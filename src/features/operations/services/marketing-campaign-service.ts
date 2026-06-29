"use client";

import {
  MARKETING_CAMPAIGNS_STORAGE_KEY,
  normalizeMarketingCampaign,
  type CampaignObjective,
  type CampaignStatus,
  type MarketingCampaign,
  type MarketingChannel,
} from "@/data/operations/marketing-campaigns";
import type { DesiredBranchId } from "@/data/operations/leads";
import type { DemoSession } from "@/features/operations/types";

export type CampaignInput = {
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
};

export function readMarketingCampaigns() {
  try {
    const raw = window.localStorage.getItem(MARKETING_CAMPAIGNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((campaign) => normalizeMarketingCampaign(campaign))
      .filter((campaign): campaign is MarketingCampaign => Boolean(campaign))
      .sort((left, right) => right.fechaCreacion.localeCompare(left.fechaCreacion));
  } catch {
    return [];
  }
}

export function writeMarketingCampaigns(campaigns: MarketingCampaign[]) {
  window.localStorage.setItem(
    MARKETING_CAMPAIGNS_STORAGE_KEY,
    JSON.stringify(campaigns),
  );
}

export function createMarketingCampaign(input: CampaignInput, session: DemoSession) {
  if (session.role !== "Administrador") {
    return { ok: false as const, message: "Solo Administrador puede crear campanas." };
  }

  const validation = validateInput(input);
  if (validation) return { ok: false as const, message: validation };

  const campaign: MarketingCampaign = {
    ...input,
    id: createId(),
    nombre: normalizeText(input.nombre),
    descripcion: input.descripcion ? normalizeText(input.descripcion) : null,
    fechaCreacion: new Date().toISOString(),
  };
  const campaigns = [campaign, ...readMarketingCampaigns()];
  writeMarketingCampaigns(campaigns);

  return { ok: true as const, campaign, campaigns };
}

export function updateMarketingCampaign(
  campaignId: string,
  input: CampaignInput,
  session: DemoSession,
) {
  if (session.role !== "Administrador") {
    return { ok: false as const, message: "Solo Administrador puede editar campanas." };
  }
  const validation = validateInput(input);
  if (validation) return { ok: false as const, message: validation };

  const campaigns = readMarketingCampaigns();
  const existing = campaigns.find((campaign) => campaign.id === campaignId);
  if (!existing) return { ok: false as const, message: "Campana no encontrada." };

  const campaign: MarketingCampaign = {
    ...existing,
    ...input,
    nombre: normalizeText(input.nombre),
    descripcion: input.descripcion ? normalizeText(input.descripcion) : null,
  };
  const nextCampaigns = campaigns.map((item) =>
    item.id === campaign.id ? campaign : item,
  );
  writeMarketingCampaigns(nextCampaigns);

  return { ok: true as const, campaign, campaigns: nextCampaigns };
}

function validateInput(input: CampaignInput) {
  if (!normalizeText(input.nombre) || normalizeText(input.nombre).length > 120) {
    return "Indica un nombre de campana de hasta 120 caracteres.";
  }
  if (Number.isNaN(new Date(input.fechaInicio).getTime())) {
    return "Indica una fecha de inicio valida.";
  }
  if (input.fechaFin && Number.isNaN(new Date(input.fechaFin).getTime())) {
    return "Indica una fecha de cierre valida.";
  }
  if (
    input.fechaFin &&
    new Date(input.fechaFin).getTime() < new Date(input.fechaInicio).getTime()
  ) {
    return "La fecha de cierre no puede ser anterior al inicio.";
  }
  if (input.presupuestoEstimado !== null && input.presupuestoEstimado < 0) {
    return "El presupuesto estimado no puede ser negativo.";
  }
  return null;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `CMP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `CMP-${Date.now().toString(36).toUpperCase()}`;
}
