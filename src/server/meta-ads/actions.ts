"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { canManageMarketing } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  fetchAdAccountInsights,
  fetchAdAccountMetadata,
} from "@/server/meta-ads/client";
import {
  MAX_AD_ACCOUNT_LABEL,
  isMetaAdDatePresetValue,
  metaAdAccountErrorMessages,
  normalizeAdAccountId,
  type MetaAdAccountErrorCode,
  type MetaAdAccountResult,
  type MetaAdRefreshSummary,
} from "@/server/meta-ads/shared";

/**
 * Escrituras del registro de cuentas publicitarias. Server Actions, como todo lo
 * que no sea la entrega HTTP de Meta.
 *
 * El rol se vuelve a comprobar en cada acción con `canManageMarketing` (Admin y
 * MARKETING), la misma puerta de Meta-1; no se inventa un permiso nuevo.
 *
 * **Sólo lectura y conexión.** Aquí no se crea ninguna campaña, no se pausa
 * ninguna, no se cambia ningún presupuesto y no se gasta dinero. Conectar es
 * anotar un identificador en la base después de comprobar que el token puede
 * leerlo; desconectar es borrar esa anotación.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION =
  "No tienes permiso para gestionar las cuentas publicitarias de Meta.";

function fail(
  code: MetaAdAccountErrorCode,
  detail?: string,
): MetaAdAccountResult {
  return {
    ok: false,
    code,
    error: detail
      ? `${metaAdAccountErrorMessages[code]} (${detail})`
      : metaAdAccountErrorMessages[code],
  };
}

/** `null` = sin etiqueta; `false` = etiqueta rechazada por larga. */
function normalizeLabel(value: string | null | undefined): string | null | false {
  if (!value) return null;
  const clean = sanitizeText(value);
  if (!clean) return null;
  if (clean.length > MAX_AD_ACCOUNT_LABEL) return false;
  return clean;
}

/** El lado de fallo, para poder leer `.error` sin estrechar en cada llamada. */
type MetaAdAccountFailure = Extract<MetaAdAccountResult, { ok: false }>;

/** Admin o MARKETING, comprobado en el servidor. */
async function requireMarketingManager(): Promise<MetaAdAccountFailure | null> {
  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, code: "sin-acceso", error: NO_PERMISSION };
  }
  return null;
}

/**
 * Conecta una cuenta publicitaria al registro.
 *
 * El orden importa y es deliberado:
 *
 *   1. Se valida la FORMA del identificador. Un valor que no es `act_` + dígitos
 *      no puede existir en Meta, así que gastar una llamada de red en
 *      comprobarlo sería tirar una petición para confirmar lo que ya se sabe.
 *   2. Se consulta el Graph API. **Ésta es la validación de verdad**: comprueba
 *      que la cuenta existe Y que este token puede leerla. Sin ella el registro
 *      aceptaría identificadores bien formados que no sirven para nada, y el
 *      fallo aparecería mucho más tarde, en el tablero.
 *   3. Sólo entonces se escribe la fila, ya con los metadatos traídos.
 *
 * Si cualquiera de los dos primeros pasos falla, **no se crea ninguna fila**.
 */
export async function connectMetaAdAccount(
  adAccountId: string,
  label?: string | null,
): Promise<MetaAdAccountResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, code: "graph-api", error: DB_REQUIRED };
  }

  const denied = await requireMarketingManager();
  if (denied) return denied;

  const normalized = normalizeAdAccountId(adAccountId);
  if (!normalized) return fail("identificador-invalido");

  const cleanLabel = normalizeLabel(label);
  if (cleanLabel === false) return fail("etiqueta-invalida");

  const fetched = await fetchAdAccountMetadata(normalized);
  if (!fetched.ok) return fail(fetched.code, fetched.detail);

  try {
    const created = await getPrisma().metaAdAccount.create({
      data: {
        adAccountId: normalized,
        label: cleanLabel,
        accountName: fetched.metadata.accountName,
        currency: fetched.metadata.currency,
        accountStatus: fetched.metadata.accountStatus,
        // `lastSyncedAt` se queda nulo: lo que hay es lo del alta, y todavía no
        // se ha resincronizado nunca. Rellenarlo aquí haría que el panel
        // mintiera sobre cuándo se comprobó por última vez.
      },
      select: { id: true },
    });
    revalidatePath("/panel/marketing");
    return { ok: true, id: created.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail("ya-conectada");
    }
    throw error;
  }
}

