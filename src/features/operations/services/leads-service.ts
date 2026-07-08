"use client";

import {
  demoLeads,
  getDesiredBranch,
  normalizePublicLead,
  PUBLIC_LEADS_STORAGE_KEY,
  type DesiredBranchId,
  type DemoSeller,
  type LeadOriginChannel,
  type PublicLead,
} from "@/data/operations/leads";
import type { DemoSession } from "@/features/operations/types";
import { isDemoDataEnabled } from "@/shared/lib/demo-mode";

const MIN_VISIBLE_LEADS = 3;

export type ManualLeadInput = {
  nombre: string;
  telefono: string;
  correo: string | null;
  motoInteres: string;
  motoSlug: string | null;
  canalOrigen: LeadOriginChannel;
  observacionInicial: string;
};

function readStoredLeads() {
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

function withDemoLeads(leads: PublicLead[]) {
  if (leads.length >= MIN_VISIBLE_LEADS) return leads;

  const usedIds = new Set(leads.map((lead) => lead.id));
  const missingDemoLeads = demoLeads.filter((lead) => !usedIds.has(lead.id));

  return [...leads, ...missingDemoLeads].slice(
    0,
    Math.max(MIN_VISIBLE_LEADS, leads.length),
  );
}

export function readLeadInboxLeads() {
  const leads = readStoredLeads();
  return isDemoDataEnabled() ? withDemoLeads(leads) : leads;
}

export function writeLeadInboxLeads(leads: PublicLead[]) {
  window.localStorage.setItem(PUBLIC_LEADS_STORAGE_KEY, JSON.stringify(leads));
}

export function createManualLead(
  input: ManualLeadInput,
  session: DemoSession & { branchId: DesiredBranchId; role: "Vendedor" },
) {
  const branch = getDesiredBranch(session.branchId);

  if (!branch) {
    throw new Error("Sucursal no valida.");
  }

  const lead: PublicLead = {
    id: generateManualLeadId(),
    nombre: input.nombre.trim(),
    telefono: input.telefono.trim(),
    correo: input.correo?.trim() ? input.correo.trim() : null,
    motoInteres: input.motoInteres,
    motoSlug: input.motoSlug,
    sucursalDeseada: branch.id,
    sucursalNombre: branch.name,
    canalOrigen: input.canalOrigen,
    estado: "Asignado",
    fechaCreacion: new Date().toISOString(),
    vendedorAsignado: session.userName as DemoSeller,
    observacionInicial: input.observacionInicial.trim() || null,
    seguimiento: null,
    creadoPorUsuarioId: session.userId,
    creadoPorUsuarioNombre: session.userName,
  };

  return lead;
}

function generateManualLeadId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `MAN-${date}-${suffix.toUpperCase()}`;
}
