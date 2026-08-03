import {
  roundFinancialMoney as roundPosMoney,
  sanitizeFinancialMoney as sanitizePosMoney,
} from "@/server/finance/money";
import { sanitizeFinancialText as sanitizePosText } from "@/server/finance/text";

export { roundPosMoney, sanitizePosMoney, sanitizePosText };

/**
 * Patch POS1.0-A — client-safe vocabulary of the Point of Sale.
 *
 * Pure values: no Prisma client, no session, no database access.
 *
 * The POS is a **separate bounded context from Caja**. `CashDocument` models an
 * accounting document — review, issue, posting, reversal, receivables, tax — and
 * this models a retail checkout. Nothing here posts to the ledger, so the
 * repository still has exactly one posting path per economic event.
 *
 * Money arithmetic reuses `finance/money`, the same helpers the accounting layer
 * uses, rather than a private copy. TD-01 spent a patch removing duplicated
 * money helpers and this context does not reintroduce them.
 */

export type PosSaleStatusValue = "BORRADOR" | "COMPLETADA" | "ANULADA";

export const posSaleStatusValues: PosSaleStatusValue[] = [
  "BORRADOR",
  "COMPLETADA",
  "ANULADA",
];

export const posSaleStatusLabels: Record<PosSaleStatusValue, string> = {
  BORRADOR: "Borrador",
  COMPLETADA: "Completada",
  ANULADA: "Anulada",
};

/** Reused from Caja: the payment vocabulary is shared across the business. */
export type PosPaymentMethodValue =
  | "EFECTIVO"
  | "TRANSFERENCIA"
  | "CHEQUE"
  | "TARJETA";

export const posPaymentMethodValues: PosPaymentMethodValue[] = [
  "EFECTIVO",
  "TRANSFERENCIA",
  "CHEQUE",
  "TARJETA",
];

export const posPaymentMethodLabels: Record<PosPaymentMethodValue, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque",
  TARJETA: "Tarjeta",
};

export function isPosPaymentMethodValue(
  value: string,
): value is PosPaymentMethodValue {
  return (posPaymentMethodValues as string[]).includes(value);
}

// --- Arithmetic ----------------------------------------------------------

/**
 * One line: `cantidad × precio − descuento + impuesto`, floored at zero.
 *
 * The tax **adds** and the discount subtracts, the same shape the expense and
 * document formulas already use. A line whose discount exceeds its gross is
 * floored rather than negative: a negative line would mean "swap the sides",
 * which is not something a till sale expresses.
 */
export function calculatePosLineTotal(input: {
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
}): number {
  const gross = input.quantity * input.unitPrice;
  return roundPosMoney(
    Math.max(gross - (input.discount ?? 0) + (input.tax ?? 0), 0),
  );
}

/** Gross of a line before its own discount and tax. */
export function calculatePosLineSubtotal(input: {
  quantity: number;
  unitPrice: number;
}): number {
  return roundPosMoney(input.quantity * input.unitPrice);
}

export type PosSaleTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
};

/**
 * The sale's stored figures are **the sum of its lines** — every one of them.
 *
 * That is the only reading of the model that needs no extra decision. The
 * aggregate carries `discount` and so does each line; treating the header value
 * as anything other than the sum of the lines would require inventing an order
 * between two discount layers, and a header-level discount is not something this
 * patch was asked to define. If the business later wants one, it is an explicit
 * addition, not an interpretation. See `docs/POS.md`.
 */
export function calculatePosSaleTotals(
  lines: Array<{
    quantity: number;
    unitPrice: number;
    discount?: number;
    tax?: number;
  }>,
): PosSaleTotals {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  for (const line of lines) {
    subtotal += calculatePosLineSubtotal(line);
    discount += line.discount ?? 0;
    tax += line.tax ?? 0;
  }
  return {
    subtotal: roundPosMoney(subtotal),
    discount: roundPosMoney(discount),
    tax: roundPosMoney(tax),
    total: roundPosMoney(Math.max(subtotal - discount + tax, 0)),
  };
}

export function calculatePosPaidTotal(
  payments: Array<{ amount: number }>,
): number {
  return roundPosMoney(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
  );
}

/** Quantities are three-decimal and strictly positive, like Caja's. */
export function sanitizePosQuantity(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value > 999_999) return null;
  return Math.round(value * 1_000) / 1_000;
}

// --- DTOs ----------------------------------------------------------------

export type PosProductDTO = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitPrice: number;
  isActive: boolean;
};

export type PosSaleItemDTO = {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  subtotal: number;
  total: number;
  position: number;
};

export type PosPaymentDTO = {
  id: string;
  method: PosPaymentMethodValue;
  methodLabel: string;
  amount: number;
  reference: string | null;
};

export type PosSaleDTO = {
  id: string;
  /** The business identity. Database ids stay implementation details. */
  saleNumber: string;
  branchCode: string | null;
  branchName: string;
  cashierName: string;
  customerName: string | null;
  status: PosSaleStatusValue;
  statusLabel: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidTotal: number;
  /** `total − paidTotal`; negative when the till took more than the sale. */
  balance: number;
  notes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type PosSaleDetailDTO = PosSaleDTO & {
  items: PosSaleItemDTO[];
  payments: PosPaymentDTO[];
};
