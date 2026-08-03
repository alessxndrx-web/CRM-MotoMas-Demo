import { componentsForEvent } from "@/server/finance/account-mapping/shared";
import { PostingPayloadError } from "@/server/finance/posting/errors";
import type { PostingComponentAmount } from "@/server/finance/posting/shared";
import type { PostingStrategy } from "@/server/finance/posting/strategy";
import { roundFinancialMoney } from "@/server/finance/money";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.4-E — posting strategy for expenses (`GASTO`).
 *
 * ## Which components an entry declares, and why
 *
 * `calculateExpenseTotal` (src/server/contabilidad/shared.ts) is:
 *
 *     total = max(subtotal + tax − retention1 − retention2, 0)
 *
 * Note the sign of `tax`: unlike the accounting document and the cash document,
 * where every term after the subtotal is a **deduction**, an expense *adds* the
 * tax before subtracting the retentions. That difference is the whole reason
 * this strategy is not another instance of the document factory.
 *
 * Each component the engine receives becomes an independent balanced
 * debit/credit pair, so with `tax = 0` the derivation is the FF1.4-C one,
 * unchanged:
 *
 * - `SUBTOTAL` recognizes the whole gross expense;
 * - each non-zero retention reduces the payable on the account the mapping
 *   names, which is what makes the withheld tax a liability instead of a
 *   discount;
 * - declaring `TOTAL` **as well** would recognize the same money twice.
 *
 * The set is forced by the arithmetic, not chosen: `subtotal − retentions`
 * already equals `total`, so `SUBTOTAL` plus the non-zero retentions lands the
 * payable exactly on `total`. A retention worth zero is not declared: it did
 * not move, and declaring it would demand a mapping rule for a movement that
 * never happens.
 *
 * ## Why an expense carrying tax is refused
 *
 * `componentsForEvent("GASTO")` is `SUBTOTAL, RETENCION_1, RETENCION_2, TOTAL`.
 * There is no tax component — not for this event and not for any event in
 * FF1.0's matrix. So an expense with `tax > 0` has no honest expression:
 *
 * - `SUBTOTAL` alone books the payable at `subtotal`, short by the tax, and
 *   the creditable tax never reaches an account at all;
 * - adding `TOTAL` to reach the right payable double-counts the subtotal;
 * - folding the tax into `SUBTOTAL` overstates the expense by the tax, which
 *   is exactly the error a creditable-VAT account exists to prevent.
 *
 * Every available combination either loses money or states a false expense, so
 * the strategy refuses the document instead of posting a wrong entry. Adding
 * the component is an accounting decision plus a Prisma enum migration, and
 * neither belongs to this patch. See `docs/POSTING_ENGINE.md` §13.
 *
 * ## What this strategy never does
 *
 * It chooses no account, decides no debit/credit side and touches no database.
 * The expense's own `accountId` column is deliberately ignored here: accounts
 * come from the mapping resolver. See §13 for that open question too.
 */

export type ExpensePostingPayload = {
  expenseId: string;
  reference: string;
  subtotal: number;
  tax: number;
  retention1: number;
  retention2: number;
  total: number;
  supplier: string;
  concept: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readMoney(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return roundFinancialMoney(value);
}

function parseExpensePayload(payload: unknown): ExpensePostingPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;

  if (!isNonEmptyString(candidate.expenseId)) return null;
  if (!isNonEmptyString(candidate.reference)) return null;
  if (!isNonEmptyString(candidate.supplier)) return null;
  if (!isNonEmptyString(candidate.concept)) return null;

  const subtotal = readMoney(candidate.subtotal);
  const tax = readMoney(candidate.tax);
  const retention1 = readMoney(candidate.retention1);
  const retention2 = readMoney(candidate.retention2);
  const total = readMoney(candidate.total);
  if (
    subtotal === null ||
    tax === null ||
    retention1 === null ||
    retention2 === null ||
    total === null
  ) {
    return null;
  }

  return {
    expenseId: candidate.expenseId,
    reference: candidate.reference,
    subtotal,
    tax,
    retention1,
    retention2,
    total,
    supplier: candidate.supplier,
    concept: candidate.concept,
  };
}

function expenseConcept(payload: ExpensePostingPayload): string {
  return (
    sanitizeFinancialText(
      `${payload.reference} · ${payload.supplier} · ${payload.concept}`,
      300,
    ) ?? payload.reference
  );
}

const allowed = new Set(componentsForEvent("GASTO"));

export const expenseStrategy: PostingStrategy<ExpensePostingPayload> = {
  event: "GASTO",
  description: "Gasto",
  parse: parseExpensePayload,
  plan(payload): PostingComponentAmount[] {
    // The matrix carries no tax component, so a taxed expense cannot be
    // expressed without either losing the tax or overstating the expense.
    if (payload.tax > 0) {
      throw new PostingPayloadError(
        `El gasto ${payload.reference} tiene impuesto (${payload.tax}), y el evento GASTO no admite un componente de impuesto. No se contabiliza para no registrar un asiento incorrecto.`,
      );
    }

    const concept = expenseConcept(payload);
    const retentions = [
      { component: "RETENCION_1" as const, amount: payload.retention1 },
      { component: "RETENCION_2" as const, amount: payload.retention2 },
    ].filter((retention) => retention.amount > 0);

    // Asked, never assumed — the same guard the document strategies apply, so
    // narrowing the matrix later fails loudly here instead of silently
    // dropping a movement.
    const unmappable = retentions.filter(
      (retention) => !allowed.has(retention.component),
    );
    if (unmappable.length) {
      throw new PostingPayloadError(
        `El gasto ${payload.reference} tiene ${unmappable
          .map((retention) => retention.component)
          .join(", ")}, y el evento GASTO no admite ese componente. No se contabiliza para no perder el movimiento.`,
      );
    }

    if (payload.subtotal <= 0) {
      throw new PostingPayloadError(
        `El gasto ${payload.reference} no tiene subtotal por contabilizar.`,
      );
    }

    // `total` is floored at 0, so retentions exceeding the subtotal would post
    // a payable the model never owed. The model permits it; the ledger cannot
    // express it.
    if (payload.retention1 + payload.retention2 > payload.subtotal) {
      throw new PostingPayloadError(
        `El gasto ${payload.reference} tiene retenciones mayores que el subtotal. No se contabiliza porque el total quedaría en cero y el asiento no representaría el movimiento.`,
      );
    }

    return [
      { component: "SUBTOTAL", amount: payload.subtotal, concept },
      ...retentions.map((retention) => ({
        component: retention.component,
        amount: retention.amount,
        concept,
      })),
    ];
  },
};
