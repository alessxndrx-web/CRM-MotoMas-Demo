import type { Prisma } from "@prisma/client";

import { postingStateSelect } from "@/server/finance/chart-of-accounts/repository";
import { describeChartAccountPostingBlock } from "@/server/finance/chart-of-accounts/shared";
import { sanitizeFinancialMoney } from "@/server/finance/money";
import { assertAccountingDateIsOpen } from "@/server/finance/periods";
import { draftAccountIds } from "@/server/finance/posting/builder";
import {
  PostingAccountError,
  PostingDuplicateError,
  PostingPeriodClosedError,
  PostingRequestError,
  PostingUnbalancedError,
} from "@/server/finance/posting/errors";
import type {
  PostingJournalDraft,
  PostingPlan,
  PostingRequest,
} from "@/server/finance/posting/shared";

/**
 * Patch FF1.3-A — posting validator.
 *
 * **Generic invariants only.** Everything here is true of every accounting
 * event that will ever exist: an entry balances, its accounts may receive
 * movements, its period is open, and the same event is not posted twice.
 *
 * There is deliberately no business-specific validation in this file — no
 * "an invoice must have items", no "a closing must have a counted amount". Those
 * belong to the module that owns the event and, where they concern the shape of
 * the payload, to that event's strategy. Mixing them here is how a validator
 * turns into the `switch` this architecture exists to avoid.
 *
 * Every check reads current state through the caller's transaction client, so a
 * stale read can never authorize a posting.
 */

export type PostingValidatorDb = Pick<
  Prisma.TransactionClient,
  "chartAccount" | "accountingClosing" | "postingRecord"
>;

// --- Request-level -------------------------------------------------------

/** The request is well formed before any strategy or database is consulted. */
export function validatePostingRequest(request: PostingRequest): void {
  if (!request.source?.id?.trim()) {
    throw new PostingRequestError(
      "El evento contable necesita un documento de origen identificable.",
    );
  }
  if (
    !(request.accountingDate instanceof Date) ||
    Number.isNaN(request.accountingDate.getTime())
  ) {
    throw new PostingRequestError("La fecha contable del evento no es válida.");
  }
}

/**
 * The plan a strategy produced is usable: it moves money, and every amount is a
 * valid, non-negative figure inside the schema's monetary bounds.
 *
 * Signed amounts are rejected on purpose. A negative component would mean "swap
 * the sides", which is a decision the *mapping* owns; letting a strategy express
 * it here would put accounting policy back into code.
 */
export function validatePostingPlan(plan: PostingPlan): void {
  if (!plan.components.length) {
    throw new PostingRequestError(
      `El evento ${plan.event} no declaró ningún componente monetario.`,
    );
  }

  let total = 0;
  for (const component of plan.components) {
    const amount = sanitizeFinancialMoney(component.amount);
    if (amount === null) {
      throw new PostingRequestError(
        `El monto del componente ${component.component} no es válido.`,
      );
    }
    total += amount;
  }

  if (total <= 0) {
    throw new PostingRequestError(
      `El evento ${plan.event} no mueve ningún monto y no debe contabilizarse.`,
    );
  }
}

// --- Journal-level -------------------------------------------------------

/**
 * Structural invariants of the entry itself. The builder makes these true by
 * construction; checking them anyway is what turns "we believe it balances" into
 * "it cannot be written unless it balances".
 */
export function validateJournalDraft(draft: PostingJournalDraft): void {
  if (draft.lines.length < 2) {
    throw new PostingRequestError(
      "El asiento generado necesita al menos dos líneas.",
    );
  }

  for (const line of draft.lines) {
    if (line.debit > 0 && line.credit > 0) {
      throw new PostingRequestError(
        "Una línea no puede tener debe y haber a la vez.",
      );
    }
    if (line.debit === 0 && line.credit === 0) {
      throw new PostingRequestError("Una línea no puede quedar en cero.");
    }
    if (line.debit < 0 || line.credit < 0) {
      throw new PostingRequestError("Una línea no admite montos negativos.");
    }
  }

  if (draft.debitTotal !== draft.creditTotal) {
    throw new PostingUnbalancedError(draft.debitTotal, draft.creditTotal);
  }
}

