import type { DocumentSequence, Prisma } from "@prisma/client";

import type { FinancialDocumentSeriesValue } from "@/server/finance/numbering/shared";

/**
 * Patch FF1.0 — data access for `DocumentSequence`.
 *
 * Pure persistence: no authorization, no audit, no formatting. Every function
 * accepts the client explicitly so the caller decides whether the read runs in
 * its financial transaction (allocation always must) or outside it (listings).
 */

/** Satisfied by both `PrismaClient` and `Prisma.TransactionClient`. */
export type SequenceDb = Pick<Prisma.TransactionClient, "documentSequence">;

export type SequenceKey = {
  series: FinancialDocumentSeriesValue;
  branchKey: string;
  fiscalYear: number;
};

export type CreateSequenceData = SequenceKey & {
  branchId: string | null;
  prefix: string;
  padding: number;
  notes: string | null;
};

export type UpdateSequenceData = {
  prefix?: string;
  padding?: number;
  isActive?: boolean;
  notes?: string | null;
};

export async function findSequenceByKey(
  db: SequenceDb,
  key: SequenceKey,
): Promise<DocumentSequence | null> {
  return db.documentSequence.findUnique({
    where: {
      series_branchKey_fiscalYear: {
        series: key.series,
        branchKey: key.branchKey,
        fiscalYear: key.fiscalYear,
      },
    },
  });
}

export async function findSequenceById(
  db: SequenceDb,
  id: string,
): Promise<DocumentSequence | null> {
  return db.documentSequence.findUnique({ where: { id } });
}

export async function listSequences(
  db: SequenceDb,
  filter: {
    branchKeys?: readonly string[];
    series?: FinancialDocumentSeriesValue;
    fiscalYear?: number;
  } = {},
): Promise<DocumentSequence[]> {
  return db.documentSequence.findMany({
    where: {
      ...(filter.branchKeys ? { branchKey: { in: [...filter.branchKeys] } } : {}),
      ...(filter.series ? { series: filter.series } : {}),
      ...(filter.fiscalYear ? { fiscalYear: filter.fiscalYear } : {}),
    },
    orderBy: [
      { fiscalYear: "desc" },
      { series: "asc" },
      { branchKey: "asc" },
    ],
  });
}

export async function createSequence(
  db: SequenceDb,
  data: CreateSequenceData,
): Promise<DocumentSequence> {
  return db.documentSequence.create({
    data: {
      series: data.series,
      branchId: data.branchId,
      branchKey: data.branchKey,
      fiscalYear: data.fiscalYear,
      prefix: data.prefix,
      padding: data.padding,
      notes: data.notes,
    },
  });
}

export async function updateSequence(
  db: SequenceDb,
  id: string,
  data: UpdateSequenceData,
): Promise<DocumentSequence> {
  return db.documentSequence.update({ where: { id }, data });
}

/**
 * Consumes one value atomically.
 *
 * `increment` compiles to `UPDATE ... SET next_value = next_value + 1 ...
 * RETURNING *`, a single statement that takes the row lock and returns the
 * committed result, so concurrent allocations serialize and no two callers can
 * ever read the same counter. The consumed value is the returned one minus one;
 * it is never derived from a prior read.
 *
 * The caller MUST pass its transaction client: if the surrounding operation
 * rolls back, the consumed value must roll back with it.
 */
export async function consumeNextValue(
  db: SequenceDb,
  id: string,
): Promise<{ sequence: DocumentSequence; value: number }> {
  const sequence = await db.documentSequence.update({
    where: { id },
    data: { nextValue: { increment: 1 } },
  });
  return { sequence, value: sequence.nextValue - 1 };
}

/** Records the number produced by the last allocation, for operator visibility. */
export async function recordIssuedNumber(
  db: SequenceDb,
  id: string,
  lastNumber: string,
  lastIssuedAt: Date,
): Promise<void> {
  await db.documentSequence.update({
    where: { id },
    data: { lastNumber, lastIssuedAt },
  });
}
