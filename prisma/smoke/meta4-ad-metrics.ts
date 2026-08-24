/**
 * SMOKE-META-4 — tablero de métricas de cuentas publicitarias.
 *
 *   npm run smoke:meta4
 *
 * ## Qué prueba
 *
 * Las Server Actions y la consulta reales, con sesión firmada. El Graph API está
 * simulado con un doble que **cuenta las llamadas**, que es lo que permite
 * demostrar lo más importante de este parche: que el camino de LECTURA del
 * tablero no toca la red.
 *
 *   1. Refrescar una cuenta conectada crea una foto, con el `date_preset` de
 *      Meta correcto en la petición.
 *   2. Refrescar dos veces crea una fila NUEVA; la primera sigue ahí.
 *   3. `getLatestMetaAdMetrics` devuelve la más reciente por cuenta.
 *   4. «Sin foto» y «foto con ceros» son estados distintos, no el mismo.
 *   5. `refreshAllMetaAdMetrics`: el fallo de una cuenta no impide las otras.
 *   6. Puerta de permiso: un Vendedor no refresca.
 *   7. **Cero llamadas al Graph API desde la lectura del tablero.**
 *   8. Una cuenta que no está en el registro no se puede refrescar.
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
  refreshAllMetaAdMetrics,
  refreshMetaAdMetrics,
} from "@/server/meta-ads/actions";
import { getLatestMetaAdMetrics } from "@/server/meta-ads/queries";
import { metaAdDatePresetApiValues } from "@/server/meta-ads/shared";

process.env.META_MARKETING_ACCESS_TOKEN = "smoke-meta4-ads-read-token";

const prisma = new PrismaClient();
const STAMP = Date.now();
const TAG = `SMOKE-META4-${STAMP}`;
const ACC_A = `act_91${STAMP}`;
const ACC_B = `act_92${STAMP}`;
const ACC_ZERO = `act_93${STAMP}`;
const ACC_NEVER = `act_94${STAMP}`;
const ALL = [ACC_A, ACC_B, ACC_ZERO, ACC_NEVER];

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
let lastInsightsUrl = "";
/** Cuentas cuyo informe debe fallar, para probar el fallo parcial. */
const failingAccounts = new Set<string>();
/** Cuentas cuyo informe viene vacío (Meta responde `data: []`). */
const emptyAccounts = new Set<string>();
let insights = { impressions: "1500", clicks: "60", spend: "250.75", ctr: "4.0000", cpc: "4.1792" };

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = typeof input === "string" ? input : input.toString();
  if (!url.includes("graph.facebook.com")) {
    throw new Error(`El smoke no esperaba una llamada a ${url}`);
  }
  graphCalls += 1;

  // Alta de la cuenta (nodo, sin /insights).
  if (!url.includes("/insights")) {
    const id = ALL.find((account) => url.includes(account)) ?? "act_0";
    return new Response(
      JSON.stringify({ id, name: `Cuenta ${id}`, currency: "NIO", account_status: 1 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  lastInsightsUrl = url;

  const failing = [...failingAccounts].find((account) => url.includes(account));
  if (failing) {
    return new Response(
      JSON.stringify({
        error: { message: "(#200) Ad account not accessible", code: 200 },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const empty = [...emptyAccounts].find((account) => url.includes(account));
  if (empty) {
    // Meta responde así cuando en ese periodo no hubo entrega.
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ data: [{ ...insights, account_currency: "NIO" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof globalThis.fetch;

// --- Sesión ---------------------------------------------------------------

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

function snapshotsFor(adAccountId: string, datePreset = "ULTIMOS_7D") {
  return prisma.metaAdMetricSnapshot.count({ where: { adAccountId, datePreset } });
}

async function main() {
  console.log(`\nSMOKE-META-4 — métricas de cuentas publicitarias (${TAG})\n`);

  const adminUser = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  const actorId = adminUser?.id ?? "smoke-meta4-actor";
  await signInAs("ADMIN", actorId);

  // Registro: cuatro cuentas conectadas.
  for (const account of ALL) {
    const result = await connectMetaAdAccount(account, `${TAG} ${account}`);
    if (!result.ok) throw new Error(`no se pudo conectar ${account}: ${result.error}`);
  }
  check("las cuatro cuentas de prueba quedaron conectadas", true);

  // --- 1. Refrescar crea una foto con el date_preset correcto ------------
  const callsBefore = graphCalls;
  const refreshed = await refreshMetaAdMetrics(ACC_A, "ULTIMOS_7D");
  check(
    "refrescar una cuenta conectada devuelve ok",
    refreshed.ok,
    refreshed.ok ? "" : `${refreshed.code}: ${refreshed.error}`,
  );
  check(
    "el refresco consultó el Graph API",
    graphCalls === callsBefore + 1,
    `llamadas=${graphCalls - callsBefore}`,
  );
  check(
    "la petición usó el date_preset de Meta, no el del CRM",
    decodeURIComponent(lastInsightsUrl).includes(
      `date_preset=${metaAdDatePresetApiValues.ULTIMOS_7D}`,
    ) && decodeURIComponent(lastInsightsUrl).includes("/insights"),
    lastInsightsUrl,
  );
  check(
    "ULTIMOS_7D traduce exactamente a last_7d",
    metaAdDatePresetApiValues.ULTIMOS_7D === "last_7d" &&
      metaAdDatePresetApiValues.HOY === "today" &&
      metaAdDatePresetApiValues.ULTIMOS_30D === "last_30d" &&
      metaAdDatePresetApiValues.ESTE_MES === "this_month" &&
      metaAdDatePresetApiValues.MES_PASADO === "last_month",
  );

  const first = await prisma.metaAdMetricSnapshot.findFirst({
    where: { adAccountId: ACC_A, datePreset: "ULTIMOS_7D" },
    select: {
      id: true,
      impressions: true,
      clicks: true,
      spend: true,
      currency: true,
      ctr: true,
      cpc: true,
    },
  });
  check(
    "la foto guardó las cifras que devolvió Meta",
    Number(first?.impressions) === 1500 &&
      Number(first?.clicks) === 60 &&
      Number(first?.spend) === 250.75 &&
      first?.currency === "NIO" &&
      Number(first?.ctr) === 4 &&
      Number(first?.cpc) === 4.1792,
    JSON.stringify({
      impressions: String(first?.impressions),
      clicks: String(first?.clicks),
      spend: String(first?.spend),
      ctr: String(first?.ctr),
      cpc: String(first?.cpc),
    }),
  );

  // --- 2. Segundo refresco → fila NUEVA, la primera sigue ----------------
  insights = { impressions: "1800", clicks: "75", spend: "310.00", ctr: "4.1667", cpc: "4.1333" };
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const second = await refreshMetaAdMetrics(ACC_A, "ULTIMOS_7D");
  check("el segundo refresco devuelve ok", second.ok);
  check(
    "hay DOS fotos: la segunda no pisó la primera",
    (await snapshotsFor(ACC_A)) === 2,
    `fotos=${await snapshotsFor(ACC_A)}`,
  );
  check(
    "la primera foto sigue existiendo con sus cifras originales",
    Number(
      (
        await prisma.metaAdMetricSnapshot.findUnique({
          where: { id: first?.id ?? "" },
          select: { impressions: true },
        })
      )?.impressions,
    ) === 1500,
  );

  // --- 3 y 7. El tablero lee la más reciente, SIN tocar la red -----------
  const callsBeforeRead = graphCalls;
  const board = await getLatestMetaAdMetrics("ULTIMOS_7D");
  check(
    "LEER EL TABLERO NO HIZO NI UNA LLAMADA AL GRAPH API",
    graphCalls === callsBeforeRead,
    `llamadas=${graphCalls - callsBeforeRead}`,
  );

  const rowA = board.rows.find((row) => row.adAccountId === ACC_A);
  check(
    "el tablero devuelve la foto MÁS RECIENTE de la cuenta",
    rowA?.snapshot?.impressions === 1800 && rowA?.snapshot?.clicks === 75,
    JSON.stringify(rowA?.snapshot),
  );
  check(
    "la foto del tablero trae su fecha para poder mostrar su edad",
    typeof rowA?.snapshot?.fetchedAt === "string" &&
      !Number.isNaN(new Date(rowA.snapshot.fetchedAt).getTime()),
  );

  // --- 4. Sin foto ≠ foto con ceros --------------------------------------
  emptyAccounts.add(ACC_ZERO);
  const zeroed = await refreshMetaAdMetrics(ACC_ZERO, "ULTIMOS_7D");
  check("una cuenta sin entrega también se puede refrescar", zeroed.ok,
    zeroed.ok ? "" : `${zeroed.code}: ${zeroed.error}`);

  const board2 = await getLatestMetaAdMetrics("ULTIMOS_7D");
  const rowZero = board2.rows.find((row) => row.adAccountId === ACC_ZERO);
  const rowNever = board2.rows.find((row) => row.adAccountId === ACC_NEVER);

  check(
    "la cuenta consultada sin actividad tiene FOTO con ceros",
    rowZero?.snapshot !== null &&
      rowZero?.snapshot?.impressions === 0 &&
      rowZero?.snapshot?.spend === 0,
    JSON.stringify(rowZero?.snapshot),
  );
  check(
    "la foto de ceros hereda la moneda del registro, no queda vacía",
    rowZero?.snapshot?.currency === "NIO",
    rowZero?.snapshot?.currency,
  );
  check(
    "sin clics, el CPC es null y no cero: no es que cada clic saliera gratis",
    rowZero?.snapshot?.cpc === null,
  );
  check(
    "la cuenta NUNCA consultada tiene snapshot en null",
    rowNever !== undefined && rowNever.snapshot === null,
  );
  check(
    "los dos estados son distinguibles: uno tiene foto y el otro no",
    rowZero?.snapshot !== null && rowNever?.snapshot === null,
  );

  // --- 5. Fallo parcial en refreshAll ------------------------------------
  failingAccounts.add(ACC_B);
  const beforeAllA = await snapshotsFor(ACC_A);
  const beforeAllB = await snapshotsFor(ACC_B);

  const summary = await refreshAllMetaAdMetrics("ULTIMOS_7D");
  check(
    "refrescar todo informa de que hubo problemas",
    !summary.ok && summary.failures.length === 1,
    JSON.stringify(summary.failures),
  );
  check(
    "el fallo señala exactamente la cuenta que falló",
    summary.failures[0]?.adAccountId === ACC_B,
    summary.failures[0]?.adAccountId,
  );
  check(
    "las otras tres cuentas SÍ se actualizaron pese al fallo de una",
    summary.refreshed === 3,
    `actualizadas=${summary.refreshed}`,
  );
  check(
    "la cuenta que iba después de la fallida recibió su foto nueva",
    (await snapshotsFor(ACC_A)) === beforeAllA + 1,
    `antes=${beforeAllA} después=${await snapshotsFor(ACC_A)}`,
  );
  check(
    "la cuenta fallida no dejó ninguna foto",
    (await snapshotsFor(ACC_B)) === beforeAllB,
    `antes=${beforeAllB} después=${await snapshotsFor(ACC_B)}`,
  );
  failingAccounts.delete(ACC_B);

  // --- 8. Cuenta fuera del registro --------------------------------------
  const unknown = await refreshMetaAdMetrics(`act_95${STAMP}`, "ULTIMOS_7D");
  check(
    "no se puede refrescar una cuenta que no está en el registro",
    !unknown.ok && unknown.code === "no-encontrada",
    unknown.ok ? "lo dejó pasar" : `código=${unknown.code}`,
  );

  const badPreset = await refreshMetaAdMetrics(ACC_A, "ULTIMO_TRIMESTRE");
  check(
    "un periodo fuera de los cinco se rechaza",
    !badPreset.ok && badPreset.code === "periodo-invalido",
    badPreset.ok ? "lo aceptó" : `código=${badPreset.code}`,
  );

  // --- Los periodos no se mezclan ----------------------------------------
  await refreshMetaAdMetrics(ACC_A, "HOY");
  check(
    "una foto de HOY no cuenta como foto de ULTIMOS_7D",
    (await snapshotsFor(ACC_A, "HOY")) === 1,
  );
  const boardToday = await getLatestMetaAdMetrics("HOY");
  const boardWeek = await getLatestMetaAdMetrics("ULTIMOS_7D");
  check(
    "cada periodo tiene su propia foto en el tablero",
    boardToday.rows.find((r) => r.adAccountId === ACC_A)?.snapshot !== null &&
      boardWeek.rows.find((r) => r.adAccountId === ACC_A)?.snapshot !== null &&
      boardToday.rows.find((r) => r.adAccountId === ACC_A)?.snapshot?.id !==
        boardWeek.rows.find((r) => r.adAccountId === ACC_A)?.snapshot?.id,
  );
  check(
    "un periodo nunca consultado sigue vacío para todas las cuentas",
    (await getLatestMetaAdMetrics("MES_PASADO")).rows
      .filter((row) => ALL.includes(row.adAccountId))
      .every((row) => row.snapshot === null),
  );

  // --- 6. Puerta de permiso ---------------------------------------------
  await signInAs("VENDEDOR", actorId);
  const callsBeforeForbidden = graphCalls;
  const beforeForbidden = await snapshotsFor(ACC_A);

  const forbiddenOne = await refreshMetaAdMetrics(ACC_A, "ULTIMOS_7D");
  check(
    "un Vendedor no puede refrescar una cuenta",
    !forbiddenOne.ok,
    forbiddenOne.ok ? "lo dejó pasar" : "",
  );
  const forbiddenAll = await refreshAllMetaAdMetrics("ULTIMOS_7D");
  check(
    "un Vendedor no puede refrescar todo",
    !forbiddenAll.ok && forbiddenAll.refreshed === 0,
    `actualizadas=${forbiddenAll.refreshed}`,
  );
  check(
    "los intentos del Vendedor no tocaron la red ni dejaron fotos",
    graphCalls === callsBeforeForbidden &&
      (await snapshotsFor(ACC_A)) === beforeForbidden,
  );

  // La lectura sí es legítima para quien ya ve el panel; sigue sin tocar red.
  const callsBeforeReadAgain = graphCalls;
  await getLatestMetaAdMetrics("ULTIMOS_7D");
  check(
    "leer el tablero sigue sin llamar a Meta en ningún caso",
    graphCalls === callsBeforeReadAgain,
  );
}

async function cleanup() {
  await prisma.metaAdMetricSnapshot.deleteMany({
    where: { adAccountId: { in: [...ALL, `act_95${STAMP}`] } },
  });
  await prisma.metaAdAccount.deleteMany({
    where: { adAccountId: { in: [...ALL, `act_95${STAMP}`] } },
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
