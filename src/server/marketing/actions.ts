"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  canAccessBranch,
  canConfirmCampaignLeads,
  canManageMarketing,
  canReportCampaignLeads,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import { catalogModelLabel } from "@/server/catalog/shared";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  isMarketingCampaignObjectiveValue,
  isMarketingCampaignStatusValue,
  isMarketingChannelValue,
  marketingCampaignObjectiveLabels,
  marketingCampaignStatusLabels,
  marketingChannelLabels,
  type MarketingCampaignInput,
} from "@/server/marketing/shared";
import {
  coverageAllows,
  resolveGrantCoverage,
} from "@/server/permissions/service";

/**
 * Server-side Marketing write actions. Admin and MARKETING manage campaigns —
 * the role is re-checked here, never trusted from the UI. Branches are resolved
 * from branch *codes*; a raw branch id is never accepted from a client. Enums
 * are validated and free text is sanitized before Prisma.
 *
 * These actions never touch Caja, Contabilidad or the public portal, never
 * create leads/customers/units, and imply no external ad-platform integration.
 *
 * ## Patch CRM-INT1
 *
 * - **Varias sucursales y varios modelos por campaña**, en
 *   `MarketingCampaignBranch` y `MarketingCampaignModel`. Ninguna = todas.
 * - **Permiso delegado.** El rol MARKETING abre la puerta; lo que decide en qué
 *   sucursales edita es su concesión `MARKETING_GESTIONAR_CAMPANAS`. Editar una
 *   campaña exige cubrir sus sucursales de antes **y** las de después: si no,
 *   bastaría con quitarle una sucursal ajena para poder tocarla.
 * - **Edición segura.** Una campaña finalizada sólo admite nombre, descripción
 *   y estado; y ninguna campaña pierde una sucursal que ya tiene leads
 *   atribuidos o cifras reportadas, porque eso escondería historia de los
 *   informes.
 * - **Rastro.** Alta, edición y cierre dejan una fila en `UserAuditLog` con lo
 *   que cambió.
 * - **Conciliación.** Marketing registra cuántos leads reporta por sucursal;
 *   la sucursal confirma; Marketing revisa. Nada de esto crea, borra ni mueve un
 *   lead.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para gestionar campañas.";
const NOT_FOUND = "La campaña no existe.";
const INVALID = "Revisa los datos de la campaña.";
const UNKNOWN_AD_ACCOUNT =
  "La cuenta publicitaria seleccionada ya no está conectada.";

export type MarketingActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_BUDGET = 100_000_000;
const MAX_REPORTED_LEADS = 1_000_000;

function normalizedName(value: string): string | null {
  const clean = sanitizeText(value);
  if (!clean || clean.length > MAX_NAME) return null;
  return clean;
}

function optionalDescription(value: string | null): string | null {
  if (!value) return null;
  const clean = sanitizeText(value);
  return clean ? clean.slice(0, MAX_DESCRIPTION) : null;
}

/** A valid non-negative budget, or null. Rejects NaN/negative/oversized. */
function sanitizeBudget(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > MAX_BUDGET) return null;
  return Math.round(value * 100) / 100;
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type ValidatedCampaign = {
  name: string;
  channel: MarketingCampaignInput["channel"];
  estimatedBudget: number | null;
  startsAt: Date;
  endsAt: Date | null;
  status: MarketingCampaignInput["status"];
  objective: MarketingCampaignInput["objective"];
  description: string | null;
};

