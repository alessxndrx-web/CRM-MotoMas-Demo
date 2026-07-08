"use client";

import {
  getDesiredBranch,
  NEW_LEAD_STATUS,
  normalizePublicLead,
  PUBLIC_LEADS_STORAGE_KEY,
  type DesiredBranchId,
  type LeadOriginChannel,
  type PublicLead,
} from "@/data/operations/leads";

type CreatePublicLeadInput = {
  nombre: string;
  telefono: string;
  cedula: string;
  correo: string | null;
  motoInteres: string;
  motoSlug: string | null;
  sucursalDeseada: DesiredBranchId;
  canalOrigen: LeadOriginChannel | null;
  campaignId?: string | null;
  campaignName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  /**
   * Use a caller-provided tracking code (e.g. one already created in the
   * database) instead of generating a local-only id, so the same code is
   * searchable from both the database and this localStorage fallback record.
   */
  idOverride?: string | null;
};

function generateLeadId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `SOL-${date}-${suffix.toUpperCase()}`;
}

export function readPublicLeads() {
  try {
    const raw = window.localStorage.getItem(PUBLIC_LEADS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((lead) => normalizePublicLead(lead))
      .filter((lead): lead is PublicLead => Boolean(lead));
  } catch {
    return [];
  }
}

export function savePublicLead(input: CreatePublicLeadInput) {
  const branch = getDesiredBranch(input.sucursalDeseada);

  if (!branch) {
    throw new Error("Sucursal no valida.");
  }

  const lead: PublicLead = {
    id: input.idOverride?.trim() || generateLeadId(),
    nombre: sanitizeText(input.nombre),
    telefono: input.telefono.replace(/\D/g, "").slice(0, 8),
    cedula: sanitizeCedula(input.cedula),
    correo: input.correo?.trim() ? input.correo.trim().toLowerCase() : null,
    motoInteres: input.motoInteres,
    motoSlug: input.motoSlug,
    sucursalDeseada: branch.id,
    sucursalNombre: branch.name,
    canalOrigen: input.canalOrigen,
    estado: NEW_LEAD_STATUS,
    fechaCreacion: new Date().toISOString(),
    vendedorAsignado: null,
    campaignId: sanitizeOptionalText(input.campaignId),
    campaignName: sanitizeOptionalText(input.campaignName),
    utmSource: sanitizeOptionalText(input.utmSource),
    utmMedium: sanitizeOptionalText(input.utmMedium),
    utmCampaign: sanitizeOptionalText(input.utmCampaign),
    utmContent: sanitizeOptionalText(input.utmContent),
    utmTerm: sanitizeOptionalText(input.utmTerm),
    metaLeadId: null,
    metaFormId: null,
    metaAdId: null,
    metaCampaignId: null,
  };

  const leads = readPublicLeads();
  window.localStorage.setItem(
    PUBLIC_LEADS_STORAGE_KEY,
    JSON.stringify([lead, ...leads]),
  );

  return lead;
}

function sanitizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizeCedula(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function sanitizeOptionalText(value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized ? normalized.slice(0, 160) : null;
}
