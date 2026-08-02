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
      lines: { create: data.lines },
    },
  });
}

export type CreatePostingRecordData = {
  event: PostingRecord["event"];
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
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

export async function findPostingRecordByKey(
  db: PostingDb,
  idempotencyKey: string,
): Promise<PostingRecord | null> {
  return db.postingRecord.findUnique({ where: { idempotencyKey } });
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