function validate(
  input: MarketingCampaignInput,
): { ok: true; data: ValidatedCampaign } | { ok: false; error: string } {
  const name = normalizedName(input.name);
  if (!name) {
    return { ok: false, error: `El nombre es obligatorio (máximo ${MAX_NAME} caracteres).` };
  }
  if (!isMarketingChannelValue(input.channel)) return { ok: false, error: INVALID };
  if (!isMarketingCampaignStatusValue(input.status)) return { ok: false, error: INVALID };
  if (!isMarketingCampaignObjectiveValue(input.objective)) {
    return { ok: false, error: INVALID };
  }

  const startsAt = parseDate(input.startsAt);
  if (!startsAt) return { ok: false, error: "La fecha de inicio no es válida." };
  let endsAt: Date | null = null;
  if (input.endsAt) {
    endsAt = parseDate(input.endsAt);
    if (!endsAt) return { ok: false, error: "La fecha de fin no es válida." };
    if (endsAt.getTime() < startsAt.getTime()) {
      return { ok: false, error: "La fecha de fin no puede ser anterior a la de inicio." };
    }
  }
  if (input.estimatedBudget !== null && sanitizeBudget(input.estimatedBudget) === null) {
    return { ok: false, error: "El presupuesto debe ser un monto positivo." };
  }

  return {
    ok: true,
    data: {
      name,
      channel: input.channel,
      estimatedBudget: sanitizeBudget(input.estimatedBudget),
      startsAt,
      endsAt,
      status: input.status,
      objective: input.objective,
      description: optionalDescription(input.description),
    },
  };
}

/**
 * Patch Attribution-1 — comprueba que la cuenta publicitaria elegida existe.
 *
 * El identificador llega del navegador, así que **se verifica contra el registro
 * antes de guardarlo**; el resto del formulario ya sigue esa regla (las
 * sucursales se resuelven desde su código, nunca desde un id crudo).
 *
 * Se distingue «no eligió ninguna» —válido, la campaña se queda sin gasto
 * asociado— de «eligió una que no está», que es un error con su propio mensaje:
 * guardar `null` en silencio dejaría a Marketing creyendo que enlazó algo.
 */
async function resolveMetaAdAccountId(
  metaAdAccountId: string | null,
): Promise<{ ok: true; id: string | null } | { ok: false }> {
  if (!metaAdAccountId) return { ok: true, id: null };
  const account = await getPrisma().metaAdAccount.findUnique({
    where: { id: metaAdAccountId },
    select: { id: true },
  });
  return account ? { ok: true, id: account.id } : { ok: false };
}

/**
 * Patch CRM-INT1 — los códigos de sucursal a ids. Sólo sucursales activas para
 * una campaña nueva; al editar se admiten además las que la campaña ya tenía,
 * aunque se hayan desactivado después (quitarlas sería reescribir historia).
 */
async function resolveBranchIds(
  codes: readonly string[],
  keepIds: ReadonlySet<string> = new Set(),
): Promise<{ ok: true; ids: string[]; names: Map<string, string> } | { ok: false; error: string }> {
  const unique = [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
  if (!unique.length) return { ok: true, ids: [], names: new Map() };
  const branches = await getPrisma().branch.findMany({
    where: { code: { in: unique } },
    select: { id: true, name: true, isActive: true },
  });
  if (branches.length !== unique.length) {
    return { ok: false, error: "Alguna sucursal elegida no existe." };
  }
  const inactive = branches.filter((branch) => !branch.isActive && !keepIds.has(branch.id));
  if (inactive.length) {
    return {
      ok: false,
      error: `La sucursal ${inactive.map((branch) => branch.name).join(", ")} está desactivada.`,
    };
  }
  return {
    ok: true,
    ids: branches.map((branch) => branch.id),
    names: new Map(branches.map((branch) => [branch.id, branch.name])),
  };
}

/** Patch CRM-INT1 — los modelos del catálogo, con la misma regla que las sucursales. */
async function resolveCatalogModelIds(
  ids: readonly string[],
  keepIds: ReadonlySet<string> = new Set(),
): Promise<{ ok: true; ids: string[]; labels: Map<string, string> } | { ok: false; error: string }> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (!unique.length) return { ok: true, ids: [], labels: new Map() };
  const models = await getPrisma().motorcycleCatalogModel.findMany({
    where: { id: { in: unique } },
  });
  if (models.length !== unique.length) {
    return { ok: false, error: "Algún modelo elegido no existe en el catálogo." };
  }
  const inactive = models.filter((model) => !model.isActive && !keepIds.has(model.id));
  if (inactive.length) {
    return {
      ok: false,
      error: `El modelo ${inactive.map(catalogModelLabel).join(", ")} está dado de baja en el catálogo.`,
    };
  }
  return {
    ok: true,
    ids: models.map((model) => model.id),
    labels: new Map(models.map((model) => [model.id, catalogModelLabel(model)])),
  };
}

