import { componentsForEvent } from "@/server/finance/account-mapping/shared";
import { roundFinancialMoney } from "@/server/finance/money";
import { PostingPayloadError } from "@/server/finance/posting/errors";
import type {
  PostingComponentAmount,
  PostingComponentValue,
  PostingEventValue,
} from "@/server/finance/posting/shared";
import type { PostingStrategy } from "@/server/finance/posting/strategy";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.4-D — posting strategies for cash documents.
 *
 * ## Which components an entry declares
 *
 * The rule is the FF1.4-C derivation extended with the collection side, and it
 * is forced by the model's own arithmetic. `calculateCashDocumentTotal` is:
 *
 *     total = max(subtotal − appliedPayment − retention1 − retention2, 0)
 *
 * so `subtotal` is the gross fact and `total` the residual left to collect.
 * Because every component becomes an independent balanced pair:
 *
 * - `SUBTOTAL` recognizes the gross movement;
 * - each non-zero deduction reduces it;
 * - each non-zero `PAGO_*` records money actually received, by method;
 * - `TOTAL` is never declared alongside them — it would recognize the same
 *   money a second time.
 *
 * What remains uncollected simply stays on the receivable account the mapping
 * names, with no component of its own. A partially paid invoice is therefore
 * fully expressible without a single extra rule.
 *
 * ## The cash receipt is genuinely ambiguous, and this file does not hide it
 *
 * `componentsForEvent("CAJA_RECIBO")` allows **both** `TOTAL` and the `PAGO_*`
 * family. For a receipt those are the same money — declaring both double-counts
 * it — so at most one interpretation can be posted:
 *
 * - **`PAGO_*` (implemented).** Splits the collection by method, so cash and
 *   bank land on different accounts. When the payments cover the total exactly,
 *   it moves the same amount `TOTAL` would and carries strictly more
 *   information, which is why it is the one implemented.
 * - **`TOTAL` (not implemented).** One pair for the whole receipt, losing the
 *   method. Legitimate if the company does not want per-method accounts.
 *
 * The choice is written down rather than silent, and it is **not settled**: it
 * needs the accountant. Where the derivation does not hold — a receipt whose
 * payments do not add up to its total — the strategy refuses instead of picking
 * an interpretation. See `docs/POSTING_ENGINE.md` §12.
 *
 * ## What this strategy never does
 *
 * It chooses no account, decides no debit/credit side and touches no database.
 */

export type CashDocumentPaymentTotals = {
  EFECTIVO: number;
  TRANSFERENCIA: number;
  CHEQUE: number;
  TARJETA: number;
};

export type CashDocumentPostingPayload = {
  documentId: string;
  documentNumber: string;
  subtotal: number;
  retention1: number;
  retention2: number;
  appliedPayment: number;
  total: number;
  thirdPartyName: string;
  concept: string;
  payments: CashDocumentPaymentTotals;
};

const PAYMENT_COMPONENT: Record<
  keyof CashDocumentPaymentTotals,
  PostingComponentValue
> = {
  EFECTIVO: "PAGO_EFECTIVO",
  TRANSFERENCIA: "PAGO_TRANSFERENCIA",
  CHEQUE: "PAGO_CHEQUE",
  TARJETA: "PAGO_TARJETA",
};

const PAYMENT_METHODS = Object.keys(
  PAYMENT_COMPONENT,
) as Array<keyof CashDocumentPaymentTotals>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readMoney(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return roundFinancialMoney(value);
}

function readPayments(value: unknown): CashDocumentPaymentTotals | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const totals: Partial<CashDocumentPaymentTotals> = {};
  for (const method of PAYMENT_METHODS) {
    const amount = readMoney(candidate[method] ?? 0);
    if (amount === null) return null;
    totals[method] = amount;
  }
  return totals as CashDocumentPaymentTotals;
}

