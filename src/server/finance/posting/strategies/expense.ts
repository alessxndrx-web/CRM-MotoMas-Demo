import { componentsForEvent } from "@/server/finance/account-mapping/shared";
import { PostingPayloadError } from "@/server/finance/posting/errors";
import type { PostingComponentAmount } from "@/server/finance/posting/shared";
import type { PostingStrategy } from "@/server/finance/posting/strategy";
import { roundFinancialMoney } from "@/server/finance/money";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.4-E — posting strategy for expenses (`GASTO`).
 * Patch FF2.0-A — taxed expenses, once `IMPUESTO` existed.
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
 * this strategy is not another instance of the document factory, and it is why
 * `IMPUESTO` had to be a component of its own rather than a fourth deduction.
 *
 * Each component the engine receives becomes an independent balanced
 * debit/credit pair, so the set is the subtotal plus every non-zero modifier:
 *
 * - `SUBTOTAL` recognizes the expense, at the amount the model states;
 * - `IMPUESTO` **adds** to the payable and lands the tax on its own account,
 *   which is what a creditable-tax account exists for — the expense itself is
 *   never inflated by it;
 * - each non-zero retention **reduces** the payable, which is what makes the
 *   withheld tax a liability instead of a discount;
 * - declaring `TOTAL` **as well** would recognize the same money twice.
 *
 * The set is forced by the arithmetic, not chosen: `subtotal + tax − retentions`
 * is the model's own `total`, so the payable lands exactly on it while the
 * expense stays at `subtotal` and the tax stays separable.
 *
 * A modifier worth zero is not declared: it did not move, and declaring it
 * would demand a mapping rule for a movement that never happens. An untaxed
 * expense therefore posts exactly the entry it posted before FF2.0-A, and needs
 * no `IMPUESTO` rule at all.
 *
 * ## What this strategy never does
 *
 * It chooses no account, decides no debit/credit side and touches no database.
 * Which account receives the tax — a creditable asset or a sunk cost — is
 * entirely the mapping's decision, and that is the point: neither the engine
 * nor this file knows what a tax means. The expense's own `accountId` column is
 * deliberately ignored here too; accounts come from the mapping resolver. See
 * `docs/POSTING_ENGINE.md` §16.
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
    const concept = expenseConcept(payload);
    const modifiers = [
      { component: "IMPUESTO" as const, amount: payload.tax },
      { component: "RETENCION_1" as const, amount: payload.retention1 },
      { component: "RETENCION_2" as const, amount: payload.retention2 },
    ].filter((modifier) => modifier.amount > 0);

    // Asked, never assumed — the same guard the document strategies apply, so
    // narrowing the matrix later fails loudly here instead of silently
    // dropping a movement.
    const unmappable = modifiers.filter(
      (modifier) => !allowed.has(modifier.component),
    );
    if (unmappable.length) {
      throw new PostingPayloadError(
        `El gasto ${payload.reference} tiene ${unmappable
          .map((modifier) => modifier.component)
          .join(", ")}, y el evento GASTO no admite ese componente. No se contabiliza para no perder el movimiento.`,
      );
    }

    if (payload.subtotal <= 0) {
      throw new PostingPayloadError(
        `El gasto ${payload.reference} no tiene subtotal por contabilizar.`,
      );
    }

    // `total` is floored at 0, so retentions exceeding what the expense is
    // worth — subtotal **plus tax**, since the tax is part of what is owed —
    // would post a payable the model never owed. The model permits it; the
    // ledger cannot express it.
    if (
      payload.retention1 + payload.retention2 >
      payload.subtotal + payload.tax
    ) {
      throw new PostingPayloadError(
        `El gasto ${payload.reference} tiene retenciones mayores que el subtotal más el impuesto. No se contabiliza porque el total quedaría en cero y el asiento no representaría el movimiento.`,
      );
    }

    return [
      { component: "SUBTOTAL", amount: payload.subtotal, concept },
      ...modifiers.map((modifier) => ({
        component: modifier.component,
        amount: modifier.amount,
        concept,
      })),
    ];
  },
};
