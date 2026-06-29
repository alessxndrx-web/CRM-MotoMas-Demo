import {
  desiredBranches,
  getDesiredBranch,
  type DesiredBranchId,
} from "@/data/operations/leads";
import type { OperationRole } from "@/features/operations/types";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const TRANSFER_ORDERS_STORAGE_KEY = storageKeys.transferOrders;

export const TRANSFER_PENDING_STATUS = "Pendiente";
export const TRANSFER_APPROVED_STATUS = "Aprobado";
export const TRANSFER_IN_TRANSIT_STATUS = "En tr\u00e1nsito";
export const TRANSFER_RECEIVED_STATUS = "Recibido";
export const TRANSFER_CANCELLED_STATUS = "Cancelado";

export const transferOrderStatuses = [
  TRANSFER_PENDING_STATUS,
  TRANSFER_APPROVED_STATUS,
  TRANSFER_IN_TRANSIT_STATUS,
  TRANSFER_RECEIVED_STATUS,
  TRANSFER_CANCELLED_STATUS,
] as const;

export type TransferOrderStatus = (typeof transferOrderStatuses)[number];

export type TransferStatusHistoryEntry = {
  id: string;
  fecha: string;
  estado: TransferOrderStatus;
  usuarioId: string;
  usuarioNombre: string;
  rol: OperationRole;
  notas: string;
};

export type TransferOrder = {
  id: string;
  numeroTraslado: string;
  unidadId: string;
  modeloSlug: string;
  modelo: string;
  vin: string;
  sucursalOrigenId: DesiredBranchId;
  sucursalOrigenNombre: string;
  sucursalDestinoId: DesiredBranchId;
  sucursalDestinoNombre: string;
  solicitanteId: string;
  solicitanteNombre: string;
  solicitanteRol: OperationRole;
  motivo: string;
  estado: TransferOrderStatus;
  fechaSolicitud: string;
  fechaAprobacion: string | null;
  fechaDespacho: string | null;
  fechaRecepcion: string | null;
  fechaCancelacion: string | null;
  aprobadoPorId: string | null;
  aprobadoPorNombre: string | null;
  despachadoPorId: string | null;
  despachadoPorNombre: string | null;
  recibidoPorId: string | null;
  recibidoPorNombre: string | null;
  canceladoPorId: string | null;
  canceladoPorNombre: string | null;
  historial: TransferStatusHistoryEntry[];
};

export function isTransferOrderStatus(
  value: string,
): value is TransferOrderStatus {
  return transferOrderStatuses.some((status) => status === value);
}

export function isActiveTransferStatus(status: TransferOrderStatus) {
  return (
    status === TRANSFER_PENDING_STATUS ||
    status === TRANSFER_APPROVED_STATUS ||
    status === TRANSFER_IN_TRANSIT_STATUS
  );
}

export function isActiveTransferOrder(order: TransferOrder) {
  return isActiveTransferStatus(order.estado);
}

export function getTransferBranch(id: string) {
  return getDesiredBranch(id);
}

export function getTransferBranchName(id: DesiredBranchId) {
  return (
    desiredBranches.find((branch) => branch.id === id)?.name ??
    "Sucursal no encontrada"
  );
}

export function normalizeTransferOrder(value: unknown): TransferOrder | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<TransferOrder>;
  const origin = candidate.sucursalOrigenId
    ? getTransferBranch(candidate.sucursalOrigenId)
    : null;
  const destination = candidate.sucursalDestinoId
    ? getTransferBranch(candidate.sucursalDestinoId)
    : null;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.numeroTraslado !== "string" ||
    typeof candidate.unidadId !== "string" ||
    typeof candidate.modeloSlug !== "string" ||
    typeof candidate.modelo !== "string" ||
    typeof candidate.vin !== "string" ||
    !origin ||
    !destination ||
    typeof candidate.solicitanteId !== "string" ||
    typeof candidate.solicitanteNombre !== "string" ||
    !isOperationRole(candidate.solicitanteRol) ||
    typeof candidate.motivo !== "string" ||
    !(
      typeof candidate.estado === "string" &&
      isTransferOrderStatus(candidate.estado)
    ) ||
    typeof candidate.fechaSolicitud !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    numeroTraslado: candidate.numeroTraslado,
    unidadId: candidate.unidadId,
    modeloSlug: candidate.modeloSlug,
    modelo: candidate.modelo,
    vin: candidate.vin,
    sucursalOrigenId: origin.id,
    sucursalOrigenNombre:
      typeof candidate.sucursalOrigenNombre === "string"
        ? candidate.sucursalOrigenNombre
        : origin.name,
    sucursalDestinoId: destination.id,
    sucursalDestinoNombre:
      typeof candidate.sucursalDestinoNombre === "string"
        ? candidate.sucursalDestinoNombre
        : destination.name,
    solicitanteId: candidate.solicitanteId,
    solicitanteNombre: candidate.solicitanteNombre,
    solicitanteRol: candidate.solicitanteRol,
    motivo: candidate.motivo,
    estado: candidate.estado,
    fechaSolicitud: candidate.fechaSolicitud,
    fechaAprobacion: nullableString(candidate.fechaAprobacion),
    fechaDespacho: nullableString(candidate.fechaDespacho),
    fechaRecepcion: nullableString(candidate.fechaRecepcion),
    fechaCancelacion: nullableString(candidate.fechaCancelacion),
    aprobadoPorId: nullableString(candidate.aprobadoPorId),
    aprobadoPorNombre: nullableString(candidate.aprobadoPorNombre),
    despachadoPorId: nullableString(candidate.despachadoPorId),
    despachadoPorNombre: nullableString(candidate.despachadoPorNombre),
    recibidoPorId: nullableString(candidate.recibidoPorId),
    recibidoPorNombre: nullableString(candidate.recibidoPorNombre),
    canceladoPorId: nullableString(candidate.canceladoPorId),
    canceladoPorNombre: nullableString(candidate.canceladoPorNombre),
    historial: Array.isArray(candidate.historial)
      ? candidate.historial
          .map((entry) => normalizeTransferHistoryEntry(entry))
          .filter(
            (entry): entry is TransferStatusHistoryEntry => Boolean(entry),
          )
      : [],
  };
}

function normalizeTransferHistoryEntry(
  value: unknown,
): TransferStatusHistoryEntry | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<TransferStatusHistoryEntry>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fecha !== "string" ||
    !(
      typeof candidate.estado === "string" &&
      isTransferOrderStatus(candidate.estado)
    ) ||
    typeof candidate.usuarioId !== "string" ||
    typeof candidate.usuarioNombre !== "string" ||
    !isOperationRole(candidate.rol) ||
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
    rol: candidate.rol,
    notas: candidate.notas,
  };
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function isOperationRole(value: unknown): value is OperationRole {
  return (
    value === "Vendedor" ||
    value === "Gerente" ||
    value === "Administrador"
  );
}
