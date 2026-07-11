import type { Prisma } from "@prisma/client";

import type { MarketingScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  marketingCampaignObjectiveLabels,
  marketingCampaignStatusLabels,
  marketingChannelLabels,
  marketingChannelValues,
  marketingConversionRate,
  type MarketingCampaignDTO,
  type MarketingCampaignObjectiveValue,
  type MarketingCampaignPerformanceDTO,
  type MarketingCampaignStatusValue,
  type MarketingChannelValue,
  type MarketingSummaryDTO,
} from "@/server/marketing/shared";

/**
 * Role-scoped Marketing read queries (Patch 3.7C.1). Every function resolves the
 * caller's {@link MarketingScope} into Prisma `where` filters, so branch
 * visibility is enforced in the database layer and never only in the UI:
 *
 * - global → Admin, every campaign.
 * - branch → Manager, campaigns targeting their branch or company-wide
 *   (untargeted) campaigns; lead attribution is counted within their branch.
 * - none   → blocked role (Seller / Cashier / Accountant) → empty.
 *
 * `estimatedBudget` is a marketing planning figure, nulled out for viewers who
 * may not see costs (`canSeeBudget`). No external ad-platform data is read.
 */

const LIST_LIMIT = 200;
const PERFORMANCE_LIMIT = 50;

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

/** Campaigns visible for the resolved scope, or null when nothing can match. */
function campaignWhere(
  resolved: ResolvedMarketingScope,
): Prisma.MarketingCampaignWhereInput | null {
  if (resolved.level === "empty") return null;
  if (resolved.level === "branch") {
    return {
      OR: [{ targetBranchId: resolved.branchId }, { targetBranchId: null }],
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
  targetBranch?: { code: string; name: string } | null;
  createdBy?: { name: string } | null;
};

function mapCampaign(
  campaign: CampaignRow,
  leadCount: number,
  canSeeBudget: boolean,
): MarketingCampaignDTO {
  const channel = campaign.channel as MarketingChannelValue;
  const status = campaign.status as MarketingCampaignStatusValue;
  const objective = campaign.objective as MarketingCampaignObjectiveValue;
  return {
    id: campaign.id,
    name: campaign.name,
    channel,
    channelLabel: marketingChannelLabels[channel] ?? campaign.channel,
    targetBranchCode: campaign.targetBranch?.code ?? null,
    targetBranchName: campaign.targetBranch?.name ?? null,
    motorcycleSlug: campaign.motorcycleSlug,
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
    leadCount,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

const campaignInclude = {
  targetBranch: { select: { code: true, name: true } },
  createdBy: { select: { name: true } },
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
    mapCampaign(campaign, counts.get(campaign.id) ?? 0, canSeeBudget),
  );
}

export async function getMarketingCampaignDetail(
  scope: MarketingScope,
  id: string,
  canSeeBudget: boolean,
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
  return mapCampaign(campaign, leadCount, canSeeBudget);
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
