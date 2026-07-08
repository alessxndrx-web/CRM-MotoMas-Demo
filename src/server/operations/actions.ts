"use server";

import type { Prisma } from "@prisma/client";

import {
  canAccessBranch,
  canApproveTransfers,
  canManageReservations,
  canManageSales,
  canManageTransfers,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { isSaleTypeValue } from "@/server/operations/shared";

/**
 * Server-side operations write actions (Patch 3.2B): reservations, sales and
 * transfers. Every action re-checks the session role/branch scope; authorization
 * is enforced here, not in the UI. Multi-write flows run inside Prisma
 * transactions so unit status, movement history and the operation row stay
 * consistent.
 *
 * These actions never touch Caja, Contabilidad or the public portal, never
 * expose costs, and never create a MotorcycleUnit (units come only from
 * inventory ingress). Customer and MotorcycleUnit stay separate: reservations
 * and sales link them at the transaction level, never inside the unit record.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_SESSION = "Sesión no válida.";
const NO_PERMISSION = "No tienes permiso para esta operación.";

export type OperationActionResult =
  | { ok: true }
  | { ok: false; error: string };

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

function generateCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

type MovementInput = {
  unitId: string;
  branchId: string;
  type:
    | "RESERVA"
    | "VENTA"
    | "ENTREGA"
    | "TRASLADO_SALIDA"
    | "TRASLADO_ENTRADA"
    | "AJUSTE";
  reason: string;
  notes: string | null;
  userId: string;
};

async function addMovement(tx: Prisma.TransactionClient, input: MovementInput) {
  await tx.inventoryMovement.create({
    data: {
      motorcycleUnitId: input.unitId,
      branchId: input.branchId,
      type: input.type,
      reason: input.reason,
      notes: input.notes,
      createdByUserId: input.userId,
      date: new Date(),
    },
  });
}

/**
 * A Seller may only act on customers linked to them (via an assigned/created
 * lead or an expediente they own). Admin/Manager pass through.
 */
async function sellerOwnsCustomer(
  userId: string,
  customerId: string,
  customerFileId: string | null,
): Promise<boolean> {
  const prisma = getPrisma();
  if (customerFileId) {
    const file = await prisma.customerFile.findUnique({
      where: { id: customerFileId },
    });
    if (file && file.sellerId === userId && file.customerId === customerId) {
      return true;
    }
  }
  const link = await prisma.customer.findFirst({
    where: {
      id: customerId,
      OR: [
        {
          leads: {
            some: {
              OR: [{ assignedSellerId: userId }, { createdById: userId }],
            },
          },
        },
        { customerFiles: { some: { sellerId: userId } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(link);
}

// --- Reservations --------------------------------------------------------

export type CreateReservationResult =
  | { ok: true; reservationId: string; reservationNumber: string }
  | { ok: false; error: string };

export async function createReservation(input: {
  customerId: string;
  motorcycleUnitId: string;
  customerFileId?: string | null;
  notes?: string | null;
}): Promise<CreateReservationResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageReservations(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  if (!input.customerId) return { ok: false, error: "Selecciona un cliente." };
  if (!input.motorcycleUnitId) {
    return { ok: false, error: "Selecciona una unidad." };
  }

  const actorBranch = sessionBranchCode(session.branchId);
  const fileId = input.customerFileId?.trim() || null;

  try {
    const prisma = getPrisma();

    const unit = await prisma.motorcycleUnit.findUnique({
      where: { id: input.motorcycleUnitId },
      include: { branch: true },
    });
    if (!unit) return { ok: false, error: "La unidad no existe." };
    if (!canAccessBranch(session.roleEnum, actorBranch, unit.branch.code)) {
      return { ok: false, error: "La unidad no pertenece a tu sucursal." };
    }
    if (unit.status !== "AVAILABLE") {
      return {
        ok: false,
        error: "Solo puedes reservar una unidad disponible.",
      };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) return { ok: false, error: "El cliente no existe." };

    if (fileId) {
      const file = await prisma.customerFile.findUnique({ where: { id: fileId } });
      if (!file || file.customerId !== input.customerId) {
        return { ok: false, error: "El expediente no corresponde al cliente." };
      }
    }

    if (
      session.roleEnum === "VENDEDOR" &&
      !(await sellerOwnsCustomer(session.uid, input.customerId, fileId))
    ) {
      return {
        ok: false,
        error: "Solo puedes reservar para tus clientes o expedientes.",
      };
    }

    const activeReservation = await prisma.reservation.findFirst({
      where: { motorcycleUnitId: unit.id, status: "ACTIVA" },
      select: { id: true },
    });
    if (activeReservation) {
      return { ok: false, error: "La unidad ya tiene una reserva activa." };
    }

    const reservationNumber = generateCode("RES");

    const created = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.create({
        data: {
          reservationNumber,
          customerId: input.customerId,
          customerFileId: fileId,
          motorcycleUnitId: unit.id,
          branchId: unit.branchId,
          sellerId: session.uid,
          status: "ACTIVA",
          notes: input.notes?.trim() || null,
        },
      });
      await tx.motorcycleUnit.update({
        where: { id: unit.id },
        data: { status: "RESERVED" },
      });
      await addMovement(tx, {
        unitId: unit.id,
        branchId: unit.branchId,
        type: "RESERVA",
        reason: `Reserva ${reservationNumber}`,
        notes: input.notes?.trim() || null,
        userId: session.uid,
      });
      return reservation;
    });

    return {
      ok: true,
      reservationId: created.id,
      reservationNumber,
    };
  } catch {
    return { ok: false, error: "No se pudo crear la reserva." };
  }
}

export async function cancelReservation(input: {
  reservationId: string;
  notes?: string | null;
}): Promise<OperationActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageReservations(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({
      where: { id: input.reservationId },
      include: { branch: true, motorcycleUnit: true, sale: { select: { id: true } } },
    });
    if (!reservation) return { ok: false, error: "La reserva no existe." };

    if (!scopeAllows(session.roleEnum, actorBranch, session.uid, {
      branchCode: reservation.branch.code,
      sellerId: reservation.sellerId,
    })) {
      return { ok: false, error: "Esta reserva no está dentro de tu alcance." };
    }
    if (reservation.status !== "ACTIVA") {
      return { ok: false, error: "Solo puedes cancelar una reserva activa." };
    }
    if (reservation.sale) {
      return {
        ok: false,
        error: "No puedes cancelar una reserva que ya tiene una venta.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          status: "CANCELADA",
          cancelledAt: new Date(),
          notes: input.notes?.trim() || reservation.notes,
        },
      });
      // Only free the unit if it is still held by this reservation.
      if (reservation.motorcycleUnit.status === "RESERVED") {
        await tx.motorcycleUnit.update({
          where: { id: reservation.motorcycleUnitId },
          data: { status: "AVAILABLE" },
        });
      }
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo cancelar la reserva." };
  }
}

export async function completeReservation(input: {
  reservationId: string;
}): Promise<OperationActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageReservations(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const reservation = await prisma.reservation.findUnique({
      where: { id: input.reservationId },
      include: { branch: true },
    });
    if (!reservation) return { ok: false, error: "La reserva no existe." };
    if (!scopeAllows(session.roleEnum, actorBranch, session.uid, {
      branchCode: reservation.branch.code,
      sellerId: reservation.sellerId,
    })) {
      return { ok: false, error: "Esta reserva no está dentro de tu alcance." };
    }
    if (reservation.status !== "ACTIVA") {
      return { ok: false, error: "Solo puedes completar una reserva activa." };
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "COMPLETADA", completedAt: new Date() },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo completar la reserva." };
  }
}

// --- Sales ---------------------------------------------------------------

export type CreateSaleResult =
  | { ok: true; saleId: string; saleNumber: string }
  | { ok: false; error: string };

export async function createSale(input: {
  customerId: string;
  motorcycleUnitId: string;
  type: string;
  customerFileId?: string | null;
  reservationId?: string | null;
  notes?: string | null;
}): Promise<CreateSaleResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageSales(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  if (!input.customerId) return { ok: false, error: "Selecciona un cliente." };
  if (!input.motorcycleUnitId) return { ok: false, error: "Selecciona una unidad." };
  if (!isSaleTypeValue(input.type)) {
    return { ok: false, error: "Tipo de venta no válido." };
  }

  const actorBranch = sessionBranchCode(session.branchId);
  const fileId = input.customerFileId?.trim() || null;
  const reservationId = input.reservationId?.trim() || null;

  try {
    const prisma = getPrisma();

    const unit = await prisma.motorcycleUnit.findUnique({
      where: { id: input.motorcycleUnitId },
      include: { branch: true },
    });
    if (!unit) return { ok: false, error: "La unidad no existe." };
    if (!canAccessBranch(session.roleEnum, actorBranch, unit.branch.code)) {
      return { ok: false, error: "La unidad no pertenece a tu sucursal." };
    }
    if (unit.status !== "AVAILABLE" && unit.status !== "RESERVED") {
      return {
        ok: false,
        error: "Solo puedes vender una unidad disponible o reservada.",
      };
    }

    const existingSale = await prisma.sale.findUnique({
      where: { motorcycleUnitId: unit.id },
      select: { id: true },
    });
    if (existingSale) {
      return { ok: false, error: "La unidad ya tiene una venta registrada." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: input.customerId },
    });
    if (!customer) return { ok: false, error: "El cliente no existe." };

    if (fileId) {
      const file = await prisma.customerFile.findUnique({ where: { id: fileId } });
      if (!file || file.customerId !== input.customerId) {
        return { ok: false, error: "El expediente no corresponde al cliente." };
      }
    }

    if (
      session.roleEnum === "VENDEDOR" &&
      !(await sellerOwnsCustomer(session.uid, input.customerId, fileId))
    ) {
      return {
        ok: false,
        error: "Solo puedes vender a tus clientes o expedientes.",
      };
    }

    // Resolve/validate reservation linkage.
    let linkedReservationId: string | null = null;
    const activeReservation = await prisma.reservation.findFirst({
      where: { motorcycleUnitId: unit.id, status: "ACTIVA" },
    });

    if (reservationId) {
      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
      });
      if (!reservation) return { ok: false, error: "La reserva no existe." };
      if (
        reservation.motorcycleUnitId !== unit.id ||
        reservation.customerId !== input.customerId
      ) {
        return {
          ok: false,
          error: "La reserva no corresponde al cliente y la unidad.",
        };
      }
      if (reservation.status !== "ACTIVA") {
        return { ok: false, error: "La reserva ya no está activa." };
      }
      linkedReservationId = reservation.id;
    } else if (unit.status === "RESERVED") {
      // A reserved unit can only be sold through its active reservation.
      return {
        ok: false,
        error:
          "La unidad está reservada: la venta debe hacerse desde su reserva activa.",
      };
    }

    if (activeReservation && activeReservation.id !== linkedReservationId) {
      return {
        ok: false,
        error:
          "La unidad tiene una reserva activa distinta; véndela desde esa reserva.",
      };
    }

    const saleNumber = generateCode("VEN");

    const created = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          saleNumber,
          customerId: input.customerId,
          customerFileId: fileId,
          reservationId: linkedReservationId,
          motorcycleUnitId: unit.id,
          branchId: unit.branchId,
          sellerId: session.uid,
          type: input.type as SaleTypeInput,
          status: "COMPLETADA",
          notes: input.notes?.trim() || null,
        },
      });
      await tx.motorcycleUnit.update({
        where: { id: unit.id },
        data: { status: "SOLD" },
      });
      await addMovement(tx, {
        unitId: unit.id,
        branchId: unit.branchId,
        type: "VENTA",
        reason: `Venta ${saleNumber}`,
        notes: input.notes?.trim() || null,
        userId: session.uid,
      });
      if (linkedReservationId) {
        await tx.reservation.update({
          where: { id: linkedReservationId },
          data: { status: "COMPLETADA", completedAt: new Date() },
        });
      }
      return sale;
    });

    return { ok: true, saleId: created.id, saleNumber };
  } catch {
    return { ok: false, error: "No se pudo registrar la venta." };
  }
}

