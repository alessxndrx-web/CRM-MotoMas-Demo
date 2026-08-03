/**
 * Client-safe Caja DTOs, enum values, labels and pure validation/calculation
 * helpers (Patch 3.4B). No Prisma import belongs here: Decimal values are
 * serialized before crossing the server boundary and no inventory costs are
 * present in any DTO.
 */

// The calculation helpers below round through the canonical implementation; the
// alias keeps their bodies unchanged (Patch TD-01).
import { roundFinancialMoney as roundCashMoney } from "@/server/finance/money";

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
  tax: number;
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
  /** Patch FF1.1-B — expected per method, derived from registered payments. */
  expectedCashAmount: number;
  expectedTransferAmount: number;
  expectedCheckAmount: number;
  expectedCardAmount: number;
  expectedTotal: number;
  /** Per-method arqueo lines, derived from the stored counted/expected pairs. */
  byMethod: CashClosingMethodTotal[];
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
    /** Total of the shift's ISSUED documents. Drafts and annulled excluded. */
    documentTotal: number;
    /** Payments registered against those issued documents. */
    paidTotal: number;
    balance: number;
    /**
     * The same payments broken down by method. Patch FF1.1-B: this is the
     * *expected* cash of the shift, which is why the closing preview reads it
     * instead of recomputing anything from documents.
     */
    paymentBreakdown: CashPaymentBreakdown;
    /** Informational totals the closing stores alongside the arqueo. */
    invoicedTotal: number;
    retentionTotal: number;
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

/**
 * Patch TD-01: the money, currency and Decimal-serialization helpers used to be
 * defined here and, byte for byte, again in Contabilidad. They now live once in
 * `@/server/finance/money` and `@/server/finance/text`, and are re-exported
 * under their historical Caja names, so every call site is unchanged and the
 * behaviour is identical.
 */
export {
  dateToISOString,
  decimalToNumber,
  decimalToString,
  roundFinancialMoney as roundCashMoney,
  sanitizeFinancialCurrency as sanitizeCashCurrency,
  sanitizeFinancialMoney as sanitizeCashMoney,
} from "@/server/finance/money";
export { sanitizeFinancialText as sanitizeCajaText } from "@/server/finance/text";

/**
 * A quantity, not an amount: three decimals, strictly positive and bounded far
 * below the money ceiling. It stays local because it encodes a different rule.
 */
export function sanitizeCashQuantity(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Mirrors the Caja formula: subtotal + tax - abono - retentions, floor 0.
 *
 * Patch FF2.0-C added the tax term, which is **additive** and defaults to zero,
 * so every document written before it produces exactly the total it produced
 * before. `calculateDocumentTotalDecimal` in `caja/actions.ts` is the Decimal
 * twin of this function and carries the same term.
 */
export function calculateCashDocumentTotal(input: {
  subtotal: number;
  tax?: number;
  appliedPayment?: number;
  retention1?: number;
  retention2?: number;
}): number {
  return roundCashMoney(
    Math.max(
      input.subtotal +
        (input.tax ?? 0) -
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

/** One line of the arqueo: what the shift should hold vs what was counted. */
export type CashClosingMethodTotal = {
  method: CashPaymentMethodValue;
  methodLabel: string;
  expected: number;
  counted: number;
  /** `counted - expected`. Positive is an overage, negative a shortage. */
  difference: number;
};

export type CashClosingTotals = {
  /** Sum of the counted amounts. */
  receivedTotal: number;
  /** Sum of the expected amounts. */
  expectedTotal: number;
  /** Informational: total invoiced in the shift. Not part of the difference. */
  invoicedTotal: number;
  retentionTotal: number;
  /** `receivedTotal - expectedTotal`. */
  difference: number;
  /** Per-method breakdown, in the canonical method order. */
  byMethod: CashClosingMethodTotal[];
};

/**
 * Patch FF1.1-B — **the** cash closing formula. Single source of truth.
 *
 * Before this patch the same arithmetic existed three times: inline in
 * `createCashClosingAction`, again in `closeCashSessionAction`, and here for the
 * panel preview. All three computed
 *
 *     difference = counted − Σ total of issued FACTURA documents
 *
 * which is wrong for the business: it compares money against *invoicing*
 * instead of against *collection*. It ignored the `CashPayment` rows actually
 * registered, ignored receipts entirely, counted a partially-paid invoice at its
 * full value, and treated debit/credit notes as if they had been collected. A
 * shift that issued one C$10,000 invoice with a C$3,000 down payment reported a
 * shortage of C$7,000 that never existed.
 *
 * The corrected rule is:
 *
 *     expected[method] = Σ payments of that method registered against the
 *                        shift's ISSUED documents
 *     difference[method] = counted[method] − expected[method]
 *     difference = Σ counted − Σ expected
 *
 * It needs no rule per document type: notes cannot carry payments and drafts are
 * not issued, so both contribute zero by construction instead of by exception.
 *
 * Arithmetic domain: every input is already bounded to `Decimal(12,2)`, so the
 * values are exact as IEEE doubles (below 2^53 in cents) and `roundCashMoney`
 * absorbs the representation epsilon. That is what lets the server and the panel
 * share this one implementation instead of keeping a Decimal copy for writes and
 * a number copy for the preview — the divergence that produced the bug.
 */
export function calculateCashClosingTotals(input: {
  counted: CashPaymentBreakdown;
  expected: CashPaymentBreakdown;
  /** Informational totals of the shift; default 0 for a preview. */
  invoicedTotal?: number;
  retentionTotal?: number;
}): CashClosingTotals {
  const byMethod = cashPaymentMethodValues.map((method) => {
    const expected = roundCashMoney(input.expected[method] ?? 0);
    const counted = roundCashMoney(input.counted[method] ?? 0);
    return {
      method,
      methodLabel: cashPaymentMethodLabels[method],
      expected,
      counted,
      difference: roundCashMoney(counted - expected),
    };
  });

  const receivedTotal = roundCashMoney(
    byMethod.reduce((sum, line) => sum + line.counted, 0),
  );
  const expectedTotal = roundCashMoney(
    byMethod.reduce((sum, line) => sum + line.expected, 0),
  );

  return {
    receivedTotal,
    expectedTotal,
    invoicedTotal: roundCashMoney(input.invoicedTotal ?? 0),
    retentionTotal: roundCashMoney(input.retentionTotal ?? 0),
    difference: roundCashMoney(receivedTotal - expectedTotal),
    byMethod,
  };
}
