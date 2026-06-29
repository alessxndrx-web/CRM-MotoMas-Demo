"use client";

import {
  RESERVATIONS_STORAGE_KEY,
  RESERVATION_ACTIVE_STATUS,
  RESERVATION_CANCELLED_STATUS,
  isActiveReservation,
  normalizeReservation,
  type ReservationHistoryEntry,
  type ReservationRecord,
  type ReservationStatus,
} from "@/data/operations/reservations";
import type {
  CustomerFileRecord,
  CustomerRecord,
} from "@/data/operations/customer-files";
import type {
  InventoryMovement,
  InventoryUnit,
  InventoryUnitStatus,
} from "@/data/operations/inventory";
import {
  readCustomerFiles,
  readCustomers,
} from "@/features/operations/services/customer-files-service";
import {
  readInventoryUnits,
  writeInventoryUnits,
} from "@/features/operations/services/inventory-service";
import {
  hasActiveTransferForUnit,
  readTransferOrders,
} from "@/features/operations/services/transfer-service";
import type { DemoSession } from "@/features/operations/types";

const INVENTORY_AVAILABLE_STATUS = "Disponible" as InventoryUnitStatus;
const INVENTORY_RESERVED_STATUS = "Reservada" as InventoryUnitStatus;

type CreateReservationInput = {
  unitId: string;
  customerFileId: string | null;
  clienteNombre: string;
  observacion: string;
};

type ReservationMutationResult = {
  ok: boolean;
  message: string;
  reservations: ReservationRecord[];
  units: InventoryUnit[];
  reservation: ReservationRecord | null;
};

