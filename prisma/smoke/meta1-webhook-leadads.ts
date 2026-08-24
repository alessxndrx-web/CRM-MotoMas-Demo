/**
 * SMOKE-META-1 — webhook de Meta y captación de Lead Ads.
 *
 *   npm run smoke:meta
 *
 * ## Qué prueba
 *
 * El camino completo, entrando por donde entra Meta: se construyen peticiones
 * HTTP reales y se llaman los handlers exportados por
 * `src/app/api/webhooks/meta/route.ts`. No se prueba una copia de la lógica.
 *
 *   1. Saludo de verificación: token correcto devuelve el challenge; token
 *      equivocado devuelve 403.
 *   2. Firma manipulada: 401, y **cero** escrituras y **cero** llamadas al
 *      Graph API — se comprueba contando las dos cosas.
 *   3. Página mapeada y activa: nace un `Lead` en ESA sucursal.
 *   4. Reenvío de la misma `leadgen_id`: sigue habiendo un solo `Lead`.
 *   5. Página sin mapear: nace una fila en el andén y **ningún** `Lead`.
 *   6. Página mapeada pero inactiva: se trata como sin mapear.
 *   7. Reenvío estando en el andén: una sola fila, no dos.
 *   8. Evento que no es `leadgen`: 200 y no escribe nada.
 *   9. `resolveUnmappedMetaLead`: crea el `Lead` en la sucursal elegida con el
 *      mapeo correcto, y el segundo intento falla limpio sin duplicar.
 *  10. CRUD de mapeos y su puerta de permiso (un Vendedor no pasa).
 *
 * El Graph API está simulado: `globalThis.fetch` se sustituye por un doble que
 * responde el nodo del lead. Lo que NO se simula es el mapeo de campos, la
 * firma, la idempotencia ni la resolución de sucursal — eso es el código real.
 *
 * Las Server Actions se ejercitan con una sesión **firmada de verdad**: el
 * smoke inyecta la cookie en el stub de `next/headers` y el código de
 * autorización que corre es el mismo de producción.
 *
 * Crea sus fixtures con prefijo reconocible y **los borra al terminar**, incluso
 * si una aserción falla.
 */
import { PrismaClient } from "@prisma/client";

import { GET, POST } from "@/app/api/webhooks/meta/route";
import {
  SESSION_COOKIE_NAME,
  createSessionToken,
} from "@/server/auth/session";
import {
  createMetaPageBranchMapping,
  deleteMetaPageBranchMapping,
  resolveUnmappedMetaLead,
  updateMetaPageBranchMapping,
} from "@/server/meta/actions";
import { signMetaBody } from "@/server/meta/webhook";

const APP_SECRET = "smoke-meta-app-secret";
const VERIFY_TOKEN = "smoke-meta-verify-token";

process.env.META_APP_SECRET = APP_SECRET;
process.env.META_WEBHOOK_VERIFY_TOKEN = VERIFY_TOKEN;
process.env.META_PAGE_ACCESS_TOKEN = "smoke-meta-page-token";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-META1-${STAMP}`;
/** `page_id` de Meta es numérico; los del smoke también, para ser realistas. */
const MAPPED_PAGE = `9${STAMP}`;
const UNMAPPED_PAGE = `8${STAMP}`;
const INACTIVE_PAGE = `7${STAMP}`;
const FORM_ID = `6${STAMP}`;

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${name} ${detail}`);
  }
}

// --- Doble del Graph API --------------------------------------------------

type LeadgenFixture = {
  platform?: string;
  field_data: { name: string; values: string[] }[];
};

