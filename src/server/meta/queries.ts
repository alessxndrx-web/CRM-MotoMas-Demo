import { getPrisma } from "@/server/db/prisma";
import {
  asMetaFieldEntries,
  checkMetaLeadCompleteness,
  mapMetaLeadFields,
  type BranchChoice,
  type MetaPageBranchDTO,
  type MetaUnmappedLeadDTO,
} from "@/server/meta/shared";

/**
 * Lecturas del módulo Meta para el panel de Marketing.
 *
 * El alcance es global a propósito: un mapeo página → sucursal es configuración
 * de la integración, no un dato de una sucursal. Quién puede verlo lo decide la
 * pantalla con `canManageMarketing` (Admin y MARKETING), la misma puerta que ya
 * usan las campañas.
 */

const LIST_LIMIT = 200;

export async function listMetaPageBranchMappings(): Promise<MetaPageBranchDTO[]> {
  const rows = await getPrisma().metaPageBranch.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    take: LIST_LIMIT,
    include: { branch: { select: { code: true, name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    pageId: row.pageId,
    label: row.label,
    branchId: row.branchId,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Leads en andén todavía sin resolver.
 *
 * El DTO no lleva ninguna respuesta del formulario — sólo los NOMBRES de las
 * preguntas que llegaron. Quien resuelve elige una sucursal, y esa decisión la
 * dicta la página de la que vino el lead, no la persona. Es la misma postura
 * que `MarketingLeadAttributionDTO` ya sostiene: Marketing mide sin ver la
 * identidad del lead.
 */
export async function listPendingMetaUnmappedLeads(): Promise<
  MetaUnmappedLeadDTO[]
> {
  const rows = await getPrisma().metaUnmappedLead.findMany({
    where: { resolvedAt: null },
    orderBy: { receivedAt: "asc" },
    take: LIST_LIMIT,
  });

  return rows.map((row) => {
    const fields = asMetaFieldEntries(row.fetchedFields);
    const completeness = checkMetaLeadCompleteness(mapMetaLeadFields(fields));
    return {
      id: row.id,
      leadgenId: row.leadgenId,
      pageId: row.pageId,
      formId: row.formId,
      receivedAt: row.receivedAt.toISOString(),
      capturedFields: fields.map((field) => field.name),
      isComplete: completeness.ok,
      missingFields: completeness.ok ? [] : completeness.missing,
    };
  });
}

/** Sucursales reales de la base — un mapeo tiene que apuntar a una que exista. */
export async function listBranchChoices(): Promise<BranchChoice[]> {
  const rows = await getPrisma().branch.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });
  return rows;
}
