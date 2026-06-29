"use client";

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
  RESERVATION_ACTIVE_STATUS,
  RESERVATION_COMPLETED_STATUS,
  type ReservationHistoryEntry,
  type ReservationRecord,
} from "@/data/operations/reservations";
import {
  SALE_COMPLETED_STATUS,
  SALE_DELIVERED_STATUS,
  SALES_STORAGE_KEY,
  normalizeSale,
  type SaleRecord,
  type SaleType,
} from "@/data/operations/sales";
import {
  readCustomerFiles,
  readCustomers,
} from "@/features/operations/services/customer-files-service";
import {
  readInventoryUnits,
  writeInventoryUnits,
} from "@/features/operations/services/inventory-service";
import {
  readReservations,
  writeReservations,
} from "@/features/operations/services/reservation-service";
import type { DemoSession } from "@/features/operations/types";

const INVENTORY_AVAILABLE_STATUS = "Disponible" as InventoryUnitStatus;
const INVENTORY_RESERVED_STATUS = "Reservada" as InventoryUnitStatus;
const INVENTORY_SOLD_STATUS = "Vendida" as InventoryUnitStatus;
const INVENTORY_DELIVERED_STATUS = "Entregada" as InventoryUnitStatus;
const INVENTORY_IN_TRANSIT_STATUS =
  "En tr\u00e1nsito" as InventoryUnitStatus;

export type CreateSaleInput = {
  sourceType: "reservation" | "file" | "customer";
  reservationId: string | null;
  customerFileId: string | null;
  customerId: string | null;
  unitId: string;
  tipoVenta: SaleType;
  observaciones: string;
};

type SaleMutationResult = {
  ok: boolean;
  message: string;
  sales: SaleRecord[];
  units: InventoryUnit[];
  reservations: ReservationRecord[];
  sale: SaleRecord | null;
};

