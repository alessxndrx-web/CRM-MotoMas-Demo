import type { Prisma } from "@prisma/client";

import { ACCOUNT_NOT_FOUND_ERROR } from "@/server/finance/errors";
import { postingStateSelect } from "@/server/finance/chart-of-accounts/repository";
import { describeChartAccountPostingBlock } from "@/server/finance/chart-of-accounts/shared";

/**
 * Patch 4.0S-C1 — server-side financial invariants for Contabilidad.
 *
 * Pure guard helpers shared by the Contabilidad server actions. They always
 * read the current database state through the caller's transaction client, so
 * a forged or stale client request can never satisfy them, and no role —
 * including Admin — receives a bypass: the guards take no actor at all.
 *
 * The period semantics are documented once, next to the implementation, in
 * `@/server/finance/periods`.
 */

/**
 * Patch FF1.3-A: the accounting period lock moved down to
 * `@/server/finance/periods` so the posting engine can enforce it without
 * `finance` importing `contabilidad`, which the dependency rule forbids. The
 * rule is unchanged and these names keep working, so no call site changed and
 * there is still exactly one implementation.
 */
export {
  INVALID_ACCOUNTING_DATE_ERROR,
  PERIOD_CLOSED_ERROR,
  accountingPeriodOf,
  assertAccountingDateIsOpen,
  findBlockingAccountingClosing,
  isAccountingPeriodClosed,
} from "@/server/finance/periods";

export type ContabilidadGuardResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * A journal line may only reference a chart account that exists and may
 * currently receive a movement. Existence and eligibility come from the current
 * database row, never from a client label.
 *
 * Patch FF1.1 widened "active" to the full posting rule now that the catalogue
 * can express it: an archived account, a grouping header, an account outside
 * its effective window and an unapproved template account are all refused, each
 * with its own message. Before FF1.1 only `isActive` existed, so a total
 * account was a perfectly valid target for a journal line.
 *
 * `at` is the date the movement claims — the entry date, not the wall clock —
 * so an account's effective window is judged against the movement it must
 * cover.
 */
export async function assertChartAccountUsable(
  tx: Pick<Prisma.TransactionClient, "chartAccount">,
  accountId: string | null | undefined,
  at: Date = new Date(),
): Promise<ContabilidadGuardResult> {
  if (!accountId || typeof accountId !== "string") {
    return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
  }
  const account = await tx.chartAccount.findUnique({
    where: { id: accountId },
    select: postingStateSelect,
  });
  if (!account) return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };

  const blocked = describeChartAccountPostingBlock(account, at);
  return blocked ? { ok: false, error: blocked } : { ok: true };
}

/**
 * Reversal-only account rule (Patch 4.0S-C2). A reversal must reproduce the
 * historical accounting dimensions of the entry it corrects, so it may reuse an
 * account that was deactivated after the original was posted — otherwise
 * deactivating an account would permanently strand its posted entries with no
 * legal correction path. The account must still exist: a missing account means
 * the source data is broken, not historical.
 *
 * This exception is deliberately narrow. It applies only to lines copied from an
 * already-posted entry inside `reverseJournalEntryAction`; ordinary manual lines
 * keep the strict {@link assertChartAccountUsable} rule, and posting keeps the
 * strict {@link validateJournalEntryAccounts} revalidation.
 */
export async function assertReversalAccountExists(
  tx: Pick<Prisma.TransactionClient, "chartAccount">,
  accountId: string | null | undefined,
): Promise<ContabilidadGuardResult> {
  if (!accountId || typeof accountId !== "string") {
    return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
  }
  const account = await tx.chartAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });
  return account ? { ok: true } : { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
}

/**
 * Posting-time revalidation of every current line of an entry. This closes the
 * gap where an account was eligible when the draft line was written and stopped
 * being so afterwards — deactivated, archived, turned into a grouping header or
 * past its effective window: the stale draft cannot post until corrected.
 */
export async function validateJournalEntryAccounts(
  tx: Pick<Prisma.TransactionClient, "journalEntryLine">,
  entryId: string,
  at: Date = new Date(),
): Promise<ContabilidadGuardResult> {
  const lines = await tx.journalEntryLine.findMany({
    where: { entryId },
    select: { account: { select: postingStateSelect } },
  });
  for (const line of lines) {
    if (!line.account) return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
    const blocked = describeChartAccountPostingBlock(line.account, at);
    if (blocked) {
      return {
        ok: false,
        error: `${blocked} Corrige las líneas del asiento antes de contabilizar.`,
      };
    }
  }
  return { ok: true };
}
