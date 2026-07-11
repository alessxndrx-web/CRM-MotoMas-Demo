/**
 * Pure, client-safe Marketing types, enum value unions, label maps and input
 * shapes (Patch 3.7C.1). No database import here so client components can reuse
 * the DTO shapes and catalogs. Enforcement lives in queries.ts / actions.ts.
 *
 * These mirror the Prisma enums MarketingChannel / MarketingCampaignStatus /
 * MarketingCampaignObjective and the current local campaign contract
 * (`src/data/operations/marketing-campaigns.ts`). No external ad-platform
 * integration, webhook or spend synchronization is implied.
 */

export type MarketingChannelValue =
  | "FACEBOOK_ADS"
  | "INSTAGRAM_ADS"
  | "TIKTOK"
  | "WHATSAPP"
  | "WEBSITE"
  | "REFERRAL"
  | "OTHER";

export const marketingChannelValues: MarketingChannelValue[] = [
  "FACEBOOK_ADS",
  "INSTAGRAM_ADS",
  "TIKTOK",
  "WHATSAPP",
  "WEBSITE",
  "REFERRAL",
  "OTHER",
];

export const marketingChannelLabels: Record<MarketingChannelValue, string> = {
  FACEBOOK_ADS: "Facebook Ads",
  INSTAGRAM_ADS: "Instagram Ads",
  TIKTOK: "TikTok",
  WHATSAPP: "WhatsApp",
  WEBSITE: "Sitio web",
  REFERRAL: "Referido",
  OTHER: "Otro",
};

export function isMarketingChannelValue(
  value: string,
): value is MarketingChannelValue {
  return marketingChannelValues.includes(value as MarketingChannelValue);
}

export type MarketingCampaignStatusValue = "ACTIVE" | "PAUSED" | "COMPLETED";

export const marketingCampaignStatusValues: MarketingCampaignStatusValue[] = [
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
];

export const marketingCampaignStatusLabels: Record<
  MarketingCampaignStatusValue,
  string
> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  COMPLETED: "Finalizada",
};

export function isMarketingCampaignStatusValue(
  value: string,
): value is MarketingCampaignStatusValue {
  return marketingCampaignStatusValues.includes(
    value as MarketingCampaignStatusValue,
  );
}

export type MarketingCampaignObjectiveValue =
  | "LEADS"
  | "RESERVATIONS"
  | "SALES";

export const marketingCampaignObjectiveValues: MarketingCampaignObjectiveValue[] =
  ["LEADS", "RESERVATIONS", "SALES"];

export const marketingCampaignObjectiveLabels: Record<
  MarketingCampaignObjectiveValue,
  string
> = {
  LEADS: "Leads",
  RESERVATIONS: "Reservas",
  SALES: "Ventas",
};

export function isMarketingCampaignObjectiveValue(
  value: string,
): value is MarketingCampaignObjectiveValue {
  return marketingCampaignObjectiveValues.includes(
    value as MarketingCampaignObjectiveValue,
  );
}

/**
 * A marketing campaign as shown to an authorized viewer. `estimatedBudget` is a
 * marketing planning figure (not an inventory acquisition cost) and is nulled
 * out by the query layer for viewers who may not see costs.
 */
export type MarketingCampaignDTO = {
  id: string;
  name: string;
  channel: MarketingChannelValue;
  channelLabel: string;
  targetBranchCode: string | null;
  targetBranchName: string | null;
  motorcycleSlug: string | null;
  estimatedBudget: number | null;
  startsAt: string;
  endsAt: string | null;
  status: MarketingCampaignStatusValue;
  statusLabel: string;
  objective: MarketingCampaignObjectiveValue;
  objectiveLabel: string;
  description: string | null;
  createdById: string;
  createdByName: string | null;
  /** Leads attributed to this campaign inside the viewer's scope. */
  leadCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Attribution performance for one campaign, derived only from DB records. */
export type MarketingCampaignPerformanceDTO = {
  campaignId: string;
  campaignName: string;
  channel: MarketingChannelValue;
  channelLabel: string;
  status: MarketingCampaignStatusValue;
  leads: number;
  /** Leads that reached EXPEDIENTE (converted). */
  converted: number;
  discarded: number;
  /** Reservations whose expediente came from a lead of this campaign. */
  reservations: number;
  /** Sales whose expediente came from a lead of this campaign. */
  sales: number;
  conversionRate: number;
};

/** Aggregate marketing picture for the Reportes / Dashboard marketing block. */
export type MarketingSummaryDTO = {
  totalCampaigns: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  completedCampaigns: number;
  /** Leads attributed to any campaign inside the viewer's scope. */
  attributedLeads: number;
  byChannel: {
    channel: MarketingChannelValue;
    channelLabel: string;
    count: number;
  }[];
  topCampaigns: MarketingCampaignPerformanceDTO[];
};

/**
 * Server-side campaign input (English enum values). Branch is passed as a code;
 * the action resolves it to a branch id and never trusts a raw id from a client.
 */
export type MarketingCampaignInput = {
  name: string;
  channel: MarketingChannelValue;
  targetBranchCode: string | null;
  motorcycleSlug: string | null;
  estimatedBudget: number | null;
  startsAt: string;
  endsAt: string | null;
  status: MarketingCampaignStatusValue;
  objective: MarketingCampaignObjectiveValue;
  description: string | null;
};

export function marketingConversionRate(
  leads: number,
  converted: number,
): number {
  if (leads <= 0) return 0;
  return Math.round((converted / leads) * 1000) / 1000;
}