/** Cambia la etiqueta o el interruptor de seguimiento. No toca nada en Meta. */
export async function updateMetaAdAccount(input: {
  id: string;
  label: string | null;
  isActive: boolean;
}): Promise<MetaAdAccountResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, code: "graph-api", error: DB_REQUIRED };
  }

  const denied = await requireMarketingManager();
  if (denied) return denied;

  const cleanLabel = normalizeLabel(input.label);
  if (cleanLabel === false) return fail("etiqueta-invalida");

  const prisma = getPrisma();
  const existing = await prisma.metaAdAccount.findUnique({
    where: { id: input.id },
    select: { id: true },
  });
  if (!existing) return fail("no-encontrada");

  await prisma.metaAdAccount.update({
    where: { id: input.id },
    data: { label: cleanLabel, isActive: input.isActive },
  });
  revalidatePath("/panel/marketing");
  return { ok: true, id: input.id };
}

/**
 * Quita la cuenta del registro.
 *
 * **Esto NO revoca nada en Meta.** El Usuario del Sistema conserva exactamente
 * el mismo acceso que tenía; lo único que cambia es que MotoMas deja de seguir
 * la cuenta aquí. Revocar el acceso de verdad es un paso manual y aparte, en el
 * Business Manager. La pantalla lo dice con estas mismas palabras para que
 * borrar la fila no se confunda con revocar.
 */
export async function disconnectMetaAdAccount(
  id: string,
): Promise<MetaAdAccountResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, code: "graph-api", error: DB_REQUIRED };
  }

  const denied = await requireMarketingManager();
  if (denied) return denied;

  const prisma = getPrisma();
  const existing = await prisma.metaAdAccount.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return fail("no-encontrada");

  await prisma.metaAdAccount.delete({ where: { id } });
  revalidatePath("/panel/marketing");
  return { ok: true, id };
}

/**
 * Vuelve a leer nombre, moneda y estado, y sella `lastSyncedAt`.
 *
 * Es un botón, no un trabajo programado: construir una sincronización automática
 * queda fuera de este parche. Mientras no se pulse, lo que muestra el panel es
 * lo que Meta dijo al conectar — y `lastSyncedAt` es precisamente lo que permite
 * saberlo en vez de suponerlo.
 *
 * Si la consulta falla, la fila se queda como estaba: media actualización sería
 * peor que ninguna, porque dejaría metadatos nuevos con una fecha vieja.
 */
export async function resyncMetaAdAccountMetadata(
  id: string,
): Promise<MetaAdAccountResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, code: "graph-api", error: DB_REQUIRED };
  }

  const denied = await requireMarketingManager();
  if (denied) return denied;

  const prisma = getPrisma();
  const existing = await prisma.metaAdAccount.findUnique({
    where: { id },
    select: { id: true, adAccountId: true },
  });
  if (!existing) return fail("no-encontrada");

  const fetched = await fetchAdAccountMetadata(existing.adAccountId);
  if (!fetched.ok) return fail(fetched.code, fetched.detail);

  await prisma.metaAdAccount.update({
    where: { id },
    data: {
      accountName: fetched.metadata.accountName,
      currency: fetched.metadata.currency,
      accountStatus: fetched.metadata.accountStatus,
      lastSyncedAt: new Date(),
    },
  });
  revalidatePath("/panel/marketing");
  return { ok: true, id };
}

// --- Métricas (Patch Meta-4) ---------------------------------------------

/**
 * Refresca las métricas de una cuenta para un periodo y **añade** una foto.
 *
 * No borra ni pisa las anteriores: `MetaAdMetricSnapshot` es un historial, no una
 * casilla de caché. El tablero se queda con la más reciente por (cuenta,
 * periodo), y el resto es el registro de qué dijo Meta y cuándo.
 *
 * Que la cuenta exista hoy en el registro se comprueba **aquí** y no con una
 * clave foránea: la tabla de fotos guarda deliberadamente el `act_…` sin FK para
 * que desconectar una cuenta no borre la prueba de lo que se gastó. Esa regla
 * vive en la aplicación porque es donde puede decir algo útil en español.
 */