function parseCashDocumentPayload(
  payload: unknown,
): CashDocumentPostingPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;

  if (!isNonEmptyString(candidate.documentId)) return null;
  if (!isNonEmptyString(candidate.documentNumber)) return null;
  if (!isNonEmptyString(candidate.thirdPartyName)) return null;
  if (!isNonEmptyString(candidate.concept)) return null;

  const subtotal = readMoney(candidate.subtotal);
  const retention1 = readMoney(candidate.retention1);
  const retention2 = readMoney(candidate.retention2);
  const appliedPayment = readMoney(candidate.appliedPayment);
  const total = readMoney(candidate.total);
  const payments = readPayments(candidate.payments);
  if (
    subtotal === null ||
    retention1 === null ||
    retention2 === null ||
    appliedPayment === null ||
    total === null ||
    payments === null
  ) {
    return null;
  }

  return {
    documentId: candidate.documentId,
    documentNumber: candidate.documentNumber,
    subtotal,
    retention1,
    retention2,
    appliedPayment,
    total,
    thirdPartyName: candidate.thirdPartyName,
    concept: candidate.concept,
    payments,
  };
}

function cashConcept(payload: CashDocumentPostingPayload): string {
  return (
    sanitizeFinancialText(
      `${payload.documentNumber} · ${payload.thirdPartyName} · ${payload.concept}`,
      300,
    ) ?? payload.documentNumber
  );
}

function paymentComponents(
  payload: CashDocumentPostingPayload,
  concept: string,
): PostingComponentAmount[] {
  return PAYMENT_METHODS.filter(
    (method) => payload.payments[method] > 0,
  ).map((method) => ({
    component: PAYMENT_COMPONENT[method],
    amount: payload.payments[method],
    concept,
  }));
}

function paidTotal(payload: CashDocumentPostingPayload): number {
  return roundFinancialMoney(
    PAYMENT_METHODS.reduce((sum, method) => sum + payload.payments[method], 0),
  );
}

function createCashDocumentStrategy(
  event: PostingEventValue,
  description: string,
): PostingStrategy<CashDocumentPostingPayload> {
  const allowed = new Set(componentsForEvent(event));
  const allowsGross = allowed.has("SUBTOTAL");
  const allowsPayments = allowed.has("PAGO_EFECTIVO");

  return {
    event,
    description,
    parse: parseCashDocumentPayload,
    plan(payload): PostingComponentAmount[] {
      const concept = cashConcept(payload);
      const deductions = [
        { component: "RETENCION_1" as const, amount: payload.retention1 },
        { component: "RETENCION_2" as const, amount: payload.retention2 },
        { component: "ABONO_APLICADO" as const, amount: payload.appliedPayment },
      ].filter((deduction) => deduction.amount > 0);

      const unmappable = deductions.filter(
        (deduction) => !allowed.has(deduction.component),
      );
      if (unmappable.length) {
        throw new PostingPayloadError(
          `El documento ${payload.documentNumber} tiene ${unmappable
            .map((deduction) => deduction.component)
            .join(", ")}, y el evento ${event} no admite ese componente. No se contabiliza para no perder el movimiento.`,
        );
      }

      const payments = allowsPayments ? paymentComponents(payload, concept) : [];

      // Notes and any event without a gross component: the receipt case.
      if (!allowsGross) {
        const collected = paidTotal(payload);
        if (!payments.length || collected !== payload.total) {
          throw new PostingPayloadError(
            `El recibo ${payload.documentNumber} tiene cobros por ${collected.toFixed(2)} y un total de ${payload.total.toFixed(2)}. Solo se contabiliza un recibo cuyos cobros cubran exactamente su total; con una diferencia, el componente que representaría el saldo es una decisión contable pendiente.`,
          );
        }
        return payments;
      }

      if (payload.subtotal <= 0) {
        throw new PostingPayloadError(
          `El documento ${payload.documentNumber} no tiene subtotal por contabilizar.`,
        );
      }

      return [
        { component: "SUBTOTAL", amount: payload.subtotal, concept },
        ...deductions.map((deduction) => ({
          component: deduction.component,
          amount: deduction.amount,
          concept,
        })),
        ...payments,
      ];
    },
  };
}

export const cashInvoiceStrategy = createCashDocumentStrategy(
  "CAJA_FACTURA",
  "Factura de caja",
);

export const cashReceiptStrategy = createCashDocumentStrategy(
  "CAJA_RECIBO",
  "Recibo de caja",
);

export const cashDebitNoteStrategy = createCashDocumentStrategy(
  "CAJA_NOTA_DEBITO",
  "Nota de débito de caja",
);

export const cashCreditNoteStrategy = createCashDocumentStrategy(
  "CAJA_NOTA_CREDITO",
  "Nota de crédito de caja",
);
