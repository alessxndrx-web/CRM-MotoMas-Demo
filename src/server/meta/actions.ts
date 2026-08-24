"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { canManageMarketing } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { createLeadFromMetaFields } from "@/server/meta/ingest";
import {
  asMetaFieldEntries,
  type MetaPageBranchInput,
} from "@/server/meta/shared";

/**
 * Escrituras del módulo Meta. Todo lo que no sea la entrega HTTP de Meta pasa
 * por aquí como Server Action, igual que el resto de la aplicación — la ruta
 * `src/app/api/webhooks/meta/route.ts` es la única excepción y sólo porque Meta
 * llama desde fuera.
 *
 * El rol se vuelve a comprobar en cada acción con `canManageMarketing` (Admin y
 * MARKETING), la misma puerta que ya usan las campañas; no se inventa un permiso
 * nuevo. La sucursal se resuelve desde un *código*, nunca se acepta un id crudo
 * del cliente, siguiendo `createMarketingCampaignAction`.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para gestionar la integración de Meta.";
const MAPPING_NOT_FOUND = "El mapeo de página no existe.";
const STAGED_NOT_FOUND = "El lead pendiente no existe.";
const ALREADY_RESOLVED = "Ese lead pendiente ya fue resuelto.";
const BRANCH_NOT_FOUND = "La sucursal seleccionada no existe.";
const DUPLICATE_PAGE = "Esa página ya está mapeada a una sucursal.";
const INVALID_PAGE_ID =
  "El identificador de página de Meta debe ser numérico (sólo dígitos).";
const INVALID_LABEL = "El nombre de la página es demasiado largo.";

const MAX_LABEL = 120;
const MAX_PAGE_ID = 32;

export type MetaActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** El `page_id` de Meta es numérico. Un valor con letras nunca coincidirá. */
function normalizePageId(value: string): string | null {
  const clean = (value ?? "").trim();
  if (!clean || clean.length > MAX_PAGE_ID) return null;
  if (!/^\d+$/.test(clean)) return null;
  return clean;
}

function normalizeLabel(value: string | null): string | null | false {
  if (!value) return null;
  const clean = sanitizeText(value);
  if (!clean) return null;
  if (clean.length > MAX_LABEL) return false;
  return clean;
}

async function resolveBranchIdByCode(branchCode: string): Promise<string | null> {
  const branch = await getPrisma().branch.findUnique({
    where: { code: (branchCode ?? "").trim() },
    select: { id: true },
  });
  return branch?.id ?? null;
}

export async function createMetaPageBranchMapping(
  input: MetaPageBranchInput,
): Promise<MetaActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const pageId = normalizePageId(input.pageId);
  if (!pageId) return { ok: false, error: INVALID_PAGE_ID };

  const label = normalizeLabel(input.label);
  if (label === false) return { ok: false, error: INVALID_LABEL };

  const branchId = await resolveBranchIdByCode(input.branchCode);
  if (!branchId) return { ok: false, error: BRANCH_NOT_FOUND };

  try {
    const mapping = await getPrisma().metaPageBranch.create({
      data: { pageId, branchId, label, isActive: input.isActive },
      select: { id: true },
    });
    revalidatePath("/panel/marketing");
    return { ok: true, id: mapping.id };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: DUPLICATE_PAGE };
    }
    throw error;
  }
}

/** Cambia sucursal, nombre o el interruptor de activo de un mapeo existente. */
export async function updateMetaPageBranchMapping(
  mappingId: string,
  input: MetaPageBranchInput,
): Promise<MetaActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const pageId = normalizePageId(input.pageId);
  if (!pageId) return { ok: false, error: INVALID_PAGE_ID };

  const label = normalizeLabel(input.label);
  if (label === false) return { ok: false, error: INVALID_LABEL };

  const branchId = await resolveBranchIdByCode(input.branchCode);
  if (!branchId) return { ok: false, error: BRANCH_NOT_FOUND };

  const prisma = getPrisma();
  const existing = await prisma.metaPageBranch.findUnique({
    where: { id: mappingId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: MAPPING_NOT_FOUND };

  try {
    await prisma.metaPageBranch.update({
      where: { id: mappingId },
      data: { pageId, branchId, label, isActive: input.isActive },
    });
    revalidatePath("/panel/marketing");
    return { ok: true, id: mappingId };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: DUPLICATE_PAGE };
    }
    throw error;
  }
}

/**
 * Borra un mapeo. Los `Lead` que ya entraron por esa página no se tocan: nacen
 * con su `branchId` copiado, no con una referencia al mapeo, justamente para que
 * desconectar una página no reescriba historia.
 */
export async function deleteMetaPageBranchMapping(
  mappingId: string,
): Promise<MetaActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const prisma = getPrisma();
  const existing = await prisma.metaPageBranch.findUnique({
    where: { id: mappingId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: MAPPING_NOT_FOUND };

  await prisma.metaPageBranch.delete({ where: { id: mappingId } });
  revalidatePath("/panel/marketing");
  return { ok: true, id: mappingId };
}

/**
 * Convierte un lead del andén en un `Lead` de la sucursal elegida a mano.
 *
 * Usa exactamente el mismo mapeo de campos que el webhook
 * (`createLeadFromMetaFields`): un lead resuelto a mano y uno captado
 * automáticamente quedan guardados igual.
 *
 * Rechaza si la fila ya estaba resuelta, así que un doble clic no produce un
 * segundo `Lead`.
 */
export async function resolveUnmappedMetaLead(
  stagedId: string,
  branchCode: string,
): Promise<MetaActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const prisma = getPrisma();
  const staged = await prisma.metaUnmappedLead.findUnique({
    where: { id: stagedId },
    select: {
      id: true,
      leadgenId: true,
      fetchedFields: true,
      resolvedAt: true,
      resolvedLeadId: true,
    },
  });
  if (!staged) return { ok: false, error: STAGED_NOT_FOUND };
  if (staged.resolvedAt) return { ok: false, error: ALREADY_RESOLVED };

  const branchId = await resolveBranchIdByCode(branchCode);
  if (!branchId) return { ok: false, error: BRANCH_NOT_FOUND };

  const created = await createLeadFromMetaFields({
    leadgenId: staged.leadgenId,
    branchId,
    fieldData: asMetaFieldEntries(staged.fetchedFields),
    // El andén guarda `field_data` crudo y no la plataforma, así que un lead
    // resuelto a mano queda como "Facebook Ads" — el valor por defecto de Lead
    // Ads. Ver docs/META_INTEGRATIONS.md §Limitaciones.
    platform: undefined,
  });

  if (!created.ok) {
    return {
      ok: false,
      error: `El formulario no capturó ${created.missing.join(" ni ")}; ese lead no puede crearse.`,
    };
  }

  /*
   * `updateMany` con `resolvedAt: null` en el filtro: dos clics simultáneos
   * pasan los dos por la lectura de arriba, y aquí sólo uno encuentra la fila
   * todavía sin resolver. El otro cuenta 0 y ya no reescribe la resolución del
   * que ganó. El `Lead` no se duplica porque `metaLeadgenId` es único.
   */
  const claimed = await prisma.metaUnmappedLead.updateMany({
    where: { id: stagedId, resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolvedLeadId: created.leadId,
      resolvedById: session.uid,
    },
  });
  if (claimed.count === 0) return { ok: false, error: ALREADY_RESOLVED };

  revalidatePath("/panel/marketing");
  return { ok: true, id: created.leadId };
}
