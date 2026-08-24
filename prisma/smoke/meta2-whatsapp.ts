/**
 * SMOKE-META-2 — WhatsApp: entrantes, bienvenida, ventana de 24 h y estados.
 *
 *   npm run smoke:meta2
 *
 * ## Qué prueba
 *
 * Entra por donde entra Meta: peticiones HTTP firmadas contra los handlers
 * exportados por `src/app/api/webhooks/meta/route.ts`, y las Server Actions
 * reales con una sesión firmada de verdad. No se prueba una copia de la lógica.
 *
 *   1. Entrante de un teléfono nuevo: crea la fila y dispara UNA bienvenida.
 *   2. Segundo entrante del mismo teléfono: crea la fila, NO vuelve a saludar.
 *   3. Reentrega del mismo `wa_message_id`: no duplica.
 *   4. Texto libre dentro de las 24 h: sale, con su `wa_message_id`.
 *   5. Texto libre fuera de las 24 h: rechazado con código propio y **sin fila**.
 *   6. Plantilla fuera de la ventana: sale con el nombre aprobado.
 *   7. Estado por `wa_message_id`: actualiza el correcto; uno desconocido no
 *      crea nada ni falla; y un estado atrasado no hace retroceder.
 *   8. Firma manipulada en una entrega de WhatsApp: 401 y cero escrituras.
 *   9. Emparejamiento por teléfono con `Lead`, y el entrante huérfano que se
 *      guarda igual.
 *  10. Sin `WHATSAPP_PHONE_NUMBER_ID`: error específico y sin fila.
 *
 * La API de WhatsApp está simulada (`globalThis.fetch`). Lo que NO se simula es
 * la ventana, la idempotencia, el emparejamiento ni el reparto del webhook.
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
import { signMetaBody } from "@/server/meta/webhook";
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
} from "@/server/whatsapp/actions";
import {
  WHATSAPP_WELCOME_MESSAGE_ES,
  shouldAdvanceStatus,
} from "@/server/whatsapp/shared";

const APP_SECRET = "smoke-meta2-app-secret";

process.env.META_APP_SECRET = APP_SECRET;
process.env.META_WEBHOOK_VERIFY_TOKEN = "smoke-meta2-verify";
process.env.META_PAGE_ACCESS_TOKEN = "smoke-meta2-page-token";
process.env.WHATSAPP_ACCESS_TOKEN = "smoke-meta2-wa-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-META2-${STAMP}`;
const SUFFIX = String(STAMP).slice(-7);
/** Teléfonos sólo-dígitos, como los manda Meta (`from`, sin «+»). */
const PHONE_NEW = `5058${SUFFIX}`;
const PHONE_LEAD = `5057${SUFFIX}`;
const PHONE_WINDOW = `5056${SUFFIX}`;
const ALL_PHONES = [PHONE_NEW, PHONE_LEAD, PHONE_WINDOW];

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

// --- Doble de la API de WhatsApp -----------------------------------------

let sendCalls = 0;
let lastSendBody: Record<string, unknown> | null = null;
/** Cuando es true, la API responde error: para probar el camino FALLIDO. */
let rejectNextSend = false;
let sentIdCounter = 0;

const realFetch = globalThis.fetch;

