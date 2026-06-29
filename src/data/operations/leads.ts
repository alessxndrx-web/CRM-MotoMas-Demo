import { storageKeys } from "@/shared/persistence/storage-keys";

export const PUBLIC_LEADS_STORAGE_KEY = storageKeys.publicLeads;
export const NEW_LEAD_STATUS = "Nuevo Lead";

export const leadStatuses = [
  NEW_LEAD_STATUS,
  "Asignado",
  "Contactado",
  "Interesado",
  "Expediente",
  "Descartado",
] as const;

export const desiredBranches = [
  { id: "plaza-inter", name: "Plaza Inter" },
  { id: "rubenia", name: "Rubenia" },
  { id: "carretera-norte", name: "Carretera Norte" },
  { id: "ciudad-sandino", name: "Ciudad Sandino" },
  { id: "masaya", name: "Masaya" },
  { id: "el-coyotepe", name: "El Coyotepe" },
] as const;

export const leadOriginChannels = [
  "Facebook Ads",
  "Instagram Ads",
  "TikTok",
  "WhatsApp",
  "Referido",
  "Sitio web",
] as const;

export const manualLeadOriginChannels = [
  "Sucursal",
  "WhatsApp directo",
  "Referido",
  "Presencial",
] as const;

export const demoSellers = ["Roberto", "María", "José"] as const;

export type DesiredBranchId = (typeof desiredBranches)[number]["id"];
export type LeadOriginChannel =
  | (typeof leadOriginChannels)[number]
  | (typeof manualLeadOriginChannels)[number];
export type LeadStatus = (typeof leadStatuses)[number];
export type DemoSeller = (typeof demoSellers)[number];

export type PublicLead = {
  id: string;
  nombre: string;
  telefono: string;
  cedula?: string | null;
  correo: string | null;
  motoInteres: string;
  motoSlug: string | null;
  sucursalDeseada: DesiredBranchId;
  sucursalNombre: string;
  canalOrigen: LeadOriginChannel | null;
  estado: LeadStatus;
  fechaCreacion: string;
  vendedorAsignado: DemoSeller | null;
  observacionInicial?: string | null;
  seguimiento?: string | null;
  creadoPorUsuarioId?: string | null;
  creadoPorUsuarioNombre?: string | null;
  clienteId?: string | null;
  expedienteId?: string | null;
  numeroExpediente?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
  metaLeadId?: string | null;
  metaFormId?: string | null;
  metaAdId?: string | null;
  metaCampaignId?: string | null;
};

export const demoLeads: PublicLead[] = [
  {
    id: "DEMO-LEAD-001",
    nombre: "Carlos Ruiz",
    telefono: "8800-1040",
    correo: "carlos@example.com",
    cedula: null,
    motoInteres: "Pulsar NS200 2027",
    motoSlug: "pulsar-ns200-2027",
    sucursalDeseada: "plaza-inter",
    sucursalNombre: "Plaza Inter",
    canalOrigen: "Facebook Ads",
    estado: NEW_LEAD_STATUS,
    fechaCreacion: "2026-06-14T14:00:00.000Z",
    vendedorAsignado: null,
  },
  {
    id: "DEMO-LEAD-002",
    nombre: "Andrea López",
    telefono: "8812-3300",
    correo: null,
    cedula: null,
    motoInteres: "Bajaj Pulsar N250 2026",
    motoSlug: "bajaj-pulsar-n250-2026",
    sucursalDeseada: "rubenia",
    sucursalNombre: "Rubenia",
    canalOrigen: "WhatsApp",
    estado: "Asignado",
    fechaCreacion: "2026-06-14T15:30:00.000Z",
    vendedorAsignado: "María",
  },
  {
    id: "DEMO-LEAD-003",
    nombre: "Marcos Díaz",
    telefono: "8721-4490",
    correo: "marcos@example.com",
    cedula: null,
    motoInteres: "Dominar 250",
    motoSlug: "dominar-250",
    sucursalDeseada: "masaya",
    sucursalNombre: "Masaya",
    canalOrigen: "TikTok",
    estado: "Contactado",
    fechaCreacion: "2026-06-14T16:45:00.000Z",
    vendedorAsignado: "María",
  },
];