export function readReservations() {
  try {
    const raw = window.localStorage.getItem(RESERVATIONS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return resetReservations();

    return parsed
      .map((reservation) => normalizeReservation(reservation))
      .filter(
        (reservation): reservation is ReservationRecord =>
          Boolean(reservation),
      )
      .sort(sortByReservationDateDesc);
  } catch {
    return resetReservations();
  }
}

export function writeReservations(reservations: ReservationRecord[]) {
  window.localStorage.setItem(
    RESERVATIONS_STORAGE_KEY,
    JSON.stringify(reservations),
  );
}

export function resetReservations() {
  writeReservations([]);
  return [];
}

export function hasActiveReservationForUnit(
  reservations: ReservationRecord[],
  unitId: string,
) {
  return reservations.some(
    (reservation) =>
      reservation.unidadId === unitId && isActiveReservation(reservation),
  );
}

export function createReservation(
  input: CreateReservationInput,
  session: DemoSession,
): ReservationMutationResult {
  const units = readInventoryUnits();
  const reservations = readReservations();
  const transferOrders = readTransferOrders();
  const customers = readCustomers();
  const files = readCustomerFiles();
  const unit = units.find((item) => item.id === input.unitId);
  const now = new Date().toISOString();

  if (session.role !== "Vendedor" || session.branchId === "all") {
    return mutationError(
      "Solo el Vendedor puede crear reservas en esta fase.",
      reservations,
      units,
    );
  }

  if (!unit) {
    return mutationError("Selecciona una unidad disponible.", reservations, units);
  }

  if (unit.estado !== INVENTORY_AVAILABLE_STATUS) {
    return mutationError(
      "Solo se pueden reservar unidades disponibles.",
      reservations,
      units,
    );
  }

  if (unit.sucursalActualId !== session.branchId) {
    return mutationError(
      "La unidad debe estar en tu sucursal para crear la reserva.",
      reservations,
      units,
    );
  }

  if (hasActiveReservationForUnit(reservations, unit.id)) {
    return mutationError(
      "La unidad ya tiene una reserva activa.",
      reservations,
      units,
    );
  }

  if (hasActiveTransferForUnit(transferOrders, unit.id)) {
    return mutationError(
      "La unidad tiene un traslado activo y no puede reservarse.",
      reservations,
      units,
    );
  }

  const target = resolveReservationTarget(
    input.customerFileId,
    input.clienteNombre,
    files,
    customers,
  );

  if (!target) {
    return mutationError(
      "Selecciona un expediente o indica el cliente para la reserva.",
      reservations,
      units,
    );
  }

  const reservationId = createId("RSV");
  const reservation: ReservationRecord = {
    id: reservationId,
    numeroReserva: createReservationNumber(reservations.length + 1),
    clienteId: target.clienteId,
    clienteNombre: target.clienteNombre,
    expedienteId: target.expedienteId,
    numeroExpediente: target.numeroExpediente,
    unidadId: unit.id,
    modeloSlug: unit.modeloSlug,
    modelo: unit.modelo,
    vin: unit.vin,
    sucursalId: unit.sucursalActualId,
    sucursalNombre: unit.sucursalActual,
    vendedorId: session.userId,
    vendedorNombre: session.userName,
    fechaReserva: now,
    fechaCancelacion: null,
    fechaCompletada: null,
    estado: RESERVATION_ACTIVE_STATUS,
    observacion: input.observacion.trim() || null,
    historial: [
      createHistoryEntry(
        reservationId,
        RESERVATION_ACTIVE_STATUS,
        session,
        `Reserva creada para ${target.clienteNombre}.`,
        now,
      ),
    ],
  };

  const movement = createInventoryMovement(
    reservation,
    INVENTORY_RESERVED_STATUS,
    now,
    `Unidad reservada para ${target.clienteNombre}.`,
  );
  const nextUnits = units.map((item) =>
    item.id === unit.id
      ? {
          ...item,
          estado: INVENTORY_RESERVED_STATUS,
          fechaActualizacion: now,
          historialMovimientos: [movement, ...item.historialMovimientos],
        }
      : item,
  );
  const nextReservations = [reservation, ...reservations].sort(
    sortByReservationDateDesc,
  );

  writeInventoryUnits(nextUnits);
  writeReservations(nextReservations);

  return mutationSuccess(
    "Reserva creada.",
    nextReservations,
    nextUnits,
    reservation,
  );
}

export function cancelReservation(
  reservationId: string,
  session: DemoSession,
): ReservationMutationResult {
  const units = readInventoryUnits();
  const reservations = readReservations();
  const reservation = reservations.find((item) => item.id === reservationId);
  const now = new Date().toISOString();

  if (!reservation) {
    return mutationError("Reserva no encontrada.", reservations, units);
  }

  if (!canCancelReservation(reservation, session)) {
    return mutationError(
      "Solo el Vendedor puede cancelar reservas propias activas.",
      reservations,
      units,
      reservation,
    );
  }

  const unit = units.find((item) => item.id === reservation.unidadId);
  if (!unit) {
    return mutationError("Unidad no encontrada.", reservations, units, reservation);
  }

  if (unit.estado !== INVENTORY_RESERVED_STATUS) {
    return mutationError(
      "La unidad ya no esta en estado Reservada y no puede liberarse.",
      reservations,
      units,
      reservation,
    );
  }

  const nextReservation: ReservationRecord = {
    ...reservation,
    estado: RESERVATION_CANCELLED_STATUS,
    fechaCancelacion: now,
    historial: [
      createHistoryEntry(
        reservation.id,
        RESERVATION_CANCELLED_STATUS,
        session,
        "Reserva cancelada y unidad liberada.",
        now,
      ),
      ...reservation.historial,
    ],
  };
  const movement = createInventoryMovement(
    nextReservation,
    INVENTORY_AVAILABLE_STATUS,
    now,
    `Reserva ${reservation.numeroReserva} cancelada. Unidad disponible.`,
  );
  const nextUnits = units.map((item) =>
    item.id === unit.id
      ? {
          ...item,
          estado: INVENTORY_AVAILABLE_STATUS,
          fechaActualizacion: now,
          historialMovimientos: [movement, ...item.historialMovimientos],
        }
      : item,
  );
  const nextReservations = reservations
    .map((item) => (item.id === nextReservation.id ? nextReservation : item))
    .sort(sortByReservationDateDesc);

  writeInventoryUnits(nextUnits);
  writeReservations(nextReservations);

  return mutationSuccess(
    "Reserva cancelada.",
    nextReservations,
    nextUnits,
    nextReservation,
  );
}

export function canCancelReservation(
  reservation: ReservationRecord,
  session: DemoSession,
) {
  return (
    session.role === "Vendedor" &&
    reservation.vendedorId === session.userId &&
    reservation.estado === RESERVATION_ACTIVE_STATUS
  );
}

function resolveReservationTarget(
  customerFileId: string | null,
  clienteNombre: string,
  files: CustomerFileRecord[],
  customers: CustomerRecord[],
) {
  if (customerFileId) {
    const file = files.find((item) => item.id === customerFileId);
    if (!file) return null;

    const customer = customers.find((item) => item.id === file.clienteId);

    return {
      clienteId: file.clienteId,
      clienteNombre: customer?.nombre ?? "Cliente sin nombre",
      expedienteId: file.id,
      numeroExpediente: file.numeroExpediente,
    };
  }

  const trimmedName = clienteNombre.trim();
  if (!trimmedName) return null;

  return {
    clienteId: null,
    clienteNombre: trimmedName,
    expedienteId: null,
    numeroExpediente: null,
  };
}

function createHistoryEntry(
  reservationId: string,
  status: ReservationStatus,
  session: DemoSession,
  notes: string,
  date: string,
): ReservationHistoryEntry {
  return {
    id: `${reservationId}-HIS-${createId("EVT")}`,
    fecha: date,
    estado: status,
    usuarioId: session.userId,
    usuarioNombre: session.userName,
    notas: notes,
  };
}

function createInventoryMovement(
  reservation: ReservationRecord,
  status: InventoryUnitStatus,
  date: string,
  notes: string,
): InventoryMovement {
  return {
    id: `${reservation.id}-MOV-${createId("INV")}`,
    fecha: date,
    tipo: "Reserva",
    sucursalOrigenId: reservation.sucursalId,
    sucursalOrigenNombre: reservation.sucursalNombre,
    sucursalDestinoId: reservation.sucursalId,
    sucursalDestinoNombre: reservation.sucursalNombre,
    estado: status,
    referencia: reservation.numeroReserva,
    notas: notes,
  };
}

function mutationError(
  message: string,
  reservations: ReservationRecord[],
  units: InventoryUnit[],
  reservation: ReservationRecord | null = null,
): ReservationMutationResult {
  return { ok: false, message, reservations, units, reservation };
}

function mutationSuccess(
  message: string,
  reservations: ReservationRecord[],
  units: InventoryUnit[],
  reservation: ReservationRecord,
): ReservationMutationResult {
  return { ok: true, message, reservations, units, reservation };
}

function createReservationNumber(sequence: number) {
  return `RES-${String(sequence).padStart(5, "0")}`;
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function sortByReservationDateDesc(
  left: ReservationRecord,
  right: ReservationRecord,
) {
  return (
    new Date(right.fechaReserva).getTime() -
    new Date(left.fechaReserva).getTime()
  );
}
