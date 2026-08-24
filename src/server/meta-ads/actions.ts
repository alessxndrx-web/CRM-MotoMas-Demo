"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { canManageMarketing } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { fetchAdAccountMetadata } from "@/server/meta-ads/client";
import {
  MAX_AD_ACCOUNT_LABEL,
  metaAdAccountErrorMessages,
  normalizeAdAccountId,
  type MetaAdAccountErrorCode,
  type MetaAdAccountResult,
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

/** Admin o MARKETING, comprobado en el servidor. */
async function requireMarketingManager(): Promise<MetaAdAccountResult | null> {
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