async function authorizeManage(): Promise<
  | { ok: true; userId: string; role: UserRoleEnum }
  | { ok: false; error: string }
> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  return { ok: true, userId: session.uid, role: session.roleEnum };
}

function coverageError(branchIds: string[]): string {
  return branchIds.length
    ? "No tienes permiso para gestionar campañas en alguna de esas sucursales. Pide al Administrador que te lo conceda."
    : "Una campaña para todas las sucursales exige permiso en todas. Pide al Administrador que te lo conceda, o elige sucursales concretas.";
}

function revalidateMarketing(campaignId?: string) {
  revalidatePath("/panel/marketing");
  if (campaignId) revalidatePath(`/panel/marketing/campanas/${campaignId}`);
}

export async function createMarketingCampaignAction(
  input: MarketingCampaignInput,
): Promise<MarketingActionResult> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const valid = validate(input);
  if (!valid.ok) return valid;
  const data = valid.data;

  const branches = await resolveBranchIds(input.branchCodes ?? []);
  if (!branches.ok) return branches;
  const models = await resolveCatalogModelIds(input.catalogModelIds ?? []);
  if (!models.ok) return models;

  const prisma = getPrisma();
  const coverage = await resolveGrantCoverage(
    prisma,
    { id: auth.userId, role: auth.role },
    "MARKETING_GESTIONAR_CAMPANAS",
  );
  if (!coverageAllows(coverage, branches.ids)) {
    return { ok: false, error: coverageError(branches.ids) };
  }

  const adAccount = await resolveMetaAdAccountId(input.metaAdAccountId);
  if (!adAccount.ok) return { ok: false, error: UNKNOWN_AD_ACCOUNT };

  try {
    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.marketingCampaign.create({
        data: {
          ...data,
          // Heredado: la única sucursal cuando hay exactamente una. Ver el
          // comentario de la columna en el esquema.
          targetBranchId: branches.ids.length === 1 ? branches.ids[0] : null,
          metaAdAccountId: adAccount.id,
          createdById: auth.userId,
          branches: { create: branches.ids.map((branchId) => ({ branchId })) },
          models: { create: models.ids.map((catalogModelId) => ({ catalogModelId })) },
        },
        select: { id: true },
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.userId,
          action: "MARKETING_CAMPAIGN_CREATED",
          targetType: "MarketingCampaign",
          targetId: created.id,
          description:
            `Creó la campaña «${data.name}» · sucursales: ${
              branches.ids.length ? [...branches.names.values()].join(", ") : "todas"
            } · modelos: ${models.ids.length ? [...models.labels.values()].join(", ") : "todos"}.`,
        },
      });
      return created;
    });

    revalidateMarketing(campaign.id);
    return { ok: true, id: campaign.id };
  } catch {
    return { ok: false, error: "No se pudo crear la campaña." };
  }
}

/**
 * Edita una campaña. Ver el comentario del archivo para las reglas.
 *
 * Los cambios de sucursales y modelos se aplican como diferencia (se añaden
 * las nuevas y se quitan las que ya no están), dentro de la misma transacción
 * que el resto de campos y que su rastro de auditoría.
 */