globalThis.fetch = (async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (!url.includes("graph.facebook.com")) {
    throw new Error(`El smoke no esperaba una llamada a ${url}`);
  }
  if (!url.endsWith("/messages")) {
    throw new Error(`Endpoint inesperado: ${url}`);
  }

  sendCalls += 1;
  lastSendBody = init?.body
    ? (JSON.parse(String(init.body)) as Record<string, unknown>)
    : null;

  if (rejectNextSend) {
    rejectNextSend = false;
    return new Response(
      JSON.stringify({ error: { message: "Template name does not exist" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  sentIdCounter += 1;
  return new Response(
    JSON.stringify({
      messaging_product: "whatsapp",
      contacts: [{ input: "x", wa_id: "x" }],
      messages: [{ id: `wamid.${TAG}-OUT-${sentIdCounter}` }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof globalThis.fetch;

// --- Constructores de peticiones -----------------------------------------

const WEBHOOK_URL = "https://motomas.test/api/webhooks/meta";

function inboundPayload(waMessageId: string, from: string, body: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "102290129340398",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550783881",
                phone_number_id: "1234567890",
              },
              contacts: [{ profile: { name: "Cliente" }, wa_id: from }],
              messages: [
                {
                  from,
                  id: waMessageId,
                  timestamp: String(Math.floor(STAMP / 1000)),
                  type: "text",
                  text: { body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(waMessageId: string, status: string, to: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "102290129340398",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15550783881",
                phone_number_id: "1234567890",
              },
              statuses: [
                {
                  id: waMessageId,
                  status,
                  timestamp: String(Math.floor(STAMP / 1000)),
                  recipient_id: to,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

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

function tamperedPost(signedPayload: unknown, sentPayload: unknown): Request {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hub-signature-256": signMetaBody(
        JSON.stringify(signedPayload),
        APP_SECRET,
      ),
    },
    body: JSON.stringify(sentPayload),
  });
}

// --- Sesión firmada para las Server Actions -------------------------------

type SmokeGlobals = { __motomasSmokeCookies?: Record<string, string> };

async function signInAs(
  roleEnum: "ADMIN" | "CAJERO",
  uid: string,
): Promise<void> {
  const token = await createSessionToken({
    uid,
    email: `${TAG.toLowerCase()}@example.com`,
    name: TAG,
    role: roleEnum === "ADMIN" ? "Administrador" : "Cajero",
    roleEnum,
    branchId: "all",
    branchName: "Todas",
  });
  (globalThis as unknown as SmokeGlobals).__motomasSmokeCookies = {
    [SESSION_COOKIE_NAME]: token,
  };
}

function countFor(phone: string) {
  return prisma.whatsAppMessage.count({ where: { phone } });
}

async function main() {
  console.log(`\nSMOKE-META-2 — WhatsApp (${TAG})\n`);

  const branch = await prisma.branch.findFirstOrThrow({ select: { id: true } });
  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const actorId = adminUser?.id ?? "smoke-meta2-actor";

  // --- 1. Entrante de un teléfono nuevo → fila + UNA bienvenida ----------
  const firstId = `wamid.${TAG}-IN-1`;
  const response1 = await POST(
    signedPost(inboundPayload(firstId, PHONE_NEW, "Hola, quiero información")),
  );
  check(
    "una entrega de WhatsApp firmada responde 200",
    response1.status === 200,
    `estado=${response1.status}`,
  );

  const afterFirst = await prisma.whatsAppMessage.findMany({
    where: { phone: PHONE_NEW },
    orderBy: { createdAt: "asc" },
    select: {
      direction: true,
      body: true,
      status: true,
      waMessageId: true,
      leadId: true,
      customerId: true,
    },
  });
  check(
    "el entrante quedó registrado y disparó exactamente una respuesta",
    afterFirst.length === 2,
    `filas=${afterFirst.length}`,
  );
  check(
    "el primero es el ENTRANTE con su texto y su wa_message_id",
    afterFirst[0]?.direction === "ENTRANTE" &&
      afterFirst[0]?.body === "Hola, quiero información" &&
      afterFirst[0]?.waMessageId === firstId,
  );
  check(
    "el segundo es la bienvenida automática SALIENTE",
    afterFirst[1]?.direction === "SALIENTE" &&
      afterFirst[1]?.body === WHATSAPP_WELCOME_MESSAGE_ES,
    `cuerpo=${JSON.stringify(afterFirst[1]?.body)}`,
  );
  check(
    "el entrante sin lead ni cliente se guarda igual, sin dueño",
    afterFirst[0]?.leadId === null && afterFirst[0]?.customerId === null,
  );

  // --- 2. Segundo entrante → NO vuelve a saludar -------------------------
  const secondId = `wamid.${TAG}-IN-2`;
  await POST(
    signedPost(inboundPayload(secondId, PHONE_NEW, "¿Tienen Pulsar NS200?")),
  );
  const outboundAfterSecond = await prisma.whatsAppMessage.count({
    where: { phone: PHONE_NEW, direction: "SALIENTE" },
  });
  check(
    "el segundo entrante se registra",
    (await countFor(PHONE_NEW)) === 3,
    `filas=${await countFor(PHONE_NEW)}`,
  );
  check(
    "el segundo entrante NO dispara una segunda bienvenida",
    outboundAfterSecond === 1,
    `salientes=${outboundAfterSecond}`,
  );

  // --- 3. Reentrega del mismo wa_message_id → no duplica -----------------
  const beforeRedelivery = await countFor(PHONE_NEW);
  const redelivered = await POST(
    signedPost(inboundPayload(firstId, PHONE_NEW, "Hola, quiero información")),
  );
  check(
    "la reentrega responde 200",
    redelivered.status === 200,
    `estado=${redelivered.status}`,
  );
  check(
    "la reentrega del mismo wa_message_id no duplica la fila",
    (await countFor(PHONE_NEW)) === beforeRedelivery,
    `antes=${beforeRedelivery} después=${await countFor(PHONE_NEW)}`,
  );

  // --- 9. Emparejamiento por teléfono con un Lead ------------------------
  const lead = await prisma.lead.create({
    data: {
      trackingCode: `${TAG}-LEAD`,
      name: "Cliente Con Lead",
      phone: PHONE_LEAD,
      branchId: branch.id,
      status: "NUEVO_LEAD",
    },
    select: { id: true },
  });

  await POST(
    signedPost(inboundPayload(`wamid.${TAG}-IN-3`, PHONE_LEAD, "Buenas")),
  );
  const matched = await prisma.whatsAppMessage.findFirst({
    where: { phone: PHONE_LEAD, direction: "ENTRANTE" },
    select: { leadId: true },
  });
  check(
    "un entrante cuyo teléfono coincide con un Lead queda asociado",
    matched?.leadId === lead.id,
    `leadId=${matched?.leadId}`,
  );

  // --- 4. Texto libre DENTRO de la ventana → sale ------------------------
  await signInAs("ADMIN", actorId);

  const callsBeforeSend = sendCalls;
  const sent = await sendWhatsAppMessage({
    phone: PHONE_LEAD,
    body: "Claro, te comparto los precios.",
  });
  check(
    "el envío de texto libre dentro de las 24 h devuelve ok",
    sent.ok,
    sent.ok ? "" : `${sent.code}: ${sent.error}`,
  );
  check(
    "el envío llamó a la API de WhatsApp",
    sendCalls === callsBeforeSend + 1,
    `llamadas=${sendCalls - callsBeforeSend}`,
  );
  check(
    "el cuerpo enviado es el de un mensaje de texto",
    lastSendBody?.type === "text" && lastSendBody?.messaging_product === "whatsapp",
    JSON.stringify(lastSendBody),
  );

  const outboundRow = sent.ok
    ? await prisma.whatsAppMessage.findUnique({
        where: { id: sent.messageId },
        select: {
          direction: true,
          status: true,
          waMessageId: true,
          body: true,
          leadId: true,
        },
      })
    : null;
  check(
    "la fila saliente guarda el wa_message_id que devolvió Meta",
    Boolean(outboundRow) &&
      outboundRow?.direction === "SALIENTE" &&
      outboundRow?.status === "PENDIENTE" &&
      outboundRow?.waMessageId === (sent.ok ? sent.waMessageId : ""),
    JSON.stringify(outboundRow),
  );
  check(
    "la fila saliente también queda asociada al Lead",
    outboundRow?.leadId === lead.id,
  );

  // --- 5. Texto libre FUERA de la ventana → rechazado y SIN fila ---------
  const longAgo = new Date(STAMP - 25 * 60 * 60 * 1000);
  await prisma.whatsAppMessage.create({
    data: {
      direction: "ENTRANTE",
      phone: PHONE_WINDOW,
      waMessageId: `wamid.${TAG}-OLD`,
      body: "Mensaje viejo",
      status: "ENTREGADO",
      createdAt: longAgo,
    },
  });

  const beforeRejected = await countFor(PHONE_WINDOW);
  const callsBeforeRejected = sendCalls;
  const rejected = await sendWhatsAppMessage({
    phone: PHONE_WINDOW,
    body: "¿Sigues interesado?",
  });
  check(
    "el texto libre fuera de las 24 h se rechaza",
    !rejected.ok,
    rejected.ok ? "lo dejó pasar" : "",
  );
  check(
    "el rechazo trae el código tipado 'fuera-de-ventana'",
    !rejected.ok && rejected.code === "fuera-de-ventana",
    rejected.ok ? "" : `código=${rejected.code}`,
  );
  check(
    "un envío rechazado no llega a llamar a la API",
    sendCalls === callsBeforeRejected,
    `llamadas=${sendCalls - callsBeforeRejected}`,
  );
  check(
    "un envío rechazado NO deja fila: nunca salió y no hay nada que correlacionar",
    (await countFor(PHONE_WINDOW)) === beforeRejected,
    `antes=${beforeRejected} después=${await countFor(PHONE_WINDOW)}`,
  );

  // --- 6. Plantilla fuera de la ventana → sale ---------------------------
  const template = await sendWhatsAppTemplateMessage({
    phone: PHONE_WINDOW,
    templateName: "hello_world",
  });
  check(
    "la plantilla aprobada sí sale fuera de la ventana",
    template.ok,
    template.ok ? "" : `${template.code}: ${template.error}`,
  );
  check(
    "el cuerpo enviado es el de una plantilla, con su idioma aprobado",
    lastSendBody?.type === "template" &&
      JSON.stringify(lastSendBody?.template) ===
        JSON.stringify({ name: "hello_world", language: { code: "en_US" } }),
    JSON.stringify(lastSendBody),
  );
  const templateRow = template.ok
    ? await prisma.whatsAppMessage.findUnique({
        where: { id: template.messageId },
        select: { templateName: true, body: true, direction: true },
      })
    : null;
  check(
    "la fila de plantilla guarda el nombre y no un cuerpo inventado",
    templateRow?.templateName === "hello_world" &&
      templateRow?.body === null &&
      templateRow?.direction === "SALIENTE",
    JSON.stringify(templateRow),
  );

  const unapproved = await sendWhatsAppTemplateMessage({
    phone: PHONE_WINDOW,
    templateName: "plantilla_inventada",
  });
  check(
    "una plantilla no registrada se rechaza sin llamar a Meta",
    !unapproved.ok && unapproved.code === "plantilla-no-aprobada",
    unapproved.ok ? "la dejó pasar" : `código=${unapproved.code}`,
  );

  // --- 7. Devoluciones de estado ----------------------------------------
  const outboundWamid = sent.ok ? sent.waMessageId : "";
  await POST(signedPost(statusPayload(outboundWamid, "delivered", PHONE_LEAD)));
  const delivered = await prisma.whatsAppMessage.findUnique({
    where: { waMessageId: outboundWamid },
    select: { status: true },
  });
  check(
    "una devolución de estado actualiza el mensaje correcto",
    delivered?.status === "ENTREGADO",
    `estado=${delivered?.status}`,
  );

  await POST(signedPost(statusPayload(outboundWamid, "read", PHONE_LEAD)));
  check(
    "el estado avanza a LEIDO",
    (
      await prisma.whatsAppMessage.findUnique({
        where: { waMessageId: outboundWamid },
        select: { status: true },
      })
    )?.status === "LEIDO",
  );

  // Meta puede entregar las devoluciones desordenadas.
  await POST(signedPost(statusPayload(outboundWamid, "sent", PHONE_LEAD)));
  check(
    "un estado atrasado no hace retroceder al mensaje",
    (
      await prisma.whatsAppMessage.findUnique({
        where: { waMessageId: outboundWamid },
        select: { status: true },
      })
    )?.status === "LEIDO",
  );
  check(
    "shouldAdvanceStatus no deja retroceder ni resucitar un fallo",
    shouldAdvanceStatus("ENTREGADO", "ENVIADO") === false &&
      shouldAdvanceStatus("ENVIADO", "ENTREGADO") === true &&
      shouldAdvanceStatus("FALLIDO", "LEIDO") === false &&
      shouldAdvanceStatus("ENVIADO", "FALLIDO") === true,
  );

  const totalBeforeUnknown = await prisma.whatsAppMessage.count({
    where: { phone: { in: ALL_PHONES } },
  });
  const unknownStatus = await POST(
    signedPost(statusPayload(`wamid.${TAG}-NOEXISTE`, "delivered", PHONE_NEW)),
  );
  check(
    "un estado de un wa_message_id desconocido responde 200, no falla",
    unknownStatus.status === 200,
    `estado=${unknownStatus.status}`,
  );
  check(
    "un estado desconocido no inventa una fila nueva",
    (await prisma.whatsAppMessage.count({
      where: { phone: { in: ALL_PHONES } },
    })) === totalBeforeUnknown,
  );

  // --- 8. Firma manipulada en una entrega de WhatsApp --------------------
  const beforeTamper = await prisma.whatsAppMessage.count({
    where: { phone: { in: ALL_PHONES } },
  });
  const callsBeforeTamper = sendCalls;
  const tampered = await POST(
    tamperedPost(
      inboundPayload(`wamid.${TAG}-X`, PHONE_NEW, "firmado"),
      inboundPayload(`wamid.${TAG}-TAMPER`, PHONE_NEW, "inyectado"),
    ),
  );
  check(
    "una entrega de WhatsApp con firma manipulada responde 401",
    tampered.status === 401,
    `estado=${tampered.status}`,
  );
  check(
    "la entrega manipulada no escribió ningún mensaje",
    (await prisma.whatsAppMessage.count({
      where: { phone: { in: ALL_PHONES } },
    })) === beforeTamper,
  );
  check(
    "la entrega manipulada no envió nada",
    sendCalls === callsBeforeTamper,
  );

  // El saludo de Meta-1 sigue funcionando en la misma ruta.
  const handshake = await GET(
    new Request(
      `${WEBHOOK_URL}?hub.mode=subscribe&hub.verify_token=smoke-meta2-verify&hub.challenge=ok-${STAMP}`,
      { method: "GET" },
    ),
  );
  check(
    "el saludo de verificación sigue respondiendo el challenge",
    handshake.status === 200 && (await handshake.text()) === `ok-${STAMP}`,
  );

  // --- 10. Sin WHATSAPP_PHONE_NUMBER_ID → error específico y sin fila ----
  const savedPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;

  const beforeUnconfigured = await countFor(PHONE_LEAD);
  const unconfigured = await sendWhatsAppMessage({
    phone: PHONE_LEAD,
    body: "Prueba sin número configurado",
  });
  check(
    "sin WHATSAPP_PHONE_NUMBER_ID el envío falla con su código propio",
    !unconfigured.ok && unconfigured.code === "sin-numero-configurado",
    unconfigured.ok ? "lo dejó pasar" : `código=${unconfigured.code}`,
  );
  check(
    "el mensaje de error nombra la variable que falta",
    !unconfigured.ok &&
      unconfigured.error.includes("WHATSAPP_PHONE_NUMBER_ID no configurado"),
    unconfigured.ok ? "" : unconfigured.error,
  );
  check(
    "sin número configurado no se deja fila",
    (await countFor(PHONE_LEAD)) === beforeUnconfigured,
  );
  process.env.WHATSAPP_PHONE_NUMBER_ID = savedPhoneNumberId;

  // --- Un envío que SÍ salió y Meta rechazó sí se registra --------------
  rejectNextSend = true;
  const metaRejected = await sendWhatsAppMessage({
    phone: PHONE_LEAD,
    body: "Esta la rechaza Meta",
  });
  check(
    "un envío que Meta rechaza devuelve error",
    !metaRejected.ok && metaRejected.code === "rechazado-por-meta",
    metaRejected.ok ? "devolvió ok" : `código=${metaRejected.code}`,
  );
  const failedRow = await prisma.whatsAppMessage.findFirst({
    where: { phone: PHONE_LEAD, status: "FALLIDO" },
    select: { waMessageId: true, body: true },
  });
  check(
    "sí se registra como FALLIDO, sin wa_message_id, porque llegó a intentarse",
    failedRow?.waMessageId === null &&
      failedRow?.body === "Esta la rechaza Meta",
    JSON.stringify(failedRow),
  );

  // --- La puerta de permiso ---------------------------------------------
  await signInAs("CAJERO", actorId);
  const forbidden = await sendWhatsAppMessage({
    phone: PHONE_LEAD,
    body: "No debería salir",
  });
  check(
    "un Cajero no puede escribir por WhatsApp",
    !forbidden.ok,
    forbidden.ok ? "lo dejó pasar" : "",
  );
}

async function cleanup() {
  await prisma.whatsAppMessage.deleteMany({
    where: { phone: { in: ALL_PHONES } },
  });
  await prisma.lead.deleteMany({ where: { trackingCode: `${TAG}-LEAD` } });
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
