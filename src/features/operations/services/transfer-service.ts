"use client";

import type { DesiredBranchId } from "@/data/operations/leads";
import {
  TRANSFER_APPROVED_STATUS,
  TRANSFER_CANCELLED_STATUS,
  TRANSFER_IN_TRANSIT_STATUS,
  TRANSFER_ORDERS_STORAGE_KEY,
  TRANSFER_PENDING_STATUS,
  TRANSFER_RECEIVED_STATUS,
  getTransferBranch,
  isActiveTransferOrder,
  normalizeTransferOrder,
  type TransferOrder,
  type TransferOrderStatus,
  type TransferStatusHistoryEntry,
} from "@/data/operations/transfers";
import type {
  InventoryMovement,
  InventoryUnit,
  InventoryUnitStatus,
} from "@/data/operations/inventory";
import {
  readInventoryUnits,
  writeInventoryUnits,
} from "@/features/operations/services/inventory-service";
import type { DemoSession } from "@/features/operations/types";

const INVENTORY_AVAILABLE_STATUS = "Disponible" as InventoryUnitStatus;
const INVENTORY_IN_TRANSIT_STATUS =
  "En tr\u00e1nsito" as InventoryUnitStatus;

type CreateTransferInput = {
  originBranchId: DesiredBranchId;
  destinationBranchId: DesiredBranchId;
  unitId: string;
  motivo: string;
};

type TransferMutationResult = {
  ok: boolean;
  message: string;
  orders: TransferOrder[];
  units: InventoryUnit[];
  order: TransferOrder | null;
};

