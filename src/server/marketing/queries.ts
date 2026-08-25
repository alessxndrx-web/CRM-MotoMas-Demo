import type { Prisma } from "@prisma/client";

import type { MarketingScope } from "@/server/auth/access";
import { leadStatusLabels, type LeadStatusValue } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  marketingCampaignObjectiveLabels,
  marketingCampaignStatusLabels,
  marketingChannelForOriginChannel,
  marketingChannelLabels,
  marketingChannelValues,
  marketingConversionRate,
  type MarketingAttributionReportDTO,
  type MarketingAttributionRowDTO,
  type MarketingCampaignDTO,
  type MarketingCampaignObjectiveValue,
  type MarketingCampaignPerformanceDTO,
  type MarketingCampaignStatusValue,
  type MarketingChannelValue,
  type MarketingLeadAttributionDTO,
  type MarketingSummaryDTO,
} from "@/server/marketing/shared";
import { getLatestMetaAdMetrics } from "@/server/meta-ads/queries";
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
  metaAdAccountId?: string | null;
  targetBranch?: { code: string; name: string } | null;
  createdBy?: { name: string } | null;
  metaAdAccount?: { label: string | null; accountName: string | null; adAccountId: string } | null;
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
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}

const campaignInclude = {
  targetBranch: { select: { code: true, name: true } },
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
export async function getMarketingAttributionReport(
  datePreset: MetaAdDatePresetValue,
  branchCode: string | null = null,
): Promise<MarketingAttributionReportDTO> {
  const range = resolveMetaAdDatePresetRange(datePreset);
  const empty: MarketingAttributionReportDTO = {
    datePreset,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    branchCode,
    rows: [],
  };
  if (!isDatabaseConfigured()) return empty;

  // La sucursal llega como **código**, nunca como id: es la misma regla que
  // siguen las campañas y los mapeos de página. Un código desconocido no puede
  // casar con nada, y devolver el informe vacío es más honesto que ignorarlo y
  // enseñar cifras de toda la empresa bajo una etiqueta de sucursal.
  const branchId = branchCode ? await resolveBranchId(branchCode) : null;
  if (branchCode && !branchId) return empty;

  const prisma = getPrisma();
  const window = { gte: range.from, lt: range.to };
  const branchFilter = branchId ? { branchId } : {};
  const saleWhere = {
    status: "COMPLETADA" as const,
    completedAt: window,
    ...branchFilter,
  };

  const [leadGroups, salesChannels, links, accounts, metricsBoard] =
    await Promise.all([
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

  const leadsByChannel = new Map<string, number>();
  for (const group of leadGroups) {
    if (group.originChannel) {
      leadsByChannel.set(group.originChannel, group._count._all);
    }
  }

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

  const channels = new Set<string>([
    ...leadsByChannel.keys(),
    ...salesChannels.flatMap((lead) =>
      lead.originChannel ? [lead.originChannel] : [],
    ),
    ...accountsByChannel.keys(),
  ]);

  const rows: MarketingAttributionRowDTO[] = await Promise.all(
    [...channels].map(async (channel) => {
      const linked = accountsByChannel.get(channel) ?? new Set<string>();
      const snapshots = [...linked]
        // Una cuenta enlazada que el tablero no devuelve —dada de baja en el
        // registro— cuenta como cuenta sin foto, no como gasto cero.
        .map((adAccountId) => snapshotByAccount.get(adAccountId) ?? null)
        .filter((snapshot) => snapshot !== null);

      const currencies = new Set(snapshots.map((snapshot) => snapshot.currency));
      const mixedCurrency = currencies.size > 1;
      // Sin ninguna foto no hay gasto que enseñar, y con monedas distintas
      // tampoco: sumar córdobas con dólares da una cifra que parece correcta y
      // no lo es.
      const spend =
        snapshots.length === 0 || mixedCurrency
          ? null
          : round2(
              snapshots.reduce((total, snapshot) => total + snapshot.spend, 0),
            );

      const sales = await prisma.posSale.aggregate({
        where: { ...saleWhere, attributedLead: { originChannel: channel } },
        _count: { _all: true },
        _sum: { total: true },
      });

      const leads = leadsByChannel.get(channel) ?? 0;

      return {
        channel,
        marketingChannel: marketingChannelForOriginChannel(channel),
        spend,
        spendCurrency: spend === null ? null : ([...currencies][0] ?? null),
        linkedAccounts: linked.size,
        accountsWithoutSnapshot: linked.size - snapshots.length,
        mixedCurrency,
        leads,
        salesCount: sales._count._all,
        salesTotal: sales._sum.total ? sales._sum.total.toNumber() : 0,
        // **Nunca se divide entre cero y nunca se fabrica un 0.00.** Sin leads
        // el coste por lead no es cero, es nada; sin gasto conocido tampoco hay
        // nada que repartir.
        costPerLead: spend === null || leads === 0 ? null : round2(spend / leads),
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
