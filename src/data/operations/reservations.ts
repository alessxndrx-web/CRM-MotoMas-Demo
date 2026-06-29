import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const RESERVATIONS_STORAGE_KEY = storageKeys.reservations;

export const RESERVATION_ACTIVE_STATUS = "Activa";
export const RESERVATION_CANCELLED_STATUS = "Cancelada";
export const RESERVATION_COMPLETED_STATUS = "Completada";

export const reservationStatuses = [
  RESERVATION_ACTIVE_STATUS,
  RESERVATION_CANCELLED_STATUS,
  RESERVATION_COMPLETED_STATUS,
] as const;

export type ReservationStatus = (typeof reservationStatuses)[number];

export type ReservationHistoryEntry = {
  id: string;
  fecha: string;
  estado: ReservationStatus;
  usuarioId: string;
  usuarioNombre: string;
  notas: string;
};

export type ReservationRecord = {
  id: string;
  numeroReserva: string;
  clienteId: string | null;
  clienteNombre: string;
  expedienteId: string | null;
  numeroExpediente: string | null;
  unidadId: string;
  modeloSlug: string;
  modelo: string;
  vin: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  vendedorId: string;
  vendedorNombre: string;
  fechaReserva: string;
  fechaCancelacion: string | null;
  fechaCompletada: string | null;
  estado: ReservationStatus;
  observacion: string | null;
  historial: ReservationHistoryEntry[];
};

export function isReservationStatus(value: string): value is ReservationStatus {
  return reservationStatuses.some((status) => status === value);
}

export function isActiveReservation(reservation: ReservationRecord) {
  return reservation.estado === RESERVATION_ACTIVE_STATUS;
}

export function normalizeReservation(value: unknown): ReservationRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ReservationRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.numeroReserva !== "string" ||
    !(typeof candidate.clienteId === "string" || candidate.clienteId === null) ||
    typeof candidate.clienteNombre !== "string" ||
    !(
      typeof candidate.expedienteId === "string" ||
      candidate.expedienteId === null
    ) ||
    !(
      typeof candidate.numeroExpediente === "string" ||
      candidate.numeroExpediente === null
    ) ||
    typeof candidate.unidadId !== "string" ||
    typeof candidate.modeloSlug !== "string" ||
    typeof candidate.modelo !== "string" ||
    typeof candidate.vin !== "string" ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string" ||
    typeof candidate.vendedorId !== "string" ||
    typeof candidate.vendedorNombre !== "string" ||
    typeof candidate.fechaReserva !== "string" ||
    !(
      typeof candidate.fechaCancelacion === "string" ||
      candidate.fechaCancelacion === null
    ) ||
    !(
      typeof candidate.fechaCompletada === "string" ||
      candidate.fechaCompletada === null
    ) ||
    !(
      typeof candidate.estado === "string" &&
      isReservationStatus(candidate.estado)
    ) ||
    !(typeof candidate.observacion === "string" || candidate.observacion === null)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    numeroReserva: candidate.numeroReserva,
    clienteId: candidate.clienteId,
    clienteNombre: candidate.clienteNombre,
    expedienteId: candidate.expedienteId,
    numeroExpediente: candidate.numeroExpediente,
    unidadId: candidate.unidadId,
    modeloSlug: candidate.modeloSlug,
    modelo: candidate.modelo,
    vin: candidate.vin,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
    vendedorId: candidate.vendedorId,
    vendedorNombre: candidate.vendedorNombre,
    fechaReserva: candidate.fechaReserva,
    fechaCancelacion: candidate.fechaCancelacion,
    fechaCompletada: candidate.fechaCompletada,
    estado: candidate.estado,
    observacion: candidate.observacion,
    historial: Array.isArray(candidate.historial)
      ? candidate.historial
          .map((entry) => normalizeReservationHistoryEntry(entry))
          .filter(
            (entry): entry is ReservationHistoryEntry => Boolean(entry),
          )
      : [],
  };
}

function normalizeReservationHistoryEntry(
  value: unknown,
): ReservationHistoryEntry | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<ReservationHistoryEntry>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fecha !== "string" ||
    !(
      typeof candidate.estado === "string" &&
      isReservationStatus(candidate.estado)
    ) ||
    typeof candidate.usuarioId !== "string" ||
    typeof candidate.usuarioNombre !== "string" ||
    typeof candidate.notas !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    fecha: candidate.fecha,
    estado: candidate.estado,
    usuarioId: candidate.usuarioId,
    usuarioNombre: candidate.usuarioNombre,
    notas: candidate.notas,
  };
}