// --- State-level ---------------------------------------------------------

/**
 * The accounting period of the movement is open for its branch scope.
 *
 * Reuses the 4.0S-C1 rule verbatim through `finance/periods`; the posting engine
 * gets no exception, and neither does Admin.
 */
export async function assertPostingPeriodOpen(
  db: PostingValidatorDb,
  accountingDate: Date,
  branchId: string | null,
): Promise<void> {
  const period = await assertAccountingDateIsOpen(
    db,
    accountingDate,
    branchId,
  );
  if (!period.ok) throw new PostingPeriodClosedError(period.error);
}

/**
 * Every account the draft touches may receive a movement on the accounting date.
 *
 * Reuses `describeChartAccountPostingBlock` (FF1.1-A) — the one rule that also
 * governs manual journal lines and mapping rules — so an account inactive,
 * archived, of grouping type, outside its effective window or a template pending
 * approval is refused here for the same reason and with the same message.
 */
export async function assertPostingAccountsUsable(
  db: PostingValidatorDb,
  draft: PostingJournalDraft,
  at: Date,
): Promise<void> {
  const accountIds = draftAccountIds(draft);
  if (!accountIds.length) return;

  const accounts = await db.chartAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, ...postingStateSelect },
  });

  const byId = new Map(accounts.map((account) => [account.id, account]));
  for (const accountId of accountIds) {
    const account = byId.get(accountId);
    if (!account) {
      throw new PostingAccountError(
        "El mapeo contable referencia una cuenta que ya no existe.",
      );
    }
    const blocked = describeChartAccountPostingBlock(account, at);
    if (blocked) throw new PostingAccountError(blocked);
  }
}

/**
 * The event has not been posted before.
 *
 * Internal: the pipeline reads the record directly. Callers that need "was this
 * event posted?" use `listPostings` with a source filter.
 *
 * The read is advisory: the authoritative guarantee is the unique index on
 * `posting_records.idempotency_key`, which is what actually stops two concurrent
 * postings of the same event. This check exists so the common case returns a
 * clean business answer instead of a constraint violation.
 */
async function findExistingPosting(
  db: PostingValidatorDb,
  idempotencyKey: string,
): Promise<{ id: string; journalEntryId: string; status: string } | null> {
  const record = await db.postingRecord.findUnique({
    where: { activeIdempotencyKey: idempotencyKey },
    select: { id: true, journalEntryId: true, status: true },
  });
  return record;
}

/** Strict variant: refuses instead of converging on the existing posting. */
export async function assertNotAlreadyPosted(
  db: PostingValidatorDb,
  idempotencyKey: string,
): Promise<void> {
  const existing = await findExistingPosting(db, idempotencyKey);
  if (existing && existing.status === "CONTABILIZADO") {
    throw new PostingDuplicateError(idempotencyKey);
  }
}

/**
 * Patch FF1.3-C — account rule for a reversal.
 *
 * A reversal must reproduce the historical dimensions of the entry it corrects,
 * so it may reuse an account that was deactivated, archived or retired after the
 * original was posted. Otherwise deactivating an account would permanently
 * strand its posted entries with no legal correction path — the same exception
 * 4.0S-C2 defines for manual reversals.
 *
 * The account must still **exist**: a missing account means the source data is
 * broken, not historical. This is existence, not policy, which is why it does
 * not go through `describeChartAccountPostingBlock`.
 */
export async function assertReversalAccountsExist(
  db: PostingValidatorDb,
  draft: PostingJournalDraft,
): Promise<void> {
  const accountIds = draftAccountIds(draft);
  if (!accountIds.length) return;

  const found = await db.chartAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true },
  });
  if (found.length !== accountIds.length) {
    throw new PostingAccountError(
      "El asiento original referencia una cuenta que ya no existe y no puede revertirse.",
    );
  }
}
