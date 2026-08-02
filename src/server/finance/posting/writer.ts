import { Prisma } from "@prisma/client";

import { draftTotalAmount } from "@/server/finance/posting/builder";
import {
  createPostedJournalEntry,
  createPostingRecord,
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
