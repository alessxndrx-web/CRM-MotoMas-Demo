import type { Prisma } from "@prisma/client";

import type { CrmScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  reservationStatusLabels,
  saleStatusLabels,
  saleTypeLabels,
  transferStatusLabels,
  type ReservationDTO,
  type ReservationStatusValue,
  type SaleDTO,
  type SaleStatusValue,
  type SaleTypeValue,
  type TransferDTO,
  type TransferStatusValue,
} from "@/server/operations/shared";

/**
 * Role-scoped operations read queries (Patch 3.2B). Each function resolves the
 * caller's {@link CrmScope} into a Prisma `where` filter so branch/personal
 * visibility is enforced in the database layer, never only in the UI.
 */

const LIST_LIMIT = 200;

async function resolveBranchId(branchCode: string): Promise<string | null> {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  return branch?.id ?? null;
}

// --- Reservations --------------------------------------------------------

export async function listReservations(
  scope: CrmScope,
): Promise<ReservationDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.ReservationWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = { branchId };
  } else if (scope.level === "personal") {
    where = { sellerId: scope.userId };
  }

  const reservations = await prisma.reservation.findMany({
    where,
    include: {
      branch: true,
      seller: true,
      customer: true,
      customerFile: true,
      motorcycleUnit: true,
      sale: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return reservations.map(mapReservation);
}

// --- Sales ---------------------------------------------------------------

export async function listSales(scope: CrmScope): Promise<SaleDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.SaleWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = { branchId };
  } else if (scope.level === "personal") {
    where = { sellerId: scope.userId };
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      branch: true,
      seller: true,
      customer: true,
      motorcycleUnit: true,
      reservation: { select: { reservationNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return sales.map(mapSale);
}

// --- Transfers -----------------------------------------------------------

export async function listTransfers(scope: CrmScope): Promise<TransferDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.TransferOrderWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = {
      OR: [{ originBranchId: branchId }, { destinationBranchId: branchId }],
    };
  } else if (scope.level === "personal") {
    where = { requestedById: scope.userId };
  }

  const transfers = await prisma.transferOrder.findMany({
    where,
    include: {
      originBranch: true,
      destinationBranch: true,
      motorcycleUnit: true,
      requestedBy: true,
      approvedBy: true,
      dispatchedBy: true,
      receivedBy: true,
      cancelledBy: true,
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return transfers.map(mapTransfer);
}

// --- Mappers -------------------------------------------------------------

type BranchRelation = { code: string; name: string } | null;

function branchCodeOf(branch: BranchRelation): string | null {
  return branch?.code ?? null;
}

function branchNameOf(branch: BranchRelation): string {
  return branch?.name ?? "Sucursal";
}

function mapReservation(reservation: {
  id: string;
  reservationNumber: string;
  customerId: string;
  customerFileId: string | null;
  motorcycleUnitId: string;
  sellerId: string;
  status: string;
  reservedAt: Date;
  cancelledAt: Date | null;
  completedAt: Date | null;
  notes: string | null;
  branch?: BranchRelation;
  seller?: { name: string } | null;
  customer?: { name: string } | null;
  customerFile?: { fileNumber: string } | null;
  motorcycleUnit?: { name: string; chassisNumber: string } | null;
  sale?: { id: string } | null;
}): ReservationDTO {
  const status = reservation.status as ReservationStatusValue;
  return {
    id: reservation.id,
    reservationNumber: reservation.reservationNumber,
    customerId: reservation.customerId,
    customerName: reservation.customer?.name ?? "Cliente",
    customerFileId: reservation.customerFileId,
    fileNumber: reservation.customerFile?.fileNumber ?? null,
    motorcycleUnitId: reservation.motorcycleUnitId,
    unitName: reservation.motorcycleUnit?.name ?? "Unidad",
    chassisNumber: reservation.motorcycleUnit?.chassisNumber ?? "",
    branchCode: branchCodeOf(reservation.branch ?? null),
    branchName: branchNameOf(reservation.branch ?? null),
    sellerId: reservation.sellerId,
    sellerName: reservation.seller?.name ?? null,
    status,
    statusLabel: reservationStatusLabels[status] ?? reservation.status,
    hasSale: Boolean(reservation.sale),
    reservedAt: reservation.reservedAt.toISOString(),
    cancelledAt: reservation.cancelledAt
      ? reservation.cancelledAt.toISOString()
      : null,
    completedAt: reservation.completedAt
      ? reservation.completedAt.toISOString()
      : null,
    notes: reservation.notes,
  };
}

function mapSale(sale: {
  id: string;
  saleNumber: string;
  customerId: string;
  customerFileId: string | null;
  reservationId: string | null;
  motorcycleUnitId: string;
  sellerId: string;
  type: string;
  status: string;
  soldAt: Date;
  deliveredAt: Date | null;
  notes: string | null;
  branch?: BranchRelation;
  seller?: { name: string } | null;
  customer?: { name: string } | null;
  motorcycleUnit?: { name: string; chassisNumber: string } | null;
  reservation?: { reservationNumber: string } | null;
}): SaleDTO {
  const type = sale.type as SaleTypeValue;
  const status = sale.status as SaleStatusValue;
  return {
    id: sale.id,
    saleNumber: sale.saleNumber,
    customerId: sale.customerId,
    customerName: sale.customer?.name ?? "Cliente",
    customerFileId: sale.customerFileId,
    reservationId: sale.reservationId,
    reservationNumber: sale.reservation?.reservationNumber ?? null,
    motorcycleUnitId: sale.motorcycleUnitId,
    unitName: sale.motorcycleUnit?.name ?? "Unidad",
    chassisNumber: sale.motorcycleUnit?.chassisNumber ?? "",
    branchCode: branchCodeOf(sale.branch ?? null),
    branchName: branchNameOf(sale.branch ?? null),
    sellerId: sale.sellerId,
    sellerName: sale.seller?.name ?? null,
    type,
    typeLabel: saleTypeLabels[type] ?? sale.type,
    status,
    statusLabel: saleStatusLabels[status] ?? sale.status,
    soldAt: sale.soldAt.toISOString(),
    deliveredAt: sale.deliveredAt ? sale.deliveredAt.toISOString() : null,
    notes: sale.notes,
  };
}

function mapTransfer(transfer: {
  id: string;
  transferNumber: string;
  motorcycleUnitId: string;
  status: string;
  reason: string;
  requestedById: string;
  requestedAt: Date;
  approvedAt: Date | null;
  dispatchedAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  notes: string | null;
  originBranch?: BranchRelation;
  destinationBranch?: BranchRelation;
  motorcycleUnit?: { name: string; chassisNumber: string } | null;
  requestedBy?: { name: string } | null;
  approvedBy?: { name: string } | null;
  dispatchedBy?: { name: string } | null;
  receivedBy?: { name: string } | null;
  cancelledBy?: { name: string } | null;
}): TransferDTO {
  const status = transfer.status as TransferStatusValue;
  return {
    id: transfer.id,
    transferNumber: transfer.transferNumber,
    motorcycleUnitId: transfer.motorcycleUnitId,
    unitName: transfer.motorcycleUnit?.name ?? "Unidad",
    chassisNumber: transfer.motorcycleUnit?.chassisNumber ?? "",
    originBranchCode: branchCodeOf(transfer.originBranch ?? null),
    originBranchName: branchNameOf(transfer.originBranch ?? null),
    destinationBranchCode: branchCodeOf(transfer.destinationBranch ?? null),
    destinationBranchName: branchNameOf(transfer.destinationBranch ?? null),
    status,
    statusLabel: transferStatusLabels[status] ?? transfer.status,
    reason: transfer.reason,
    requestedById: transfer.requestedById,
    requestedByName: transfer.requestedBy?.name ?? null,
    approvedByName: transfer.approvedBy?.name ?? null,
    dispatchedByName: transfer.dispatchedBy?.name ?? null,
    receivedByName: transfer.receivedBy?.name ?? null,
    cancelledByName: transfer.cancelledBy?.name ?? null,
    requestedAt: transfer.requestedAt.toISOString(),
    approvedAt: transfer.approvedAt ? transfer.approvedAt.toISOString() : null,
    dispatchedAt: transfer.dispatchedAt
      ? transfer.dispatchedAt.toISOString()
      : null,
    receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString() : null,
    cancelledAt: transfer.cancelledAt
      ? transfer.cancelledAt.toISOString()
      : null,
    notes: transfer.notes,
  };
}
