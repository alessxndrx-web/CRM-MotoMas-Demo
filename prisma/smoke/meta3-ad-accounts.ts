/**
 * SMOKE-META-3 — registro de cuentas publicitarias de Meta.
 *
 *   npm run smoke:meta3
 *
 * ## Qué prueba
 *
 * Las Server Actions reales, con una sesión firmada de verdad; el Graph API está
 * simulado con un doble de `globalThis.fetch` que además **cuenta las llamadas**,
 * que es lo que permite demostrar que un identificador mal escrito se rechaza
 * SIN gastar una petición de red.
 *
 *   1. Cuenta válida: crea la fila con los metadatos traídos.
 *   2. Identificador mal formado: rechazado y **cero** llamadas al Graph API.
 *   3. Cuenta sin acceso (Meta responde 400): rechazada, sin fila.
 *   4. La misma cuenta dos veces: rechazada por el índice único.
 *   5. Resincronizar: actualiza metadatos y `lastSyncedAt`, sin crear fila.
 *   6. Desconectar: borra la fila (y NO revoca nada en Meta).
 *   7. Puerta de permiso: un Vendedor no conecta, ni edita, ni desconecta.
 *   8. Sin `META_MARKETING_ACCESS_TOKEN`: error propio y sin fila.
 *
 * Lo que NO se simula: la validación del identificador, el orden de las
 * comprobaciones, la unicidad ni la autorización.
 *
 * Crea sus fixtures con prefijo reconocible y **los borra al terminar**, incluso
 * si una aserción falla.
 */
import { PrismaClient } from "@prisma/client";

import {
  SESSION_COOKIE_NAME,
  createSessionToken,
} from "@/server/auth/session";
import {
  connectMetaAdAccount,
  disconnectMetaAdAccount,
  resyncMetaAdAccountMetadata,
  updateMetaAdAccount,
} from "@/server/meta-ads/actions";
import { isValidAdAccountId } from "@/server/meta-ads/shared";

