/**
 * Pure, client-safe operations (reservations / sales / transfers) types, enum
 * value unions and label maps. No database import here so client components can
 * reuse the DTO shapes. Enforcement lives in queries.ts / actions.ts.
 *
 * These mirror the Prisma enums added in Patch 3.2A.
 */

export type ReservationStatusValue =
  | "PENDIENTE_PAGO"
  | "ACTIVA"
  | "CANCELADA"
  | "COMPLETADA";

export const reservationStatusLabels: Record<ReservationStatusValue, string> = {
  PENDIENTE_PAGO: "Pendiente de pago",
  ACTIVA: "Activa",
  CANCELADA: "Cancelada",
  COMPLETADA: "Completada",
};

/**
 * Patch CRM-QA1 — estados en los que la reserva sigue viva y retiene el candado
 * de su unidad. Se declara aquí porque lo consultan la pantalla, la acción y el
 * smoke, y porque enumerarlo tres veces es garantizar que un día no coincidan.
 */
export const reservationStatusValues: ReservationStatusValue[] = [
  "PENDIENTE_PAGO",
  "ACTIVA",
  "CANCELADA",
  "COMPLETADA",
];

export function isReservationStatusValue(
  value: string,
): value is ReservationStatusValue {
  return reservationStatusValues.includes(value as ReservationStatusValue);
}

export const liveReservationStatuses: ReservationStatusValue[] = [
  "PENDIENTE_PAGO",
  "ACTIVA",
];

export type ReservationPaymentProofStatusValue =
  | "PENDIENTE_REVISION"
  | "APROBADO"
  | "RECHAZADO";

export const reservationProofStatusLabels: Record<
  ReservationPaymentProofStatusValue,
  string
> = {
  // Patch CRM-INT1 — «verificado» y no «aprobado»: lo que se aprueba es la
  // imagen, no un ingreso. Los valores del enumerado no cambian.
  PENDIENTE_REVISION: "Pendiente de verificación",
  APROBADO: "Verificado",
  RECHAZADO: "Rechazado",
};

export type ReservationPaymentMethodValue =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "TARJETA";

export const reservationPaymentMethodValues: ReservationPaymentMethodValue[] = [
  "TRANSFERENCIA",
  "EFECTIVO",
  "CHEQUE",
  "TARJETA",
];

export const reservationPaymentMethodLabels: Record<
  ReservationPaymentMethodValue,
  string
> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque",
  TARJETA: "Tarjeta",
};

export function isReservationPaymentMethod(
  value: string,
): value is ReservationPaymentMethodValue {
  return reservationPaymentMethodValues.includes(
    value as ReservationPaymentMethodValue,
  );
}

/**
 * Patch CRM-INT1 — de dónde llegó un comprobante. El del portal lo subió el
 * propio cliente y todavía no apartó nada; el del panel lo subió un empleado
 * y ya retiene la unidad.
 */
export type ReservationProofSourceValue = "PANEL" | "PORTAL_CLIENTE";

export const reservationProofSourceLabels: Record<ReservationProofSourceValue, string> = {
  PANEL: "Subido por el equipo",
  PORTAL_CLIENTE: "Enviado por el cliente desde el portal",
};

/** El comprobante subido a mano, tal y como lo ve una pantalla autorizada. */
export type ReservationPaymentProofDTO = {
  id: string;
  storedFileId: string;
  source: ReservationProofSourceValue;
  sourceLabel: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  amount: string | null;
  currency: string | null;
  method: ReservationPaymentMethodValue;
  methodLabel: string;
  reference: string | null;
  status: ReservationPaymentProofStatusValue;
  statusLabel: string;
  uploadedByName: string | null;
  uploadedAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
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
  /** Patch CRM-QA1 — cuándo se acreditó el pago y la unidad quedó bloqueada. */
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  notes: string | null;
  /**
   * Patch CRM-QA1 — el comprobante subido a mano, si lo hay.
   *
   * Nulo no significa «sin pagar»: una reserva confirmada por la pasarela no
   * tiene comprobante manual y no lo necesita. Lo que dice si está pagada es
   * `status`, y por qué camino lo dice la combinación de este campo con
   * `paidOnline`.
   */
  paymentProof: ReservationPaymentProofDTO | null;
  /**
   * Patch CRM-INT1 — todos los comprobantes de la reserva, del más reciente al
   * más antiguo. El primero es `paymentProof`; los demás son intentos ya
   * revisados, que se conservan con su motivo de rechazo.
   */
  proofHistory: ReservationPaymentProofDTO[];
  /** Patch CRM-QA1 — tiene un cobro en línea ya pagado. */
  paidOnline: boolean;
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
