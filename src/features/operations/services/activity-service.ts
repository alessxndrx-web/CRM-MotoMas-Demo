"use client";

import {
  ACTIVITIES_STORAGE_KEY,
  isActivityPriority,
  isActivityType,
  normalizeActivity,
  type ActivityPriority,
  type ActivityRecord,
  type ActivityStatus,
  type ActivityType,
} from "@/data/operations/activities";
import type { DesiredBranchId } from "@/data/operations/leads";
import type { DemoSession } from "@/features/operations/types";

export const ACTIVITIES_CHANGE_EVENT = "motomas-activities-change";

export type CreateActivityInput = {
  tipo: ActivityType;
  prioridad: ActivityPriority;
  titulo: string;
  descripcion: string;
  fechaProgramada: string | null;
  leadId?: string | null;
  customerId?: string | null;
  expedienteId?: string | null;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
};

export function readActivities() {
  try {
    const raw = window.localStorage.getItem(ACTIVITIES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((activity) => normalizeActivity(activity))
      .filter((activity): activity is ActivityRecord => Boolean(activity))
      .sort(sortActivities);
  } catch {
    return [];
  }
}

export function writeActivities(activities: ActivityRecord[]) {
  window.localStorage.setItem(
    ACTIVITIES_STORAGE_KEY,
    JSON.stringify([...activities].sort(sortActivities)),
  );
  window.dispatchEvent(new Event(ACTIVITIES_CHANGE_EVENT));
}

export function subscribeToActivities(callback: () => void) {
  window.addEventListener(ACTIVITIES_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(ACTIVITIES_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function createActivity(
  input: CreateActivityInput,
  session: DemoSession,
) {
  const title = normalizeText(input.titulo);
  const scheduledAt = input.fechaProgramada ? new Date(input.fechaProgramada) : null;

  if (session.role === "Administrador" || session.branchId === "all") {
    return activityError("Tu rol no puede crear actividades operativas.");
  }
  if (!title || title.length > 120) {
    return activityError("Indica un titulo de hasta 120 caracteres.");
  }
  if (!isActivityType(input.tipo) || !isActivityPriority(input.prioridad)) {
    return activityError("Selecciona tipo y prioridad validos.");
  }
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    return activityError("Indica una fecha programada valida.");
  }
  if (!input.leadId && !input.customerId && !input.expedienteId) {
    return activityError("Vincula la actividad a un lead, cliente o expediente.");
  }
  if (input.sucursalId !== session.branchId) {
    return activityError("La actividad debe pertenecer a tu sucursal.");
  }

  const now = new Date().toISOString();
  const activity: ActivityRecord = {
    id: createId("ACT"),
    tipo: input.tipo,
    estado: "Pendiente",
    prioridad: input.prioridad,
    titulo: title,
    descripcion: normalizeText(input.descripcion) || null,
    fechaProgramada: scheduledAt?.toISOString() ?? null,
    fechaCompletada: null,
    leadId: input.leadId ?? null,
    customerId: input.customerId ?? null,
    expedienteId: input.expedienteId ?? null,
    sucursalId: input.sucursalId,
    sucursalNombre: input.sucursalNombre,
    vendedorId: session.userId,
    vendedorNombre: session.userName,
    creadoPor: session.userName,
    fechaCreacion: now,
    resultado: null,
  };
  const activities = [activity, ...readActivities()];

  writeActivities(activities);
  return { ok: true as const, activity, activities };
}

export function completeActivity(
  activityId: string,
  result: string,
  session: DemoSession,
) {
  return changeActivityStatus(activityId, "Completada", result, session);
}

export function cancelActivity(
  activityId: string,
  session: DemoSession,
) {
  return changeActivityStatus(activityId, "Cancelada", "", session);
}

export function filterActivitiesForRelationship(
  activities: ActivityRecord[],
  relation: {
    leadIds?: string[];
    customerId?: string | null;
    expedienteId?: string | null;
  },
) {
  const leadIds = new Set(relation.leadIds ?? []);

  return activities.filter(
    (activity) =>
      (activity.leadId ? leadIds.has(activity.leadId) : false) ||
      (relation.customerId && activity.customerId === relation.customerId) ||
      (relation.expedienteId && activity.expedienteId === relation.expedienteId),
  );
}

export function getActivitiesByLead(activities: ActivityRecord[], leadId: string) {
  return activities.filter((activity) => activity.leadId === leadId);
}

export function getActivitiesByCustomer(
  activities: ActivityRecord[],
  customerId: string,
) {
  return activities.filter((activity) => activity.customerId === customerId);
}

export function getActivitiesByExpediente(
  activities: ActivityRecord[],
  expedienteId: string,
) {
  return activities.filter((activity) => activity.expedienteId === expedienteId);
}

export function getNextPendingActivity(activities: ActivityRecord[]) {
  return activities
    .filter(
      (activity) =>
        activity.estado === "Pendiente" && Boolean(activity.fechaProgramada),
    )
    .sort(sortActivities)[0] ?? null;
}

export function getLastCompletedActivity(activities: ActivityRecord[]) {
  return activities
    .filter((activity) => activity.estado === "Completada")
    .sort(
      (left, right) =>
        new Date(right.fechaCompletada ?? right.fechaCreacion).getTime() -
        new Date(left.fechaCompletada ?? left.fechaCreacion).getTime(),
    )[0] ?? null;
}

export function isActivityOverdue(activity: ActivityRecord, now = new Date()) {
  if (activity.estado !== "Pendiente") return false;
  if (!activity.fechaProgramada) return false;

  const scheduledAt = new Date(activity.fechaProgramada);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return !Number.isNaN(scheduledAt.getTime()) && scheduledAt < todayStart;
}

export function isActivityScheduledToday(activity: ActivityRecord, now = new Date()) {
  if (activity.estado !== "Pendiente") return false;
  if (!activity.fechaProgramada) return false;

  const scheduledAt = new Date(activity.fechaProgramada);

  return (
    !Number.isNaN(scheduledAt.getTime()) &&
    scheduledAt.getFullYear() === now.getFullYear() &&
    scheduledAt.getMonth() === now.getMonth() &&
    scheduledAt.getDate() === now.getDate()
  );
}

function changeActivityStatus(
  activityId: string,
  status: Extract<ActivityStatus, "Completada" | "Cancelada">,
  result: string,
  session: DemoSession,
) {
  const activities = readActivities();
  const activity = activities.find((item) => item.id === activityId);

  if (!activity) return activityError("Actividad no encontrada.");
  if (!canManageActivity(activity, session)) {
    return activityError("Tu rol no puede actualizar esta actividad.");
  }
  if (activity.estado !== "Pendiente") {
    return activityError("Solo se pueden actualizar actividades pendientes.");
  }

  const now = new Date().toISOString();
  const nextActivity: ActivityRecord = {
    ...activity,
    estado: status,
    fechaCompletada: status === "Completada" ? now : null,
    resultado: status === "Completada" ? normalizeText(result) || null : null,
  };
  const nextActivities = activities.map((item) =>
    item.id === activityId ? nextActivity : item,
  );

  writeActivities(nextActivities);
  return { ok: true as const, activity: nextActivity, activities: nextActivities };
}

function canManageActivity(activity: ActivityRecord, session: DemoSession) {
  if (session.role === "Administrador") return false;
  if (session.role === "Gerente") return activity.sucursalId === session.branchId;

  return activity.vendedorId === session.userId;
}

function activityError(message: string) {
  return { ok: false as const, message };
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function sortActivities(left: ActivityRecord, right: ActivityRecord) {
  return (left.fechaProgramada ? new Date(left.fechaProgramada).getTime() : Number.MAX_SAFE_INTEGER) - (right.fechaProgramada ? new Date(right.fechaProgramada).getTime() : Number.MAX_SAFE_INTEGER);
}