export async function markSaleDelivered(input: {
  saleId: string;
}): Promise<OperationActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageSales(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const sale = await prisma.sale.findUnique({
      where: { id: input.saleId },
      include: { branch: true },
    });
    if (!sale) return { ok: false, error: "La venta no existe." };
    if (!scopeAllows(session.roleEnum, actorBranch, session.uid, {
      branchCode: sale.branch.code,
      sellerId: sale.sellerId,
    })) {
      return { ok: false, error: "Esta venta no está dentro de tu alcance." };
    }
    if (sale.status !== "COMPLETADA") {
      return {
        ok: false,
        error: "Solo puedes entregar una venta completada.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: "ENTREGADA", deliveredAt: new Date() },
      });
      await tx.motorcycleUnit.update({
        where: { id: sale.motorcycleUnitId },
        data: { status: "DELIVERED" },
      });
      await addMovement(tx, {
        unitId: sale.motorcycleUnitId,
        branchId: sale.branchId,
        type: "ENTREGA",
        reason: `Entrega ${sale.saleNumber}`,
        notes: null,
        userId: session.uid,
      });
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo marcar la venta como entregada." };
  }
}

// --- Transfers -----------------------------------------------------------

export type CreateTransferResult =
  | { ok: true; transferId: string; transferNumber: string }
  | { ok: false; error: string };

