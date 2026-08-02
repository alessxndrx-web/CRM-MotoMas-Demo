import { decimalToNumber } from "@/server/finance/money";
import {
  buildJournalDraft,
  buildReversalDraft,
} from "@/server/finance/posting/builder";
import { dispatchPosting } from "@/server/finance/posting/dispatcher";
import {
  createAccountMappingResolver,
  resolvePostingAccounts,
  type AccountMappingResolverPort,
} from "@/server/finance/posting/mapping";
import {
  findActivePostingByKey,
  findJournalEntryWithLines,
  findPostingRecordById,
  type PostingDb,
} from "@/server/finance/posting/repository";
import {
  postingRegistry,
  type PostingRegistry,
} from "@/server/finance/posting/registry";
import {
  postingIdempotencyKey,
  type PostingRequest,
  type PostingResult,
} from "@/server/finance/posting/shared";
import { PostingRequestError } from "@/server/finance/posting/errors";
import {
  assertNotAlreadyPosted,
  assertPostingAccountsUsable,
  assertReversalAccountsExist,
  assertPostingPeriodOpen,
  validateJournalDraft,
  validatePostingPlan,
  validatePostingRequest,
  type PostingValidatorDb,
} from "@/server/finance/posting/validator";
import {
  writePosting,
  writePostingReversal,
} from "@/server/finance/posting/writer";
import { sanitizeFinancialText } from "@/server/finance/text";
import type { FinancialTransactionContext } from "@/server/finance/transaction";

/**
 * Patch FF1.3-A — the posting pipeline.
 *
 * The only file that knows the order of the stages, and it knows nothing else.
 * It contains no accounting rule of its own: every decision it takes is
 * delegated to the component that owns it.
 *
 * ```txt
 *   Business event
 *        │  validatePostingRequest         (shape)
 *        ▼
 *   Dispatcher ──► Strategy                (which components, how much)
 *        │  validatePostingPlan            (amounts are real money)
 *        ▼
 *   Mapping resolver                       (components → accounts)
 *        ▼
 *   Builder                                (accounts + amounts → lines)
 *        │  validateJournalDraft           (balanced, well formed)
 *        ▼
 *   State validators                       (period open, accounts postable,
 *        │                                  not already posted)
 *        ▼
 *   Writer ──► journal entry + posting record + audit
 * ```
 *
 * **Idempotency comes first and last.** The pipeline looks for an existing
 * posting before doing any work, and the unique index on the posting record
 * decides the race if two requests get past that read simultaneously. The reads
 * are a courtesy; the constraint is the guarantee.
 *
 * The whole pipeline runs inside the caller's financial transaction, so a
 * rejected rule leaves no entry, no record and no audit trace of a posting that
 * did not happen.
 */

export type PostingPipelineOptions = {
  /** Overridable for tests; defaults to the module registry. */
  registry?: PostingRegistry;
  /** Overridable for tests; defaults to the FF1.0 mapping adapter. */
  resolver?: AccountMappingResolverPort;
  /**
   * When true, an already-posted event is an error instead of converging on the
   * existing result. Off by default: a caller retrying after a timeout must be
   * able to reach the same answer twice.
   */
  strictDuplicates?: boolean;
  /** Populated only when the source event is an accounting document. */
  accountingDocumentId?: string | null;
};

