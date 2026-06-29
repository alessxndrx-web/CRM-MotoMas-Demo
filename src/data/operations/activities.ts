import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const ACTIVITIES_STORAGE_KEY = storageKeys.activities;

export const activityTypes = [
  "Llamada",
  "WhatsApp",
  "Visita",
  "Nota",
  "Seguimiento",
  "Cita",
  "Otro",
] as const;

export const activityStatuses = [
  "Pendiente",
  "Completada",
  "Cancelada",
] as const;

export const activityPriorities = ["Baja", "Media", "Alta"] as const;

export type ActivityType = (typeof activityTypes)[number];
export type ActivityStatus = (typeof activityStatuses)[number];
export type ActivityPriority = (typeof activityPriorities)[number];

export type ActivityRecord = {
  id: string;
  tipo: ActivityType;
  estado: ActivityStatus;
  prioridad: ActivityPriority;
  titulo: string;
  descripcion: string | null;
  fechaProgramada: string | null;
  fechaCompletada: string | null;
  leadId: string | null;
  customerId: string | null;
  expedienteId: string | null;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  vendedorId: string;
  vendedorNombre: string;
  creadoPor: string;
  fechaCreacion: string;
  resultado: string | null;
};

export function isActivityType(value: string): value is ActivityType {
  return activityTypes.some((type) => type === value);
}

export function isActivityStatus(value: string): value is ActivityStatus {
  return activityStatuses.some((status) => status === value);
}

export function isActivityPriority(value: string): value is ActivityPriority {
  return activityPriorities.some((priority) => priority === value);
}

export function normalizeActivity(value: unknown): ActivityRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ActivityRecord>;

  if (
    typeof candidate.id !== "string" ||
    !(typeof candidate.tipo === "string" && isActivityType(candidate.tipo)) ||
    !(
      typeof candidate.estado === "string" &&
      isActivityStatus(candidate.estado)
    ) ||
    !(
      typeof candidate.prioridad === "string" &&
      isActivityPriority(candidate.prioridad)
    ) ||
    typeof candidate.titulo !== "string" ||
    !(typeof candidate.descripcion === "string" || candidate.descripcion === null) ||
    !(typeof candidate.fechaProgramada === "string" || candidate.fechaProgramada === null) ||
    !(
      typeof candidate.fechaCompletada === "string" ||
      candidate.fechaCompletada === null
    ) ||
    !(typeof candidate.leadId === "string" || candidate.leadId === null) ||
    !(typeof candidate.customerId === "string" || candidate.customerId === null) ||
    !(typeof candidate.expedienteId === "string" || candidate.expedienteId === null) ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string" ||
    typeof candidate.vendedorId !== "string" ||
    typeof candidate.vendedorNombre !== "string" ||
    typeof candidate.creadoPor !== "string" ||
    typeof candidate.fechaCreacion !== "string" ||
    !(typeof candidate.resultado === "string" || candidate.resultado === null)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    tipo: candidate.tipo,
    estado: candidate.estado,
    prioridad: candidate.prioridad,
    titulo: candidate.titulo,
    descripcion: candidate.descripcion,
    fechaProgramada: candidate.fechaProgramada,
    fechaCompletada: candidate.fechaCompletada,
    leadId: candidate.leadId,
    customerId: candidate.customerId,
    expedienteId: candidate.expedienteId,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
    vendedorId: candidate.vendedorId,
    vendedorNombre: candidate.vendedorNombre,
    creadoPor: candidate.creadoPor,
    fechaCreacion: candidate.fechaCreacion,
    resultado: candidate.resultado,
  };
}