export async function updateMarketingCampaignAction(
  campaignId: string,
  input: MarketingCampaignInput,
): Promise<MarketingActionResult> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const valid = validate(input);
  if (!valid.ok) return valid;
  const data = valid.data;

  const prisma = getPrisma();
  const existing = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
    include: {
      branches: { select: { branchId: true, branch: { select: { name: true } } } },
      models: { select: { catalogModelId: true } },
    },
  });
  if (!existing) return { ok: false, error: NOT_FOUND };

  const oldBranchIds = existing.branches.map((row) => row.branchId);
  const oldModelIds = existing.models.map((row) => row.catalogModelId);

  const branches = await resolveBranchIds(input.branchCodes ?? [], new Set(oldBranchIds));
  if (!branches.ok) return branches;
  const models = await resolveCatalogModelIds(input.catalogModelIds ?? [], new Set(oldModelIds));
  if (!models.ok) return models;

  const coverage = await resolveGrantCoverage(
    prisma,
    { id: auth.userId, role: auth.role },
    "MARKETING_GESTIONAR_CAMPANAS",
  );
  if (!coverageAllows(coverage, oldBranchIds) || !coverageAllows(coverage, branches.ids)) {
    return {
      ok: false,
      error: "No tienes permiso para editar esta campaña en todas sus sucursales.",
    };
  }

  const adAccount = await resolveMetaAdAccountId(input.metaAdAccountId);
  if (!adAccount.ok) return { ok: false, error: UNKNOWN_AD_ACCOUNT };

  const sameSet = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value) => b.includes(value));
  const sameDate = (a: Date | null, b: Date | null) =>
    (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const oldBudget = existing.estimatedBudget ? existing.estimatedBudget.toNumber() : null;

  // Qué cambia, en palabras. Sirve para el rastro y para aplicar la regla de
  // las campañas finalizadas sobre los mismos hechos.
  const structural: string[] = [];
  if (!sameSet(oldBranchIds, branches.ids)) structural.push("sucursales");
  if (!sameSet(oldModelIds, models.ids)) structural.push("modelos");
  if (!sameDate(existing.startsAt, data.startsAt)) structural.push("fecha de inicio");
  if (!sameDate(existing.endsAt, data.endsAt)) structural.push("fecha de fin");
  if (existing.channel !== data.channel) structural.push("canal");
  if (existing.objective !== data.objective) structural.push("objetivo");
  if (oldBudget !== data.estimatedBudget) structural.push("presupuesto");
  if ((existing.metaAdAccountId ?? null) !== adAccount.id) structural.push("cuenta publicitaria");

  if (existing.status === "COMPLETED" && structural.length) {
    return {
      ok: false,
      error:
        `La campaña está finalizada: sólo puedes cambiar nombre, descripción o estado. ` +
        `Para modificar ${structural.join(", ")}, reábrela primero.`,
    };
  }

  // Quitar una sucursal que ya tiene leads atribuidos o cifras reportadas
  // escondería esa historia de los informes de la campaña.
  const removedBranchIds = oldBranchIds.filter((id) => !branches.ids.includes(id));
  const becomesAll = branches.ids.length === 0 && oldBranchIds.length > 0;
  if (removedBranchIds.length && !becomesAll) {
    const [leadRows, reportRows] = await Promise.all([
      prisma.lead.groupBy({
        by: ["branchId"],
        where: { marketingCampaignId: campaignId, branchId: { in: removedBranchIds } },
      }),
      prisma.marketingCampaignLeadReport.findMany({
        where: { campaignId, branchId: { in: removedBranchIds } },
        select: { branchId: true },
      }),
    ]);
    const blocked = new Set([
      ...leadRows.map((row) => row.branchId),
      ...reportRows.map((row) => row.branchId),
    ]);
    if (blocked.size) {
      const names = existing.branches
        .filter((row) => blocked.has(row.branchId))
        .map((row) => row.branch.name);
      return {
        ok: false,
        error: `No puedes quitar ${names.join(", ")}: ya tiene leads atribuidos o cifras reportadas en esta campaña.`,
      };
    }
  }

  const changes = [...structural];
  if (existing.name !== data.name) changes.unshift(`nombre «${existing.name}» → «${data.name}»`);
  if ((existing.description ?? null) !== data.description) changes.push("descripción");
  if (existing.status !== data.status) {
    changes.push(
      `estado ${marketingCampaignStatusLabels[existing.status as keyof typeof marketingCampaignStatusLabels]} → ${marketingCampaignStatusLabels[data.status]}`,
    );
  }
  if (!changes.length) return { ok: true, id: campaignId };

  const detail: string[] = [];
  if (structural.includes("sucursales")) {
    detail.push(
      `sucursales: ${branches.ids.length ? [...branches.names.values()].join(", ") : "todas"}`,
    );
  }
  if (structural.includes("modelos")) {
    detail.push(`modelos: ${models.ids.length ? [...models.labels.values()].join(", ") : "todos"}`);
  }
  if (structural.includes("canal")) detail.push(`canal: ${marketingChannelLabels[data.channel]}`);
  if (structural.includes("objetivo")) {
    detail.push(`objetivo: ${marketingCampaignObjectiveLabels[data.objective]}`);
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.marketingCampaign.update({
        where: { id: campaignId },
        data: {
          ...data,
          targetBranchId: branches.ids.length === 1 ? branches.ids[0] : null,
          metaAdAccountId: adAccount.id,
        },
      });
      const addBranches = branches.ids.filter((id) => !oldBranchIds.includes(id));
      const dropBranches = oldBranchIds.filter((id) => !branches.ids.includes(id));
      if (dropBranches.length) {
        await tx.marketingCampaignBranch.deleteMany({
          where: { campaignId, branchId: { in: dropBranches } },
        });
      }
      if (addBranches.length) {
        await tx.marketingCampaignBranch.createMany({
          data: addBranches.map((branchId) => ({ campaignId, branchId })),
        });
      }
      const addModels = models.ids.filter((id) => !oldModelIds.includes(id));
      const dropModels = oldModelIds.filter((id) => !models.ids.includes(id));
      if (dropModels.length) {
        await tx.marketingCampaignModel.deleteMany({
          where: { campaignId, catalogModelId: { in: dropModels } },
        });
      }
      if (addModels.length) {
        await tx.marketingCampaignModel.createMany({
          data: addModels.map((catalogModelId) => ({ campaignId, catalogModelId })),
        });
      }
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.userId,
          action: "MARKETING_CAMPAIGN_UPDATED",
          targetType: "MarketingCampaign",
          targetId: campaignId,
          description:
            `Cambió ${changes.join(", ")}` + (detail.length ? ` (${detail.join("; ")})` : "") + ".",
        },
      });
    });
  } catch {
    return { ok: false, error: "No se pudo actualizar la campaña." };
  }

  revalidateMarketing(campaignId);
  return { ok: true, id: campaignId };
}

