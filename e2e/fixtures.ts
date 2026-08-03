import { PrismaClient, type Prisma } from "@prisma/client";

import { hashPassword } from "@/server/auth/password";

/**
 * Fixtures for the FF2.1-A browser suite.
 *
 * Same discipline as the Prisma smokes: one tag, everything derived from it, and
 * cleanup driven by the tag rather than by an object — so a half-built fixture
 * is removed exactly like a complete one.
 */
export const TAG = "E2E-FF21A";
export const TEST_EMAIL = `${TAG.toLowerCase()}@smoke.local`;
export const TEST_PASSWORD = "e2e-contador-password";

/**
 * **The branches must be real, seeded ones.**
 *
 * The expense screen does not read branches from the database: the page fills
 * its selector from `desiredBranches`, a static array in
 * `src/data/operations/leads.ts`, while `createExpenseAction` resolves the code
 * against the `branches` table. A branch is therefore usable from the UI only if
 * it exists in **both**, so a fixture branch invented here could never be picked.
 * These two codes appear in the static list and in the seed.
 */
export const MAPPED_BRANCH_CODE = "granada";
export const UNMAPPED_BRANCH_CODE = "rosita";

export const prisma = new PrismaClient();

export async function seedFixtures() {
  await cleanupFixtures();

  const mapped = await prisma.branch.findFirstOrThrow({
    where: { code: MAPPED_BRANCH_CODE },
  });
  const unmapped = await prisma.branch.findFirstOrThrow({
    where: { code: UNMAPPED_BRANCH_CODE },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} Contador`,
      email: TEST_EMAIL,
      passwordHash: hashPassword(TEST_PASSWORD),
      role: "CONTADOR",
    },
  });

  const debitNature = new Set(["GASTO", "IVA_ACREDITABLE", "CXC"]);
  const accountType: Record<string, "GASTO" | "ACTIVO" | "PASIVO" | "INGRESO"> = {
    GASTO: "GASTO",
    IVA_ACREDITABLE: "ACTIVO",
    CXC: "ACTIVO",
    INGRESO: "INGRESO",
    CXP: "PASIVO",
    RETENCIONES: "PASIVO",
    IVA_POR_PAGAR: "PASIVO",
  };

  const accounts: Record<string, string> = {};
  for (const name of Object.keys(accountType)) {
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: accountType[name],
        nature: debitNature.has(name) ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  type RuleInput = Prisma.AccountMappingRuleCreateWithoutSetInput;

  const baseRules: RuleInput[] = [
    {
      event: "GASTO",
      component: "SUBTOTAL",
      debitAccount: { connect: { id: accounts.GASTO } },
      creditAccount: { connect: { id: accounts.CXP } },
    },
    {
      event: "GASTO",
      component: "RETENCION_1",
      debitAccount: { connect: { id: accounts.CXP } },
      creditAccount: { connect: { id: accounts.RETENCIONES } },
    },
    // Patch FF2.1-B. En una factura de venta el impuesto es un pasivo: se cobra
    // al cliente (débito a CxC) y se debe al fisco (crédito).
    {
      event: "DOCUMENTO_FACTURA",
      component: "SUBTOTAL",
      debitAccount: { connect: { id: accounts.CXC } },
      creditAccount: { connect: { id: accounts.INGRESO } },
    },
    {
      event: "DOCUMENTO_FACTURA",
      component: "RETENCION_1",
      debitAccount: { connect: { id: accounts.RETENCIONES } },
      creditAccount: { connect: { id: accounts.CXC } },
    },
  ];

  async function activeSet(code: string, branchId: string, rules: RuleInput[]) {
    await prisma.accountMappingSet.create({
      data: {
        code,
        version: 1,
        name: code,
        status: "ACTIVO",
        branchId,
        branchKey: branchId,
        activeBranchKey: branchId,
        effectiveFrom: new Date("2020-01-01"),
        createdByUserId: user.id,
        activatedByUserId: user.id,
        activatedAt: new Date(),
        rules: { create: rules },
      },
    });
  }

  await activeSet(`${TAG}-A`, mapped.id, [
    ...baseRules,
    {
      event: "GASTO",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.IVA_ACREDITABLE } },
      creditAccount: { connect: { id: accounts.CXP } },
    },
    {
      event: "DOCUMENTO_FACTURA",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.CXC } },
      creditAccount: { connect: { id: accounts.IVA_POR_PAGAR } },
    },
  ]);
  await activeSet(`${TAG}-B`, unmapped.id, baseRules);

  return { mappedBranchId: mapped.id, unmappedBranchId: unmapped.id, userId: user.id };
}

/**
 * Cleanup is **tag-scoped, never branch-scoped**, because the branches are real
 * seeded ones this suite borrows rather than owns. Deleting by branch would
 * destroy data the suite did not create.
 */
export async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const sets = await prisma.accountMappingSet.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const setIds = sets.map((set) => set.id);
  // Every record this suite creates carries the tag in a free-text field: the
  // supplier for expenses, the third party for documents. Document numbers are
  // server-generated, so they cannot be used as the marker.
  const expenses = await prisma.expense.findMany({
    where: { supplier: { startsWith: TAG } },
    select: { id: true },
  });
  const expenseIds = expenses.map((expense) => expense.id);
  const documents = await prisma.accountingDocument.findMany({
    where: { thirdPartyName: { startsWith: TAG } },
    select: { id: true },
  });
  const documentIds = documents.map((document) => document.id);
  const records = await prisma.postingRecord.findMany({
    where: {
      OR: [
        { sourceType: "EXPENSE", sourceId: { in: expenseIds } },
        { sourceType: "ACCOUNTING_DOCUMENT", sourceId: { in: documentIds } },
      ],
    },
    select: { id: true, journalEntryId: true },
  });
  const entryIds = records.map((record) => record.journalEntryId);

  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: { in: userIds } },
  });
  await prisma.postingRecord.deleteMany({
    where: { id: { in: records.map((record) => record.id) } },
  });
  await prisma.journalEntryLine.deleteMany({
    where: { entryId: { in: entryIds } },
  });
  await prisma.journalEntry.deleteMany({
    where: { reversalOfId: { in: entryIds } },
  });
  await prisma.journalEntry.deleteMany({
    where: { accountingDocumentId: { in: documentIds } },
  });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.accountingDocument.deleteMany({ where: { id: { in: documentIds } } });
  await prisma.accountMappingRule.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.chartAccount.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