export async function createTransfer(input: {
  motorcycleUnitId: string;
  destinationBranchCode: string;
  reason: string;
}): Promise<CreateTransferResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageTransfers(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  const reason = input.reason?.trim();
  if (!input.motorcycleUnitId) return { ok: false, error: "Selecciona una unidad." };
  if (!reason) return { ok: false, error: "Indica el motivo del traslado." };
  const destinationCode = input.destinationBranchCode?.trim();
  if (!destinationCode) return { ok: false, error: "Selecciona la sucursal destino." };

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();

    const unit = await prisma.motorcycleUnit.findUnique({
      where: { id: input.motorcycleUnitId },
      include: { branch: true },
    });
    if (!unit) return { ok: false, error: "La unidad no existe." };

    const destination = await prisma.branch.findUnique({
      where: { code: destinationCode },
    });
    if (!destination) return { ok: false, error: "La sucursal destino no existe." };

    if (destination.id === unit.branchId) {
      return {
        ok: false,
        error: "El origen y el destino no pueden ser la misma sucursal.",
      };
    }
    if (unit.status !== "AVAILABLE") {
      return {
        ok: false,
        error: "Solo puedes trasladar una unidad disponible.",
      };
    }

    // The actor must be involved with the origin or the destination branch.
    const involved =
      canAccessBranch(session.roleEnum, actorBranch, unit.branch.code) ||
      canAccessBranch(session.roleEnum, actorBranch, destination.code);
    if (!involved) {
      return {
        ok: false,
        error: "El traslado debe involucrar tu sucursal.",
      };
    }

    const transferNumber = generateCode("TRA");
    const created = await prisma.transferOrder.create({
      data: {
        transferNumber,
        motorcycleUnitId: unit.id,
        originBranchId: unit.branchId,
        destinationBranchId: destination.id,
        status: "PENDIENTE",
        reason,
        requestedById: session.uid,
      },
    });

    return { ok: true, transferId: created.id, transferNumber };
  } catch {
    return { ok: false, error: "No se pudo crear el traslado." };
  }
}

