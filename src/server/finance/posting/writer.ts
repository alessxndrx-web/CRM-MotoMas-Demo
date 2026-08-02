import { Prisma } from "@prisma/client";

import { draftTotalAmount } from "@/server/finance/posting/builder";
import {
  createPostedJournalEntry,
  createPostingRecord,
  updatePostingRecord,
  type PostingDb,
} from "@/server/finance/posting/repository";
import type {
  PostingJournalDraft,
  PostingRequest,
  PostingResult,
} from "@/server/finance/posting/shared";
import { sanitizeFinancialText } from "@/server/finance/text";
import type { FinancialTransactionContext } from "@/server/finance/transaction";

/**
 * Patch FF1.3-A — posting writer.
 *
 * **The only component of the engine allowed to persist.** The dispatcher, the
 * builder and the validators are all readonly by construction, which is what
 * makes a posting fully reviewable before anything exists in the ledger.
 *
 * It writes three things, in one transaction, in this order:
 *
 * 1. the journal entry, already `CONTABILIZADO` with its lines;
 * 2. the posting record, whose unique `idempotencyKey` is what actually
 *    prevents the same event from being posted twice — a check in application
 *    code cannot survive two concurrent requests, a unique index can;
 * 3. the audit event, through the same transaction client, so history and
 *    change commit or roll back together.
 *
 * The entry is never written as a draft. An event either posts completely or
 * does not post, so no half-finished entry can be left for someone to discover.
 */

/**
 * Entry number.
 *
 * TODO(FF1.0-numbering): the sequential `DocumentSequence` service exists and is
 * what this should consume, but adopting it requires a configured series per
 * branch and fiscal year, and an unconfigured series fails closed by design —
 * which would make the engine unable to post on a fresh installation. It stays
 * on the project's existing prefix+date+random shape until numbering is wired
 * deliberately (inconsistency I-06 of docs/ACCOUNTING_EVENTS.md).
 */
function generateEntryNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `AS-${date}-${suffix}`;
}

export type PostingWriteInput = {
  request: PostingRequest;
  draft: PostingJournalDraft;
  idempotencyKey: string;
  /** Set only when the source event is an accounting document. */
  accountingDocumentId?: string | null;
};

export async function writePosting(
  ctx: FinancialTransactionContext,
  input: PostingWriteInput,
): Promise<PostingResult> {
  const { request, draft } = input;
  const db: PostingDb = ctx.tx;
  const postedAt = new Date();
  const totalAmount = draftTotalAmount(draft);

  const entry = await createPostedJournalEntry(db, {
    entryNumber: generateEntryNumber(),
    entryDate: request.accountingDate,
    branchId: request.branchId,
    source: request.journalSource ?? "DOCUMENTO",
    accountingDocumentId: input.accountingDocumentId ?? null,
    notes: sanitizeFinancialText(request.description, 500),
    createdByUserId: ctx.actor.userId,
    postedAt,
    lines: draft.lines.map((line) => ({
      accountId: line.accountId,
      concept: line.concept,
      debit: new Prisma.Decimal(line.debit),
      credit: new Prisma.Decimal(line.credit),
      position: line.position,
    })),
  });

  const record = await createPostingRecord(db, {
    event: request.event,
    sourceType: request.source.type,
    sourceId: request.source.id,
    idempotencyKey: input.idempotencyKey,
    // Held only while the posting is active; released on reversal so the event
    // can be corrected and posted again (Patch FF1.3-C).
    activeIdempotencyKey: input.idempotencyKey,
    journalEntryId: entry.id,
    branchId: request.branchId,
    accountingDate: request.accountingDate,
    currency: request.currency ?? null,
    lineCount: draft.lines.length,
    totalAmount: new Prisma.Decimal(totalAmount),
    postedByUserId: ctx.actor.userId,
  });

  // Two audit events on purpose: the ledger's own history (an entry was posted)
  // and the engine's (an event produced it). A reader of the journal must not
  // have to know the posting engine exists to see that the entry was posted.
  await ctx.audit({
    domain: "CONTABILIDAD",
    action: "JOURNAL_ENTRY_POSTED",
    entityType: "JOURNAL_ENTRY",
    entityId: entry.id,
    entityCode: entry.entryNumber,
    branchId: entry.branchId,
    after: {
      entryNumber: entry.entryNumber,
      status: entry.status,
      source: entry.source,
      entryDate: entry.entryDate,
      lineCount: draft.lines.length,
      debitTotal: draft.debitTotal,
      creditTotal: draft.creditTotal,
      isBalanced: draft.debitTotal === draft.creditTotal,
    },
    metadata: {
      component: "HEADER",
      operation: "STATUS_CHANGE",
      lineCount: draft.lines.length,
      isBalanced: draft.debitTotal === draft.creditTotal,
    },
  });

  await ctx.audit({
    domain: "CONTABILIDAD",
    action: "POSTING_EXECUTED",
    entityType: "POSTING_RECORD",
    entityId: record.id,
    entityCode: input.idempotencyKey,
    branchId: record.branchId,
    after: {
      event: request.event,
      entryNumber: entry.entryNumber,
      status: record.status,
      lineCount: draft.lines.length,
      total: totalAmount,
      entryDate: request.accountingDate,
      currency: request.currency ?? null,
    },
    metadata: {
      component: "HEADER",
      operation: "CREATE",
      lineCount: draft.lines.length,
      isBalanced: true,
    },
  });

  return {
    postingRecordId: record.id,
    journalEntryId: entry.id,
    entryNumber: entry.entryNumber,
    event: request.event,
    idempotencyKey: input.idempotencyKey,
    lineCount: draft.lines.length,
    totalAmount,
    alreadyPosted: false,
  };
}

