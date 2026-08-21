import type { Prisma } from "@prisma/client";

import {
  canViewBranchPerformance,
  canViewCommercialAnalytics,
  canViewCosts,
  canViewMarketing,
  canViewSellerPerformance,
  getAnalyticsScopeForUser,
  getMarketingScopeForUser,
  type CrmScope,
} from "@/server/auth/access";
import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { leadStatusLabels, leadStatusValues } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { listActivities } from "@/server/expedientes/queries";
import { getMarketingSummary } from "@/server/marketing/queries";
import type {
  AnalyticsScopeLevel,
  BranchPerformanceDTO,
  CreditSummaryDTO,
  DashboardAlertDTO,
  DashboardRecentActivityDTO,
  DashboardRoleContextDTO,
  DashboardSummaryDTO,
  ExpedienteSummaryDTO,
  InventorySummaryDTO,
  LeadFunnelDTO,
  QuoteDocumentSummaryDTO,
  ReportSummaryDTO,
  ReservationSalesSummaryDTO,
  SellerPerformanceDTO,
  PosSummaryDTO,
} from "@/server/analytics/shared";
import { decimalToNumber } from "@/server/finance/money";
import type { ActivitySummaryDTO } from "@/server/crm/shared";

/**
 * Role-scoped Analytics read queries (Patch 3.7C.1) for the Dashboard KPIs and
 * the Reportes panel. Every metric is derived from database records only — no
 * localStorage is read here. Scope is enforced in the database `where` layer:
 *
 * - global   → Admin, every branch.
 * - branch   → Manager, own branch.
 * - personal → Seller, only their own commercial data.
 *
 * Cashier and Accountant are blocked from commercial analytics before any query
 * runs (their dashboards live in Caja / Contabilidad). Any client-provided
 * branch/seller intent would be ignored — the scope is always re-derived from
 * the authenticated session by the caller and re-checked here.
 */

/** The session-derived context every analytics query resolves its scope from. */
export type AnalyticsContext = {
  role: UserRoleEnum;
  /** Already null for global roles; a branch code (slug) otherwise. */
  branchCode: string | null;
  userId: string;
};

type ResolvedScope =
  | { level: "global" }
  | { level: "branch"; branchId: string }
  | { level: "personal"; userId: string; branchId: string | null }
  | { level: "empty" };

async function resolveBranchId(branchCode: string): Promise<string | null> {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({
    where: { code: branchCode },
    select: { id: true },
  });
  return branch?.id ?? null;
}

/** Resolves the caller into a database-ready scope, or `empty` when blocked. */
async function resolveContextScope(
  context: AnalyticsContext,
): Promise<ResolvedScope> {
  if (!canViewCommercialAnalytics(context.role)) return { level: "empty" };
  const scope: CrmScope = getAnalyticsScopeForUser(
    context.role,
    context.branchCode,
    context.userId,
  );
  if (scope.level === "global") return { level: "global" };
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return { level: "empty" };
    return { level: "branch", branchId };
  }
  const branchId = scope.branchCode
    ? await resolveBranchId(scope.branchCode)
    : null;
  return { level: "personal", userId: scope.userId, branchId };
}

function scopeLevelOf(resolved: ResolvedScope): AnalyticsScopeLevel {
  if (resolved.level === "branch") return "branch";
  if (resolved.level === "personal") return "personal";
  return "global";
}

// --- Per-model scope filters ---------------------------------------------
// Each mirrors the filter its owning module already uses, so analytics can
// never see more than the CRM / operations / expediente lists do.

function leadFilter(r: ResolvedScope): Prisma.LeadWhereInput {
  if (r.level === "branch") return { branchId: r.branchId };
  if (r.level === "personal") {
    return { OR: [{ assignedSellerId: r.userId }, { createdById: r.userId }] };
  }
  return {};
}

function customerFilter(r: ResolvedScope): Prisma.CustomerWhereInput {
  if (r.level === "branch") return { branchId: r.branchId };
  if (r.level === "personal") {
    return {
      OR: [
        { leads: { some: leadFilter(r) } },
        { customerFiles: { some: { sellerId: r.userId } } },
      ],
    };
  }
  return {};
}