export async function refreshMetaAdMetrics(
  adAccountId: string,
  datePreset: string,
): Promise<MetaAdAccountResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, code: "graph-api", error: DB_REQUIRED };
  }

  const denied = await requireMarketingManager();
  if (denied) return denied;

  const normalized = normalizeAdAccountId(adAccountId);
  if (!normalized) return fail("identificador-invalido");
  if (!isMetaAdDatePresetValue(datePreset)) return fail("periodo-invalido");

  const prisma = getPrisma();
  const account = await prisma.metaAdAccount.findUnique({
    where: { adAccountId: normalized },
    select: { currency: true },
  });
  if (!account) return fail("no-encontrada");

  const fetched = await fetchAdAccountInsights(normalized, datePreset);
  if (!fetched.ok) return fail(fetched.code, fetched.detail);

  /*
   * La moneda sale del propio informe. Si Meta no la manda —pasa cuando el
   * periodo no tuvo entrega y `data` vino vacío— se cae a la del registro. Si no
   * hay ninguna de las dos no se guarda la foto: un gasto sin moneda no
   * significa nada, y guardarlo con una moneda inventada sería peor que no
   * guardarlo.
   */
  const currency = fetched.insights.currency ?? account.currency;
  if (!currency) return fail("moneda-desconocida");

  const snapshot = await prisma.metaAdMetricSnapshot.create({
    data: {
      adAccountId: normalized,
      datePreset,
      impressions: BigInt(fetched.insights.impressions),
      clicks: BigInt(fetched.insights.clicks),
      spend: fetched.insights.spend,
      currency,
      // `ctr` se guarda tal cual lo dio Meta. Recalcularlo desde clics entre
      // impresiones daría otro número —Meta aplica sus propias reglas de
      // atribución— y parecería un error de Meta cuando sería nuestro.
      ctr: fetched.insights.ctr,
      cpc: fetched.insights.cpc,
    },
    select: { id: true },
  });

  revalidatePath("/panel/marketing");
  return { ok: true, id: snapshot.id };
}

/**
 * Refresca todas las cuentas activas del registro, para el mismo periodo.
 *
 * **Secuencial, no `Promise.all`.** Disparar una petición por cuenta a la vez es
 * exactamente lo que los límites de frecuencia de la Marketing API castigan, y
 * con varias cuentas conectadas sería la forma más rápida de que el botón dejara
 * de funcionar.
 *
 * El fallo de una cuenta **no aborta las demás**: se anota y se sigue. Si una
 * cuenta perdió el acceso, eso no puede dejar sin actualizar a las otras trece.
 *
 * Sigue sin haber ningún trabajo programado: esto lo dispara una persona.
 */
export async function refreshAllMetaAdMetrics(
  datePreset: string,
): Promise<MetaAdRefreshSummary> {
  if (!isDatabaseConfigured()) {
    return { ok: false, refreshed: 0, failures: [{ adAccountId: "—", error: DB_REQUIRED }] };
  }

  const denied = await requireMarketingManager();
  if (denied) {
    return {
      ok: false,
      refreshed: 0,
      failures: [{ adAccountId: "—", error: denied.error }],
    };
  }

  if (!isMetaAdDatePresetValue(datePreset)) {
    return {
      ok: false,
      refreshed: 0,
      failures: [
        { adAccountId: "—", error: metaAdAccountErrorMessages["periodo-invalido"] },
      ],
    };
  }

  const accounts = await getPrisma().metaAdAccount.findMany({
    where: { isActive: true },
    orderBy: { connectedAt: "asc" },
    select: { adAccountId: true },
  });

  let refreshed = 0;
  const failures: { adAccountId: string; error: string }[] = [];

  for (const account of accounts) {
    try {
      const result = await refreshMetaAdMetrics(account.adAccountId, datePreset);
      if (result.ok) refreshed += 1;
      else failures.push({ adAccountId: account.adAccountId, error: result.error });
    } catch (error) {
      // Una excepción de una cuenta tampoco puede tumbar el resto del recorrido.
      failures.push({
        adAccountId: account.adAccountId,
        error: error instanceof Error ? error.message : "error desconocido",
      });
    }
  }

  revalidatePath("/panel/marketing");
  return { ok: failures.length === 0, refreshed, failures };
}
