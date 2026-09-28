import type { Prisma } from "@prisma/client";

import type { MarketingScope } from "@/server/auth/access";
import { catalogModelLabel } from "@/server/catalog/shared";
import {
  leadStatusLabels,
  type LeadCampaignOption,
  type LeadStatusValue,
} from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  campaignReportStatusLabels,
  marketingCampaignObjectiveLabels,
  marketingCampaignStatusLabels,
  marketingChannelForOriginChannel,
  marketingChannelLabels,
  marketingChannelValues,
  marketingConversionRate,
  type MarketingAttributionCostDTO,
  type MarketingAttributionReportDTO,
  type MarketingAttributionRowDTO,
  type CampaignChangeDTO,
  type CampaignMetaAttributionDTO,
  type CampaignReconciliationDTO,
  type CampaignReconciliationRowDTO,
  type CampaignReportStatus,
  type MarketingCampaignDTO,
  type MarketingCampaignObjectiveValue,
  type MarketingCampaignPerformanceDTO,
  type MarketingCampaignStatusValue,
  type MarketingChannelValue,
  type MarketingLeadAttributionDTO,
  type MarketingSummaryDTO,
  type UnlinkedMetaCampaignDTO,
} from "@/server/marketing/shared";
import { getLatestMetaAdMetrics } from "@/server/meta-ads/queries";
import { coverageAllows, type GrantCoverage } from "@/server/permissions/service";
import {
  resolveMetaAdDatePresetRange,
  type MetaAdDatePresetValue,
} from "@/server/meta-ads/shared";

/**
 * Role-scoped Marketing read queries (Patch 3.7C.1). Every function resolves the
 * caller's {@link MarketingScope} into Prisma `where` filters, so branch
 * visibility is enforced in the database layer and never only in the UI:
 *
 * - global → Admin or MARKETING, every campaign and reduced attribution row.
 * - branch → Manager, campaigns targeting their branch or company-wide
 *   (untargeted) campaigns; lead attribution is counted within their branch.
 * - none   → blocked role (Seller / Cashier / Accountant / Support) → empty.
 *
 * `estimatedBudget` is a marketing planning figure, nulled out for viewers who
 * may not see costs (`canSeeBudget`). No external ad-platform data is read.
 */

const LIST_LIMIT = 200;
const PERFORMANCE_LIMIT = 50;
const ATTRIBUTION_LIMIT = 200;

async function resolveBranchId(branchCode: string): Promise<string | null> {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  return branch?.id ?? null;
}

type ResolvedMarketingScope =
  | { level: "global" }
  | { level: "branch"; branchId: string }
  | { level: "empty" };

async function resolveScope(
  scope: MarketingScope,
): Promise<ResolvedMarketingScope> {
  if (scope.level === "global") return { level: "global" };
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return { level: "empty" };
    return { level: "branch", branchId };
  }
  return { level: "empty" };
}

/**
 * Campaigns visible for the resolved scope, or null when nothing can match.
 *
 * Patch CRM-INT1 — la sucursal de una campaña ya no es `targetBranchId` sino
 * `MarketingCampaignBranch`. Un Gerente o Líder ve las que incluyen su
 * sucursal y las de toda la empresa (sin sucursales), que es exactamente lo
 * que veía antes con una sola sucursal por campaña.
 */
function campaignWhere(
  resolved: ResolvedMarketingScope,
): Prisma.MarketingCampaignWhereInput | null {
  if (resolved.level === "empty") return null;
  if (resolved.level === "branch") {
    return {
      OR: [
        { branches: { none: {} } },
        { branches: { some: { branchId: resolved.branchId } } },
      ],
    };
  }
  return {};
}

/** The lead filter used to attribute lead counts inside the scope. */
function leadAttributionWhere(
  resolved: ResolvedMarketingScope,
  campaignId?: string,
): Prisma.LeadWhereInput {
  const branch =
    resolved.level === "branch" ? { branchId: resolved.branchId } : {};
  return {
    ...branch,
    marketingCampaignId: campaignId ?? { not: null },
  };
}

type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  motorcycleSlug: string | null;
  estimatedBudget: { toNumber(): number } | null;
  startsAt: Date;
  endsAt: Date | null;
  status: string;
  objective: string;
  description: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  metaAdAccountId?: string | null;
  createdBy?: { name: string } | null;
  metaAdAccount?: { label: string | null; accountName: string | null; adAccountId: string } | null;
  branches: Array<{ branchId: string; branch: { code: string; name: string } }>;
  models: Array<{
    catalogModel: {
      id: string;
      brand: string;
      model: string;
      version: string | null;
      year: number | null;
    };
  }>;
};