export function readSales() {
  try {
    const raw = window.localStorage.getItem(SALES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return resetSales();

    return parsed
      .map((sale) => normalizeSale(sale))
      .filter((sale): sale is SaleRecord => Boolean(sale))
      .sort(sortBySaleDateDesc);
  } catch {
    return resetSales();
  }
}

export function writeSales(sales: SaleRecord[]) {
  window.localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
}

export function resetSales() {
  writeSales([]);
  return [];
}

export function hasSaleForUnit(sales: SaleRecord[], unitId: string) {
  return sales.some((sale) => sale.unidadId === unitId);
}

export function createSale(
  input: CreateSaleInput,
  session: DemoSession,
): SaleMutationResult {
  const sales = readSales();
  const units = readInventoryUnits();
  const reservations = readReservations();
  const customers = readCustomers();
  const files = readCustomerFiles();
  const unit = units.find((item) => item.id === input.unitId);
  const now = new Date().toISOString();

  if (session.role !== "Vendedor" || session.branchId === "all") {
    return mutationError(
      "Solo el Vendedor puede completar ventas en esta fase.",
      sales,
      units,
      reservations,
    );
  }

  if (!unit) {
    return mutationError("Selecciona una unidad para vender.", sales, units, reservations);
  }

  if (unit.sucursalActualId !== session.branchId) {
    return mutationError(
      "La unidad debe estar en tu sucursal para completar la venta.",
      sales,
      units,
      reservations,
    );
  }

  if (hasSaleForUnit(sales, unit.id)) {
    return mutationError(
      "Esta unidad ya tiene una venta registrada.",
      sales,
      units,
      reservations,
    );
  }

  if (
    unit.estado === INVENTORY_SOLD_STATUS ||
    unit.estado === INVENTORY_DELIVERED_STATUS ||
    unit.estado === INVENTORY_IN_TRANSIT_STATUS
  ) {
    return mutationError(
      "No se pueden vender unidades vendidas, entregadas o en transito.",
      sales,
      units,
      reservations,
    );
  }

  const target = resolveSaleTarget(input, unit, reservations, customers, files);
  if (!target.ok) {
    return mutationError(target.message, sales, units, reservations);
  }

  const activeReservationForUnit = reservations.find(
    (reservation) =>
      reservation.unidadId === unit.id &&
      reservation.estado === RESERVATION_ACTIVE_STATUS,
  );

  if (
    activeReservationForUnit &&
    target.reservation?.id !== activeReservationForUnit.id
  ) {
    return mutationError(
      "La unidad tiene una reserva activa y solo puede venderse desde esa reserva.",
      sales,
      units,
      reservations,
    );
  }

  if (
    target.reservation &&
    target.reservation.vendedorId !== session.userId
  ) {
    return mutationError(
      "Solo el Vendedor responsable puede completar una venta desde esta reserva.",
      sales,
      units,
      reservations,
    );
  }

  if (unit.estado === INVENTORY_RESERVED_STATUS) {
    if (
      !target.reservation ||
      target.reservation.unidadId !== unit.id ||
      target.reservation.estado !== RESERVATION_ACTIVE_STATUS
    ) {
      return mutationError(
        "La unidad reservada solo puede venderse desde su reserva activa.",
        sales,
        units,
        reservations,
      );
    }
  }

  if (unit.estado !== INVENTORY_AVAILABLE_STATUS && unit.estado !== INVENTORY_RESERVED_STATUS) {
    return mutationError(
      "La unidad no esta disponible para completar venta.",
      sales,
      units,
      reservations,
    );
  }

  const saleId = createId("SAL");
  const sale: SaleRecord = {
    id: saleId,
    numeroVenta: createSaleNumber(sales.length + 1),
    clienteId: target.customer.id,
    clienteNombre: target.customer.nombre,
    expedienteId: target.file?.id ?? null,
    numeroExpediente: target.file?.numeroExpediente ?? null,
    reservaId: target.reservation?.id ?? null,
    numeroReserva: target.reservation?.numeroReserva ?? null,
    unidadId: unit.id,
    modeloSlug: unit.modeloSlug,
    modelo: unit.modelo,
    vin: unit.vin,
    sucursalId: unit.sucursalActualId,
    sucursalNombre: unit.sucursalActual,
    vendedorId: session.userId,
    vendedorNombre: session.userName,
    tipoVenta: input.tipoVenta,
    estado: SALE_COMPLETED_STATUS,
    fechaVenta: now,
    fechaEntrega: null,
    observaciones: input.observaciones.trim() || null,
  };

  const movement = createInventoryMovement(
    sale,
    unit,
    now,
    `Venta ${sale.numeroVenta} completada para ${sale.clienteNombre}.`,
  );
  const nextUnits = units.map((item) =>
    item.id === unit.id
      ? {
          ...item,
          estado: INVENTORY_SOLD_STATUS,
          fechaActualizacion: now,
          historialMovimientos: [movement, ...item.historialMovimientos],
        }
      : item,
  );
  const nextReservations = target.reservation
    ? reservations
        .map((reservation) =>
          reservation.id === target.reservation?.id
            ? completeReservation(reservation, sale, session, now)
            : reservation,
        )
        .sort(sortByReservationDateDesc)
    : reservations;
  const nextSales = [sale, ...sales].sort(sortBySaleDateDesc);

  writeInventoryUnits(nextUnits);
  writeReservations(nextReservations);
  writeSales(nextSales);

  return {
    ok: true,
    message: "Venta completada.",
    sales: nextSales,
    units: nextUnits,
    reservations: nextReservations,
    sale,
  };
}

export function deliverSale(
  saleId: string,
  session: DemoSession,
): SaleMutationResult {
  const sales = readSales();
  const units = readInventoryUnits();
  const reservations = readReservations();
  const sale = sales.find((item) => item.id === saleId);
  const now = new Date().toISOString();

  if (!sale) {
    return mutationError("Selecciona una venta para marcar entrega.", sales, units, reservations);
  }

  if (session.role !== "Vendedor" || session.userId !== sale.vendedorId) {
    return mutationError(
      "Solo el Vendedor responsable puede marcar la entrega de sus ventas.",
      sales,
      units,
      reservations,
    );
  }

  if (sale.estado !== SALE_COMPLETED_STATUS) {
    return mutationError(
      "Solo se pueden entregar ventas en estado Completada.",
      sales,
      units,
      reservations,
    );
  }

  const unit = units.find((item) => item.id === sale.unidadId);
  if (!unit) {
    return mutationError("Unidad asociada a la venta no encontrada.", sales, units, reservations);
  }

  if (unit.estado !== INVENTORY_SOLD_STATUS) {
    return mutationError(
      "Solo se pueden entregar unidades en estado Vendida.",
      sales,
      units,
      reservations,
    );
  }

  const movement = createDeliveryMovement(
    sale,
    unit,
    now,
    `Entrega registrada para venta ${sale.numeroVenta}.`,
  );
  const deliveredSale: SaleRecord = {
    ...sale,
    estado: SALE_DELIVERED_STATUS,
    fechaEntrega: now,
  };
  const nextSales = sales
    .map((item) => (item.id === sale.id ? deliveredSale : item))
    .sort(sortBySaleDateDesc);
  const nextUnits = units.map((item) =>
    item.id === unit.id
      ? {
          ...item,
          estado: INVENTORY_DELIVERED_STATUS,
          fechaActualizacion: now,
          historialMovimientos: [movement, ...item.historialMovimientos],
        }
      : item,
  );

  writeInventoryUnits(nextUnits);
  writeSales(nextSales);

  return {
    ok: true,
    message: "Venta marcada como entregada.",
    sales: nextSales,
    units: nextUnits,
    reservations,
    sale: deliveredSale,
  };
}

function resolveSaleTarget(
  input: CreateSaleInput,
  unit: InventoryUnit,
  reservations: ReservationRecord[],
  customers: CustomerRecord[],
  files: CustomerFileRecord[],
):
  | {
      ok: true;
      customer: CustomerRecord;
      file: CustomerFileRecord | null;
      reservation: ReservationRecord | null;
    }
  | { ok: false; message: string } {
  if (input.sourceType === "reservation") {
    const reservation = reservations.find((item) => item.id === input.reservationId);
    if (!reservation) return { ok: false, message: "Selecciona una reserva activa." };
    if (reservation.estado !== RESERVATION_ACTIVE_STATUS) {
      return { ok: false, message: "Solo se puede vender desde reservas activas." };
    }
    if (reservation.unidadId !== unit.id) {
      return { ok: false, message: "La unidad no coincide con la reserva seleccionada." };
    }
    if (!reservation.clienteId) {
      return {
        ok: false,
        message: "La reserva debe estar asociada a un cliente registrado.",
      };
    }

    const customer = customers.find((item) => item.id === reservation.clienteId);
    if (!customer) return { ok: false, message: "Cliente de la reserva no encontrado." };

    const file = reservation.expedienteId
      ? files.find((item) => item.id === reservation.expedienteId) ?? null
      : null;

    return { ok: true, customer, file, reservation };
  }

  if (input.sourceType === "file") {
    const file = files.find((item) => item.id === input.customerFileId);
    if (!file) return { ok: false, message: "Selecciona un expediente existente." };

    const customer = customers.find((item) => item.id === file.clienteId);
    if (!customer) return { ok: false, message: "Cliente del expediente no encontrado." };

    return { ok: true, customer, file, reservation: null };
  }

  const customer = customers.find((item) => item.id === input.customerId);
  if (!customer) return { ok: false, message: "Selecciona un cliente existente." };

  return { ok: true, customer, file: null, reservation: null };
}

function completeReservation(
  reservation: ReservationRecord,
  sale: SaleRecord,
  session: DemoSession,
  date: string,
): ReservationRecord {
  return {
    ...reservation,
    estado: RESERVATION_COMPLETED_STATUS,
    fechaCompletada: date,
    historial: [
      createReservationHistoryEntry(
        reservation.id,
        session,
        `Reserva completada por venta ${sale.numeroVenta}.`,
        date,
      ),
      ...reservation.historial,
    ],
  };
}

function createReservationHistoryEntry(
  reservationId: string,
  session: DemoSession,
  notes: string,
  date: string,
): ReservationHistoryEntry {
  return {
    id: `${reservationId}-HIS-${createId("EVT")}`,
    fecha: date,
    estado: RESERVATION_COMPLETED_STATUS,
    usuarioId: session.userId,
    usuarioNombre: session.userName,
    notas: notes,
  };
}

function createInventoryMovement(
  sale: SaleRecord,
  unit: InventoryUnit,
  date: string,
  notes: string,
): InventoryMovement {
  return {
    id: `${sale.id}-MOV-${createId("INV")}`,
    fecha: date,
    tipo: "Venta",
    sucursalOrigenId: unit.sucursalActualId,
    sucursalOrigenNombre: unit.sucursalActual,
    sucursalDestinoId: unit.sucursalActualId,
    sucursalDestinoNombre: unit.sucursalActual,
    estado: INVENTORY_SOLD_STATUS,
    referencia: sale.numeroVenta,
    notas: notes,
  };
}

function createDeliveryMovement(
  sale: SaleRecord,
  unit: InventoryUnit,
  date: string,
  notes: string,
): InventoryMovement {
  return {
    id: `${sale.id}-MOV-${createId("ENT")}`,
    fecha: date,
    tipo: "Entrega",
    sucursalOrigenId: unit.sucursalActualId,
    sucursalOrigenNombre: unit.sucursalActual,
    sucursalDestinoId: unit.sucursalActualId,
    sucursalDestinoNombre: unit.sucursalActual,
    estado: INVENTORY_DELIVERED_STATUS,
    referencia: sale.numeroVenta,
    notas: notes,
  };
}

function mutationError(
  message: string,
  sales: SaleRecord[],
  units: InventoryUnit[],
  reservations: ReservationRecord[],
): SaleMutationResult {
  return { ok: false, message, sales, units, reservations, sale: null };
}

function createSaleNumber(sequence: number) {
  return `VEN-${String(sequence).padStart(5, "0")}`;
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function sortBySaleDateDesc(left: SaleRecord, right: SaleRecord) {
  return new Date(right.fechaVenta).getTime() - new Date(left.fechaVenta).getTime();
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
