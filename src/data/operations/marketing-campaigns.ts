import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const MARKETING_CAMPAIGNS_STORAGE_KEY = storageKeys.marketingCampaigns;

export const marketingChannels = [
  "Facebook Ads",
  "Instagram Ads",
  "TikTok",
  "WhatsApp",
  "Sitio web",
  "Referido",
  "Otro",
] as const;

export const campaignStatuses = ["Activa", "Pausada", "Finalizada"] as const;
export const campaignObjectives = ["Leads", "Reservas", "Ventas"] as const;

export type MarketingChannel = (typeof marketingChannels)[number];
export type CampaignStatus = (typeof campaignStatuses)[number];
export type CampaignObjective = (typeof campaignObjectives)[number];

export type MarketingCampaign = {
  id: string;
  nombre: string;
  canal: MarketingChannel;
  sucursalObjetivo: DesiredBranchId | null;
  modeloObjetivo: string | null;
  presupuestoEstimado: number | null;
  fechaInicio: string;
  fechaFin: string | null;
  estado: CampaignStatus;
  objetivo: CampaignObjective;
  descripcion: string | null;
  fechaCreacion: string;
};

export function isMarketingChannel(value: string): value is MarketingChannel {
  return marketingChannels.some((channel) => channel === value);
}

export function isCampaignStatus(value: string): value is CampaignStatus {
  return campaignStatuses.some((status) => status === value);
}

export function isCampaignObjective(value: string): value is CampaignObjective {
  return campaignObjectives.some((objective) => objective === value);
}

export function normalizeMarketingCampaign(value: unknown): MarketingCampaign | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<MarketingCampaign>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.nombre !== "string" ||
    !(typeof candidate.canal === "string" && isMarketingChannel(candidate.canal)) ||
    !(
      typeof candidate.sucursalObjetivo === "string" ||
      candidate.sucursalObjetivo === null
    ) ||
    !(typeof candidate.modeloObjetivo === "string" || candidate.modeloObjetivo === null) ||
    !(
      typeof candidate.presupuestoEstimado === "number" ||
      candidate.presupuestoEstimado === null
    ) ||
    typeof candidate.fechaInicio !== "string" ||
    !(typeof candidate.fechaFin === "string" || candidate.fechaFin === null) ||
    !(typeof candidate.estado === "string" && isCampaignStatus(candidate.estado)) ||
    !(typeof candidate.objetivo === "string" && isCampaignObjective(candidate.objetivo)) ||
    !(typeof candidate.descripcion === "string" || candidate.descripcion === null) ||
    typeof candidate.fechaCreacion !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    nombre: candidate.nombre,
    canal: candidate.canal,
    sucursalObjetivo: candidate.sucursalObjetivo as DesiredBranchId | null,
    modeloObjetivo: candidate.modeloObjetivo,
    presupuestoEstimado: candidate.presupuestoEstimado,
    fechaInicio: candidate.fechaInicio,
    fechaFin: candidate.fechaFin,
    estado: candidate.estado,
    objetivo: candidate.objetivo,
    descripcion: candidate.descripcion,
    fechaCreacion: candidate.fechaCreacion,
  };
}
