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

export const activityTypeValues: ActivityTypeValue[] = [
  "NOTA",
  "LLAMADA",
  "WHATSAPP",
  "VISITA",
  "SEGUIMIENTO",
];

export const activityTypeLabels: Record<ActivityTypeValue, string> = {
  NOTA: "Nota",
  LLAMADA: "Llamada",
  WHATSAPP: "WhatsApp",
  VISITA: "Visita",
  SEGUIMIENTO: "Seguimiento",
};

export function isActivityTypeValue(value: string): value is ActivityTypeValue {
  return activityTypeValues.includes(value as ActivityTypeValue);
}

export type ActivityStatusValue = "PENDIENTE" | "COMPLETADA" | "CANCELADA";

export const activityStatusValues: ActivityStatusValue[] = [
  "PENDIENTE",
  "COMPLETADA",
  "CANCELADA",
];

export const activityStatusLabels: Record<ActivityStatusValue, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

export function isActivityStatusValue(
  value: string,
): value is ActivityStatusValue {
  return activityStatusValues.includes(value as ActivityStatusValue);
}

/** Once an activity is completed or cancelled it accepts no further change. */
export const resolvedActivityStatuses: ActivityStatusValue[] = [
  "COMPLETADA",
  "CANCELADA",
];

export type ActivityPriorityValue = "BAJA" | "MEDIA" | "ALTA";

export const activityPriorityValues: ActivityPriorityValue[] = [
  "BAJA",
  "MEDIA",
  "ALTA",
];

export const activityPriorityLabels: Record<ActivityPriorityValue, string> = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
};

export function isActivityPriorityValue(
  value: string,
): value is ActivityPriorityValue {
  return activityPriorityValues.includes(value as ActivityPriorityValue);
}

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

/**
 * An activity as shown in a list that spans several expedientes (Patch 3.3C.1):
 * carries the branch, the responsible user and the related record so the row is
 * readable without a second query. Contains no inventory cost.
 */
export type ActivityListItemDTO = ActivityDTO & {
  branchCode: string | null;
  branchName: string;
  userId: string | null;
  leadId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerFileId: string | null;
  fileNumber: string | null;
};

/** A pending activity whose scheduled date has already passed. */
export function isActivityOverdue(
  activity: Pick<ActivityDTO, "status" | "scheduledAt">,
  now: Date,
): boolean {
  if (activity.status !== "PENDIENTE" || !activity.scheduledAt) return false;
  return new Date(activity.scheduledAt).getTime() < now.getTime();
}

export type ActivitySummaryDTO = {
  pendientes: number;
  vencidas: number;
  /** Pending activities scheduled from now on. */
  proximas: number;
  completadas: number;
};

/**
 * Counters for the activities header. Pure so the server can compute them once
 * with a single `now` — a client-side `Date.now()` would make the "vencidas"
 * count differ between render passes.
 */
export function buildActivitySummary(
  activities: Pick<ActivityDTO, "status" | "scheduledAt">[],
  now: Date,
): ActivitySummaryDTO {
  let pendientes = 0;
  let vencidas = 0;
  let proximas = 0;
  let completadas = 0;

  for (const activity of activities) {
    if (activity.status === "COMPLETADA") completadas += 1;
    if (activity.status !== "PENDIENTE") continue;
    pendientes += 1;
    if (!activity.scheduledAt) continue;
    if (isActivityOverdue(activity, now)) vencidas += 1;
    else proximas += 1;
  }

  return { pendientes, vencidas, proximas, completadas };
}

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
