/**
 * Pure, client-safe CRM types, enum value unions, label maps and normalization
 * helpers. No database import here so client components can reuse the DTO shapes
 * and status catalogs. Enforcement lives in queries.ts / actions.ts.
 *
 * These mirror the Prisma enums added in Patch 3.1A (Customer / Lead /
 * CustomerFile / Activity).
 */

export type LeadStatusValue =
  | "NUEVO_LEAD"
  | "ASIGNADO"
  | "CONTACTADO"
  | "INTERESADO"
  | "EXPEDIENTE"
  | "DESCARTADO";

export const leadStatusValues: LeadStatusValue[] = [
  "NUEVO_LEAD",
  "ASIGNADO",
  "CONTACTADO",
  "INTERESADO",
  "EXPEDIENTE",
  "DESCARTADO",
];

export const leadStatusLabels: Record<LeadStatusValue, string> = {
  NUEVO_LEAD: "Nuevo lead",
  ASIGNADO: "Asignado",
  CONTACTADO: "Contactado",
  INTERESADO: "Interesado",
  EXPEDIENTE: "Expediente",
  DESCARTADO: "Descartado",
};

export function isLeadStatusValue(value: string): value is LeadStatusValue {
  return leadStatusValues.includes(value as LeadStatusValue);
}

export type CustomerFileStatusValue =
  | "ABIERTO"
  | "EN_PROCESO"
  | "COMPLETADO"
  | "CANCELADO";

export const customerFileStatusValues: CustomerFileStatusValue[] = [
  "ABIERTO",
  "EN_PROCESO",
  "COMPLETADO",
  "CANCELADO",
];

export const customerFileStatusLabels: Record<CustomerFileStatusValue, string> = {
  ABIERTO: "Abierto",
  EN_PROCESO: "En proceso",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export type ActivityTypeValue =
  | "NOTA"
  | "LLAMADA"
  | "WHATSAPP"
  | "VISITA"
  | "SEGUIMIENTO";

export const activityTypeLabels: Record<ActivityTypeValue, string> = {
  NOTA: "Nota",
  LLAMADA: "Llamada",
  WHATSAPP: "WhatsApp",
  VISITA: "Visita",
  SEGUIMIENTO: "Seguimiento",
};

export type ActivityStatusValue = "PENDIENTE" | "COMPLETADA" | "CANCELADA";

export const activityStatusLabels: Record<ActivityStatusValue, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

export type ActivityPriorityValue = "BAJA" | "MEDIA" | "ALTA";

export const activityPriorityLabels: Record<ActivityPriorityValue, string> = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
};

export type LeadDTO = {
  id: string;
  trackingCode: string;
  name: string;
  phone: string;
  cedula: string | null;
  email: string | null;
  motorcycleInterest: string | null;
  motorcycleSlug: string | null;
  branchCode: string | null;
  branchName: string;
  originChannel: string | null;
  status: LeadStatusValue;
  statusLabel: string;
  assignedSellerId: string | null;
  assignedSellerName: string | null;
  createdById: string | null;
  createdByName: string | null;
  customerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  name: string;
  phone: string;
  cedula: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFileDTO = {
  id: string;
  fileNumber: string;
  customerId: string;
  customerName: string;
  leadId: string | null;
  branchCode: string | null;
  branchName: string;
  sellerId: string | null;
  sellerName: string | null;
  motorcycleInterest: string | null;
  status: CustomerFileStatusValue;
  statusLabel: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityDTO = {
  id: string;
  type: ActivityTypeValue;
  typeLabel: string;
  status: ActivityStatusValue;
  statusLabel: string;
  priority: ActivityPriorityValue;
  priorityLabel: string;
  description: string | null;
  result: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  userName: string | null;
  createdAt: string;
};

export type CustomerFileDetailDTO = CustomerFileDTO & {
  customer: CustomerDTO;
  lead: LeadDTO | null;
  activities: ActivityDTO[];
};

/** Digits-only phone, used for storage and duplicate matching. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** Uppercased alphanumeric cedula (accepts formats with or without hyphens). */
export function normalizeCedula(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/** Collapse whitespace and trim a free-text value. */
export function sanitizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