export function readTransferOrders() {
  try {
    const raw = window.localStorage.getItem(TRANSFER_ORDERS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return resetTransferOrders();

    return parsed
      .map((order) => normalizeTransferOrder(order))
      .filter((order): order is TransferOrder => Boolean(order))
      .sort(sortByRequestDateDesc);
  } catch {
    return resetTransferOrders();
  }
}

export function writeTransferOrders(orders: TransferOrder[]) {
  window.localStorage.setItem(
    TRANSFER_ORDERS_STORAGE_KEY,
    JSON.stringify(orders),
  );
}

export function resetTransferOrders() {
  writeTransferOrders([]);
  return [];
}

export function hasActiveTransferForUnit(
  orders: TransferOrder[],
  unitId: string,
) {
  return orders.some(
    (order) => order.unidadId === unitId && isActiveTransferOrder(order),
  );
}

export function createTransferOrder(
  input: CreateTransferInput,
  session: DemoSession,
): TransferMutationResult {
  const units = readInventoryUnits();
  const orders = readTransferOrders();
  const origin = getTransferBranch(input.originBranchId);
  const destination = getTransferBranch(input.destinationBranchId);
  const unit = units.find((item) => item.id === input.unitId);
  const now = new Date().toISOString();

  if (session.role !== "Vendedor" || session.branchId === "all") {
    return mutationError(
      "Solo el Vendedor puede crear solicitudes de traslado en esta fase.",
      orders,
      units,
    );
  }

  if (!origin || !destination || origin.id === destination.id) {
    return mutationError(
      "Selecciona una sucursal origen y una sucursal destino distinta.",
      orders,
      units,
    );
  }

  if (destination.id !== session.branchId) {
    return mutationError(
      "La solicitud del Vendedor debe ingresar hacia su sucursal.",
      orders,
      units,
    );
  }

  if (!unit) {
    return mutationError("Selecciona una unidad disponible.", orders, units);
  }

  if (unit.estado !== INVENTORY_AVAILABLE_STATUS) {
    return mutationError(
      "Solo se pueden trasladar unidades disponibles.",
      orders,
      units,
    );
  }

  if (unit.sucursalActualId !== origin.id) {
    return mutationError(
      "La unidad seleccionada no pertenece a la sucursal origen.",
      orders,
      units,
    );
  }

  if (hasActiveTransferForUnit(orders, unit.id)) {
    return mutationError(
      "La unidad ya tiene una solicitud de traslado activa.",
      orders,
      units,
    );
  }

  if (!input.motivo.trim()) {
    return mutationError("Indica el motivo del traslado.", orders, units);
  }

  const orderId = createId("TRF");
  const order: TransferOrder = {
    id: orderId,
    numeroTraslado: createTransferNumber(orders.length + 1),
    unidadId: unit.id,
    modeloSlug: unit.modeloSlug,
    modelo: unit.modelo,
    vin: unit.vin,
    sucursalOrigenId: origin.id,
    sucursalOrigenNombre: origin.name,
    sucursalDestinoId: destination.id,
    sucursalDestinoNombre: destination.name,
    solicitanteId: session.userId,
    solicitanteNombre: session.userName,
    solicitanteRol: session.role,
    motivo: input.motivo.trim(),
    estado: TRANSFER_PENDING_STATUS,
    fechaSolicitud: now,
    fechaAprobacion: null,
    fechaDespacho: null,
    fechaRecepcion: null,
    fechaCancelacion: null,
    aprobadoPorId: null,
    aprobadoPorNombre: null,
    despachadoPorId: null,
    despachadoPorNombre: null,
    recibidoPorId: null,
    recibidoPorNombre: null,
    canceladoPorId: null,
    canceladoPorNombre: null,
    historial: [
      createHistoryEntry(
        orderId,
        TRANSFER_PENDING_STATUS,
        session,
        `Solicitud creada de ${origin.name} hacia ${destination.name}.`,
        now,
      ),
    ],
  };

  const nextOrders = [order, ...orders].sort(sortByRequestDateDesc);
  writeTransferOrders(nextOrders);

  return mutationSuccess(
    "Solicitud de traslado creada.",
    nextOrders,
    units,
    order,
  );
}

export function approveTransferOrder(
  orderId: string,
  session: DemoSession,
): TransferMutationResult {
  const units = readInventoryUnits();
  const orders = readTransferOrders();
  const order = orders.find((item) => item.id === orderId);
  const now = new Date().toISOString();

  if (!order) return mutationError("Traslado no encontrado.", orders, units);
  if (!canManagerHandleTransfer(order, session)) {
    return mutationError(
      "Tu rol o sucursal no puede aprobar este traslado.",
      orders,
      units,
      order,
    );
  }
  if (order.estado !== TRANSFER_PENDING_STATUS) {
    return mutationError(
      "Solo se pueden aprobar traslados pendientes.",
      orders,
      units,
      order,
    );
  }

  const nextOrder: TransferOrder = {
    ...order,
    estado: TRANSFER_APPROVED_STATUS,
    fechaAprobacion: now,
    aprobadoPorId: session.userId,
    aprobadoPorNombre: session.userName,
    historial: [
      createHistoryEntry(
        order.id,
        TRANSFER_APPROVED_STATUS,
        session,
        "Solicitud aprobada para despacho.",
        now,
      ),
      ...order.historial,
    ],
  };
  const nextOrders = replaceOrder(orders, nextOrder);
  writeTransferOrders(nextOrders);

  return mutationSuccess("Traslado aprobado.", nextOrders, units, nextOrder);
}

export function markTransferInTransit(
  orderId: string,
  session: DemoSession,
): TransferMutationResult {
  const units = readInventoryUnits();
  const orders = readTransferOrders();
  const order = orders.find((item) => item.id === orderId);
  const now = new Date().toISOString();

  if (!order) return mutationError("Traslado no encontrado.", orders, units);
  if (!canManagerHandleTransfer(order, session)) {
    return mutationError(
      "Tu rol o sucursal no puede despachar este traslado.",
      orders,
      units,
      order,
    );
  }
  if (order.estado !== TRANSFER_APPROVED_STATUS) {
    return mutationError(
      "Solo se pueden despachar traslados aprobados.",
      orders,
      units,
      order,
    );
  }

  const unit = units.find((item) => item.id === order.unidadId);
  if (!unit || unit.estado !== INVENTORY_AVAILABLE_STATUS) {
    return mutationError(
      "La unidad ya no esta disponible para despacho.",
      orders,
      units,
      order,
    );
  }
  if (unit.sucursalActualId !== order.sucursalOrigenId) {
    return mutationError(
      "La unidad ya no se encuentra en la sucursal origen.",
      orders,
      units,
      order,
    );
  }

  const movement = createInventoryMovement(
    order,
    INVENTORY_IN_TRANSIT_STATUS,
    now,
    `Traslado ${order.numeroTraslado} marcado en transito hacia ${order.sucursalDestinoNombre}.`,
  );
  const nextUnits = units.map((item) =>
    item.id === unit.id
      ? {
          ...item,
          estado: INVENTORY_IN_TRANSIT_STATUS,
          fechaActualizacion: now,
          historialMovimientos: [movement, ...item.historialMovimientos],
        }
      : item,
  );
  const nextOrder: TransferOrder = {
    ...order,
    estado: TRANSFER_IN_TRANSIT_STATUS,
    fechaDespacho: now,
    despachadoPorId: session.userId,
    despachadoPorNombre: session.userName,
    historial: [
      createHistoryEntry(
        order.id,
        TRANSFER_IN_TRANSIT_STATUS,
        session,
        "Unidad despachada desde la sucursal origen.",
        now,
      ),
      ...order.historial,
    ],
  };
  const nextOrders = replaceOrder(orders, nextOrder);

  writeInventoryUnits(nextUnits);
  writeTransferOrders(nextOrders);

  return mutationSuccess(
    "Traslado marcado en transito.",
    nextOrders,
    nextUnits,
    nextOrder,
  );
}

export function receiveTransferOrder(
  orderId: string,
  session: DemoSession,
): TransferMutationResult {
  const units = readInventoryUnits();
  const orders = readTransferOrders();
  const order = orders.find((item) => item.id === orderId);
  const now = new Date().toISOString();

  if (!order) return mutationError("Traslado no encontrado.", orders, units);
  if (!canManagerReceiveTransfer(order, session)) {
    return mutationError(
      "Solo la gerencia de la sucursal destino puede recibir este traslado.",
      orders,
      units,
      order,
    );
  }
  if (order.estado !== TRANSFER_IN_TRANSIT_STATUS) {
    return mutationError(
      "Solo se pueden recibir traslados en transito.",
      orders,
      units,
      order,
    );
  }

  const unit = units.find((item) => item.id === order.unidadId);
  if (!unit) {
    return mutationError("Unidad no encontrada.", orders, units, order);
  }

  const movement = createInventoryMovement(
    order,
    INVENTORY_AVAILABLE_STATUS,
    now,
    `Traslado ${order.numeroTraslado} recibido en ${order.sucursalDestinoNombre}.`,
  );
  const nextUnits = units.map((item) =>
    item.id === unit.id
      ? {
          ...item,
          sucursalActualId: order.sucursalDestinoId,
          sucursalActual: order.sucursalDestinoNombre,
          estado: INVENTORY_AVAILABLE_STATUS,
          fechaActualizacion: now,
          historialMovimientos: [movement, ...item.historialMovimientos],
        }
      : item,
  );
  const nextOrder: TransferOrder = {
    ...order,
    estado: TRANSFER_RECEIVED_STATUS,
    fechaRecepcion: now,
    recibidoPorId: session.userId,
    recibidoPorNombre: session.userName,
    historial: [
      createHistoryEntry(
        order.id,
        TRANSFER_RECEIVED_STATUS,
        session,
        "Recepcion confirmada por la sucursal destino.",
        now,
      ),
      ...order.historial,
    ],
  };
  const nextOrders = replaceOrder(orders, nextOrder);

  writeInventoryUnits(nextUnits);
  writeTransferOrders(nextOrders);

  return mutationSuccess("Traslado recibido.", nextOrders, nextUnits, nextOrder);
}

export function cancelTransferOrder(
  orderId: string,
  session: DemoSession,
): TransferMutationResult {
  const units = readInventoryUnits();
  const orders = readTransferOrders();
  const order = orders.find((item) => item.id === orderId);
  const now = new Date().toISOString();

  if (!order) return mutationError("Traslado no encontrado.", orders, units);
  if (!canCancelTransfer(order, session)) {
    return mutationError(
      "Tu rol no puede cancelar este traslado.",
      orders,
      units,
      order,
    );
  }

  const nextOrder: TransferOrder = {
    ...order,
    estado: TRANSFER_CANCELLED_STATUS,
    fechaCancelacion: now,
    canceladoPorId: session.userId,
    canceladoPorNombre: session.userName,
    historial: [
      createHistoryEntry(
        order.id,
        TRANSFER_CANCELLED_STATUS,
        session,
        "Solicitud cancelada antes de completar el traslado.",
        now,
      ),
      ...order.historial,
    ],
  };
  const nextOrders = replaceOrder(orders, nextOrder);
  writeTransferOrders(nextOrders);

  return mutationSuccess("Traslado cancelado.", nextOrders, units, nextOrder);
}

export function canManagerHandleTransfer(
  order: TransferOrder,
  session: DemoSession,
) {
  return (
    session.role === "Gerente" &&
    session.branchId !== "all" &&
    (order.sucursalOrigenId === session.branchId ||
      order.sucursalDestinoId === session.branchId)
  );
}

export function canManagerReceiveTransfer(
  order: TransferOrder,
  session: DemoSession,
) {
  return (
    session.role === "Gerente" &&
    session.branchId !== "all" &&
    order.sucursalDestinoId === session.branchId
  );
}

export function canCancelTransfer(order: TransferOrder, session: DemoSession) {
  if (
    order.estado !== TRANSFER_PENDING_STATUS &&
    order.estado !== TRANSFER_APPROVED_STATUS
  ) {
    return false;
  }

  if (canManagerHandleTransfer(order, session)) return true;

  return (
    session.role === "Vendedor" &&
    order.estado === TRANSFER_PENDING_STATUS &&
    order.solicitanteId === session.userId
  );
}

function replaceOrder(orders: TransferOrder[], nextOrder: TransferOrder) {
  return orders
    .map((order) => (order.id === nextOrder.id ? nextOrder : order))
    .sort(sortByRequestDateDesc);
}

function createHistoryEntry(
  orderId: string,
  status: TransferOrderStatus,
  session: DemoSession,
  notes: string,
  date: string,
): TransferStatusHistoryEntry {
  return {
    id: `${orderId}-HIS-${createId("EVT")}`,
    fecha: date,
    estado: status,
    usuarioId: session.userId,
    usuarioNombre: session.userName,
    rol: session.role,
    notas: notes,
  };
}

function createInventoryMovement(
  order: TransferOrder,
  status: InventoryUnitStatus,
  date: string,
  notes: string,
): InventoryMovement {
  return {
    id: `${order.id}-MOV-${createId("INV")}`,
    fecha: date,
    tipo: "Traslado",
    sucursalOrigenId: order.sucursalOrigenId,
    sucursalOrigenNombre: order.sucursalOrigenNombre,
    sucursalDestinoId: order.sucursalDestinoId,
    sucursalDestinoNombre: order.sucursalDestinoNombre,
    estado: status,
    referencia: order.numeroTraslado,
    notas: notes,
  };
}

function mutationError(
  message: string,
  orders: TransferOrder[],
  units: InventoryUnit[],
  order: TransferOrder | null = null,
): TransferMutationResult {
  return { ok: false, message, orders, units, order };
}

function mutationSuccess(
  message: string,
  orders: TransferOrder[],
  units: InventoryUnit[],
  order: TransferOrder,
): TransferMutationResult {
  return { ok: true, message, orders, units, order };
}

function createTransferNumber(sequence: number) {
  return `TR-${String(sequence).padStart(5, "0")}`;
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function sortByRequestDateDesc(left: TransferOrder, right: TransferOrder) {
  return (
    new Date(right.fechaSolicitud).getTime() -
    new Date(left.fechaSolicitud).getTime()
  );
}