export async function runPostingPipeline(
  ctx: FinancialTransactionContext,
  request: PostingRequest,
  options: PostingPipelineOptions = {},
): Promise<PostingResult> {
  const db: PostingDb & PostingValidatorDb = ctx.tx;
  const idempotencyKey = postingIdempotencyKey(request);

  // 1. Shape of the request, before any strategy or query.
  validatePostingRequest(request);

  // 2. Already posted? Converge instead of duplicating the ledger.
  if (options.strictDuplicates) {
    await assertNotAlreadyPosted(db, idempotencyKey);
  } else {
    const record = await findActivePostingByKey(db, idempotencyKey);
    if (record && record.status === "CONTABILIZADO") {
      // The entry is read, not assumed: the posting record holds a unique FK to
      // it, so a missing entry means the ledger was corrupted outside the
      // engine and must fail loudly rather than return an empty number.
      const entry = await db.journalEntry.findUnique({
        where: { id: record.journalEntryId },
        select: { entryNumber: true },
      });
      if (!entry) {
        throw new PostingRequestError(
          "La contabilización previa de este evento apunta a un asiento inexistente.",
        );
      }
      return {
        postingRecordId: record.id,
        journalEntryId: record.journalEntryId,
        entryNumber: entry.entryNumber,
        event: request.event,
        idempotencyKey,
        lineCount: record.lineCount,
        totalAmount: decimalToNumber(record.totalAmount),
        alreadyPosted: true,
      };
    }
  }

  // 3. The strategy declares what moved and for how much.
  const plan = dispatchPosting(request, options.registry ?? postingRegistry);
  validatePostingPlan(plan);

  // 4. Components become accounts. A missing mapping stops everything.
  const resolver = options.resolver ?? createAccountMappingResolver(ctx.tx);
  const accounts = await resolvePostingAccounts(resolver, {
    event: plan.event,
    components: plan.components.map((component) => component.component),
    branchId: request.branchId,
    at: request.accountingDate,
  });

  // 5. Accounts and amounts become lines. Nothing is written yet.
  const draft = buildJournalDraft(plan, accounts);
  validateJournalDraft(draft);

  // 6. State the draft depends on, read inside this transaction.
  await assertPostingPeriodOpen(db, request.accountingDate, request.branchId);
  await assertPostingAccountsUsable(db, draft, request.accountingDate);

  // 7. The only write.
  return writePosting(ctx, {
    request,
    draft,
    idempotencyKey,
    accountingDocumentId: options.accountingDocumentId ?? null,
  });
}

/**
 * Everything except the write: the same pipeline, stopped before persisting.
 *
 * This is what a "preview the entry before posting" screen will consume, and it
 * is free precisely because the builder never writes. It still runs inside a
 * transaction because the mapping, the period and the accounts must be read
 * consistently — a preview built from a different snapshot than the posting
 * would be a lie.
 */
export async function previewPosting(
  ctx: FinancialTransactionContext,
  request: PostingRequest,
  options: PostingPipelineOptions = {},
) {
  const db: PostingDb & PostingValidatorDb = ctx.tx;

  validatePostingRequest(request);
  const plan = dispatchPosting(request, options.registry ?? postingRegistry);
  validatePostingPlan(plan);

  const resolver = options.resolver ?? createAccountMappingResolver(ctx.tx);
  const accounts = await resolvePostingAccounts(resolver, {
    event: plan.event,
    components: plan.components.map((component) => component.component),
    branchId: request.branchId,
    at: request.accountingDate,
  });

  const draft = buildJournalDraft(plan, accounts);
  validateJournalDraft(draft);
  await assertPostingPeriodOpen(db, request.accountingDate, request.branchId);
  await assertPostingAccountsUsable(db, draft, request.accountingDate);

  return {
    idempotencyKey: postingIdempotencyKey(request),
    plan,
    draft,
  };
}

// --- Reversal pipeline ---------------------------------------------------

export type PostingReversalRequest = {
  postingRecordId: string;
  reason: string;
  /**
   * Date the reversal claims. Defaults to now, and the period lock is judged
   * against **it**, not against the original — an entry from a closed month
   * stays correctable in the current open period, exactly as 4.0S-C2 defines.
   */
  reversalDate?: Date;
};

export type PostingReversalResult = {
  postingRecordId: string;
  originalJournalEntryId: string;
  originalEntryNumber: string;
  reversalJournalEntryId: string;
  reversalEntryNumber: string;
  lineCount: number;
  totalAmount: number;
  alreadyReversed: boolean;
};