export function getDesiredBranch(id: string) {
  return desiredBranches.find((branch) => branch.id === id) ?? null;
}

export function isLeadOriginChannel(value: string): value is LeadOriginChannel {
  return [...leadOriginChannels, ...manualLeadOriginChannels].some(
    (channel) => channel === value,
  );
}

export function isLeadStatus(value: string): value is LeadStatus {
  return leadStatuses.some((status) => status === value);
}

export function isDemoSeller(value: string): value is DemoSeller {
  return demoSellers.some((seller) => seller === normalizeDemoSeller(value));
}

function normalizeDemoSeller(value: string) {
  if (value === "MarÃ­a") return "María";
  if (value === "JosÃ©") return "José";
  return value;
}

export function normalizePublicLead(value: unknown): PublicLead | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<PublicLead>;
  const branch = candidate.sucursalDeseada
    ? getDesiredBranch(candidate.sucursalDeseada)
    : null;
  const seller =
    typeof candidate.vendedorAsignado === "string"
      ? normalizeDemoSeller(candidate.vendedorAsignado)
      : candidate.vendedorAsignado;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.nombre !== "string" ||
    typeof candidate.telefono !== "string" ||
    !(typeof candidate.correo === "string" || candidate.correo === null) ||
    typeof candidate.motoInteres !== "string" ||
    !(typeof candidate.motoSlug === "string" || candidate.motoSlug === null) ||
    !branch ||
    !(candidate.canalOrigen === null ||
      (typeof candidate.canalOrigen === "string" &&
        isLeadOriginChannel(candidate.canalOrigen))) ||
    !(
      typeof candidate.estado === "string" &&
      isLeadStatus(candidate.estado)
    ) ||
    typeof candidate.fechaCreacion !== "string" ||
    !(
      seller === null ||
      (typeof seller === "string" && isDemoSeller(seller))
    )
  ) {
    return null;
  }

  return {
    id: candidate.id,
    nombre: candidate.nombre,
    telefono: candidate.telefono,
    cedula:
      typeof candidate.cedula === "string"
        ? candidate.cedula
        : null,
    correo: candidate.correo,
    motoInteres: candidate.motoInteres,
    motoSlug: candidate.motoSlug,
    sucursalDeseada: branch.id,
    sucursalNombre:
      typeof candidate.sucursalNombre === "string"
        ? candidate.sucursalNombre
        : branch.name,
    canalOrigen: candidate.canalOrigen,
    estado: candidate.estado,
    fechaCreacion: candidate.fechaCreacion,
    vendedorAsignado: seller,
    observacionInicial:
      typeof candidate.observacionInicial === "string"
        ? candidate.observacionInicial
        : null,
    seguimiento:
      typeof candidate.seguimiento === "string" ? candidate.seguimiento : null,
    creadoPorUsuarioId:
      typeof candidate.creadoPorUsuarioId === "string"
        ? candidate.creadoPorUsuarioId
        : null,
    creadoPorUsuarioNombre:
      typeof candidate.creadoPorUsuarioNombre === "string"
        ? candidate.creadoPorUsuarioNombre
        : null,
    clienteId:
      typeof candidate.clienteId === "string" ? candidate.clienteId : null,
    expedienteId:
      typeof candidate.expedienteId === "string" ? candidate.expedienteId : null,
    numeroExpediente:
      typeof candidate.numeroExpediente === "string"
        ? candidate.numeroExpediente
        : null,
    campaignId: nullableString(candidate.campaignId),
    campaignName: nullableString(candidate.campaignName),
    utmSource: nullableString(candidate.utmSource),
    utmMedium: nullableString(candidate.utmMedium),
    utmCampaign: nullableString(candidate.utmCampaign),
    utmContent: nullableString(candidate.utmContent),
    utmTerm: nullableString(candidate.utmTerm),
    metaLeadId: nullableString(candidate.metaLeadId),
    metaFormId: nullableString(candidate.metaFormId),
    metaAdId: nullableString(candidate.metaAdId),
    metaCampaignId: nullableString(candidate.metaCampaignId),
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}
