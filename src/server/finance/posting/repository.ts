import type { JournalEntry, Prisma, PostingRecord } from "@prisma/client";

import type {
  PostingJournalSource,
  PostingRecordFilters,
} from "@/server/finance/posting/shared";

/**
 * Patch FF1.3-A — data access for the posting engine.
 *
 * Pure persistence: no authorization, no audit, no business rule. Every function
 * takes the client explicitly so the writer persists through the caller's
 * transaction and a failed posting leaves nothing behind.
 */

export type PostingDb = Pick<
  Prisma.TransactionClient,
  "journalEntry" | "journalEntryLine" | "postingRecord"
>;

export type CreateJournalEntryData = {
  entryNumber: string;
  entryDate: Date;
  branchId: string | null;
  source: PostingJournalSource;
  accountingDocumentId: string | null;
  notes: string | null;
  createdByUserId: string;
  postedAt: Date;
  /** Set only for a reversing entry; the unique FK of the 4.0S-C2 self-relation. */
  reversalOfId?: string | null;
  lines: Array<{
    accountId: string;
    concept: string | null;
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    position: number;
  }>;
};

/**
 * Writes the entry already posted, with its lines, in one statement.
 *
 * The engine never produces a draft: an event either posts completely or does
 * not post at all, so there is no intermediate state a later action could have
 * to clean up.
 */
export async function createPostedJournalEntry(
  db: PostingDb,
  data: CreateJournalEntryData,
): Promise<JournalEntry> {
  return db.journalEntry.create({
    data: {
      entryNumber: data.entryNumber,
      entryDate: data.entryDate,
      branchId: data.branchId,
      status: "CONTABILIZADO",
      source: data.source,
      accountingDocumentId: data.accountingDocumentId,
      notes: data.notes,
      createdByUserId: data.createdByUserId,
      postedByUserId: data.createdByUserId,
      postedAt: data.postedAt,
      reversalOfId: data.reversalOfId ?? null,
      lines: { create: data.lines },
    },
  });
}

export type CreatePostingRecordData = {
  event: PostingRecord["event"];
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  activeIdempotencyKey: string;
  journalEntryId: string;
  branchId: string | null;
  accountingDate: Date;
  currency: string | null;
  lineCount: number;
  totalAmount: Prisma.Decimal;
  postedByUserId: string;
};

export async function createPostingRecord(
  db: PostingDb,
  data: CreatePostingRecordData,
): Promise<PostingRecord> {
  return db.postingRecord.create({ data });
}

/**
 * The ACTIVE posting of a business event, if any (Patch FF1.3-C).
 *
 * The lookup is by `activeIdempotencyKey`, not by `idempotencyKey`: a reversed
 * posting keeps its key for history but releases the active one, so an event
 * that was reversed and corrected can be posted again while never having two
 * live postings at once.
 */
export async function findActivePostingByKey(
  db: PostingDb,
  idempotencyKey: string,
): Promise<PostingRecord | null> {
  return db.postingRecord.findUnique({
    where: { activeIdempotencyKey: idempotencyKey },
  });
}

/** Every posting of a business event, active or reversed, newest first. */
export async function listPostingHistoryByKey(
  db: PostingDb,
  idempotencyKey: string,
): Promise<PostingRecord[]> {
  return db.postingRecord.findMany({
    where: { idempotencyKey },
    orderBy: { postedAt: "desc" },
  });
}

export async function findPostingRecordById(
  db: PostingDb,
  id: string,
): Promise<PostingRecord | null> {
  return db.postingRecord.findUnique({ where: { id } });
}

const recordInclude = {
  journalEntry: { select: { entryNumber: true } },
} as const;

export type PostingRecordRow = Prisma.PostingRecordGetPayload<{
  include: typeof recordInclude;
}>;

export async function findPostingRecordWithEntry(
  db: PostingDb,
  id: string,
): Promise<PostingRecordRow | null> {
  return db.postingRecord.findUnique({ where: { id }, include: recordInclude });
}

export async function listPostingRecords(
  db: PostingDb,
  filters: PostingRecordFilters,
  take?: number,
): Promise<PostingRecordRow[]> {
  return db.postingRecord.findMany({
    where: {
      ...(filters.event ? { event: filters.event } : {}),
      ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.branchId === undefined ? {} : { branchId: filters.branchId }),
    },
    include: recordInclude,
    orderBy: { postedAt: "desc" },
    ...(take === undefined ? {} : { take }),
  });
}

export async function updatePostingRecord(
  db: PostingDb,
  id: string,
  data: Prisma.PostingRecordUncheckedUpdateInput,
): Promise<PostingRecord> {
  return db.postingRecord.update({ where: { id }, data });
}

const entryWithLinesInclude = {
  lines: { orderBy: { position: "asc" } },
} as const;

export type JournalEntryWithLines = Prisma.JournalEntryGetPayload<{
  include: typeof entryWithLinesInclude;
}>;

/** The posted entry a reversal mirrors, with its lines in position order. */
export async function findJournalEntryWithLines(
  db: PostingDb,
  id: string,
): Promise<JournalEntryWithLines | null> {
  return db.journalEntry.findUnique({
    where: { id },
    include: entryWithLinesInclude,
  });
}