type TransferForTransition = Prisma.TransferOrderGetPayload<{
  include: { originBranch: true; destinationBranch: true; motorcycleUnit: true };
}>;

type LoadTransferResult =
  | { ok: true; transfer: TransferForTransition }
  | { ok: false; error: string };

/** Shared load + involved-branch check for transfer state transitions. */
async function loadTransferForTransition(
  session: { roleEnum: Parameters<typeof canApproveTransfers>[0]; branchId: string },
  transferId: string,
): Promise<LoadTransferResult> {
  const prisma = getPrisma();
  const transfer = await prisma.transferOrder.findUnique({
    where: { id: transferId },
    include: { originBranch: true, destinationBranch: true, motorcycleUnit: true },
  });
  if (!transfer) return { ok: false, error: "El traslado no existe." };

  const actorBranch = sessionBranchCode(session.branchId);
  const involved =
    canAccessBranch(session.roleEnum, actorBranch, transfer.originBranch.code) ||
    canAccessBranch(
      session.roleEnum,
      actorBranch,
      transfer.destinationBranch.code,
    );
  if (!involved) {
    return { ok: false, error: "El traslado no involucra tu sucursal." };
  }
  return { ok: true, transfer };
}

export async function approveTransfer(input: {
  transferId: string;
}): Promise<OperationActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canApproveTransfers(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  try {
    const loaded = await loadTransferForTransition(session, input.transferId);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    if (loaded.transfer.status !== "PENDIENTE") {
      return { ok: false, error: "Solo puedes aprobar un traslado pendiente." };
    }

    const prisma = getPrisma();
    await prisma.transferOrder.update({
      where: { id: loaded.transfer.id },
      data: {
        status: "APROBADO",
        approvedById: session.uid,
        approvedAt: new Date(),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo aprobar el traslado." };
  }
}

export async function dispatchTransfer(input: {
  transferId: string;
}): Promise<OperationActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canApproveTransfers(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  try {
    const loaded = await loadTransferForTransition(session, input.transferId);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const transfer = loaded.transfer;
    if (transfer.status !== "APROBADO") {
      return { ok: false, error: "Solo puedes despachar un traslado aprobado." };
    }
    if (transfer.motorcycleUnit.status !== "AVAILABLE") {
      return {
        ok: false,
        error: "La unidad ya no está disponible para despacharse.",
      };
    }

    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.transferOrder.update({
        where: { id: transfer.id },
        data: {
          status: "EN_TRANSITO",
          dispatchedById: session.uid,
          dispatchedAt: new Date(),
        },
      });
      await tx.motorcycleUnit.update({
        where: { id: transfer.motorcycleUnitId },
        data: { status: "IN_TRANSFER" },
      });
      await addMovement(tx, {
        unitId: transfer.motorcycleUnitId,
        branchId: transfer.originBranchId,
        type: "TRASLADO_SALIDA",
        reason: `Traslado ${transfer.transferNumber} (salida)`,
        notes: null,
        userId: session.uid,
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo despachar el traslado." };
  }
}

export async function receiveTransfer(input: {
  transferId: string;
}): Promise<OperationActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canApproveTransfers(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  try {
    const loaded = await loadTransferForTransition(session, input.transferId);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const transfer = loaded.transfer;
    if (transfer.status !== "EN_TRANSITO") {
      return {
        ok: false,
        error: "Solo puedes recibir un traslado en tránsito.",
      };
    }

    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.transferOrder.update({
        where: { id: transfer.id },
        data: {
          status: "RECIBIDO",
          receivedById: session.uid,
          receivedAt: new Date(),
        },
      });
      await tx.motorcycleUnit.update({
        where: { id: transfer.motorcycleUnitId },
        data: { branchId: transfer.destinationBranchId, status: "AVAILABLE" },
      });
      await addMovement(tx, {
        unitId: transfer.motorcycleUnitId,
        branchId: transfer.destinationBranchId,
        type: "TRASLADO_ENTRADA",
        reason: `Traslado ${transfer.transferNumber} (entrada)`,
        notes: null,
        userId: session.uid,
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo recibir el traslado." };
  }
}

export async function cancelTransfer(input: {
  transferId: string;
  notes?: string | null;
}): Promise<OperationActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canApproveTransfers(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  try {
    const loaded = await loadTransferForTransition(session, input.transferId);
    if (!loaded.ok) return { ok: false, error: loaded.error };
    const transfer = loaded.transfer;
    if (transfer.status === "RECIBIDO" || transfer.status === "CANCELADO") {
      return {
        ok: false,
        error: "No puedes cancelar un traslado recibido o ya cancelado.",
      };
    }

    const prisma = getPrisma();
    await prisma.$transaction(async (tx) => {
      await tx.transferOrder.update({
        where: { id: transfer.id },
        data: {
          status: "CANCELADO",
          cancelledById: session.uid,
          cancelledAt: new Date(),
          notes: input.notes?.trim() || transfer.notes,
        },
      });
      // If the unit was already in transit, return it to its origin branch.
      if (transfer.motorcycleUnit.status === "IN_TRANSFER") {
        await tx.motorcycleUnit.update({
          where: { id: transfer.motorcycleUnitId },
          data: { branchId: transfer.originBranchId, status: "AVAILABLE" },
        });
        await addMovement(tx, {
          unitId: transfer.motorcycleUnitId,
          branchId: transfer.originBranchId,
          type: "AJUSTE",
          reason: `Traslado ${transfer.transferNumber} cancelado (retorno)`,
          notes: input.notes?.trim() || null,
          userId: session.uid,
        });
      }
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo cancelar el traslado." };
  }
}

// --- Scope helper --------------------------------------------------------

/** Whether the actor may act on a reservation/sale given its branch + seller. */
function scopeAllows(
  role: Parameters<typeof canAccessBranch>[0],
  actorBranch: string | null,
  userId: string,
  record: { branchCode: string; sellerId: string },
): boolean {
  if (role === "ADMIN") return true;
  if (role === "GERENTE") {
    return canAccessBranch(role, actorBranch, record.branchCode);
  }
  // Seller: only their own records.
  return record.sellerId === userId;
}

type SaleTypeInput = "CONTADO" | "FINANCIAMIENTO_EXTERNO";