function customerFileFilter(r: ResolvedScope): Prisma.CustomerFileWhereInput {
  if (r.level === "branch") return { branchId: r.branchId };
  if (r.level === "personal") {
    return {
      OR: [
        { sellerId: r.userId },
        {
          lead: {
            is: {
              OR: [
                { assignedSellerId: r.userId },
                { createdById: r.userId },
              ],
            },
          },
        },
      ],
    };
  }
  return {};
}

function activityFilter(r: ResolvedScope): Prisma.ActivityWhereInput {
  if (r.level === "branch") return { branchId: r.branchId };
  if (r.level === "personal") {
    return {
      OR: [
        { userId: r.userId },
        { customerFile: { is: { sellerId: r.userId } } },
        {
          lead: {
            is: {
              OR: [
                { assignedSellerId: r.userId },
                { createdById: r.userId },
              ],
            },
          },
        },
      ],
    };
  }
  return {};
}

function reservationFilter(r: ResolvedScope): Prisma.ReservationWhereInput {
  if (r.level === "branch") return { branchId: r.branchId };
  if (r.level === "personal") return { sellerId: r.userId };
  return {};
}

function saleFilter(r: ResolvedScope): Prisma.SaleWhereInput {
  if (r.level === "branch") return { branchId: r.branchId };
  if (r.level === "personal") return { sellerId: r.userId };
  return {};
}

function unitFilter(r: ResolvedScope): Prisma.MotorcycleUnitWhereInput {
  if (r.level === "branch") return { branchId: r.branchId };
  if (r.level === "personal") {
    // A Seller sees their own branch's inventory availability; without a branch
    // context they see nothing (an impossible branch id matches no unit).
    return { branchId: r.branchId ?? "__no_branch__" };
  }
  return {};
}

// --- Sub-summaries (all take a resolved, non-empty scope) ----------------

function sumGroup<T extends { _count: { _all: number } }>(rows: T[]): number {
  return rows.reduce((total, row) => total + row._count._all, 0);
}