/**
 * Archive a campaign by marking it COMPLETED (the current flow has no hard
 * delete). Idempotent: archiving a completed campaign is a no-op success.
 * Patch CRM-INT1: exige la misma concesión que editarla y deja rastro.
 */
export async function archiveMarketingCampaignAction(
  campaignId: string,
): Promise<MarketingActionResult> {
  const auth = await authorizeManage();
  if (!auth.ok) return auth;

  const prisma = getPrisma();
  const existing = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true, branches: { select: { branchId: true } } },
  });
  if (!existing) return { ok: false, error: NOT_FOUND };
  if (existing.status === "COMPLETED") return { ok: true, id: campaignId };

  const coverage = await resolveGrantCoverage(
    prisma,
    { id: auth.userId, role: auth.role },
    "MARKETING_GESTIONAR_CAMPANAS",
  );
  if (!coverageAllows(coverage, existing.branches.map((row) => row.branchId))) {
    return { ok: false, error: "No tienes permiso para finalizar esta campaña." };
  }

  await prisma.$transaction([
    prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    }),
    prisma.userAuditLog.create({
      data: {
        actorUserId: auth.userId,
        action: "MARKETING_CAMPAIGN_COMPLETED",
        targetType: "MarketingCampaign",
        targetId: campaignId,
        description: `Finalizó la campaña «${existing.name}».`,
      },
    }),
  ]);

  revalidateMarketing(campaignId);
  return { ok: true, id: campaignId };
}

// --- Conciliación de leads (Patch CRM-INT1) -------------------------------

export type LeadReportActionResult = { ok: true } | { ok: false; error: string };