process.env.META_MARKETING_ACCESS_TOKEN = "smoke-meta3-ads-read-token";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-META3-${STAMP}`;
const ACCOUNT_OK = `act_9${STAMP}`;
const ACCOUNT_DENIED = `act_8${STAMP}`;
const ALL_IDS = [ACCOUNT_OK, ACCOUNT_DENIED];

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

let graphCalls = 0;
let lastRequestedUrl = "";
/** Metadatos que devuelve el doble; se cambian para probar la resincronización. */
let metadata = { name: "MotoMas — Cuenta principal", currency: "NIO", account_status: 1 };

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (!url.includes("graph.facebook.com")) {
    throw new Error(`El smoke no esperaba una llamada a ${url}`);
  }
  graphCalls += 1;
  lastRequestedUrl = url;

  if (url.includes(ACCOUNT_DENIED)) {
    // Meta responde 400 tanto para "no existe" como para "no tienes acceso".
    return new Response(
      JSON.stringify({
        error: {
          message: "Unsupported get request. Object does not exist or is not accessible.",
          type: "GraphMethodException",
          code: 100,
        },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ id: ACCOUNT_OK, ...metadata }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}) as typeof globalThis.fetch;

// --- Sesión firmada -------------------------------------------------------

type SmokeGlobals = { __motomasSmokeCookies?: Record<string, string> };

async function signInAs(
  roleEnum: "ADMIN" | "VENDEDOR",
  uid: string,
): Promise<void> {
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

function countAll() {
  return prisma.metaAdAccount.count({ where: { adAccountId: { in: ALL_IDS } } });
}

async function main() {
  console.log(`\nSMOKE-META-3 — cuentas publicitarias (${TAG})\n`);

  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const actorId = adminUser?.id ?? "smoke-meta3-actor";
  await signInAs("ADMIN", actorId);

  // --- La forma del identificador, sin tocar la red ----------------------
  check(
    "isValidAdAccountId acepta act_ + dígitos y rechaza lo demás",
    isValidAdAccountId("act_1234567890") &&
      !isValidAdAccountId("1234567890") &&
      !isValidAdAccountId("act_") &&
      !isValidAdAccountId("act_12ab34") &&
      !isValidAdAccountId(""),
  );

  // --- 2. Identificador mal formado → rechazo SIN llamada ----------------
  const callsBeforeMalformed = graphCalls;
  const beforeMalformed = await countAll();

  const malformed = await connectMetaAdAccount("1234567890", "Sin prefijo");
  check(
    "un identificador sin el prefijo act_ se rechaza",
    !malformed.ok && malformed.code === "identificador-invalido",
    malformed.ok ? "lo aceptó" : `código=${malformed.code}`,
  );
  check(
    "el rechazo por forma NO gastó ninguna llamada al Graph API",
    graphCalls === callsBeforeMalformed,
    `llamadas=${graphCalls - callsBeforeMalformed}`,
  );

  const malformed2 = await connectMetaAdAccount("act_no_son_digitos", null);
  check(
    "act_ con caracteres no numéricos también se rechaza sin llamar",
    !malformed2.ok &&
      malformed2.code === "identificador-invalido" &&
      graphCalls === callsBeforeMalformed,
  );
  check(
    "ningún identificador mal formado dejó fila",
    (await countAll()) === beforeMalformed,
  );

  // --- 1. Cuenta válida → fila con metadatos -----------------------------
  const callsBeforeConnect = graphCalls;
  const connected = await connectMetaAdAccount(ACCOUNT_OK, "Cuenta principal");
  check(
    "conectar una cuenta accesible devuelve ok",
    connected.ok,
    connected.ok ? "" : `${connected.code}: ${connected.error}`,
  );
  check(
    "la conexión sí consultó el Graph API",
    graphCalls === callsBeforeConnect + 1,
    `llamadas=${graphCalls - callsBeforeConnect}`,
  );
  check(
    "la consulta pidió name, currency y account_status del nodo act_",
    lastRequestedUrl.includes(ACCOUNT_OK) &&
      decodeURIComponent(lastRequestedUrl).includes(
        "fields=name,currency,account_status",
      ),
    lastRequestedUrl,
  );

  const row = await prisma.metaAdAccount.findUnique({
    where: { adAccountId: ACCOUNT_OK },
    select: {
      id: true,
      label: true,
      accountName: true,
      currency: true,
      accountStatus: true,
      isActive: true,
      lastSyncedAt: true,
    },
  });
  check("la fila existe", row !== null);
  check(
    "guardó los metadatos que devolvió Meta",
    row?.accountName === "MotoMas — Cuenta principal" &&
      row?.currency === "NIO" &&
      row?.accountStatus === "1",
    JSON.stringify(row),
  );
  check(
    "guardó el identificador CON el prefijo act_, tal cual lo espera el Graph API",
    (
      await prisma.metaAdAccount.findUnique({
        where: { adAccountId: ACCOUNT_OK },
        select: { adAccountId: true },
      })
    )?.adAccountId === ACCOUNT_OK,
  );
  check("la etiqueta interna se conservó", row?.label === "Cuenta principal");
  check("nace siguiéndose (isActive)", row?.isActive === true);
  check(
    "lastSyncedAt nace nulo: todavía no se ha resincronizado nunca",
    row?.lastSyncedAt === null,
  );

  // --- 4. La misma cuenta dos veces → rechazo ----------------------------
  const duplicate = await connectMetaAdAccount(ACCOUNT_OK, "Otra etiqueta");
  check(
    "conectar la misma cuenta dos veces se rechaza",
    !duplicate.ok && duplicate.code === "ya-conectada",
    duplicate.ok ? "la duplicó" : `código=${duplicate.code}`,
  );
  check(
    "sigue habiendo una sola fila para esa cuenta",
    (await prisma.metaAdAccount.count({
      where: { adAccountId: ACCOUNT_OK },
    })) === 1,
  );

  // --- 3. Cuenta sin acceso → rechazo, sin fila --------------------------
  const beforeDenied = await countAll();
  const denied = await connectMetaAdAccount(ACCOUNT_DENIED, "Ajena");
  check(
    "una cuenta a la que el token no llega se rechaza",
    !denied.ok && denied.code === "sin-acceso",
    denied.ok ? "la aceptó" : `código=${denied.code}`,
  );
  check(
    "el mensaje es legible en español y dice qué hacer",
    !denied.ok &&
      denied.error.includes("El token no tiene acceso") &&
      denied.error.includes("Business Manager"),
    denied.ok ? "" : denied.error,
  );
  check(
    "no se creó ninguna fila para la cuenta inaccesible",
    (await countAll()) === beforeDenied,
  );

  // --- 5. Resincronizar --------------------------------------------------
  metadata = {
    name: "MotoMas — Cuenta renombrada",
    currency: "USD",
    account_status: 2,
  };
  const rowsBeforeResync = await countAll();
  const resynced = await resyncMetaAdAccountMetadata(row?.id ?? "");
  check(
    "resincronizar devuelve ok",
    resynced.ok,
    resynced.ok ? "" : `${resynced.code}: ${resynced.error}`,
  );

  const afterResync = await prisma.metaAdAccount.findUnique({
    where: { adAccountId: ACCOUNT_OK },
    select: {
      accountName: true,
      currency: true,
      accountStatus: true,
      lastSyncedAt: true,
      label: true,
    },
  });
  check(
    "actualizó nombre, moneda y estado desde Meta",
    afterResync?.accountName === "MotoMas — Cuenta renombrada" &&
      afterResync?.currency === "USD" &&
      afterResync?.accountStatus === "2",
    JSON.stringify(afterResync),
  );
  check("selló lastSyncedAt", afterResync?.lastSyncedAt !== null);
  check(
    "la etiqueta interna NO la pisa Meta",
    afterResync?.label === "Cuenta principal",
  );
  check(
    "resincronizar no creó ninguna fila nueva",
    (await countAll()) === rowsBeforeResync,
    `antes=${rowsBeforeResync} después=${await countAll()}`,
  );

  // --- Editar etiqueta y pausar seguimiento ------------------------------
  const edited = await updateMetaAdAccount({
    id: row?.id ?? "",
    label: "Cuenta principal (Nicaragua)",
    isActive: false,
  });
  check("editar devuelve ok", edited.ok, edited.ok ? "" : edited.error);
  const afterEdit = await prisma.metaAdAccount.findUnique({
    where: { adAccountId: ACCOUNT_OK },
    select: { label: true, isActive: true, accountStatus: true },
  });
  check(
    "cambió la etiqueta y pausó el seguimiento",
    afterEdit?.label === "Cuenta principal (Nicaragua)" &&
      afterEdit?.isActive === false,
  );
  check(
    "pausar el seguimiento no toca el estado que Meta le da a la cuenta",
    afterEdit?.accountStatus === "2",
  );

  // --- 7. Puerta de permiso ---------------------------------------------
  await signInAs("VENDEDOR", actorId);
  const callsBeforeForbidden = graphCalls;

  const forbiddenConnect = await connectMetaAdAccount(`act_7${STAMP}`, null);
  check(
    "un Vendedor no puede conectar una cuenta",
    !forbiddenConnect.ok,
    forbiddenConnect.ok ? "lo dejó pasar" : "",
  );
  check(
    "el rechazo por permiso ocurre antes de tocar el Graph API",
    graphCalls === callsBeforeForbidden,
    `llamadas=${graphCalls - callsBeforeForbidden}`,
  );

  const forbiddenEdit = await updateMetaAdAccount({
    id: row?.id ?? "",
    label: "Secuestrada",
    isActive: true,
  });
  check(
    "un Vendedor no puede editar una cuenta",
    !forbiddenEdit.ok,
    forbiddenEdit.ok ? "lo dejó pasar" : "",
  );

  const forbiddenResync = await resyncMetaAdAccountMetadata(row?.id ?? "");
  check(
    "un Vendedor no puede resincronizar",
    !forbiddenResync.ok,
    forbiddenResync.ok ? "lo dejó pasar" : "",
  );

  const forbiddenDisconnect = await disconnectMetaAdAccount(row?.id ?? "");
  check(
    "un Vendedor no puede desconectar",
    !forbiddenDisconnect.ok,
    forbiddenDisconnect.ok ? "lo dejó pasar" : "",
  );
  check(
    "tras los cuatro intentos del Vendedor la fila sigue intacta",
    (await prisma.metaAdAccount.count({
      where: { adAccountId: ACCOUNT_OK },
    })) === 1 &&
      (
        await prisma.metaAdAccount.findUnique({
          where: { adAccountId: ACCOUNT_OK },
          select: { label: true },
        })
      )?.label === "Cuenta principal (Nicaragua)",
  );

  await signInAs("ADMIN", actorId);

  // --- 8. Sin token configurado -----------------------------------------
  const savedToken = process.env.META_MARKETING_ACCESS_TOKEN;
  delete process.env.META_MARKETING_ACCESS_TOKEN;

  const beforeNoToken = await countAll();
  const callsBeforeNoToken = graphCalls;
  const noToken = await connectMetaAdAccount(`act_6${STAMP}`, null);
  check(
    "sin META_MARKETING_ACCESS_TOKEN la conexión falla con su código propio",
    !noToken.ok && noToken.code === "sin-token-configurado",
    noToken.ok ? "lo dejó pasar" : `código=${noToken.code}`,
  );
  check(
    "el mensaje nombra la variable que falta",
    !noToken.ok &&
      noToken.error.includes("META_MARKETING_ACCESS_TOKEN no configurado"),
    noToken.ok ? "" : noToken.error,
  );
  check(
    "sin token no se intenta la llamada ni se deja fila",
    graphCalls === callsBeforeNoToken && (await countAll()) === beforeNoToken,
  );
  process.env.META_MARKETING_ACCESS_TOKEN = savedToken;

  // --- 6. Desconectar ----------------------------------------------------
  const disconnected = await disconnectMetaAdAccount(row?.id ?? "");
  check(
    "desconectar devuelve ok",
    disconnected.ok,
    disconnected.ok ? "" : disconnected.error,
  );
  check(
    "la fila desapareció del registro",
    (await prisma.metaAdAccount.count({
      where: { adAccountId: ACCOUNT_OK },
    })) === 0,
  );

  const missing = await disconnectMetaAdAccount(row?.id ?? "");
  check(
    "desconectar algo que ya no está falla limpio",
    !missing.ok && missing.code === "no-encontrada",
    missing.ok ? "devolvió ok" : `código=${missing.code}`,
  );

  // Desconectar es local: la cuenta se puede volver a conectar sin tocar nada
  // en Meta, precisamente porque nunca se le revocó nada al Usuario del Sistema.
  const reconnected = await connectMetaAdAccount(ACCOUNT_OK, "Reconectada");
  check(
    "una cuenta desconectada se puede volver a conectar: no se revocó nada en Meta",
    reconnected.ok,
    reconnected.ok ? "" : `${reconnected.code}: ${reconnected.error}`,
  );
}

async function cleanup() {
  await prisma.metaAdAccount.deleteMany({
    where: {
      adAccountId: { in: [...ALL_IDS, `act_7${STAMP}`, `act_6${STAMP}`] },
    },
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
