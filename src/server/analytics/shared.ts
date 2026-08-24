/**
 * Pure, client-safe Analytics DTOs (Patch 3.7C.1) for the operational Dashboard
 * and the Reportes panel. No database import here; every query in queries.ts
 * returns these shapes. Money is always serialized as a plain `number` (never a
 * Prisma Decimal), and no inventory acquisition cost is ever included — the
 * figures below are commercial (quoted price, credit amount requested, sale
 * counts), which the cost-visibility rules do not restrict.
 */

import type { UserRoleEnum } from "@/server/auth/roles";
import type {
  ActivitySummaryDTO,
  ActivityListItemDTO,
  LeadStatusValue,
} from "@/server/crm/shared";
import type { MarketingSummaryDTO } from "@/server/marketing/shared";

export type { ActivitySummaryDTO, MarketingSummaryDTO };

/** Three-level scope, echoed back so the UI can label the view. */
export type AnalyticsScopeLevel = "global" | "branch" | "personal";

export type LeadFunnelStageDTO = {
  status: LeadStatusValue;
  label: string;
  count: number;
};

export type LeadFunnelDTO = {
  total: number;
  byStatus: LeadFunnelStageDTO[];
  bySource: { source: string; count: number }[];
  byCampaign: { campaignId: string; campaignName: string; count: number }[];
  /** Leads with no campaign attribution. */
  organic: number;
  converted: number;
  discarded: number;
  conversionRate: number;
};

export type InventorySummaryDTO = {
  total: number;
  available: number;
  reserved: number;
  inTransfer: number;
  sold: number;
  delivered: number;
  byModel: { model: string; total: number; available: number }[];
};

export type ReservationSalesSummaryDTO = {
  reservationsActive: number;
  reservationsCompleted: number;
  reservationsCancelled: number;
  salesCompleted: number;
  salesDelivered: number;
  salesTotal: number;
};

export type CreditSummaryDTO = {
  total: number;
  enRevision: number;
  documentacionPendiente: number;
  aprobados: number;
  rechazados: number;
  /** Sum of requested amounts (commercial figure, not an inventory cost). */
  montoSolicitado: number | null;
};

export type QuoteDocumentSummaryDTO = {
  quotesEmitidas: number;
  quotesAceptadas: number;
  quotesVencidas: number;
  /** Sum of referential quoted prices (commercial, not a cost). */
  quotesMontoReferencial: number | null;
  documentsPendientes: number;
  documentsRecibidos: number;
  documentsRevisados: number;
  documentsRechazados: number;
};

export type ExpedienteSummaryDTO = {
  total: number;
  abiertos: number;
  enProceso: number;
  completados: number;
  cancelados: number;
};

/** The full KPI payload for the operations dashboard, already scoped. */
export type DashboardSummaryDTO = {
  scopeLevel: AnalyticsScopeLevel;
  customers: number;
  leads: LeadFunnelDTO;
  expedientes: ExpedienteSummaryDTO;
  activities: ActivitySummaryDTO;
  inventory: InventorySummaryDTO;
  reservationSales: ReservationSalesSummaryDTO;
  credits: CreditSummaryDTO;
  quotesDocuments: QuoteDocumentSummaryDTO;
};

export type DashboardRoleContextDTO = {
  role: UserRoleEnum;
  roleLabel: string;
  scopeLevel: AnalyticsScopeLevel;
  branchName: string;
  canViewCosts: boolean;
  canViewMarketing: boolean;
  canViewBranchPerformance: boolean;
  canViewSellerPerformance: boolean;
};

export type DashboardAlertSeverity = "info" | "warning";

export type DashboardAlertDTO = {
  id: string;
  severity: DashboardAlertSeverity;
  title: string;
  count: number;
  href: string | null;
};

/** A dashboard recent-activity row reuses the CRM activity list item. */
export type DashboardRecentActivityDTO = ActivityListItemDTO;

export type BranchPerformanceDTO = {
  branchCode: string;
  branchName: string;
  leads: number;
  expedientes: number;
  reservationsActive: number;
  salesCompleted: number;
  salesDelivered: number;
};

export type SellerPerformanceDTO = {
  sellerId: string;
  sellerName: string;
  branchName: string;
  leads: number;
  activitiesPending: number;
  activitiesOverdue: number;
  expedientes: number;
  reservationsActive: number;
  salesCompleted: number;
  creditsInReview: number;
};

/** Everything the Reportes panel needs, already scoped in one place. */
export type ReportSummaryDTO = {
  scopeLevel: AnalyticsScopeLevel;
  lead: LeadFunnelDTO;
  inventory: InventorySummaryDTO;
  reservationSales: ReservationSalesSummaryDTO;
  activity: ActivitySummaryDTO;
  credits: CreditSummaryDTO;
  quotesDocuments: QuoteDocumentSummaryDTO;
  marketing: MarketingSummaryDTO;
  sellers: SellerPerformanceDTO[];
  branches: BranchPerformanceDTO[];
};
