import type { PostingComponentAmount } from "@/server/finance/posting/shared";
import type { PostingStrategy } from "@/server/finance/posting/strategy";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.3-B — first executable posting strategy: comprobante de egreso.
 *
 * Why this event and not another: `COMPROBANTE_EGRESO` is the only event family
 * whose component matrix (`componentsForEvent`, FF1.0) declares **exactly one**
 * component, `TOTAL`. Every other candidate — accounting documents (five
 * components), expenses (four), payroll (two), cash invoices (nine) — forces a
 * decision about *which* components make up the entry, and that decision is a
 * business one the repository explicitly lists as pending
 * (`docs/ACCOUNTING_EVENTS.md` §13). Declaring both `SUBTOTAL` and `TOTAL`, for
 * instance, would recognize the same money twice.
 *
 * With one component there is nothing to invent: the voucher's `amount` is the
 * whole economic fact, and which accounts it debits and credits is entirely the
 * accountant's mapping.
 *
 * This file is what a strategy looks like, and what it is not allowed to be:
 *
 * - **No database access.** `plan` is synchronous and pure.
 * - **No account.** Accounts come from the mapping; policy stays in the
 *   catalogue the accountant controls, not compiled into this file.
 * - **No debit/credit decision.** The mapping carries both sides, which is why
 *   the entry the builder produces is balanced by construction.
 * - **No period, balance, eligibility or duplicate check.** Those are generic
 *   invariants and belong to the engine's validator.
 */

export type AccountingVoucherPostingPayload = {
  voucherId: string;
  voucherNumber: string;
  amount: number;
  beneficiary: string;
  concept: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The strategy's own boundary: the framework hands over an opaque payload and
 * this is the single place it is trusted. Anything malformed returns null, which
 * the dispatcher turns into `INVALID_PAYLOAD` without reaching the ledger.
 */
function parseVoucherPayload(
  payload: unknown,
): AccountingVoucherPostingPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;

  if (!isNonEmptyString(candidate.voucherId)) return null;
  if (!isNonEmptyString(candidate.voucherNumber)) return null;
  if (!isNonEmptyString(candidate.beneficiary)) return null;
  if (!isNonEmptyString(candidate.concept)) return null;

  const amount = candidate.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return {
    voucherId: candidate.voucherId,
    voucherNumber: candidate.voucherNumber,
    amount,
    beneficiary: candidate.beneficiary,
    concept: candidate.concept,
  };
}

export const accountingVoucherEgresoStrategy: PostingStrategy<AccountingVoucherPostingPayload> =
  {
    event: "COMPROBANTE_EGRESO",
    description: "Comprobante de egreso",
    parse: parseVoucherPayload,
    plan(payload): PostingComponentAmount[] {
      return [
        {
          component: "TOTAL",
          amount: payload.amount,
          // The line concept is what a reader of the ledger sees; it names the
          // voucher and its beneficiary so an entry is traceable to its source
          // without opening the posting record.
          concept: sanitizeFinancialText(
            `${payload.voucherNumber} · ${payload.beneficiary} · ${payload.concept}`,
            300,
          ),
        },
      ];
    },
  };