function mapCampaign(
  campaign: CampaignRow,
  leadCount: number,
  canSeeBudget: boolean,
  editCoverage: GrantCoverage | null,
): MarketingCampaignDTO {
  const channel = campaign.channel as MarketingChannelValue;
  const status = campaign.status as MarketingCampaignStatusValue;
  const objective = campaign.objective as MarketingCampaignObjectiveValue;
  return {
    id: campaign.id,
    name: campaign.name,
    channel,
    channelLabel: marketingChannelLabels[channel] ?? campaign.channel,
    branches: campaign.branches
      .map((row) => ({ code: row.branch.code, name: row.branch.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    models: campaign.models
      .map((row) => ({
        id: row.catalogModel.id,
        label: catalogModelLabel(row.catalogModel),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "es")),
    legacyMotorcycleSlug:
      campaign.models.length === 0 ? campaign.motorcycleSlug : null,
    estimatedBudget:
      canSeeBudget && campaign.estimatedBudget
        ? campaign.estimatedBudget.toNumber()
        : null,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt ? campaign.endsAt.toISOString() : null,
    status,
    statusLabel: marketingCampaignStatusLabels[status] ?? campaign.status,
    objective,
    objectiveLabel:
      marketingCampaignObjectiveLabels[objective] ?? campaign.objective,
    description: campaign.description,
    createdById: campaign.createdById,
    createdByName: campaign.createdBy?.name ?? null,
    // Patch Attribution-1 — el mismo orden de preferencia que el tablero de
    // Meta-4 usa para nombrar una cuenta: la etiqueta que le puso MotoMas, si no
    // el nombre real de Meta, y en último caso el `act_…` crudo.
    metaAdAccountId: campaign.metaAdAccountId ?? null,
    metaAdAccountLabel:
      campaign.metaAdAccount?.label ??
      campaign.metaAdAccount?.accountName ??
      campaign.metaAdAccount?.adAccountId ??
      null,
    leadCount,
    canEdit: coverageAllows(
      editCoverage,
      campaign.branches.map((row) => row.branchId),
    ),
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

const campaignInclude = {
  // Patch CRM-INT1 — sucursales y modelos de la campaña, sin una consulta por
  // tarjeta.
  branches: {
    select: { branchId: true, branch: { select: { code: true, name: true } } },
  },
  models: {
    select: {
      catalogModel: {
        select: { id: true, brand: true, model: true, version: true, year: true },
      },
    },
  },
  createdBy: { select: { name: true } },
  // Patch Attribution-1 — la cuenta enlazada, para poder nombrarla en la lista y
  // preseleccionarla al editar sin una segunda consulta por campaña.
  metaAdAccount: {
    select: { label: true, accountName: true, adAccountId: true },
  },
} as const;

/**
 * Lead attribution counts per campaign for the resolved scope, as a Map keyed
 * by campaign id. A single groupBy avoids an N+1 over the campaign list.
 */
async function leadCountsByCampaign(
  resolved: ResolvedMarketingScope,
): Promise<Map<string, number>> {
  const prisma = getPrisma();
  const grouped = await prisma.lead.groupBy({
    by: ["marketingCampaignId"],
    where: leadAttributionWhere(resolved),
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const row of grouped) {
    if (row.marketingCampaignId) {
      map.set(row.marketingCampaignId, row._count._all);
    }
  }
  return map;
}

export async function listMarketingCampaigns(
  scope: MarketingScope,
  canSeeBudget: boolean,
  /** Patch CRM-INT1 — la concesión de edición de quien mira, o `null`. */
  editCoverage: GrantCoverage | null = null,
): Promise<MarketingCampaignDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const resolved = await resolveScope(scope);
  const where = campaignWhere(resolved);
  if (!where) return [];

  const prisma = getPrisma();
  const [campaigns, counts] = await Promise.all([
    prisma.marketingCampaign.findMany({
      where,
      include: campaignInclude,
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    }),
    leadCountsByCampaign(resolved),
  ]);

  return campaigns.map((campaign) =>
    mapCampaign(campaign, counts.get(campaign.id) ?? 0, canSeeBudget, editCoverage),
  );
}

/**
 * Patch CRM-INT1 — las campañas a las que se le puede atribuir un lead desde el
 * CRM: las no finalizadas, con las sucursales que cubren.
 *
 * Sólo nombre y sucursales, **nunca presupuesto ni cuenta publicitaria**: la
 * lee un vendedor para anotar «vino por esta campaña», no para ver cuánto
 * costó. La acción vuelve a comprobar que la campaña cubre la sucursal del
 * lead; filtrar aquí es sólo para no ofrecer lo que se va a rechazar.
 */
export async function listAttributableCampaigns(): Promise<LeadCampaignOption[]> {
  if (!isDatabaseConfigured()) return [];
  const campaigns = await getPrisma().marketingCampaign.findMany({
    where: { status: { not: "COMPLETED" } },
    select: {
      id: true,
      name: true,
      branches: { select: { branch: { select: { code: true } } } },
    },
    orderBy: { startsAt: "desc" },
    take: LIST_LIMIT,
  });
  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    branchCodes: campaign.branches.map((row) => row.branch.code),
  }));
}

/**
 * Privacy-minimized lead attribution for the Marketing workspace. The Prisma
 * select is an explicit allow-list and never reads lead identity/contact data,
 * notes, seller data, expediente contents, credit data or activities.
 */
export async function listMarketingLeadAttribution(
  scope: MarketingScope,
): Promise<MarketingLeadAttributionDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const resolved = await resolveScope(scope);
  if (resolved.level === "empty") return [];

  const prisma = getPrisma();
  const leads = await prisma.lead.findMany({
    where: leadAttributionWhere(resolved),
    select: {
      trackingCode: true,
      createdAt: true,
      motorcycleInterest: true,
      status: true,
      branch: { select: { code: true, name: true } },
      marketingCampaign: {
        select: { id: true, name: true, channel: true },
      },
      customerFiles: {
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: ATTRIBUTION_LIMIT,
  });

  return leads.flatMap((lead) => {
    const campaign = lead.marketingCampaign;
    if (!campaign) return [];

    const status = lead.status as LeadStatusValue;
    const channel = campaign.channel as MarketingChannelValue;
    const finalResult =
      status === "EXPEDIENTE"
        ? "Convertido"
        : status === "DESCARTADO"
          ? "Descartado"
          : null;
    const conversionDate =
      status === "EXPEDIENTE" && lead.customerFiles[0]
        ? lead.customerFiles[0].createdAt.toISOString()
        : null;

    return [
      {
        leadCode: lead.trackingCode,
        createdAt: lead.createdAt.toISOString(),
        campaignId: campaign.id,
        campaignName: campaign.name,
        channel,
        channelLabel: marketingChannelLabels[channel] ?? campaign.channel,
        branchCode: lead.branch.code,
        branchName: lead.branch.name,
        motorcycleInterest: lead.motorcycleInterest,
        status,
        statusLabel: leadStatusLabels[status] ?? lead.status,
        finalResult,
        conversionDate,
      } satisfies MarketingLeadAttributionDTO,
    ];
  });
}

export async function getMarketingCampaignDetail(
  scope: MarketingScope,
  id: string,
  canSeeBudget: boolean,
  editCoverage: GrantCoverage | null = null,
): Promise<MarketingCampaignDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const resolved = await resolveScope(scope);
  const where = campaignWhere(resolved);
  if (!where) return null;

  const prisma = getPrisma();
  const campaign = await prisma.marketingCampaign.findFirst({
    where: { AND: [{ id }, where] },
    include: campaignInclude,
  });
  if (!campaign) return null;

  const leadCount = await prisma.lead.count({
    where: leadAttributionWhere(resolved, campaign.id),
  });
  return mapCampaign(campaign, leadCount, canSeeBudget, editCoverage);
}

// --- Conciliación de leads por campaña (Patch CRM-INT1) -------------------

const reportEventLabels: Record<string, string> = {
  REPORTE_MARKETING: "Marketing reportó",
  CONFIRMACION_SUCURSAL: "La sucursal confirmó",
  REVISION_MARKETING: "Marketing revisó",
};

function reportStatus(
  reported: number | null,
  confirmed: number | null,
): CampaignReportStatus {
  if (reported === null) return "SIN_REPORTE";
  if (confirmed === null) return "PENDIENTE_CONFIRMACION";
  return reported === confirmed ? "CONFIRMADO" : "CON_DIFERENCIA";
}

/**
 * Patch CRM-INT1 — la conciliación de una campaña, sucursal por sucursal.
 *
 * ## Qué sucursales salen
 *
 * Las de la campaña (o, si cubre todas, las activas con algún dato), más
 * **cualquier sucursal con leads del CRM atribuidos aunque no esté en la
 * campaña** — si no, esos leads desaparecerían del total y la diferencia
 * parecería menor de lo que es.
 *
 * ## Alcance
 *
 * Marketing y el Administrador ven todas las filas y el consolidado. Un Gerente
 * o Líder ve sólo la fila de su sucursal: la conciliación de otra sucursal no
 * le corresponde confirmarla ni revisarla.
 *
 * ## Sin doble conteo
 *
 * `crmLeads` se cuenta agrupando los leads por sucursal. Un lead tiene una sola
 * campaña y una sola sucursal, así que aparece en una sola fila y una sola vez
 * en el total.
 */
export async function getCampaignReconciliation(
  scope: MarketingScope,
  campaignId: string,
  viewer: {
    /** Concesión para registrar la cifra de Marketing (null = no puede). */
    reportCoverage: GrantCoverage | null;
    /** Si su rol confirma cifras de sucursal. */
    canConfirm: boolean;
    /** Su sucursal (código) si es un rol de sucursal; null si es global. */
    branchCode: string | null;
  },
): Promise<CampaignReconciliationDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const resolved = await resolveScope(scope);
  const where = campaignWhere(resolved);
  if (!where) return null;

  const prisma = getPrisma();
  const campaign = await prisma.marketingCampaign.findFirst({
    where: { AND: [{ id: campaignId }, where] },
    select: {
      id: true,
      branches: { select: { branchId: true } },
    },
  });
  if (!campaign) return null;

  const [reports, crmGroups, branches] = await Promise.all([
    prisma.marketingCampaignLeadReport.findMany({
      where: { campaignId },
      include: {
        reportedBy: { select: { name: true } },
        confirmedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
        events: {
          include: { actor: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    }),
    prisma.lead.groupBy({
      by: ["branchId"],
      where: { marketingCampaignId: campaignId },
      _count: { _all: true },
    }),
    prisma.branch.findMany({ select: { id: true, code: true, name: true, isActive: true } }),
  ]);

  const campaignBranchIds = new Set(campaign.branches.map((row) => row.branchId));
  const coversAll = campaignBranchIds.size === 0;
  const crmByBranch = new Map(crmGroups.map((row) => [row.branchId, row._count._all]));
  const reportByBranch = new Map(reports.map((row) => [row.branchId, row]));

  const branchIds = new Set<string>([
    ...campaignBranchIds,
    ...crmByBranch.keys(),
    ...reportByBranch.keys(),
  ]);
  // Una campaña para toda la empresa ofrece todas las sucursales activas, para
  // que Marketing pueda registrar la cifra de cualquiera.
  if (coversAll) {
    for (const branch of branches) if (branch.isActive) branchIds.add(branch.id);
  }

  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const visibleBranchId =
    resolved.level === "branch" ? resolved.branchId : null;

  const rows: CampaignReconciliationRowDTO[] = [...branchIds]
    .filter((id) => !visibleBranchId || id === visibleBranchId)
    .flatMap((id) => {
      const branch = branchById.get(id);
      if (!branch) return [];
      const report = reportByBranch.get(id) ?? null;
      const covered = coversAll || campaignBranchIds.has(id);
      const reported = report?.reportedLeads ?? null;
      const confirmed = report?.confirmedLeads ?? null;
      const crmLeads = crmByBranch.get(id) ?? 0;
      const status = reportStatus(reported, confirmed);
      return [
        {
          branchCode: branch.code,
          branchName: branch.name,
          covered,
          reportedLeads: reported,
          reportedByName: report?.reportedBy.name ?? null,
          reportedAt: report ? report.reportedAt.toISOString() : null,
          reportedNotes: report?.reportedNotes ?? null,
          confirmedLeads: confirmed,
          confirmedByName: report?.confirmedBy?.name ?? null,
          confirmedAt: report?.confirmedAt ? report.confirmedAt.toISOString() : null,
          confirmationNotes: report?.confirmationNotes ?? null,
          reviewedByName: report?.reviewedBy?.name ?? null,
          reviewedAt: report?.reviewedAt ? report.reviewedAt.toISOString() : null,
          crmLeads,
          differenceVsCrm: reported === null ? null : reported - crmLeads,
          differenceVsConfirmed:
            reported === null || confirmed === null ? null : reported - confirmed,
          status,
          statusLabel: campaignReportStatusLabels[status],
          canReport: covered && coverageAllows(viewer.reportCoverage, [id]),
          canConfirm:
            covered &&
            report !== null &&
            viewer.canConfirm &&
            (viewer.branchCode === null || viewer.branchCode === branch.code),
          events: (report?.events ?? []).map((event) => ({
            id: event.id,
            kindLabel: reportEventLabels[event.kind] ?? event.kind,
            value: event.value,
            previousValue: event.previousValue,
            notes: event.notes,
            actorName: event.actor?.name ?? null,
            at: event.createdAt.toISOString(),
          })),
        },
      ];
    })
    .sort((a, b) => a.branchName.localeCompare(b.branchName, "es"));

  const reportedTotal = rows.reduce((sum, row) => sum + (row.reportedLeads ?? 0), 0);
  const confirmedTotal = rows.reduce((sum, row) => sum + (row.confirmedLeads ?? 0), 0);
  const crmTotal = rows.reduce((sum, row) => sum + row.crmLeads, 0);

  return {
    campaignId: campaign.id,
    consolidated: !visibleBranchId,
    rows,
    totals: {
      reportedLeads: reportedTotal,
      confirmedLeads: confirmedTotal,
      crmLeads: crmTotal,
      differenceVsCrm: reportedTotal - crmTotal,
    },
  };
}

/**
 * Patch CRM-INT1 — el historial de cambios de una campaña: alta, ediciones y
 * cierres, con quién y cuándo. Sale de `UserAuditLog`, que es el registro de
 * auditoría del repositorio; no se creó otra tabla para lo mismo.
 */
export async function listCampaignChanges(
  campaignId: string,
): Promise<CampaignChangeDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().userAuditLog.findMany({
    where: { targetType: "MarketingCampaign", targetId: campaignId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    id: row.id,
    at: row.createdAt.toISOString(),
    actorName: row.actor.name,
    action: row.action,
    description: row.description ?? "",
  }));
}

/**
 * Attribution performance for every campaign in scope. Lead counts come from a
 * single groupBy; reservation/sale attribution walks the expediente → lead →
 * campaign link and is only computed for the campaigns actually returned.
 */
export async function getMarketingCampaignPerformance(
  scope: MarketingScope,
): Promise<MarketingCampaignPerformanceDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const resolved = await resolveScope(scope);
  const where = campaignWhere(resolved);
  if (!where) return [];

  const prisma = getPrisma();
  const campaigns = await prisma.marketingCampaign.findMany({
    where,
    select: { id: true, name: true, channel: true, status: true },
    orderBy: { createdAt: "desc" },
    take: PERFORMANCE_LIMIT,
  });
  if (campaigns.length === 0) return [];

  const branchWhere =
    resolved.level === "branch" ? { branchId: resolved.branchId } : {};

  // Lead status distribution per campaign, in one query.
  const leadGroups = await prisma.lead.groupBy({
    by: ["marketingCampaignId", "status"],
    where: {
      ...branchWhere,
      marketingCampaignId: { in: campaigns.map((c) => c.id) },
    },
    _count: { _all: true },
  });
  const leadStats = new Map<
    string,
    { total: number; converted: number; discarded: number }
  >();
  for (const row of leadGroups) {
    if (!row.marketingCampaignId) continue;
    const stat = leadStats.get(row.marketingCampaignId) ?? {
      total: 0,
      converted: 0,
      discarded: 0,
    };
    stat.total += row._count._all;
    if (row.status === "EXPEDIENTE") stat.converted += row._count._all;
    if (row.status === "DESCARTADO") stat.discarded += row._count._all;
    leadStats.set(row.marketingCampaignId, stat);
  }

  const results = await Promise.all(
    campaigns.map(async (campaign) => {
      const leadCampaignLink: Prisma.ReservationWhereInput = {
        ...branchWhere,
        customerFile: {
          is: { lead: { is: { marketingCampaignId: campaign.id } } },
        },
      };
      const [reservations, sales] = await Promise.all([
        prisma.reservation.count({ where: leadCampaignLink }),
        prisma.sale.count({
          where: leadCampaignLink as Prisma.SaleWhereInput,
        }),
      ]);
      const stat = leadStats.get(campaign.id) ?? {
        total: 0,
        converted: 0,
        discarded: 0,
      };
      const channel = campaign.channel as MarketingChannelValue;
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        channel,
        channelLabel: marketingChannelLabels[channel] ?? campaign.channel,
        status: campaign.status as MarketingCampaignStatusValue,
        leads: stat.total,
        converted: stat.converted,
        discarded: stat.discarded,
        reservations,
        sales,
        conversionRate: marketingConversionRate(stat.total, stat.converted),
      } satisfies MarketingCampaignPerformanceDTO;
    }),
  );

  return results.sort((a, b) => b.leads - a.leads);
}

/** Aggregate marketing picture for the Reportes / Dashboard marketing block. */
export async function getMarketingSummary(
  scope: MarketingScope,
): Promise<MarketingSummaryDTO> {
  const empty: MarketingSummaryDTO = {
    totalCampaigns: 0,
    activeCampaigns: 0,
    pausedCampaigns: 0,
    completedCampaigns: 0,
    attributedLeads: 0,
    byChannel: [],
    topCampaigns: [],
  };
  if (!isDatabaseConfigured()) return empty;
  const resolved = await resolveScope(scope);
  const where = campaignWhere(resolved);
  if (!where) return empty;

  const prisma = getPrisma();
  const [statusGroups, channelGroups, attributedLeads, topCampaigns] =
    await Promise.all([
      prisma.marketingCampaign.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.marketingCampaign.groupBy({
        by: ["channel"],
        where,
        _count: { _all: true },
      }),
      prisma.lead.count({ where: leadAttributionWhere(resolved) }),
      getMarketingCampaignPerformance(scope),
    ]);

  const statusCount = (value: MarketingCampaignStatusValue) =>
    statusGroups.find((row) => row.status === value)?._count._all ?? 0;

  const byChannel = marketingChannelValues
    .map((channel) => ({
      channel,
      channelLabel: marketingChannelLabels[channel],
      count:
        channelGroups.find((row) => row.channel === channel)?._count._all ?? 0,
    }))
    .filter((entry) => entry.count > 0);

  return {
    totalCampaigns: statusGroups.reduce((sum, row) => sum + row._count._all, 0),
    activeCampaigns: statusCount("ACTIVE"),
    pausedCampaigns: statusCount("PAUSED"),
    completedCampaigns: statusCount("COMPLETED"),
    attributedLeads,
    byChannel,
    topCampaigns: topCampaigns.slice(0, 5),
  };
}

// --- Informe de atribución (Patch Attribution-1) --------------------------

/**
 * Gasto, leads y ventas del mismo canal y del mismo periodo, en una tabla.
 *
 * ## Qué problema cierra
 *
 * Los tres datos ya existían y ninguno se hablaba con los otros: el gasto vive
 * en las fotos de Meta-4, los leads en `Lead.originChannel` desde Meta-1, y las
 * ventas en el POS. Ninguna consulta del repositorio los unía, así que nadie
 * podía responder cuánto costó un lead ni qué canal acabó vendiendo.
 *
 * ## Se atribuye por CANAL, no por campaña
 *
 * Meta-1 ya estableció que el `campaign_id` que trae el webhook de Lead Ads no
 * se puede casar de forma fiable con una fila de `MarketingCampaign`. Por eso el
 * enlace que este informe recorre es **campaña → cuenta publicitaria**, elegido
 * a mano por Marketing, y la unión con los leads es por el nombre del canal.
 * Adivinar la campaña habría producido una tabla más detallada y falsa.
 *
 * ## Se lee en vivo y no se guarda ninguna foto
 *
 * Meta-4 cachea porque cada consulta suya cuesta una llamada al Graph API con
 * límite de frecuencia. Esto **sólo toca nuestra propia base**, donde no hay
 * cuota que agotar, así que una tabla de instantáneas añadiría un mecanismo de
 * caducidad que nadie necesita. La única cifra cacheada es el gasto, y lo está
 * porque ya venía cacheada de Meta-4.
 *
 * ## Qué canales salen en la tabla
 *
 * La unión de tres conjuntos, y hace falta la unión entera:
 *
 *   1. Canales con leads en la ventana — la pregunta original.
 *   2. Canales con **cuenta enlazada** — si no, un canal que gastó sin captar
 *      ningún lead desaparecería del informe justo cuando más urge verlo.
 *   3. Canales con ventas en la ventana — una venta puede atribuirse a un lead
 *      creado antes del periodo, y esa venta cuenta igual.
 *
 * @param branchCode Acota **leads y ventas** a una sucursal. El gasto no se
 *   acota: una cuenta publicitaria no pertenece a ninguna sucursal, y repartirlo
 *   entre sucursales sería inventar un criterio. Con filtro de sucursal activo
 *   el coste por lead mezcla un gasto de toda la empresa con leads de una
 *   sucursal; la pantalla lo advierte en vez de disimularlo.
 */
/**
 * Todo lo que hace falta para la mitad monetaria del informe, en **una sola
 * pieza que puede no pedirse** (Patch Marketing-P1).
 *
 * Está extraída aquí para que la decisión de permiso se tome una vez y en un
 * sitio visible: si quien mira no puede ver dinero, esta función **no se llama**,
 * y entonces el gasto no llega siquiera a la memoria del proceso. Recortar los
 * campos después de calcularlos habría dado el mismo HTML y una garantía más
 * débil — bastaría con olvidar un recorte en un sitio.
 *
 * Sigue sin llamar al Graph API: `getLatestMetaAdMetrics` lee las fotos.
 */
async function loadAttributionCostSources(datePreset: MetaAdDatePresetValue) {
  const prisma = getPrisma();

  const [links, accounts, metricsBoard] = await Promise.all([
    // Pares (canal, cuenta) distintos. Diez campañas apuntando a la misma
    // cuenta no pueden contar su gasto diez veces.
    prisma.marketingCampaign.groupBy({
      by: ["channel", "metaAdAccountId"],
      where: { metaAdAccountId: { not: null } },
    }),
    prisma.metaAdAccount.findMany({
      select: { id: true, adAccountId: true },
      take: LIST_LIMIT,
    }),
    // **Se reutiliza la lógica de Meta-4, no se reimplementa.** Ésta es la
    // función que ya sabe qué es «la foto más reciente de cada cuenta para
    // este periodo», y sigue sin llamar al Graph API.
    getLatestMetaAdMetrics(datePreset),
  ]);

  // El `act_…` es la clave con la que se guardan las fotos; el cuid es la clave
  // con la que se enlaza la campaña. Este mapa es el puente entre las dos.
  const adAccountIdByCuid = new Map(
    accounts.map((account) => [account.id, account.adAccountId]),
  );

  const accountsByChannel = new Map<string, Set<string>>();
  for (const link of links) {
    const channel =
      marketingChannelLabels[link.channel as MarketingChannelValue];
    const adAccountId = link.metaAdAccountId
      ? adAccountIdByCuid.get(link.metaAdAccountId)
      : undefined;
    if (!channel || !adAccountId) continue;
    const bucket = accountsByChannel.get(channel) ?? new Set<string>();
    bucket.add(adAccountId);
    accountsByChannel.set(channel, bucket);
  }

  const snapshotByAccount = new Map(
    metricsBoard.rows.map((row) => [row.adAccountId, row.snapshot]),
  );

  return { accountsByChannel, snapshotByAccount };
}

type AttributionCostSources = Awaited<
  ReturnType<typeof loadAttributionCostSources>
>;

/** Las cifras de dinero de un canal, ya resueltas. */
function buildAttributionCost(
  sources: AttributionCostSources,
  channel: string,
  leads: number,
): MarketingAttributionCostDTO {
  const linked = sources.accountsByChannel.get(channel) ?? new Set<string>();
  const snapshots = [...linked]
    // Una cuenta enlazada que el tablero no devuelve —dada de baja en el
    // registro— cuenta como cuenta sin foto, no como gasto cero.
    .map((adAccountId) => sources.snapshotByAccount.get(adAccountId) ?? null)
    .filter((snapshot) => snapshot !== null);

  const currencies = new Set(snapshots.map((snapshot) => snapshot.currency));
  const mixedCurrency = currencies.size > 1;
  // Sin ninguna foto no hay gasto que enseñar, y con monedas distintas
  // tampoco: sumar córdobas con dólares da una cifra que parece correcta y
  // no lo es.
  const spend =
    snapshots.length === 0 || mixedCurrency
      ? null
      : round2(snapshots.reduce((total, snapshot) => total + snapshot.spend, 0));

  return {
    linkedAccounts: linked.size,
    accountsWithoutSnapshot: linked.size - snapshots.length,
    mixedCurrency,
    spend,
    spendCurrency: spend === null ? null : ([...currencies][0] ?? null),
    // **Nunca se divide entre cero y nunca se fabrica un 0.00.** Sin leads
    // el coste por lead no es cero, es nada; sin gasto conocido tampoco hay
    // nada que repartir.
    costPerLead: spend === null || leads === 0 ? null : round2(spend / leads),
  };
}

/**
 * Gasto, leads y ventas del mismo canal y del mismo periodo, en una tabla.
 *
 * ## Qué problema cierra
 *
 * Los tres datos ya existían y ninguno se hablaba con los otros: el gasto vive
 * en las fotos de Meta-4, los leads en `Lead.originChannel` desde Meta-1, y las
 * ventas en el POS. Ninguna consulta del repositorio los unía, así que nadie
 * podía responder cuánto costó un lead ni qué canal acabó vendiendo.
 *
 * ## Se atribuye por CANAL, no por campaña
 *
 * Meta-1 ya estableció que el `campaign_id` que trae el webhook de Lead Ads no
 * se puede casar de forma fiable con una fila de `MarketingCampaign`. Por eso el
 * enlace que este informe recorre es **campaña → cuenta publicitaria**, elegido
 * a mano por Marketing, y la unión con los leads es por el nombre del canal.
 * Adivinar la campaña habría producido una tabla más detallada y falsa.
 *
 * ## Se lee en vivo y no se guarda ninguna foto
 *
 * Meta-4 cachea porque cada consulta suya cuesta una llamada al Graph API con
 * límite de frecuencia. Esto **sólo toca nuestra propia base**, donde no hay
 * cuota que agotar, así que una tabla de instantáneas añadiría un mecanismo de
 * caducidad que nadie necesita. La única cifra cacheada es el gasto, y lo está
 * porque ya venía cacheada de Meta-4.
 *
 * ## Quién ve qué (Patch Marketing-P1)
 *
 * El informe entero **ya no está detrás de `canManageMarketing`**. Attribution-1
 * lo colgó ahí porque su pantalla vivía dentro del panel de integraciones de
 * Meta, y eso dejaba fuera al Gerente de un agregado que `canViewLeadAttribution`
 * dice explícitamente que le corresponde: «Managers keep aggregate campaign
 * metrics but do not receive lead-level rows». Aquí no hay ninguna fila a nivel
 * de lead; es un recuento por canal.
 *
 * Lo que sí se le retira es **el dinero**, con `includeCost: false`:
 *
 * - `canViewCosts` concede al Gerente costes **de su propia sucursal**, y el
 *   gasto publicitario de este informe es de toda la empresa. No hay forma
 *   limpia de repartirlo por sucursal, y enseñárselo sin repartir se leería como
 *   «el gasto de mi sucursal», que es falso.
 * - El coste por lead **se retira con él, obligatoriamente**: es el gasto
 *   dividido entre los leads, y los leads sí se ven, así que dejarlo devolvería
 *   el gasto multiplicando. Ocultar uno y enseñar el otro no oculta nada.
 *
 * `includeCost` **no tiene valor por omisión a propósito**: un permiso que se
 * puede olvidar acaba olvidado, y omitirlo aquí habría abierto el dinero por
 * descuido en cualquier llamada futura.
 *
 * ## El alcance llega como `MarketingScope`, no como un código suelto
 *
 * Igual que `listMarketingCampaigns`. Importa más de lo que parece: un Gerente
 * **sin sucursal asignada** resuelve a `{ level: "none" }`, y esta función
 * devuelve entonces el informe vacío en vez de las cifras de toda la empresa.
 * Con un código de sucursal suelto, esa sesión llegaba aquí con la cadena vacía
 * —que es falsy— y el filtro desaparecía sin que nadie lo notara.
 *
 * Para MARKETING el alcance es global, como manda el propio
 * `getMarketingScopeForUser`: «MARKETING has cross-branch campaign/attribution
 * scope inside this module».
 *
 * ## Qué canales salen en la tabla
 *
 * La unión de tres conjuntos, y hace falta la unión entera:
 *
 *   1. Canales con leads en la ventana — la pregunta original.
 *   2. Canales con **cuenta enlazada** — si no, un canal que gastó sin captar
 *      ningún lead desaparecería del informe justo cuando más urge verlo.
 *   3. Canales con ventas en la ventana — una venta puede atribuirse a un lead
 *      creado antes del periodo, y esa venta cuenta igual.
 *
 * El segundo conjunto **sólo entra cuando se ve el dinero**: para quien no lo ve,
 * un canal sin leads y sin ventas sería una fila entera en blanco.
 */
export async function getMarketingAttributionReport(
  scope: MarketingScope,
  datePreset: MetaAdDatePresetValue,
  includeCost: boolean,
): Promise<MarketingAttributionReportDTO> {
  const range = resolveMetaAdDatePresetRange(datePreset);
  const branchCode = scope.level === "branch" ? scope.branchCode : null;
  const empty: MarketingAttributionReportDTO = {
    datePreset,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    branchCode,
    includesCost: includeCost,
    rows: [],
  };
  if (!isDatabaseConfigured()) return empty;

  // Un alcance bloqueado —o un Gerente sin sucursal, o una sucursal que no
  // existe— devuelve el informe vacío. **Nunca se ensancha a global.**
  const resolved = await resolveScope(scope);
  if (resolved.level === "empty") return empty;

  const prisma = getPrisma();
  const window = { gte: range.from, lt: range.to };
  const branchFilter =
    resolved.level === "branch" ? { branchId: resolved.branchId } : {};
  const saleWhere = {
    status: "COMPLETADA" as const,
    completedAt: window,
    ...branchFilter,
  };

  const [leadGroups, salesChannels, costSources] = await Promise.all([
    prisma.lead.groupBy({
      by: ["originChannel"],
      where: {
        createdAt: window,
        originChannel: { not: null },
        ...branchFilter,
      },
      _count: { _all: true },
    }),
    // Los canales que vendieron, aunque su lead sea anterior a la ventana.
    // `distinct` deja como mucho una fila por canal, así que esta consulta no
    // crece con el número de ventas.
    prisma.lead.findMany({
      where: {
        originChannel: { not: null },
        attributedPosSales: { some: saleWhere },
      },
      select: { originChannel: true },
      distinct: ["originChannel"],
    }),
    // **Aquí es donde el permiso se convierte en ausencia de datos.** Sin
    // `includeCost`, las tres consultas del gasto no llegan a lanzarse.
    includeCost ? loadAttributionCostSources(datePreset) : Promise.resolve(null),
  ]);

  const leadsByChannel = new Map<string, number>();
  for (const group of leadGroups) {
    if (group.originChannel) {
      leadsByChannel.set(group.originChannel, group._count._all);
    }
  }

  const channels = new Set<string>([
    ...leadsByChannel.keys(),
    ...salesChannels.flatMap((lead) =>
      lead.originChannel ? [lead.originChannel] : [],
    ),
    ...(costSources ? costSources.accountsByChannel.keys() : []),
  ]);

  const rows: MarketingAttributionRowDTO[] = await Promise.all(
    [...channels].map(async (channel) => {
      const sales = await prisma.posSale.aggregate({
        where: { ...saleWhere, attributedLead: { originChannel: channel } },
        _count: { _all: true },
        _sum: { total: true },
      });

      const leads = leadsByChannel.get(channel) ?? 0;

      return {
        channel,
        marketingChannel: marketingChannelForOriginChannel(channel),
        leads,
        salesCount: sales._count._all,
        salesTotal: sales._sum.total ? sales._sum.total.toNumber() : 0,
        cost: costSources
          ? buildAttributionCost(costSources, channel, leads)
          : null,
      };
    }),
  );

  // Primero lo que más leads trajo; el nombre desempata para que dos cargas
  // seguidas den siempre el mismo orden.
  rows.sort(
    (left, right) =>
      right.leads - left.leads || left.channel.localeCompare(right.channel),
  );

  return { ...empty, rows };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Patch CRM-INT3 — las campañas de Meta vinculadas a esta campaña y las que se
 * han visto en leads sin vincular a ninguna.
 *
 * Las cifras separan lo que un vínculo **no** atribuye y por qué, para que la
 * conciliación se pueda explicar: un lead de esa campaña de Meta puede estar en
 * otra campaña de MotoMas (alguien lo atribuyó antes), sin campaña (su
 * sucursal no está cubierta o llegó fuera de fechas) o todavía en el andén
 * esperando sucursal.
 */
export async function getCampaignMetaAttribution(
  campaignId: string,
): Promise<CampaignMetaAttributionDTO> {
  if (!isDatabaseConfigured()) return { links: [], candidates: [] };
  const prisma = getPrisma();
  const [links, allLinkIds] = await Promise.all([
    prisma.marketingCampaignMetaLink.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" },
      select: {
        metaCampaignId: true,
        label: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.marketingCampaignMetaLink.findMany({ select: { metaCampaignId: true } }),
  ]);
  const linkedIds = links.map((link) => link.metaCampaignId);
  const everyLinked = allLinkIds.map((link) => link.metaCampaignId);

  const [leadGroups, stagingGroups, candidateLeads, candidateStaging] = await Promise.all([
    linkedIds.length
      ? prisma.lead.groupBy({
          by: ["metaCampaignId", "marketingCampaignId"],
          where: { metaCampaignId: { in: linkedIds } },
          _count: { _all: true },
        })
      : [],
    linkedIds.length
      ? prisma.metaUnmappedLead.groupBy({
          by: ["metaCampaignId"],
          where: { metaCampaignId: { in: linkedIds }, resolvedAt: null },
          _count: { _all: true },
        })
      : [],
    prisma.lead.groupBy({
      by: ["metaCampaignId", "metaCampaignName"],
      where: { metaCampaignId: { not: null, notIn: everyLinked } },
      _count: { _all: true },
      orderBy: { _count: { metaCampaignId: "desc" } },
      take: 50,
    }),
    prisma.metaUnmappedLead.groupBy({
      by: ["metaCampaignId", "metaCampaignName"],
      where: { metaCampaignId: { not: null, notIn: everyLinked }, resolvedAt: null },
      _count: { _all: true },
      orderBy: { _count: { metaCampaignId: "desc" } },
      take: 50,
    }),
  ]);

  const candidates = new Map<string, UnlinkedMetaCampaignDTO>();
  for (const row of candidateLeads) {
    if (!row.metaCampaignId) continue;
    const entry = candidates.get(row.metaCampaignId) ?? {
      metaCampaignId: row.metaCampaignId,
      name: row.metaCampaignName,
      leads: 0,
      pendingInStaging: 0,
    };
    entry.leads += row._count._all;
    entry.name = entry.name ?? row.metaCampaignName;
    candidates.set(row.metaCampaignId, entry);
  }
  for (const row of candidateStaging) {
    if (!row.metaCampaignId) continue;
    const entry = candidates.get(row.metaCampaignId) ?? {
      metaCampaignId: row.metaCampaignId,
      name: row.metaCampaignName,
      leads: 0,
      pendingInStaging: 0,
    };
    entry.pendingInStaging += row._count._all;
    entry.name = entry.name ?? row.metaCampaignName;
    candidates.set(row.metaCampaignId, entry);
  }

  return {
    links: links.map((link) => {
      const rows = leadGroups.filter((row) => row.metaCampaignId === link.metaCampaignId);
      const sum = (predicate: (row: (typeof rows)[number]) => boolean) =>
        rows.filter(predicate).reduce((total, row) => total + row._count._all, 0);
      return {
        metaCampaignId: link.metaCampaignId,
        label: link.label,
        createdAt: link.createdAt.toISOString(),
        createdByName: link.createdBy?.name ?? null,
        leadsTotal: sum(() => true),
        attributedHere: sum((row) => row.marketingCampaignId === campaignId),
        attributedElsewhere: sum(
          (row) => row.marketingCampaignId !== null && row.marketingCampaignId !== campaignId,
        ),
        unattributed: sum((row) => row.marketingCampaignId === null),
        pendingInStaging:
          stagingGroups.find((row) => row.metaCampaignId === link.metaCampaignId)?._count._all ?? 0,
      };
    }),
    candidates: [...candidates.values()].sort(
      (a, b) => b.leads + b.pendingInStaging - (a.leads + a.pendingInStaging),
    ),
  };
}
