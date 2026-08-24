import type { ChartAccount, Prisma } from "@prisma/client";

import type { ChartAccountFilters } from "@/server/finance/chart-of-accounts/shared";

/**
 * Patch FF1.1 — data access for the chart of accounts.
 *
 * Pure persistence: no authorization, no audit, no business rule. Every
 * function takes the client explicitly so a caller inside a financial
 * transaction reads and writes through that transaction.
 */

/** Satisfied by both `PrismaClient` and `Prisma.TransactionClient`. */
export type ChartAccountDb = Pick<Prisma.TransactionClient, "chartAccount">;

/**
 * Exactly the columns {@link describeChartAccountPostingBlock} needs. Selecting
 * a narrow shape keeps the eligibility rule cheap enough to run per journal
 * line without pulling whole rows.
 */
export const postingStateSelect = {
  code: true,
  isActive: true,
  allowsPosting: true,
  archivedAt: true,
  origin: true,
  approvedAt: true,
  effectiveFrom: true,
  effectiveTo: true,
} as const;

const catalogInclude = {
  parent: { select: { code: true } },
  _count: { select: { children: true } },
} as const;

export type ChartAccountWithRelations = Prisma.ChartAccountGetPayload<{
  include: typeof catalogInclude;
}>;

export async function findAccountById(
  db: ChartAccountDb,
  id: string,
): Promise<ChartAccount | null> {
  return db.chartAccount.findUnique({ where: { id } });
}

export async function findAccountWithRelations(
  db: ChartAccountDb,
  id: string,
): Promise<ChartAccountWithRelations | null> {
  return db.chartAccount.findUnique({ where: { id }, include: catalogInclude });
}

function whereFromFilters(
  filters: ChartAccountFilters,
): Prisma.ChartAccountWhereInput {
  const search = filters.search?.trim();
  return {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.nature ? { nature: filters.nature } : {}),
    ...(filters.origin ? { origin: filters.origin } : {}),
    ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
    ...(filters.allowsPosting === undefined
      ? {}
      : { allowsPosting: filters.allowsPosting }),
    // A template account still awaiting the company accountant's decision.
    ...(filters.pendingApproval
      ? { origin: "PLANTILLA" as const, approvedAt: null }
      : {}),
    ...(filters.includeArchived ? {} : { archivedAt: null }),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listAccounts(
  db: ChartAccountDb,
  filters: ChartAccountFilters = {},
  take?: number,
): Promise<ChartAccountWithRelations[]> {
  return db.chartAccount.findMany({
    where: whereFromFilters(filters),
    include: catalogInclude,
    orderBy: { code: "asc" },
    ...(take === undefined ? {} : { take }),
  });
}

export async function countChildren(
  db: ChartAccountDb,
  parentId: string,
): Promise<number> {
  return db.chartAccount.count({ where: { parentId } });
}

export async function countUnarchivedChildren(
  db: ChartAccountDb,
  parentId: string,
): Promise<number> {
  return db.chartAccount.count({ where: { parentId, archivedAt: null } });
}

/**
 * Journal lines referencing an account. Used to decide whether a structural
 * change (type, nature, becoming a grouping header) would rewrite the meaning
 * of history instead of describing the future.
 */
export async function countJournalLines(
  db: Pick<Prisma.TransactionClient, "journalEntryLine">,
  accountId: string,
): Promise<number> {
  return db.journalEntryLine.count({ where: { accountId } });
}

export async function createAccount(
  db: ChartAccountDb,
  data: Prisma.ChartAccountUncheckedCreateInput,
): Promise<ChartAccount> {
  return db.chartAccount.create({ data });
}

export async function updateAccount(
  db: ChartAccountDb,
  id: string,
  data: Prisma.ChartAccountUncheckedUpdateInput,
): Promise<ChartAccount> {
  return db.chartAccount.update({ where: { id }, data });
}

/**
 * Ancestor chain of an account, closest first. Bounded by `maxDepth` so a
 * hierarchy corrupted outside the service (a cycle written by hand in SQL)
 * cannot turn a re-parent check into an infinite walk.
 */
export async function listAncestorIds(
  db: ChartAccountDb,
  accountId: string,
  maxDepth: number,
): Promise<string[]> {
  const ancestors: string[] = [];
  let currentId: string | null = accountId;

  for (let step = 0; step < maxDepth && currentId; step += 1) {
    const row: { parentId: string | null } | null =
      await db.chartAccount.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
    if (!row?.parentId) break;
    ancestors.push(row.parentId);
    currentId = row.parentId;
  }

  return ancestors;
}

/**
 * Every descendant of an account with its depth relative to it (direct child =
 * 1). Read level by level instead of recursively so the number of queries is
 * bounded by the depth ceiling, not by the size of the subtree.
 */
export async function listDescendants(
  db: ChartAccountDb,
  accountId: string,
  maxDepth: number,
): Promise<Array<{ id: string; relativeDepth: number }>> {
  const descendants: Array<{ id: string; relativeDepth: number }> = [];
  let frontier = [accountId];

  for (let depth = 1; depth <= maxDepth && frontier.length; depth += 1) {
    const children = await db.chartAccount.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    if (!children.length) break;
    for (const child of children) {
      descendants.push({ id: child.id, relativeDepth: depth });
    }
    frontier = children.map((child) => child.id);
  }

  return descendants;
}

/** Bulk level rewrite used after a subtree moves. */
export async function setLevel(
  db: ChartAccountDb,
  accountIds: readonly string[],
  level: number,
): Promise<void> {
  if (!accountIds.length) return;
  await db.chartAccount.updateMany({
    where: { id: { in: [...accountIds] } },
    data: { level },
  });
}