const graphFixtures = new Map<string, LeadgenFixture>();
let graphCalls = 0;

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (!url.includes("graph.facebook.com")) {
    throw new Error(`El smoke no esperaba una llamada a ${url}`);
  }
  graphCalls += 1;

  const leadgenId = new URL(url).pathname.split("/").pop() ?? "";
  const fixture = graphFixtures.get(leadgenId);
  if (!fixture) {
    return new Response(JSON.stringify({ error: "not found" }), { status: 400 });
  }
  return new Response(
    JSON.stringify({
      id: leadgenId,
      created_time: "2026-08-24T12:00:00+0000",
      form_id: FORM_ID,
      platform: fixture.platform,
      field_data: fixture.field_data,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof globalThis.fetch;

// --- Constructores de peticiones -----------------------------------------

const WEBHOOK_URL = "https://motomas.test/api/webhooks/meta";

function leadgenPayload(leadgenId: string, pageId: string) {
  return {
    object: "page",
    entry: [
      {
        id: pageId,
        time: STAMP,
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: leadgenId,
              page_id: pageId,
              form_id: FORM_ID,
              created_time: STAMP,
            },
          },
        ],
      },
    ],
  };
}

/** Petición firmada como la firma Meta. */
function signedPost(payload: unknown): Request {
  const raw = JSON.stringify(payload);
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signMetaBody(raw, APP_SECRET),
    },
    body: raw,
  });
}

/**
 * Petición manipulada: se firma un cuerpo y se envía OTRO. Es el ataque real —
 * quien reenvía una entrega capturada cambiándole el contenido.
 */
function tamperedPost(signedPayload: unknown, sentPayload: unknown): Request {
  const signature = signMetaBody(JSON.stringify(signedPayload), APP_SECRET);
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signature,
    },
    body: JSON.stringify(sentPayload),
  });
}

function verificationRequest(token: string, challenge: string): Request {
  const url = new URL(WEBHOOK_URL);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", token);
  url.searchParams.set("hub.challenge", challenge);
  return new Request(url, { method: "GET" });
}

// --- Sesión firmada para las Server Actions -------------------------------

type SmokeGlobals = { __motomasSmokeCookies?: Record<string, string> };

async function signInAs(roleEnum: "ADMIN" | "VENDEDOR", uid: string) {
  const token = await createSessionToken({
    uid,
    email: `${TAG.toLowerCase()}@example.com`,
    name: TAG,
    role: roleEnum === "ADMIN" ? "Administrador" : "Vendedor",
    roleEnum,
    branchId: "all",
    branchName: "Todas",
  });
  (globalThis as unknown as SmokeGlobals).__motomasSmokeCookies = {
    [SESSION_COOKIE_NAME]: token,
  };
}

async function countLeads(): Promise<number> {
  return prisma.lead.count({ where: { metaLeadgenId: { startsWith: TAG } } });
}