async function loadCampaignBranch(campaignId: string, branchCode: string) {
  const prisma = getPrisma();
  const [campaign, branch] = await Promise.all([
    prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, name: true, branches: { select: { branchId: true } } },
    }),
    prisma.branch.findUnique({ where: { code: (branchCode ?? "").trim() } }),
  ]);
  if (!campaign) return { ok: false as const, error: NOT_FOUND };
  if (!branch) return { ok: false as const, error: "La sucursal no existe." };
  const covered =
    campaign.branches.length === 0 ||
    campaign.branches.some((row) => row.branchId === branch.id);
  if (!covered) {
    return { ok: false as const, error: `La campaña no incluye la sucursal ${branch.name}.` };
  }
  return { ok: true as const, campaign, branch };
}

function parseLeadCount(value: number | string): number | null {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0 || count > MAX_REPORTED_LEADS) return null;
  return count;
}

/**
 * Marketing registra —o corrige— cuántos leads trajo la campaña en una
 * sucursal. Es su cifra, no la del CRM: no crea ningún lead.
 *
 * Corregirla deja la anterior en el historial y **anula la revisión** de esa
 * sucursal, porque lo que se había revisado ya no es lo que hay. La
 * confirmación de la sucursal se conserva: es su propia cifra, y sigue siendo
 * verdad.
 */
export async function saveCampaignLeadReportAction(input: {
  campaignId: string;
  branchCode: string;
  reportedLeads: number | string;
  notes?: string | null;
}): Promise<LeadReportActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canReportCampaignLeads(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para reportar leads de campañas." };
  }
  const count = parseLeadCount(input.reportedLeads);
  if (count === null) {
    return { ok: false, error: "La cantidad de leads debe ser un número entero, cero o mayor." };
  }

  const loaded = await loadCampaignBranch(input.campaignId, input.branchCode);
  if (!loaded.ok) return loaded;
  const { campaign, branch } = loaded;

  const prisma = getPrisma();
  const coverage = await resolveGrantCoverage(
    prisma,
    { id: session.uid, role: session.roleEnum },
    "MARKETING_REPORTAR_LEADS",
  );
  if (!coverageAllows(coverage, [branch.id])) {
    return {
      ok: false,
      error: `No tienes permiso para reportar leads en ${branch.name}. Pide al Administrador que te lo conceda.`,
    };
  }

  const notes = sanitizeText(input.notes ?? "").slice(0, 500) || null;
  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.marketingCampaignLeadReport.findUnique({
        where: { campaignId_branchId: { campaignId: campaign.id, branchId: branch.id } },
      });
      if (current && current.reportedLeads === count && current.reportedNotes === notes) {
        return;
      }
      const report = await tx.marketingCampaignLeadReport.upsert({
        where: { campaignId_branchId: { campaignId: campaign.id, branchId: branch.id } },
        create: {
          campaignId: campaign.id,
          branchId: branch.id,
          reportedLeads: count,
          reportedNotes: notes,
          reportedById: session.uid,
        },
        update: {
          reportedLeads: count,
          reportedNotes: notes,
          reportedById: session.uid,
          reportedAt: new Date(),
          reviewedById: null,
          reviewedAt: null,
        },
      });
      await tx.marketingCampaignLeadReportEvent.create({
        data: {
          reportId: report.id,
          kind: "REPORTE_MARKETING",
          value: count,
          previousValue: current?.reportedLeads ?? null,
          notes,
          actorId: session.uid,
        },
      });
    });
  } catch {
    return { ok: false, error: "No se pudo guardar la cifra reportada." };
  }

  revalidateMarketing(campaign.id);
  return { ok: true };
}

/**
 * La sucursal confirma cuántos leads recibió de la campaña.
 *
 * Gerente o Líder de ventas **de esa sucursal** (o el Administrador). Exige que
 * Marketing haya reportado antes: el proceso es reportar, confirmar, revisar.
 * Si la cifra de la sucursal no coincide con la de Marketing, la diferencia
 * queda a la vista; nadie la «arregla» cambiando leads.
 */
