import type { Prisma } from "@prisma/client";

import type { CrmScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  reservationPaymentMethodLabels,
  reservationProofStatusLabels,
  reservationStatusLabels,
  saleStatusLabels,
  saleTypeLabels,
  transferStatusLabels,
  type ReservationDTO,
  type ReservationPaymentMethodValue,
  type ReservationPaymentProofDTO,
  type ReservationPaymentProofStatusValue,
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
      // Patch CRM-QA1. El comprobante y el cobro en línea viajan con la fila:
      // la pantalla tiene que poder decir POR QUÉ una reserva está bloqueada, y
      // preguntarlo por fila habría sido una consulta por reserva.
      paymentProof: {
        include: { storedFile: true, uploadedBy: true, reviewedBy: true },
      },
      paymentRequests: {
        where: { status: "PAGADA" },
        select: { id: true },
        take: 1,
      },
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
  confirmedAt?: Date | null;
  paymentProof?: ReservationProofRelation;
  paymentRequests?: Array<{ id: string }>;
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
    confirmedAt: reservation.confirmedAt
      ? reservation.confirmedAt.toISOString()
      : null,
    completedAt: reservation.completedAt
      ? reservation.completedAt.toISOString()
      : null,
    notes: reservation.notes,
    paymentProof: mapReservationProof(reservation.paymentProof ?? null),
    paidOnline: Boolean(reservation.paymentRequests?.length),
  };
}

type ReservationProofRelation = {
  id: string;
  storedFileId: string;
  amount: { toFixed(digits: number): string } | null;
  currency: string | null;
  method: string;
  reference: string | null;
  status: string;
  uploadedAt: Date;
  reviewedAt: Date | null;
  reviewNotes: string | null;
  storedFile?: { originalName: string; mimeType: string; sizeBytes: number } | null;
  uploadedBy?: { name: string } | null;
  reviewedBy?: { name: string } | null;
} | null;

function mapReservationProof(
  proof: ReservationProofRelation,
): ReservationPaymentProofDTO | null {
  if (!proof) return null;
  const method = proof.method as ReservationPaymentMethodValue;
  const status = proof.status as ReservationPaymentProofStatusValue;
  return {
    id: proof.id,
    storedFileId: proof.storedFileId,
    fileName: proof.storedFile?.originalName ?? "Comprobante",
    mimeType: proof.storedFile?.mimeType ?? "",
    sizeBytes: proof.storedFile?.sizeBytes ?? 0,
    // El Decimal cruza como cadena: un `number` perdería centavos en el camino.
    amount: proof.amount ? proof.amount.toFixed(2) : null,
    currency: proof.currency,
    method,
    methodLabel: reservationPaymentMethodLabels[method] ?? proof.method,
    reference: proof.reference,
    status,
    statusLabel: reservationProofStatusLabels[status] ?? proof.status,
    uploadedByName: proof.uploadedBy?.name ?? null,
    uploadedAt: proof.uploadedAt.toISOString(),
    reviewedByName: proof.reviewedBy?.name ?? null,
    reviewedAt: proof.reviewedAt ? proof.reviewedAt.toISOString() : null,
    reviewNotes: proof.reviewNotes,
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
