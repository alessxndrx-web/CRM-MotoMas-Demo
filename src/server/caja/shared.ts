/**
 * Client-safe Caja DTOs, enum values, labels and pure validation/calculation
 * helpers (Patch 3.4B). No Prisma import belongs here: Decimal values are
 * serialized before crossing the server boundary and no inventory costs are
 * present in any DTO.
 */

export type CashDocumentTypeValue =
  | "FACTURA"
  | "RECIBO"
  | "NOTA_DEBITO"
  | "NOTA_CREDITO";

export const cashDocumentTypeValues: CashDocumentTypeValue[] = [
  "FACTURA",
  "RECIBO",
  "NOTA_DEBITO",
  "NOTA_CREDITO",
];

export const cashDocumentTypeLabels: Record<CashDocumentTypeValue, string> = {
  FACTURA: "Factura",
  RECIBO: "Recibo oficial de caja",
  NOTA_DEBITO: "Nota de débito",
  NOTA_CREDITO: "Nota de crédito",
};

export function isCashDocumentTypeValue(
  value: string,
): value is CashDocumentTypeValue {
  return cashDocumentTypeValues.includes(value as CashDocumentTypeValue);
}

export type CashDocumentStatusValue = "BORRADOR" | "EMITIDO" | "ANULADO";

export const cashDocumentStatusValues: CashDocumentStatusValue[] = [
  "BORRADOR",
  "EMITIDO",
  "ANULADO",
];

export const cashDocumentStatusLabels: Record<
  CashDocumentStatusValue,
  string
> = {
  BORRADOR: "Borrador",
  EMITIDO: "Emitido",
  ANULADO: "Anulado",
};

export function isCashDocumentStatusValue(
  value: string,
): value is CashDocumentStatusValue {
  return cashDocumentStatusValues.includes(value as CashDocumentStatusValue);
}

export type CashPaymentMethodValue =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "TARJETA";

export const cashPaymentMethodValues: CashPaymentMethodValue[] = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "CHEQUE",
  "TARJETA",
];

export const cashPaymentMethodLabels: Record<
  CashPaymentMethodValue,
  string
> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque",
  TARJETA: "Tarjeta",
};

export function isCashPaymentMethodValue(
  value: string,
): value is CashPaymentMethodValue {
  return cashPaymentMethodValues.includes(value as CashPaymentMethodValue);
}

export type CashSessionStatusValue = "ABIERTO" | "CERRADO" | "ANULADO";

export const cashSessionStatusValues: CashSessionStatusValue[] = [
  "ABIERTO",
  "CERRADO",
  "ANULADO",
];

export const cashSessionStatusLabels: Record<CashSessionStatusValue, string> = {
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
  ANULADO: "Anulado",
};

export function isCashSessionStatusValue(
  value: string,
): value is CashSessionStatusValue {
  return cashSessionStatusValues.includes(value as CashSessionStatusValue);
}

export type CashClosingStatusValue =
  | "ABIERTO"
  | "CERRADO"
  | "REVISADO_CONTABILIDAD"
  | "ANULADO";

export const cashClosingStatusValues: CashClosingStatusValue[] = [
  "ABIERTO",
  "CERRADO",
  "REVISADO_CONTABILIDAD",
  "ANULADO",
];

export const cashClosingStatusLabels: Record<
  CashClosingStatusValue,
  string
> = {
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
  REVISADO_CONTABILIDAD: "Revisado por Contabilidad",
  ANULADO: "Anulado",
};

export function isCashClosingStatusValue(
  value: string,
): value is CashClosingStatusValue {
  return cashClosingStatusValues.includes(value as CashClosingStatusValue);
}

