import type { Prisma } from "@prisma/client";

import {
  buildCashPaymentBreakdown,
  type CashPaymentBreakdown,
  type CashPaymentMethodValue,
} from "@/server/caja/shared";
import { decimalToNumber } from "@/server/finance/money";

/**
 * Patch FF1.1-B — the one place that reads what a shift *should* hold.
 *
 * `createCashClosingAction` and `closeCashSessionAction` both used to build
 * these totals inline, with slightly different code, and both derived the
 * expectation from invoiced documents rather than from registered collections.
 * They now share this collector, so the arqueo cannot drift between the moment
 * it is prepared and the moment it is closed.
 *
 * Everything is read through the caller's transaction client: the totals must
 * see exactly the rows the closing is being written against, not a snapshot
 * taken outside the transaction.
 */

export type CashClosingDb = Pick<
  Prisma.TransactionClient,
  "cashPayment" | "cashDocument"
>;

export type CashClosingInputs = {
  /** Expected per method: payments registered against ISSUED documents. */
  expected: CashPaymentBreakdown;
  /** Informational: total invoiced in the shift (issued FACTURA documents). */
  invoicedTotal: number;
  /** Informational: retentions withheld across the shift's issued documents. */
  retentionTotal: number;
};

/**
 * Only ISSUED documents count. A draft is not a fact — its payments are still
 * being edited — and an annulled document's collection did not happen. Filtering
 * by document status covers both without a rule per document type: notes cannot
 * carry payments, so they contribute zero by construction.
 */
const ISSUED_DOCUMENT = { status: "EMITIDO" } as const;

export async function collectCashClosingInputs(
  db: CashClosingDb,
  cashSessionId: string,
): Promise<CashClosingInputs> {
  const [paymentGroups, invoiceTotal, retentionTotals] = await Promise.all([
    db.cashPayment.groupBy({
      by: ["method"],
      where: { cashSessionId, document: { is: ISSUED_DOCUMENT } },
      _sum: { amount: true },
    }),
    db.cashDocument.aggregate({
      where: { cashSessionId, ...ISSUED_DOCUMENT, type: "FACTURA" },
      _sum: { total: true },
    }),
    db.cashDocument.aggregate({
      where: { cashSessionId, ...ISSUED_DOCUMENT },
      _sum: { retention1: true, retention2: true },
    }),
  ]);

  return {
    expected: buildCashPaymentBreakdown(
      paymentGroups.map((group) => ({
        method: group.method as CashPaymentMethodValue,
        amount: decimalToNumber(group._sum.amount),
      })),
    ),
    invoicedTotal: decimalToNumber(invoiceTotal._sum.total),
    retentionTotal:
      decimalToNumber(retentionTotals._sum.retention1) +
      decimalToNumber(retentionTotals._sum.retention2),
  };
}
