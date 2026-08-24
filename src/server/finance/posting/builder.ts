import { roundFinancialMoney } from "@/server/finance/money";
import type { ResolvedPostingAccounts } from "@/server/finance/posting/mapping";
import type {
  PostingComponentValue,
  PostingJournalDraft,
  PostingLineDraft,
  PostingPlan,
} from "@/server/finance/posting/shared";

/**
 * Patch FF1.3-A — journal builder.
 *
 * Turns a resolved plan into journal lines. It is the narrowest component of the
 * engine on purpose:
 *
 * - **It never writes to the database.** It takes data and returns data;
 *   `writer.ts` is the only component allowed to persist. That separation is
 *   what makes a posting reviewable before it exists.
 * - **It knows nothing about the business.** Sales, cash, receivables,
 *   inventory, POS, billing, taxes and payroll are all absent from this file.
 *   It receives resolved accounts and amounts, and that is all it can see.
 *
 * Each component becomes exactly two lines — one debit and one credit for the
 * same amount, on the two accounts the mapping already paired. That is why an
 * entry built here is **balanced by construction**: an unbalanced entry cannot
 * originate from a validated mapping, so the balance check downstream is a
 * safety net rather than the only defence.
 *
 * Arithmetic domain: numbers, not Decimal. Every amount is bounded to
 * `Decimal(12,2)` before it arrives, so the values are exact as doubles and
 * `roundFinancialMoney` absorbs the representation epsilon — the same decision
 * TD-01 and FF1.1-B documented, so the whole financial layer computes money one
 * way instead of two.
 */

export function buildJournalDraft(
  plan: PostingPlan,
  accounts: Map<PostingComponentValue, ResolvedPostingAccounts>,
): PostingJournalDraft {
  const lines: PostingLineDraft[] = [];
  let position = 0;

  for (const component of plan.components) {
    const amount = roundFinancialMoney(component.amount);
    // A zero component is not an error: an event may legitimately carry a
    // retention of zero. It simply produces no line, because a zero-value line
    // is noise in a ledger.
    if (amount === 0) continue;

    const mapping = accounts.get(component.component);
    if (!mapping) {
      // Unreachable through the pipeline, which resolves every component before
      // building. Kept explicit so a future caller that skips the resolver
      // fails loudly instead of silently dropping money.
      throw new Error(
        `El componente ${component.component} no tiene cuentas resueltas.`,
      );
    }

    const concept = component.concept ?? null;

    lines.push({
      accountId: mapping.debitAccountId,
      accountCode: mapping.debitAccountCode,
      debit: amount,
      credit: 0,
      concept,
      position: position++,
      component: component.component,
    });
    lines.push({
      accountId: mapping.creditAccountId,
      accountCode: mapping.creditAccountCode,
      debit: 0,
      credit: amount,
      concept,
      position: position++,
      component: component.component,
    });
  }

  return {
    lines,
    debitTotal: roundFinancialMoney(
      lines.reduce((sum, line) => sum + line.debit, 0),
    ),
    creditTotal: roundFinancialMoney(
      lines.reduce((sum, line) => sum + line.credit, 0),
    ),
  };
}

/** Total monetary weight of a draft, used for the posting record. */
export function draftTotalAmount(draft: PostingJournalDraft): number {
  return draft.debitTotal;
}

/** Distinct accounts a draft touches, used by the account validator. */
export function draftAccountIds(draft: PostingJournalDraft): string[] {
  return [...new Set(draft.lines.map((line) => line.accountId))];
}

/**
 * Patch FF1.3-C — mirror of an already posted entry.
 *
 * A reversal is not planned and not mapped: it reproduces the accounting
 * dimensions of the entry it corrects with debit and credit swapped, which is
 * the 4.0S-C2 rule applied by the engine. Building it here, and not in the
 * writer, keeps the invariant of this file intact — the builder produces data
 * and never persists — so a reversal can be validated, and one day previewed,
 * before it exists.
 *
 * The mirror is exact: same accounts, same amounts, opposite sides. Nothing is
 * recomputed from a mapping, because the mapping may legitimately have changed
 * since the original was posted and a reversal must undo what happened, not
 * what would happen today.
 */
export function buildReversalDraft(
  lines: readonly {
    accountId: string;
    accountCode?: string;
    debit: number;
    credit: number;
    concept: string | null;
    position: number;
  }[],
): PostingJournalDraft {
  const mirrored: PostingLineDraft[] = lines
    .slice()
    .sort((left, right) => left.position - right.position)
    .map((line, index) => ({
      accountId: line.accountId,
      accountCode: line.accountCode ?? "",
      debit: roundFinancialMoney(line.credit),
      credit: roundFinancialMoney(line.debit),
      concept: line.concept,
      position: index,
      // A reversal has no originating component: it mirrors lines, not events.
      component: "TOTAL",
    }));

  return {
    lines: mirrored,
    debitTotal: roundFinancialMoney(
      mirrored.reduce((sum, line) => sum + line.debit, 0),
    ),
    creditTotal: roundFinancialMoney(
      mirrored.reduce((sum, line) => sum + line.credit, 0),
    ),
  };
}
