import type {
  AccountMappingRule,
  AccountMappingSet,
  Prisma,
} from "@prisma/client";

import type {
  AccountMappingSetStatusValue,
  AccountingEventComponentValue,
  AccountingEventTypeValue,
} from "@/server/finance/account-mapping/shared";
import { postingStateSelect } from "@/server/finance/chart-of-accounts/repository";

/**
 * Patch FF1.0 — data access for the account-mapping catalogue.
 *
 * Pure persistence: no authorization, no audit, no business rule. Every
 * function takes the client explicitly so a caller inside a financial
 * transaction reads and writes through that transaction.
 */

/** Satisfied by both `PrismaClient` and `Prisma.TransactionClient`. */
export type MappingDb = Pick<
  Prisma.TransactionClient,
  "accountMappingSet" | "accountMappingRule"
>;

/**
 * Patch FF1.1: a mapped account is selected with the full posting state, not
 * just `isActive`, so validation asks the same question a journal line asks —
 * a grouping header or an unapproved template account is no more valid in a
 * mapping than it is in a movement.
 */
const ruleAccountSelect = {
  select: { id: true, name: true, ...postingStateSelect },
} as const;

const ruleInclude = {
  debitAccount: ruleAccountSelect,
  creditAccount: ruleAccountSelect,
} as const;

export type MappingRuleWithAccounts = Prisma.AccountMappingRuleGetPayload<{
  include: typeof ruleInclude;
}>;

export type MappingSetWithRules = Prisma.AccountMappingSetGetPayload<{
  include: { rules: { include: typeof ruleInclude } };
}>;

const activeRuleInclude = {
  ...ruleInclude,
  set: { select: { id: true, code: true, version: true, branchKey: true } },
} as const;

export type ActiveMappingRule = Prisma.AccountMappingRuleGetPayload<{
  include: typeof activeRuleInclude;
}>;

export type CreateMappingSetData = {
  code: string;
  version: number;
  name: string;
  description: string | null;
  branchId: string | null;
  branchKey: string;
  effectiveFrom: Date;
  createdByUserId: string;
};

export type UpsertMappingRuleData = {
  setId: string;
  event: AccountingEventTypeValue;
  component: AccountingEventComponentValue;
  debitAccountId: string;
  creditAccountId: string;
  description: string | null;
};

export async function findSetById(
  db: MappingDb,
  id: string,
): Promise<AccountMappingSet | null> {
  return db.accountMappingSet.findUnique({ where: { id } });
}

export async function findSetWithRules(
  db: MappingDb,
  id: string,
): Promise<MappingSetWithRules | null> {
  return db.accountMappingSet.findUnique({
    where: { id },
    include: {
      rules: {
        include: ruleInclude,
        orderBy: [{ event: "asc" }, { component: "asc" }],
      },
    },
  });
}

export async function listSets(
  db: MappingDb,
  filter: {
    status?: AccountMappingSetStatusValue;
    branchKeys?: readonly string[];
  } = {},
): Promise<Array<AccountMappingSet & { _count: { rules: number } }>> {
  return db.accountMappingSet.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.branchKeys
        ? { branchKey: { in: [...filter.branchKeys] } }
        : {}),
    },
    include: { _count: { select: { rules: true } } },
    orderBy: [{ code: "asc" }, { version: "desc" }],
  });
}

/** Highest version already used by a mapping code, or 0 when it is new. */
export async function findLatestVersion(
  db: MappingDb,
  code: string,
): Promise<number> {
  const latest = await db.accountMappingSet.findFirst({
    where: { code },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return latest?.version ?? 0;
}

export async function createSet(
  db: MappingDb,
  data: CreateMappingSetData,
): Promise<AccountMappingSet> {
  return db.accountMappingSet.create({ data });
}

export async function updateSet(
  db: MappingDb,
  id: string,
  data: Prisma.AccountMappingSetUpdateInput,
): Promise<AccountMappingSet> {
  return db.accountMappingSet.update({ where: { id }, data });
}

export async function countRules(db: MappingDb, setId: string): Promise<number> {
  return db.accountMappingRule.count({ where: { setId } });
}

export async function listRulesWithAccounts(
  db: MappingDb,
  setId: string,
): Promise<MappingRuleWithAccounts[]> {
  return db.accountMappingRule.findMany({
    where: { setId },
    include: ruleInclude,
    orderBy: [{ event: "asc" }, { component: "asc" }],
  });
}

export async function findRuleById(
  db: MappingDb,
  id: string,
): Promise<AccountMappingRule | null> {
  return db.accountMappingRule.findUnique({ where: { id } });
}

export async function upsertRule(
  db: MappingDb,
  data: UpsertMappingRuleData,
): Promise<{ rule: AccountMappingRule; created: boolean }> {
  const existing = await db.accountMappingRule.findUnique({
    where: {
      setId_event_component: {
        setId: data.setId,
        event: data.event,
        component: data.component,
      },
    },
  });

  if (!existing) {
    const rule = await db.accountMappingRule.create({ data });
    return { rule, created: true };
  }

  const rule = await db.accountMappingRule.update({
    where: { id: existing.id },
    data: {
      debitAccountId: data.debitAccountId,
      creditAccountId: data.creditAccountId,
      description: data.description,
    },
  });
  return { rule, created: false };
}

export async function deleteRule(db: MappingDb, id: string): Promise<void> {
  await db.accountMappingRule.delete({ where: { id } });
}

/**
 * Active mapping for an event/component, preferring the branch-specific set
 * over the corporate one. Only ACTIVO sets already in force resolve.
 */
export async function findActiveRule(
  db: MappingDb,
  input: {
    branchKey: string;
    corporateKey: string;
    event: AccountingEventTypeValue;
    component: AccountingEventComponentValue;
    at: Date;
  },
): Promise<ActiveMappingRule | null> {
  const candidates = await db.accountMappingRule.findMany({
    where: {
      event: input.event,
      component: input.component,
      set: {
        status: "ACTIVO",
        effectiveFrom: { lte: input.at },
        branchKey: { in: [input.branchKey, input.corporateKey] },
      },
    },
    include: activeRuleInclude,
  });

  return (
    candidates.find((rule) => rule.set.branchKey === input.branchKey) ??
    candidates.find((rule) => rule.set.branchKey === input.corporateKey) ??
    null
  );
}