/**
 * Patch FF1.3-C — the reversal pipeline.
 *
 * Deliberately a **second, shorter pipeline** in the same module rather than a
 * detour through `runPostingPipeline`: a reversal has no strategy to dispatch
 * and no mapping to resolve, because it mirrors what was posted instead of
 * recomputing what would be posted today. Forcing it through the posting
 * pipeline would mean inventing a fake strategy and a fake plan — more
 * machinery, less truth.
 *
 * Every stage it does have is the same component the posting path uses: the
 * builder produces the mirrored draft, `validateJournalDraft` checks it, the
 * period validator applies 4.0S-C1 and the writer is still the only thing that
 * persists.
 *
 * ```txt
 *   Posting record
 *        │  exists, is CONTABILIZADO, reason given
 *        ▼
 *   Original entry + lines            (read, never written)
 *        ▼
 *   Builder ──► mirrored draft        (debit ⇄ credit)
 *        │  validateJournalDraft
 *        ▼
 *   State validators                  (period open on the reversal date,
 *        │                             accounts still exist)
 *        ▼
 *   Writer ──► reversing entry + record flip + audit
 * ```
 */
export async function runReversalPipeline(
  ctx: FinancialTransactionContext,
  request: PostingReversalRequest,
): Promise<PostingReversalResult> {
  const db: PostingDb & PostingValidatorDb = ctx.tx;

  const reason = sanitizeFinancialText(request.reason, 500);
  if (!reason) {
    throw new PostingRequestError("Indica el motivo de la reversión.");
  }

  const record = await findPostingRecordById(db, request.postingRecordId);
  if (!record) {
    throw new PostingRequestError("La contabilización no existe.");
  }

  const original = await findJournalEntryWithLines(db, record.journalEntryId);
  if (!original) {
    throw new PostingRequestError(
      "El asiento de la contabilización no existe y no puede revertirse.",
    );
  }

  // Double reversal is refused here with a business message; the unique
  // `reversalOfId` on the journal entry is what actually decides a race.
  if (record.status !== "CONTABILIZADO") {
    return {
      postingRecordId: record.id,
      originalJournalEntryId: original.id,
      originalEntryNumber: original.entryNumber,
      reversalJournalEntryId: "",
      reversalEntryNumber: "",
      lineCount: 0,
      totalAmount: 0,
      alreadyReversed: true,
    };
  }

  const reversalDate = request.reversalDate ?? new Date();
  if (Number.isNaN(reversalDate.getTime())) {
    throw new PostingRequestError("La fecha de reversión no es válida.");
  }

  const draft = buildReversalDraft(
    original.lines.map((line) => ({
      accountId: line.accountId,
      debit: decimalToNumber(line.debit),
      credit: decimalToNumber(line.credit),
      concept: line.concept,
      position: line.position,
    })),
  );
  validateJournalDraft(draft);

  await assertPostingPeriodOpen(db, reversalDate, original.branchId);
  // Historical accounts are allowed: see `assertReversalAccountsExist`.
  await assertReversalAccountsExist(db, draft);

  const written = await writePostingReversal(ctx, {
    record: {
      id: record.id,
      idempotencyKey: record.idempotencyKey,
      branchId: record.branchId,
      event: record.event,
      accountingDate: record.accountingDate,
    },
    original: {
      id: original.id,
      entryNumber: original.entryNumber,
      branchId: original.branchId,
    },
    draft,
    reversalDate,
    reason,
  });

  return {
    postingRecordId: record.id,
    originalJournalEntryId: original.id,
    originalEntryNumber: original.entryNumber,
    reversalJournalEntryId: written.reversalEntryId,
    reversalEntryNumber: written.reversalEntryNumber,
    lineCount: draft.lines.length,
    totalAmount: draft.debitTotal,
    alreadyReversed: false,
  };
}