export type CashSessionDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  cashierId: string;
  cashierName: string;
  status: CashSessionStatusValue;
  statusLabel: string;
  openedAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashDocumentItemDTO = {
  id: string;
  documentId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type CashPaymentDTO = {
  id: string;
  cashSessionId: string | null;
  documentId: string;
  branchCode: string | null;
  branchName: string;
  recordedByUserId: string;
  recordedByName: string;
  method: CashPaymentMethodValue;
  methodLabel: string;
  amount: number;
  currency: string | null;
  bank: string | null;
  reference: string | null;
  paidAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashDocumentDTO = {
  id: string;
  cashSessionId: string | null;
  branchCode: string | null;
  branchName: string;
  issuedByUserId: string;
  issuedByName: string;
  customerId: string | null;
  customerName: string | null;
  saleId: string | null;
  saleNumber: string | null;
  reservationId: string | null;
  reservationNumber: string | null;
  relatedDocumentId: string | null;
  relatedDocumentNumber: string | null;
  type: CashDocumentTypeValue;
  typeLabel: string;
  documentNumber: string;
  status: CashDocumentStatusValue;
  statusLabel: string;
  thirdPartyName: string;
  taxId: string | null;
  concept: string;
  description: string | null;
  motorcycleDescription: string | null;
  subtotal: number;
  appliedPayment: number;
  retention1: number;
  retention2: number;
  total: number;
  paidTotal: number;
  balance: number;
  currency: string | null;
  notes: string | null;
  itemCount: number;
  paymentCount: number;
  issuedAt: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashDocumentDetailDTO = CashDocumentDTO & {
  items: CashDocumentItemDTO[];
  payments: CashPaymentDTO[];
};

export type CashClosingDTO = {
  id: string;
  cashSessionId: string;
  branchCode: string | null;
  branchName: string;
  cashierId: string;
  cashierName: string;
  preparedByUserId: string;
  preparedByName: string;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  status: CashClosingStatusValue;
  statusLabel: string;
  cashAmount: number;
  transferAmount: number;
  checkAmount: number;
  cardAmount: number;
  invoicedTotal: number;
  receivedTotal: number;
  retentionTotal: number;
  difference: number;
  currency: string | null;
  notes: string | null;
  preparedAt: string;
  closedAt: string | null;
  reviewedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashSessionDetailDTO = {
  session: CashSessionDTO;
  documents: CashDocumentDTO[];
  payments: CashPaymentDTO[];
  closing: CashClosingDTO | null;
  totals: {
    documentTotal: number;
    paidTotal: number;
    balance: number;
    paymentBreakdown: CashPaymentBreakdown;
  };
};

export type CashClosingDetailDTO = {
  closing: CashClosingDTO;
  session: CashSessionDTO;
  documents: CashDocumentDTO[];
  payments: CashPaymentDTO[];
};

export type CashPaymentBreakdown = Record<CashPaymentMethodValue, number>;

export type CajaDashboardSummaryDTO = {
  currentSession: CashSessionDTO | null;
  openSessionCount: number;
  documentCount: number;
  draftDocumentCount: number;
  issuedDocumentCount: number;
  cancelledDocumentCount: number;
  issuedInvoiceTotal: number;
  paymentTotal: number;
  balance: number;
  pendingClosingCount: number;
  paymentBreakdown: CashPaymentBreakdown;
};

type DecimalLike = { toNumber(): number; toString(): string } | null | undefined;

/** Decimal-safe serialization for client DTOs. */
export function decimalToNumber(value: DecimalLike): number {
  return value ? value.toNumber() : 0;
}

export function decimalToString(value: DecimalLike): string {
  return value ? value.toString() : "0";
}

export function dateToISOString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

export function sanitizeCajaText(
  value: string | null | undefined,
  maxLength = 500,
): string | null {
  if (!value) return null;
  const clean = value.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : null;
}

/** Non-negative money input bounded to the schema's Decimal(12,2). */
export function sanitizeCashMoney(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999_999.99) {
    return null;
  }
  return roundCashMoney(value);
}

export function sanitizeCashQuantity(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

/** Currency stays optional; when supplied it must be a neutral ISO-like code. */
export function sanitizeCashCurrency(
  value: string | null | undefined,
): string | null {
  const clean = sanitizeCajaText(value, 3)?.toUpperCase() ?? null;
  return clean && /^[A-Z]{3}$/.test(clean) ? clean : null;
}

export function roundCashMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Mirrors the current Caja formula: subtotal - abono - retentions, floor 0. */
export function calculateCashDocumentTotal(input: {
  subtotal: number;
  appliedPayment?: number;
  retention1?: number;
  retention2?: number;
}): number {
  return roundCashMoney(
    Math.max(
      input.subtotal -
        (input.appliedPayment ?? 0) -
        (input.retention1 ?? 0) -
        (input.retention2 ?? 0),
      0,
    ),
  );
}

export function calculateCashPaidTotal(
  payments: Array<{ amount: number }>,
): number {
  return roundCashMoney(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
  );
}

export function calculateCashBalance(total: number, paidTotal: number): number {
  return roundCashMoney(Math.max(total - paidTotal, 0));
}

export function buildCashPaymentBreakdown(
  payments: Array<{ method: CashPaymentMethodValue; amount: number }>,
): CashPaymentBreakdown {
  const totals: CashPaymentBreakdown = {
    EFECTIVO: 0,
    TRANSFERENCIA: 0,
    CHEQUE: 0,
    TARJETA: 0,
  };
  for (const payment of payments) {
    totals[payment.method] = roundCashMoney(
      totals[payment.method] + payment.amount,
    );
  }
  return totals;
}

/**
 * Current local closing behavior: counted amounts are manual, while invoiced
 * and retention totals are derived from issued documents.
 */
export function calculateCashClosingTotals(input: {
  cashAmount: number;
  transferAmount: number;
  checkAmount: number;
  cardAmount: number;
  documents: Array<
    Pick<
      CashDocumentDTO,
      "type" | "status" | "total" | "retention1" | "retention2"
    >
  >;
}) {
  const issued = input.documents.filter(
    (document) => document.status === "EMITIDO",
  );
  const receivedTotal = roundCashMoney(
    input.cashAmount +
      input.transferAmount +
      input.checkAmount +
      input.cardAmount,
  );
  const invoicedTotal = roundCashMoney(
    issued
      .filter((document) => document.type === "FACTURA")
      .reduce((sum, document) => sum + document.total, 0),
  );
  const retentionTotal = roundCashMoney(
    issued.reduce(
      (sum, document) =>
        sum + document.retention1 + document.retention2,
      0,
    ),
  );
  return {
    receivedTotal,
    invoicedTotal,
    retentionTotal,
    difference: roundCashMoney(receivedTotal - invoicedTotal),
  };
}