export async function confirmCampaignLeadReportAction(input: {
  campaignId: string;
  branchCode: string;
  confirmedLeads: number | string;
  notes?: string | null;
}): Promise<LeadReportActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canConfirmCampaignLeads(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para confirmar leads de campañas." };
  }
  const count = parseLeadCount(input.confirmedLeads);
  if (count === null) {
    return { ok: false, error: "La cantidad de leads debe ser un número entero, cero o mayor." };
  }

  const loaded = await loadCampaignBranch(input.campaignId, input.branchCode);
  if (!loaded.ok) return loaded;
  const { campaign, branch } = loaded;

  const actorBranch = session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  if (!canAccessBranch(session.roleEnum, actorBranch, branch.code)) {
    return { ok: false, error: "Solo puedes confirmar las cifras de tu sucursal." };
  }

  const notes = sanitizeText(input.notes ?? "").slice(0, 500) || null;
  const prisma = getPrisma();
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.marketingCampaignLeadReport.findUnique({
        where: { campaignId_branchId: { campaignId: campaign.id, branchId: branch.id } },
      });
      if (!current) return "NO_REPORT" as const;
      await tx.marketingCampaignLeadReport.update({
        where: { id: current.id },
        data: {
          confirmedLeads: count,
          confirmationNotes: notes,
          confirmedById: session.uid,
          confirmedAt: new Date(),
          reviewedById: null,
          reviewedAt: null,
        },
      });
      await tx.marketingCampaignLeadReportEvent.create({
        data: {
          reportId: current.id,
          kind: "CONFIRMACION_SUCURSAL",
          value: count,
          previousValue: current.confirmedLeads,
          notes,
          actorId: session.uid,
        },
      });
      return "OK" as const;
    });
    if (outcome === "NO_REPORT") {
      return {
        ok: false,
        error: "Marketing aún no ha reportado cifras de esta campaña para tu sucursal.",
      };
    }
  } catch {
    return { ok: false, error: "No se pudo guardar la confirmación." };
  }

  revalidateMarketing(campaign.id);
  return { ok: true };
}

/**
 * Marketing da por revisada la conciliación de una sucursal. Exige que la
 * sucursal haya confirmado: revisar una cifra sin contraparte no concilia
 * nada. Revisar no borra la diferencia; deja constancia de que alguien la vio.
 */
export async function reviewCampaignLeadReportAction(input: {
  campaignId: string;
  branchCode: string;
  notes?: string | null;
}): Promise<LeadReportActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canReportCampaignLeads(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para revisar la conciliación." };
  }

  const loaded = await loadCampaignBranch(input.campaignId, input.branchCode);
  if (!loaded.ok) return loaded;
  const { campaign, branch } = loaded;

  const prisma = getPrisma();
  const coverage = await resolveGrantCoverage(
    prisma,
    { id: session.uid, role: session.roleEnum },
    "MARKETING_REPORTAR_LEADS",
  );
  if (!coverageAllows(coverage, [branch.id])) {
    return { ok: false, error: `No tienes permiso sobre ${branch.name}.` };
  }

  const report = await prisma.marketingCampaignLeadReport.findUnique({
    where: { campaignId_branchId: { campaignId: campaign.id, branchId: branch.id } },
  });
  if (!report) return { ok: false, error: "Esta sucursal no tiene cifras reportadas." };
  if (report.confirmedLeads === null) {
    return { ok: false, error: "La sucursal todavía no confirmó su cifra." };
  }

  const notes = sanitizeText(input.notes ?? "").slice(0, 500) || null;
  await prisma.$transaction([
    prisma.marketingCampaignLeadReport.update({
      where: { id: report.id },
      data: { reviewedById: session.uid, reviewedAt: new Date() },
    }),
    prisma.marketingCampaignLeadReportEvent.create({
      data: {
        reportId: report.id,
        kind: "REVISION_MARKETING",
        value: report.reportedLeads,
        previousValue: report.confirmedLeads,
        notes,
        actorId: session.uid,
      },
    }),
  ]);

  revalidateMarketing(campaign.id);
  return { ok: true };
}
