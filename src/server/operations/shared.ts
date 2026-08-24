/**
 * Pure, client-safe operations (reservations / sales / transfers) types, enum
 * value unions and label maps. No database import here so client components can
 * reuse the DTO shapes. Enforcement lives in queries.ts / actions.ts.
 *
 * These mirror the Prisma enums added in Patch 3.2A.
 */

export type ReservationStatusValue = "ACTIVA" | "CANCELADA" | "COMPLETADA";

export const reservationStatusLabels: Record<ReservationStatusValue, string> = {
  ACTIVA: "Activa",
  CANCELADA: "Cancelada",
  COMPLETADA: "Completada",
};

export type SaleTypeValue = "CONTADO" | "FINANCIAMIENTO_EXTERNO";

export const saleTypeValues: SaleTypeValue[] = [
  "CONTADO",
  "FINANCIAMIENTO_EXTERNO",
];

export const saleTypeLabels: Record<SaleTypeValue, string> = {
  CONTADO: "Contado",
  FINANCIAMIENTO_EXTERNO: "Financiamiento externo",
};

export function isSaleTypeValue(value: string): value is SaleTypeValue {
  return saleTypeValues.includes(value as SaleTypeValue);
}

export type SaleStatusValue = "COMPLETADA" | "ENTREGADA";

export const saleStatusLabels: Record<SaleStatusValue, string> = {
  COMPLETADA: "Completada",
  ENTREGADA: "Entregada",
};

export type TransferStatusValue =
  | "PENDIENTE"
  | "APROBADO"
  | "EN_TRANSITO"
  | "RECIBIDO"
  | "CANCELADO";

export const transferStatusLabels: Record<TransferStatusValue, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  EN_TRANSITO: "En tránsito",
  RECIBIDO: "Recibido",
  CANCELADO: "Cancelado",
};

export type ReservationDTO = {
  id: string;
  reservationNumber: string;
  customerId: string;
  customerName: string;
  customerFileId: string | null;
  fileNumber: string | null;
  motorcycleUnitId: string;
  unitName: string;
  chassisNumber: string;
  branchCode: string | null;
  branchName: string;
  sellerId: string;
  sellerName: string | null;
  status: ReservationStatusValue;
  statusLabel: string;
  hasSale: boolean;
  reservedAt: string;
  cancelledAt: string | null;
  completedAt: string | null;
  notes: string | null;
};

export type SaleDTO = {
  id: string;
  saleNumber: string;
  customerId: string;
  customerName: string;
  customerFileId: string | null;
  reservationId: string | null;
  reservationNumber: string | null;
  motorcycleUnitId: string;
  unitName: string;
  chassisNumber: string;
  branchCode: string | null;
  branchName: string;
  sellerId: string;
  sellerName: string | null;
  type: SaleTypeValue;
  typeLabel: string;
  status: SaleStatusValue;
  statusLabel: string;
  soldAt: string;
  deliveredAt: string | null;
  notes: string | null;
};

export type TransferDTO = {
  id: string;
  transferNumber: string;
  motorcycleUnitId: string;
  unitName: string;
  chassisNumber: string;
  originBranchCode: string | null;
  originBranchName: string;
  destinationBranchCode: string | null;
  destinationBranchName: string;
  status: TransferStatusValue;
  statusLabel: string;
  reason: string;
  requestedById: string;
  requestedByName: string | null;
  approvedByName: string | null;
  dispatchedByName: string | null;
  receivedByName: string | null;
  cancelledByName: string | null;
  requestedAt: string;
  approvedAt: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
};