async function buildLeadFunnel(r: ResolvedScope): Promise<LeadFunnelDTO> {
  const prisma = getPrisma();
  const where = leadFilter(r);
  const [statusGroups, sourceGroups, campaignGroups] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ["originChannel"],
      where,
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ["marketingCampaignId"],
      where,
      _count: { _all: true },
    }),
  ]);

  const total = sumGroup(statusGroups);
  const countFor = (value: string) =>
    statusGroups.find((row) => row.status === value)?._count._all ?? 0;

  const byStatus = leadStatusValues.map((status) => ({
    status,
    label: leadStatusLabels[status],
    count: countFor(status),
  }));

  const bySource = sourceGroups
    .map((row) => ({
      source: row.originChannel ?? "Sin canal",
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const campaignIds = campaignGroups
    .map((row) => row.marketingCampaignId)
    .filter((id): id is string => Boolean(id));
  const campaigns = campaignIds.length
    ? await prisma.marketingCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: { id: true, name: true },
      })
    : [];
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));

  const organic =
    campaignGroups.find((row) => row.marketingCampaignId === null)?._count
      ._all ?? 0;
  const byCampaign = campaignGroups
    .filter((row) => row.marketingCampaignId)
    .map((row) => ({
      campaignId: row.marketingCampaignId as string,
      campaignName:
        campaignName.get(row.marketingCampaignId as string) ?? "Campaña",
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const converted = countFor("EXPEDIENTE");
  const discarded = countFor("DESCARTADO");

  return {
    total,
    byStatus,
    bySource,
    byCampaign,
    organic,
    converted,
    discarded,
    conversionRate: total > 0 ? Math.round((converted / total) * 1000) / 1000 : 0,
  };
}

async function buildInventorySummary(
  r: ResolvedScope,
): Promise<InventorySummaryDTO> {
  const prisma = getPrisma();
  const where = unitFilter(r);
  const groups = await prisma.motorcycleUnit.groupBy({
    by: ["model", "status"],
    where,
    _count: { _all: true },
  });

  const totals = {
    total: 0,
    available: 0,
    reserved: 0,
    inTransfer: 0,
    sold: 0,
    delivered: 0,
  };
  const models = new Map<string, { total: number; available: number }>();

  for (const row of groups) {
    const count = row._count._all;
    totals.total += count;
    if (row.status === "AVAILABLE") totals.available += count;
    if (row.status === "RESERVED") totals.reserved += count;
    if (row.status === "IN_TRANSFER") totals.inTransfer += count;
    if (row.status === "SOLD") totals.sold += count;
    if (row.status === "DELIVERED") totals.delivered += count;

    const model = models.get(row.model) ?? { total: 0, available: 0 };
    model.total += count;
    if (row.status === "AVAILABLE") model.available += count;
    models.set(row.model, model);
  }

  const byModel = Array.from(models.entries())
    .map(([model, value]) => ({ model, ...value }))
    .sort((a, b) => b.total - a.total);

  return { ...totals, byModel };
}

/**
 * Patch INT2 — el mostrador, acotado por sucursal como todo lo demás.
 *
 * `PosSale` y `PosPurchaseOrder` llevan `branchId`; el saldo cuelga de la bodega,
 * así que se filtra por `warehouse.branch`. **No se inventa alcance**: es el
 * mismo `ResolvedScope` que usan los demás constructores.
 *
 * El alcance `personal` (un vendedor) no tiene lectura sobre el mostrador: una
 * venta de repuestos no se atribuye a un vendedor, así que se informa la de su
 * sucursal si la tiene y nada si no.
 */
async function buildPosSummary(r: ResolvedScope): Promise<PosSummaryDTO> {
  const branchId =
    r.level === "branch"
      ? r.branchId
      : r.level === "personal"
        ? (r.branchId ?? undefined)
        : undefined;
  if (r.level === "personal" && !branchId) return emptyPos;

  const prisma = getPrisma();
  const saleWhere = { status: "COMPLETADA" as const, ...(branchId ? { branchId } : {}) };
  const warehouseWhere = branchId ? { warehouse: { branchId } } : {};

  const [sales, payments, purchases, withBalance, outOfStock] = await Promise.all([
    prisma.posSale.aggregate({
      where: saleWhere,
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.posPayment.aggregate({
      where: { sale: saleWhere },
      _sum: { amount: true },
    }),
    prisma.posPurchaseOrder.aggregate({
      where: {
        status: { in: ["RECIBIDA", "RECIBIDA_PARCIAL"] },
        ...(branchId ? { branchId } : {}),
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.posInventory.count({ where: warehouseWhere }),
    prisma.posInventory.count({ where: { ...warehouseWhere, quantity: { lte: 0 } } }),
  ]);

  return {
    salesCompleted: sales._count._all,
    salesAmount: sales._sum.total ? decimalToNumber(sales._sum.total) : 0,
    paymentsAmount: payments._sum.amount ? decimalToNumber(payments._sum.amount) : 0,
    purchasesReceived: purchases._count._all,
    purchasesAmount: purchases._sum.total ? decimalToNumber(purchases._sum.total) : 0,
    productsWithBalance: withBalance,
    productsOutOfStock: outOfStock,
  };
}

async function buildReservationSalesSummary(
  r: ResolvedScope,
): Promise<ReservationSalesSummaryDTO> {
  const prisma = getPrisma();
  const [resGroups, saleGroups] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["status"],
      where: reservationFilter(r),
      _count: { _all: true },
    }),
    prisma.sale.groupBy({
      by: ["status"],
      where: saleFilter(r),
      _count: { _all: true },
    }),
  ]);

  const res = (value: string) =>
    resGroups.find((row) => row.status === value)?._count._all ?? 0;
  const sale = (value: string) =>
    saleGroups.find((row) => row.status === value)?._count._all ?? 0;

  const salesCompleted = sale("COMPLETADA");
  const salesDelivered = sale("ENTREGADA");

  return {
    reservationsActive: res("ACTIVA"),
    reservationsCompleted: res("COMPLETADA"),
    reservationsCancelled: res("CANCELADA"),
    salesCompleted,
    salesDelivered,
    salesTotal: salesCompleted + salesDelivered,
  };
}

async function buildCreditSummary(r: ResolvedScope): Promise<CreditSummaryDTO> {
  const prisma = getPrisma();
  const where: Prisma.CreditApplicationWhereInput = {
    customerFile: customerFileFilter(r),
  };
  const [groups, amount] = await Promise.all([
    prisma.creditApplication.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.creditApplication.aggregate({ where, _sum: { amount: true } }),
  ]);

  const count = (value: string) =>
    groups.find((row) => row.status === value)?._count._all ?? 0;

  return {
    total: sumGroup(groups),
    enRevision: count("EN_REVISION"),
    documentacionPendiente: count("DOCUMENTACION_PENDIENTE"),
    aprobados: count("APROBADO"),
    rechazados: count("RECHAZADO"),
    montoSolicitado: amount._sum.amount ? amount._sum.amount.toNumber() : null,
  };
}

async function buildQuoteDocumentSummary(
  r: ResolvedScope,
): Promise<QuoteDocumentSummaryDTO> {
  const prisma = getPrisma();
  const cf = customerFileFilter(r);
  const [quoteGroups, quoteAmount, docGroups] = await Promise.all([
    prisma.quote.groupBy({
      by: ["status"],
      where: { customerFile: cf },
      _count: { _all: true },
    }),
    prisma.quote.aggregate({
      where: { customerFile: cf, status: { in: ["EMITIDA", "ACEPTADA"] } },
      _sum: { price: true },
    }),
    prisma.expedienteDocument.groupBy({
      by: ["status"],
      where: { customerFile: cf },
      _count: { _all: true },
    }),
  ]);

  const quote = (value: string) =>
    quoteGroups.find((row) => row.status === value)?._count._all ?? 0;
  const doc = (value: string) =>
    docGroups.find((row) => row.status === value)?._count._all ?? 0;

  return {
    quotesEmitidas: quote("EMITIDA"),
    quotesAceptadas: quote("ACEPTADA"),
    quotesVencidas: quote("VENCIDA"),
    quotesMontoReferencial: quoteAmount._sum.price
      ? quoteAmount._sum.price.toNumber()
      : null,
    documentsPendientes: doc("PENDIENTE"),
    documentsRecibidos: doc("RECIBIDO"),
    documentsRevisados: doc("REVISADO"),
    documentsRechazados: doc("RECHAZADO"),
  };
}

async function buildExpedienteSummary(
  r: ResolvedScope,
): Promise<ExpedienteSummaryDTO> {
  const prisma = getPrisma();
  const groups = await prisma.customerFile.groupBy({
    by: ["status"],
    where: customerFileFilter(r),
    _count: { _all: true },
  });
  const count = (value: string) =>
    groups.find((row) => row.status === value)?._count._all ?? 0;
  return {
    total: sumGroup(groups),
    abiertos: count("ABIERTO"),
    enProceso: count("EN_PROCESO"),
    completados: count("COMPLETADO"),
    cancelados: count("CANCELADO"),
  };
}

async function buildActivitySummary(
  r: ResolvedScope,
  now: Date,
): Promise<ActivitySummaryDTO> {
  const prisma = getPrisma();
  const where = activityFilter(r);
  const [pendientes, completadas, vencidas, proximas] = await Promise.all([
    prisma.activity.count({ where: { AND: [where, { status: "PENDIENTE" }] } }),
    prisma.activity.count({ where: { AND: [where, { status: "COMPLETADA" }] } }),
    prisma.activity.count({
      where: {
        AND: [where, { status: "PENDIENTE", scheduledAt: { lt: now } }],
      },
    }),
    prisma.activity.count({
      where: {
        AND: [where, { status: "PENDIENTE", scheduledAt: { gte: now } }],
      },
    }),
  ]);
  return { pendientes, vencidas, proximas, completadas };
}

const emptyLeadFunnel: LeadFunnelDTO = {
  total: 0,
  byStatus: leadStatusValues.map((status) => ({
    status,
    label: leadStatusLabels[status],
    count: 0,
  })),
  bySource: [],
  byCampaign: [],
  organic: 0,
  converted: 0,
  discarded: 0,
  conversionRate: 0,
};

const emptyInventory: InventorySummaryDTO = {
  total: 0,
  available: 0,
  reserved: 0,
  inTransfer: 0,
  sold: 0,
  delivered: 0,
  byModel: [],
};

/** Patch INT2 — el mostrador sin nada que informar. */
const emptyPos: PosSummaryDTO = {
  salesCompleted: 0,
  salesAmount: 0,
  paymentsAmount: 0,
  purchasesReceived: 0,
  purchasesAmount: 0,
  productsWithBalance: 0,
  productsOutOfStock: 0,
};

const emptyReservationSales: ReservationSalesSummaryDTO = {
  reservationsActive: 0,
  reservationsCompleted: 0,
  reservationsCancelled: 0,
  salesCompleted: 0,
  salesDelivered: 0,
  salesTotal: 0,
};

const emptyCredits: CreditSummaryDTO = {
  total: 0,
  enRevision: 0,
  documentacionPendiente: 0,
  aprobados: 0,
  rechazados: 0,
  montoSolicitado: null,
};

const emptyQuotesDocs: QuoteDocumentSummaryDTO = {
  quotesEmitidas: 0,
  quotesAceptadas: 0,
  quotesVencidas: 0,
  quotesMontoReferencial: null,
  documentsPendientes: 0,
  documentsRecibidos: 0,
  documentsRevisados: 0,
  documentsRechazados: 0,
};

const emptyActivity: ActivitySummaryDTO = {
  pendientes: 0,
  vencidas: 0,
  proximas: 0,
  completadas: 0,
};

const emptyExpedientes: ExpedienteSummaryDTO = {
  total: 0,
  abiertos: 0,
  enProceso: 0,
  completados: 0,
  cancelados: 0,
};

// --- Dashboard -----------------------------------------------------------

export async function getOperationsDashboardSummary(
  context: AnalyticsContext,
): Promise<DashboardSummaryDTO> {
  const resolved = isDatabaseConfigured()
    ? await resolveContextScope(context)
    : { level: "empty" as const };

  if (resolved.level === "empty") {
    return {
      scopeLevel: "personal",
      customers: 0,
      leads: emptyLeadFunnel,
      expedientes: emptyExpedientes,
      activities: emptyActivity,
      inventory: emptyInventory,
      reservationSales: emptyReservationSales,
      credits: emptyCredits,
      quotesDocuments: emptyQuotesDocs,
    };
  }

  const prisma = getPrisma();
  const now = new Date();
  const [
    customers,
    leads,
    expedientes,
    activities,
    inventory,
    reservationSales,
    credits,
    quotesDocuments,
  ] = await Promise.all([
    prisma.customer.count({ where: customerFilter(resolved) }),
    buildLeadFunnel(resolved),
    buildExpedienteSummary(resolved),
    buildActivitySummary(resolved, now),
    buildInventorySummary(resolved),
    buildReservationSalesSummary(resolved),
    buildCreditSummary(resolved),
    buildQuoteDocumentSummary(resolved),
  ]);

  return {
    scopeLevel: scopeLevelOf(resolved),
    customers,
    leads,
    expedientes,
    activities,
    inventory,
    reservationSales,
    credits,
    quotesDocuments,
  };
}

/**
 * Pure role/scope context for the dashboard header. Needs no database access;
 * it echoes the caller's role, resolved scope level and capability flags.
 */
export function getDashboardRoleContext(
  context: AnalyticsContext & { branchName: string },
): DashboardRoleContextDTO {
  const scope = getAnalyticsScopeForUser(
    context.role,
    context.branchCode,
    context.userId,
  );
  const scopeLevel: AnalyticsScopeLevel =
    scope.level === "global"
      ? "global"
      : scope.level === "branch"
        ? "branch"
        : "personal";
  return {
    role: context.role,
    roleLabel: roleEnumToSpanish[context.role],
    scopeLevel,
    branchName: context.branchName,
    canViewCosts: canViewCosts(context.role),
    canViewMarketing: canViewMarketing(context.role),
    canViewBranchPerformance: canViewBranchPerformance(context.role),
    canViewSellerPerformance: canViewSellerPerformance(context.role),
  };
}

export async function getDashboardAlerts(
  context: AnalyticsContext,
): Promise<DashboardAlertDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const resolved = await resolveContextScope(context);
  if (resolved.level === "empty") return [];

  const prisma = getPrisma();
  const now = new Date();
  const [overdueActivities, pendingDocuments, creditsPendingDocs] =
    await Promise.all([
      prisma.activity.count({
        where: {
          AND: [
            activityFilter(resolved),
            { status: "PENDIENTE", scheduledAt: { lt: now } },
          ],
        },
      }),
      prisma.expedienteDocument.count({
        where: {
          customerFile: customerFileFilter(resolved),
          status: { in: ["PENDIENTE", "RECHAZADO"] },
        },
      }),
      prisma.creditApplication.count({
        where: {
          customerFile: customerFileFilter(resolved),
          status: "DOCUMENTACION_PENDIENTE",
        },
      }),
    ]);

  const alerts: DashboardAlertDTO[] = [];
  if (overdueActivities > 0) {
    alerts.push({
      id: "overdue-activities",
      severity: "warning",
      title: "Actividades vencidas",
      count: overdueActivities,
      href: "/panel/actividades",
    });
  }
  if (pendingDocuments > 0) {
    alerts.push({
      id: "pending-documents",
      severity: "warning",
      title: "Documentos pendientes o rechazados",
      count: pendingDocuments,
      href: "/panel/expedientes",
    });
  }
  if (creditsPendingDocs > 0) {
    alerts.push({
      id: "credits-pending-docs",
      severity: "info",
      title: "Créditos con documentación pendiente",
      count: creditsPendingDocs,
      href: "/panel/creditos",
    });
  }
  return alerts;
}

export async function getDashboardRecentActivity(
  context: AnalyticsContext,
  limit = 8,
): Promise<DashboardRecentActivityDTO[]> {
  if (!isDatabaseConfigured()) return [];
  if (!canViewCommercialAnalytics(context.role)) return [];
  const scope = getAnalyticsScopeForUser(
    context.role,
    context.branchCode,
    context.userId,
  );
  const activities = await listActivities(scope);
  return [...activities]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

// --- Branch / seller performance -----------------------------------------

export async function getDashboardBranchPerformance(
  context: AnalyticsContext,
): Promise<BranchPerformanceDTO[]> {
  if (!isDatabaseConfigured()) return [];
  // Cross-branch comparison is an Admin-only, global supervision view.
  if (!canViewBranchPerformance(context.role)) return [];

  const prisma = getPrisma();
  const [branches, leadG, fileG, resG, saleG] = await Promise.all([
    prisma.branch.findMany({ select: { id: true, code: true, name: true } }),
    prisma.lead.groupBy({ by: ["branchId"], _count: { _all: true } }),
    prisma.customerFile.groupBy({ by: ["branchId"], _count: { _all: true } }),
    prisma.reservation.groupBy({
      by: ["branchId", "status"],
      _count: { _all: true },
    }),
    prisma.sale.groupBy({ by: ["branchId", "status"], _count: { _all: true } }),
  ]);

  const leadBy = new Map(leadG.map((r) => [r.branchId, r._count._all]));
  const fileBy = new Map(fileG.map((r) => [r.branchId, r._count._all]));
  const resActive = new Map<string, number>();
  for (const row of resG) {
    if (row.status === "ACTIVA") {
      resActive.set(row.branchId, row._count._all);
    }
  }
  const saleBy = new Map<string, { completed: number; delivered: number }>();
  for (const row of saleG) {
    const entry = saleBy.get(row.branchId) ?? { completed: 0, delivered: 0 };
    if (row.status === "COMPLETADA") entry.completed += row._count._all;
    if (row.status === "ENTREGADA") entry.delivered += row._count._all;
    saleBy.set(row.branchId, entry);
  }

  return branches
    .map((branch) => ({
      branchCode: branch.code,
      branchName: branch.name,
      leads: leadBy.get(branch.id) ?? 0,
      expedientes: fileBy.get(branch.id) ?? 0,
      reservationsActive: resActive.get(branch.id) ?? 0,
      salesCompleted: saleBy.get(branch.id)?.completed ?? 0,
      salesDelivered: saleBy.get(branch.id)?.delivered ?? 0,
    }))
    .sort((a, b) => b.salesCompleted - a.salesCompleted);
}

export async function getDashboardSellerPerformance(
  context: AnalyticsContext,
): Promise<SellerPerformanceDTO[]> {
  if (!isDatabaseConfigured()) return [];
  // Admin (global) or Manager (own branch) only.
  if (!canViewSellerPerformance(context.role)) return [];

  const prisma = getPrisma();
  const now = new Date();

  // Scope the seller list: Admin sees all, Manager sees their branch only.
  let sellerWhere: Prisma.UserWhereInput = { role: "VENDEDOR" };
  if (context.role === "GERENTE") {
    if (!context.branchCode) return [];
    const branchId = await resolveBranchId(context.branchCode);
    if (!branchId) return [];
    sellerWhere = { role: "VENDEDOR", branchId };
  }

  const sellers = await prisma.user.findMany({
    where: sellerWhere,
    select: { id: true, name: true, branch: { select: { name: true } } },
  });
  if (sellers.length === 0) return [];
  const ids = sellers.map((s) => s.id);

  const [leadG, resG, saleG, fileG, actPending, actOverdue, creditRows] =
    await Promise.all([
      prisma.lead.groupBy({
        by: ["assignedSellerId"],
        where: { assignedSellerId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.reservation.groupBy({
        by: ["sellerId", "status"],
        where: { sellerId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.sale.groupBy({
        by: ["sellerId", "status"],
        where: { sellerId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.customerFile.groupBy({
        by: ["sellerId"],
        where: { sellerId: { in: ids } },
        _count: { _all: true },
      }),
      prisma.activity.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, status: "PENDIENTE" },
        _count: { _all: true },
      }),
      prisma.activity.groupBy({
        by: ["userId"],
        where: {
          userId: { in: ids },
          status: "PENDIENTE",
          scheduledAt: { lt: now },
        },
        _count: { _all: true },
      }),
      prisma.creditApplication.findMany({
        where: {
          status: "EN_REVISION",
          customerFile: { is: { sellerId: { in: ids } } },
        },
        select: { customerFile: { select: { sellerId: true } } },
      }),
    ]);

  const leadBy = new Map(
    leadG.map((r) => [r.assignedSellerId as string, r._count._all]),
  );
  const fileMap = new Map(
    fileG.map((r) => [r.sellerId as string, r._count._all]),
  );
  const resActive = new Map<string, number>();
  for (const row of resG) {
    if (row.status === "ACTIVA" && row.sellerId) {
      resActive.set(row.sellerId, row._count._all);
    }
  }
  const salesCompleted = new Map<string, number>();
  for (const row of saleG) {
    if (row.sellerId && (row.status === "COMPLETADA" || row.status === "ENTREGADA")) {
      salesCompleted.set(
        row.sellerId,
        (salesCompleted.get(row.sellerId) ?? 0) + row._count._all,
      );
    }
  }
  const pendingBy = new Map(
    actPending.map((r) => [r.userId as string, r._count._all]),
  );
  const overdueBy = new Map(
    actOverdue.map((r) => [r.userId as string, r._count._all]),
  );
  const creditsBy = new Map<string, number>();
  for (const row of creditRows) {
    const sellerId = row.customerFile?.sellerId;
    if (sellerId) creditsBy.set(sellerId, (creditsBy.get(sellerId) ?? 0) + 1);
  }

  return sellers
    .map((seller) => ({
      sellerId: seller.id,
      sellerName: seller.name,
      branchName: seller.branch?.name ?? "Sucursal",
      leads: leadBy.get(seller.id) ?? 0,
      activitiesPending: pendingBy.get(seller.id) ?? 0,
      activitiesOverdue: overdueBy.get(seller.id) ?? 0,
      expedientes: fileMap.get(seller.id) ?? 0,
      reservationsActive: resActive.get(seller.id) ?? 0,
      salesCompleted: salesCompleted.get(seller.id) ?? 0,
      creditsInReview: creditsBy.get(seller.id) ?? 0,
    }))
    .sort((a, b) => b.salesCompleted - a.salesCompleted);
}

// --- Reports -------------------------------------------------------------

export async function getLeadReport(
  context: AnalyticsContext,
): Promise<LeadFunnelDTO> {
  if (!isDatabaseConfigured()) return emptyLeadFunnel;
  const resolved = await resolveContextScope(context);
  if (resolved.level === "empty") return emptyLeadFunnel;
  return buildLeadFunnel(resolved);
}

export async function getInventoryReport(
  context: AnalyticsContext,
): Promise<InventorySummaryDTO> {
  if (!isDatabaseConfigured()) return emptyInventory;
  const resolved = await resolveContextScope(context);
  if (resolved.level === "empty") return emptyInventory;
  return buildInventorySummary(resolved);
}

export async function getReservationSalesReport(
  context: AnalyticsContext,
): Promise<ReservationSalesSummaryDTO> {
  if (!isDatabaseConfigured()) return emptyReservationSales;
  const resolved = await resolveContextScope(context);
  if (resolved.level === "empty") return emptyReservationSales;
  return buildReservationSalesSummary(resolved);
}

export async function getActivityReport(
  context: AnalyticsContext,
): Promise<ActivitySummaryDTO> {
  if (!isDatabaseConfigured()) return emptyActivity;
  const resolved = await resolveContextScope(context);
  if (resolved.level === "empty") return emptyActivity;
  return buildActivitySummary(resolved, new Date());
}

export async function getQuoteCreditDocumentReport(
  context: AnalyticsContext,
): Promise<{ credits: CreditSummaryDTO; quotesDocuments: QuoteDocumentSummaryDTO }> {
  if (!isDatabaseConfigured()) {
    return { credits: emptyCredits, quotesDocuments: emptyQuotesDocs };
  }
  const resolved = await resolveContextScope(context);
  if (resolved.level === "empty") {
    return { credits: emptyCredits, quotesDocuments: emptyQuotesDocs };
  }
  const [credits, quotesDocuments] = await Promise.all([
    buildCreditSummary(resolved),
    buildQuoteDocumentSummary(resolved),
  ]);
  return { credits, quotesDocuments };
}

export async function getMarketingReport(context: AnalyticsContext) {
  // Marketing has its own isolated scope: Admin/MARKETING cross-branch, Manager
  // branch, everyone else blocked. It never widens commercial analytics access.
  const marketingScope = getMarketingScopeForUser(
    context.role,
    context.branchCode,
  );
  return getMarketingSummary(marketingScope);
}

export async function getSellerReport(
  context: AnalyticsContext,
): Promise<SellerPerformanceDTO[]> {
  return getDashboardSellerPerformance(context);
}

export async function getBranchReport(
  context: AnalyticsContext,
): Promise<BranchPerformanceDTO[]> {
  return getDashboardBranchPerformance(context);
}

/** The complete Reportes payload, scoped in one place. */
export async function getCommercialReportSummary(
  context: AnalyticsContext,
): Promise<ReportSummaryDTO> {
  const resolved = isDatabaseConfigured()
    ? await resolveContextScope(context)
    : { level: "empty" as const };

  if (resolved.level === "empty") {
    return {
      scopeLevel: "personal",
      lead: emptyLeadFunnel,
      inventory: emptyInventory,
      reservationSales: emptyReservationSales,
      pos: emptyPos,
      activity: emptyActivity,
      credits: emptyCredits,
      quotesDocuments: emptyQuotesDocs,
      marketing: {
        totalCampaigns: 0,
        activeCampaigns: 0,
        pausedCampaigns: 0,
        completedCampaigns: 0,
        attributedLeads: 0,
        byChannel: [],
        topCampaigns: [],
      },
      sellers: [],
      branches: [],
    };
  }

  const now = new Date();
  const [
    lead,
    inventory,
    reservationSales,
    pos,
    activity,
    credits,
    quotesDocuments,
    marketing,
    sellers,
    branches,
  ] = await Promise.all([
    buildLeadFunnel(resolved),
    buildInventorySummary(resolved),
    buildReservationSalesSummary(resolved),
    buildPosSummary(resolved),
    buildActivitySummary(resolved, now),
    buildCreditSummary(resolved),
    buildQuoteDocumentSummary(resolved),
    getMarketingReport(context),
    getDashboardSellerPerformance(context),
    getDashboardBranchPerformance(context),
  ]);

  return {
    scopeLevel: scopeLevelOf(resolved),
    lead,
    inventory,
    reservationSales,
    pos,
    activity,
    credits,
    quotesDocuments,
    marketing,
    sellers,
    branches,
  };
}