// --- Reversal ------------------------------------------------------------

export type PostingReversalWriteInput = {
  record: {
    id: string;
    idempotencyKey: string;
    branchId: string | null;
    event: PostingRequest["event"];
    accountingDate: Date;
  };
  original: { id: string; entryNumber: string; branchId: string | null };
  draft: PostingJournalDraft;
  reversalDate: Date;
  reason: string;
};

/**
 * Patch FF1.3-C — writes a reversal.
 *
 * Three writes, one transaction, and the original entry is not among them:
 *
 * 1. the reversing entry, born `CONTABILIZADO`, linked through the unique
 *    `reversalOfId` — which is what makes "only one reversing entry may ever
 *    exist" a database guarantee rather than a check;
 * 2. the posting record, flipped to `REVERTIDO` with who, when and why, and
 *    releasing `activeIdempotencyKey` so the corrected event can be posted
 *    again;
 * 3. two audit events, in the same transaction.
 *
 * **The original entry is never touched.** Not its status, not its lines, not
 * its date. A posted entry is immutable, and the reversal exists precisely so it
 * can stay that way.
 */
export async function writePostingReversal(
  ctx: FinancialTransactionContext,
  input: PostingReversalWriteInput,
): Promise<{ reversalEntryId: string; reversalEntryNumber: string }> {
  const db: PostingDb = ctx.tx;
  const { record, original, draft } = input;
  const reversedAt = new Date();

  const reversal = await createPostedJournalEntry(db, {
    entryNumber: generateEntryNumber(),
    entryDate: input.reversalDate,
    branchId: original.branchId,
    source: "DOCUMENTO",
    accountingDocumentId: null,
    notes: sanitizeFinancialText(
      `Reversión de ${original.entryNumber}: ${input.reason}`,
      500,
    ),
    createdByUserId: ctx.actor.userId,
    postedAt: reversedAt,
    reversalOfId: original.id,
    lines: draft.lines.map((line) => ({
      accountId: line.accountId,
      concept: line.concept,
      debit: new Prisma.Decimal(line.debit),
      credit: new Prisma.Decimal(line.credit),
      position: line.position,
    })),
  });

  await updatePostingRecord(db, record.id, {
    status: "REVERTIDO",
    activeIdempotencyKey: null,
    reversedAt,
    reversedByUserId: ctx.actor.userId,
    reversalReason: input.reason,
  });

  // Symmetric with the posting path: the ledger records that an entry was
  // reversed, and the engine records that a posting was.
  await ctx.audit({
    domain: "CONTABILIDAD",
    action: "JOURNAL_ENTRY_REVERSED",
    entityType: "JOURNAL_ENTRY",
    entityId: original.id,
    entityCode: original.entryNumber,
    branchId: original.branchId,
    reason: input.reason,
    after: {
      entryNumber: original.entryNumber,
      reversalEntryNumber: reversal.entryNumber,
      entryDate: input.reversalDate,
      lineCount: draft.lines.length,
      debitTotal: draft.debitTotal,
      creditTotal: draft.creditTotal,
      isBalanced: draft.debitTotal === draft.creditTotal,
    },
    metadata: {
      component: "HEADER",
      operation: "STATUS_CHANGE",
      lineCount: draft.lines.length,
      isBalanced: draft.debitTotal === draft.creditTotal,
    },
  });

  await ctx.audit({
    domain: "CONTABILIDAD",
    action: "POSTING_REVERSED",
    entityType: "POSTING_RECORD",
    entityId: record.id,
    entityCode: record.idempotencyKey,
    branchId: record.branchId,
    reason: input.reason,
    before: { status: "CONTABILIZADO", entryNumber: original.entryNumber },
    after: {
      status: "REVERTIDO",
      event: record.event,
      reversalEntryNumber: reversal.entryNumber,
      reversedAt,
      total: draft.debitTotal,
    },
    metadata: {
      component: "HEADER",
      operation: "STATUS_CHANGE",
      changedFields: ["status", "reversedAt"],
    },
  });

  return {
    reversalEntryId: reversal.id,
    reversalEntryNumber: reversal.entryNumber,
  };
}