async function main() {
  console.log(`\nSMOKE-META-1 — webhook de Meta + Lead Ads (${TAG})\n`);

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    take: 2,
    select: { id: true, code: true, name: true },
  });
  if (branches.length < 2) {
    throw new Error("El smoke necesita al menos dos sucursales activas.");
  }
  const [branchA, branchB] = branches as [
    (typeof branches)[number],
    (typeof branches)[number],
  ];

  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const actorId = adminUser?.id ?? "smoke-meta-actor";

  // --- 1. Saludo de verificación ----------------------------------------
  const challenge = `challenge-${STAMP}`;
  const goodHandshake = await GET(verificationRequest(VERIFY_TOKEN, challenge));
  const goodBody = await goodHandshake.text();
  check(
    "el saludo con el token correcto responde 200",
    goodHandshake.status === 200,
    `estado=${goodHandshake.status}`,
  );
  check(
    "el saludo devuelve el hub.challenge crudo",
    goodBody === challenge,
    `cuerpo=${JSON.stringify(goodBody)}`,
  );

  const badHandshake = await GET(
    verificationRequest("token-equivocado", challenge),
  );
  check(
    "el saludo con token equivocado responde 403",
    badHandshake.status === 403,
    `estado=${badHandshake.status}`,
  );

  const notSubscribe = new URL(WEBHOOK_URL);
  notSubscribe.searchParams.set("hub.mode", "unsubscribe");
  notSubscribe.searchParams.set("hub.verify_token", VERIFY_TOKEN);
  notSubscribe.searchParams.set("hub.challenge", challenge);
  const wrongMode = await GET(new Request(notSubscribe, { method: "GET" }));
  check(
    "hub.mode distinto de subscribe responde 403 aunque el token sea válido",
    wrongMode.status === 403,
    `estado=${wrongMode.status}`,
  );

  // --- 2. Firma manipulada: 401, cero escrituras, cero Graph -------------
  const tamperedLeadgenId = `${TAG}-TAMPER`;
  graphFixtures.set(tamperedLeadgenId, {
    platform: "fb",
    field_data: [
      { name: "full_name", values: ["Intruso"] },
      { name: "phone_number", values: ["+505 8888 0000"] },
    ],
  });

  const leadsBeforeTamper = await countLeads();
  const stagedBeforeTamper = await prisma.metaUnmappedLead.count({
    where: { leadgenId: { startsWith: TAG } },
  });
  const graphBeforeTamper = graphCalls;

  const tampered = await POST(
    tamperedPost(
      leadgenPayload(`${TAG}-OTRO`, MAPPED_PAGE),
      leadgenPayload(tamperedLeadgenId, MAPPED_PAGE),
    ),
  );
  check(
    "una entrega con firma manipulada responde 401",
    tampered.status === 401,
    `estado=${tampered.status}`,
  );
  check(
    "la entrega manipulada no llamó al Graph API",
    graphCalls === graphBeforeTamper,
    `llamadas=${graphCalls - graphBeforeTamper}`,
  );
  check(
    "la entrega manipulada no creó ningún Lead",
    (await countLeads()) === leadsBeforeTamper,
  );
  check(
    "la entrega manipulada no dejó nada en el andén",
    (await prisma.metaUnmappedLead.count({
      where: { leadgenId: { startsWith: TAG } },
    })) === stagedBeforeTamper,
  );

  const noSignature = await POST(
    new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(leadgenPayload(tamperedLeadgenId, MAPPED_PAGE)),
    }),
  );
  check(
    "una entrega sin cabecera de firma responde 401",
    noSignature.status === 401,
    `estado=${noSignature.status}`,
  );

  // --- 3. Página mapeada y activa → Lead en esa sucursal -----------------
  await prisma.metaPageBranch.create({
    data: {
      pageId: MAPPED_PAGE,
      branchId: branchA.id,
      label: `${TAG} página mapeada`,
      isActive: true,
    },
  });

  const mappedLeadgenId = `${TAG}-MAPEADO`;
  graphFixtures.set(mappedLeadgenId, {
    platform: "ig",
    field_data: [
      { name: "full_name", values: ["  Juan   Pérez  "] },
      { name: "phone_number", values: ["+505 8765-4321"] },
      { name: "email", values: ["  Juan.Perez@Example.COM "] },
      { name: "pregunta_personalizada", values: ["Financiamiento"] },
    ],
  });

  const graphBeforeMapped = graphCalls;
  const mappedResponse = await POST(
    signedPost(leadgenPayload(mappedLeadgenId, MAPPED_PAGE)),
  );
  check(
    "una entrega firmada con evento leadgen responde 200",
    mappedResponse.status === 200,
    `estado=${mappedResponse.status}`,
  );
  check(
    "el webhook fue a buscar las respuestas al Graph API",
    graphCalls === graphBeforeMapped + 1,
    `llamadas=${graphCalls - graphBeforeMapped}`,
  );

  const mappedLeads = await prisma.lead.findMany({
    where: { metaLeadgenId: mappedLeadgenId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      branchId: true,
      originChannel: true,
      status: true,
      trackingCode: true,
      utmSource: true,
      utmCampaign: true,
    },
  });
  check(
    "se creó exactamente un Lead",
    mappedLeads.length === 1,
    `leads=${mappedLeads.length}`,
  );

  const lead = mappedLeads[0];
  if (lead) {
    check(
      "el Lead quedó en la sucursal mapeada",
      lead.branchId === branchA.id,
      `esperada=${branchA.code}`,
    );
    check(
      "full_name se normalizó con sanitizeText",
      lead.name === "Juan Pérez",
      `nombre=${JSON.stringify(lead.name)}`,
    );
    check(
      "phone_number se normalizó a solo dígitos",
      lead.phone === "50587654321",
      `teléfono=${JSON.stringify(lead.phone)}`,
    );
    check(
      "email se normalizó a minúsculas",
      lead.email === "juan.perez@example.com",
      `correo=${JSON.stringify(lead.email)}`,
    );
    check(
      "platform=ig mapeó a la taxonomía existente 'Instagram Ads'",
      lead.originChannel === "Instagram Ads",
      `canal=${JSON.stringify(lead.originChannel)}`,
    );
    check(
      "el Lead nace en NUEVO_LEAD con código de seguimiento SOL-",
      lead.status === "NUEVO_LEAD" && lead.trackingCode.startsWith("SOL-"),
      `estado=${lead.status} código=${lead.trackingCode}`,
    );
    check(
      "no se fabricaron UTMs a partir de los datos de Meta",
      lead.utmSource === null && lead.utmCampaign === null,
    );
  }

  // --- 4. Reenvío de la misma leadgen_id → sigue habiendo un solo Lead ---
  const graphBeforeRetry = graphCalls;
  const retryResponse = await POST(
    signedPost(leadgenPayload(mappedLeadgenId, MAPPED_PAGE)),
  );
  check(
    "el reenvío de Meta responde 200",
    retryResponse.status === 200,
    `estado=${retryResponse.status}`,
  );
  check(
    "el reenvío no creó un segundo Lead",
    (await prisma.lead.count({ where: { metaLeadgenId: mappedLeadgenId } })) === 1,
  );
  check(
    "el reenvío se cortó antes de gastar otra llamada al Graph API",
    graphCalls === graphBeforeRetry,
    `llamadas=${graphCalls - graphBeforeRetry}`,
  );

  // --- 5. Página sin mapear → andén, y ningún Lead -----------------------
  const unmappedLeadgenId = `${TAG}-SINMAPEO`;
  graphFixtures.set(unmappedLeadgenId, {
    platform: "fb",
    field_data: [
      { name: "full_name", values: ["María López"] },
      { name: "phone_number", values: ["+505 7777-1234"] },
      { name: "email", values: ["maria@example.com"] },
    ],
  });

  const unmappedResponse = await POST(
    signedPost(leadgenPayload(unmappedLeadgenId, UNMAPPED_PAGE)),
  );
  check(
    "una entrega de página sin mapear responde 200 (no es un error)",
    unmappedResponse.status === 200,
    `estado=${unmappedResponse.status}`,
  );
  const staged = await prisma.metaUnmappedLead.findUnique({
    where: { leadgenId: unmappedLeadgenId },
    select: { id: true, pageId: true, formId: true, fetchedFields: true },
  });
  check("el lead quedó guardado en el andén", staged !== null);
  check(
    "el andén guardó la página y el formulario de origen",
    staged?.pageId === UNMAPPED_PAGE && staged?.formId === FORM_ID,
  );
  check(
    "el andén conservó las respuestas traídas del Graph API",
    JSON.stringify(staged?.fetchedFields ?? "").includes("María López"),
  );
  check(
    "no se creó ningún Lead para la página sin mapear",
    (await prisma.lead.count({ where: { metaLeadgenId: unmappedLeadgenId } })) === 0,
  );

  // --- 6. Página mapeada pero inactiva → se trata como sin mapear --------
  await prisma.metaPageBranch.create({
    data: {
      pageId: INACTIVE_PAGE,
      branchId: branchB.id,
      label: `${TAG} página inactiva`,
      isActive: false,
    },
  });

  const inactiveLeadgenId = `${TAG}-INACTIVA`;
  graphFixtures.set(inactiveLeadgenId, {
    platform: "fb",
    field_data: [
      { name: "full_name", values: ["Carlos Ruiz"] },
      { name: "phone_number", values: ["+505 6666-1111"] },
    ],
  });

  const inactiveResponse = await POST(
    signedPost(leadgenPayload(inactiveLeadgenId, INACTIVE_PAGE)),
  );
  check(
    "una página mapeada pero inactiva responde 200",
    inactiveResponse.status === 200,
    `estado=${inactiveResponse.status}`,
  );
  check(
    "una página inactiva NO enruta el lead a su sucursal",
    (await prisma.lead.count({ where: { metaLeadgenId: inactiveLeadgenId } })) === 0,
  );
  check(
    "una página inactiva deja el lead en el andén, no lo descarta",
    (await prisma.metaUnmappedLead.count({
      where: { leadgenId: inactiveLeadgenId },
    })) === 1,
  );

  // --- 7. Reenvío estando en el andén → una sola fila --------------------
  await POST(signedPost(leadgenPayload(unmappedLeadgenId, UNMAPPED_PAGE)));
  check(
    "el reenvío de un lead ya en el andén no crea una segunda fila",
    (await prisma.metaUnmappedLead.count({
      where: { leadgenId: unmappedLeadgenId },
    })) === 1,
  );

  // --- 8. Evento que no es leadgen → 200 y no escribe nada ---------------
  const leadsBeforeOther = await countLeads();
  const stagedBeforeOther = await prisma.metaUnmappedLead.count({
    where: { leadgenId: { startsWith: TAG } },
  });
  const graphBeforeOther = graphCalls;

  const otherEvent = await POST(
    signedPost({
      object: "whatsapp_business_account",
      entry: [
        {
          id: MAPPED_PAGE,
          changes: [{ field: "messages", value: { messages: [{ id: "wamid" }] } }],
        },
      ],
    }),
  );
  check(
    "un evento que no es leadgen responde 200",
    otherEvent.status === 200,
    `estado=${otherEvent.status}`,
  );
  check(
    "un evento que no es leadgen no escribe nada",
    (await countLeads()) === leadsBeforeOther &&
      (await prisma.metaUnmappedLead.count({
        where: { leadgenId: { startsWith: TAG } },
      })) === stagedBeforeOther,
  );
  check(
    "un evento que no es leadgen no llama al Graph API",
    graphCalls === graphBeforeOther,
  );

  // --- 9. resolveUnmappedMetaLead ---------------------------------------
  await signInAs("ADMIN", actorId);

  const stagedId = staged?.id ?? "";
  const resolved = await resolveUnmappedMetaLead(stagedId, branchB.code);
  check(
    "resolver un lead del andén devuelve ok",
    resolved.ok,
    resolved.ok ? "" : resolved.error,
  );

  const resolvedLead = await prisma.lead.findUnique({
    where: { metaLeadgenId: unmappedLeadgenId },
    select: { id: true, branchId: true, name: true, phone: true, email: true },
  });
  check(
    "la resolución creó el Lead en la sucursal ELEGIDA a mano",
    resolvedLead?.branchId === branchB.id,
    `esperada=${branchB.code}`,
  );
  check(
    "la resolución usó el mismo mapeo de campos que el webhook",
    resolvedLead?.name === "María López" &&
      resolvedLead?.phone === "50577771234" &&
      resolvedLead?.email === "maria@example.com",
    `${resolvedLead?.name} / ${resolvedLead?.phone} / ${resolvedLead?.email}`,
  );

  const stagedRow = await prisma.metaUnmappedLead.findUnique({
    where: { id: stagedId },
    select: { resolvedAt: true, resolvedLeadId: true, resolvedById: true },
  });
  check(
    "la fila del andén quedó marcada como resuelta y trazada",
    stagedRow?.resolvedAt !== null &&
      stagedRow?.resolvedLeadId === resolvedLead?.id &&
      stagedRow?.resolvedById === actorId,
  );

  const resolvedTwice = await resolveUnmappedMetaLead(stagedId, branchA.code);
  check(
    "resolver dos veces la misma fila falla limpio la segunda",
    !resolvedTwice.ok,
    resolvedTwice.ok ? "devolvió ok" : "",
  );
  check(
    "el segundo intento no creó un segundo Lead",
    (await prisma.lead.count({ where: { metaLeadgenId: unmappedLeadgenId } })) === 1,
  );

  // --- 10. CRUD de mapeos y su puerta de permiso -------------------------
  const crudPage = `5${STAMP}`;
  const created = await createMetaPageBranchMapping({
    pageId: crudPage,
    branchCode: branchA.code,
    label: `${TAG} CRUD`,
    isActive: true,
  });
  check("crear un mapeo devuelve ok", created.ok, created.ok ? "" : created.error);

  const duplicate = await createMetaPageBranchMapping({
    pageId: crudPage,
    branchCode: branchB.code,
    label: `${TAG} duplicado`,
    isActive: true,
  });
  check(
    "una página ya mapeada no se puede mapear dos veces",
    !duplicate.ok,
    duplicate.ok ? "aceptó el duplicado" : "",
  );

  const nonNumeric = await createMetaPageBranchMapping({
    pageId: "no-es-numerico",
    branchCode: branchA.code,
    label: null,
    isActive: true,
  });
  check(
    "un page_id no numérico se rechaza",
    !nonNumeric.ok,
    nonNumeric.ok ? "lo aceptó" : "",
  );

  const crudId = created.ok ? created.id : "";
  const edited = await updateMetaPageBranchMapping(crudId, {
    pageId: crudPage,
    branchCode: branchB.code,
    label: `${TAG} CRUD editado`,
    isActive: false,
  });
  check("editar un mapeo devuelve ok", edited.ok, edited.ok ? "" : edited.error);

  const afterEdit = await prisma.metaPageBranch.findUnique({
    where: { id: crudId },
    select: { branchId: true, label: true, isActive: true },
  });
  check(
    "la edición reasignó sucursal, nombre y desactivó",
    afterEdit?.branchId === branchB.id &&
      afterEdit?.label === `${TAG} CRUD editado` &&
      afterEdit?.isActive === false,
  );

  // Desactivar no toca los Leads que ya entraron por esa página.
  const leadStillThere = await prisma.lead.findUnique({
    where: { metaLeadgenId: mappedLeadgenId },
    select: { branchId: true },
  });
  check(
    "desactivar un mapeo no reescribe los Leads ya creados",
    leadStillThere?.branchId === branchA.id,
  );

  await signInAs("VENDEDOR", actorId);
  const forbidden = await createMetaPageBranchMapping({
    pageId: `4${STAMP}`,
    branchCode: branchA.code,
    label: null,
    isActive: true,
  });
  check(
    "un Vendedor no puede crear mapeos",
    !forbidden.ok,
    forbidden.ok ? "lo dejó pasar" : "",
  );

  const forbiddenResolve = await resolveUnmappedMetaLead(stagedId, branchA.code);
  check(
    "un Vendedor no puede resolver leads del andén",
    !forbiddenResolve.ok,
    forbiddenResolve.ok ? "lo dejó pasar" : "",
  );

  await signInAs("ADMIN", actorId);
  const removed = await deleteMetaPageBranchMapping(crudId);
  check("borrar un mapeo devuelve ok", removed.ok, removed.ok ? "" : removed.error);
  check(
    "el mapeo borrado ya no existe",
    (await prisma.metaPageBranch.count({ where: { id: crudId } })) === 0,
  );
  check(
    "borrar el mapeo tampoco tocó los Leads ya creados",
    (await prisma.lead.count({ where: { metaLeadgenId: mappedLeadgenId } })) === 1,
  );
}

async function cleanup() {
  await prisma.metaUnmappedLead.deleteMany({
    where: { leadgenId: { startsWith: TAG } },
  });
  await prisma.lead.deleteMany({ where: { metaLeadgenId: { startsWith: TAG } } });
  await prisma.metaPageBranch.deleteMany({
    where: { pageId: { in: [MAPPED_PAGE, UNMAPPED_PAGE, INACTIVE_PAGE, `5${STAMP}`, `4${STAMP}`] } },
  });
}

main()
  .catch((error) => {
    failed += 1;
    console.error("\n  ERROR", error);
  })
  .finally(async () => {
    await cleanup();
    globalThis.fetch = realFetch;
    await prisma.$disconnect();
    console.log(`\n  ${passed} OK · ${failed} fallos\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
