/**
 * SMOKE-FF2.0-A — el impuesto como componente contable.
 *
 *   npm run smoke:tax
 *
 * Reproduce el cuerpo transaccional de `reviewExpenseAction`, igual que
 * SMOKE-FF1.4-E, porque las acciones de servidor autorizan contra la cookie de
 * sesión. La autorización queda fuera de cobertura.
 *
 * `Expense` es el **único** modelo del esquema con un importe de impuesto, así
 * que los escenarios de documento contable, factura de caja y notas gravadas no
 * se pueden construir: esos modelos no tienen columna de impuesto. Ver
 * `docs/POSTING_CONTRACT.md` §L-1.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient } from "@prisma/client";

import {
  findActiveExpensePosting,
  postExpenseInTransaction,
} from "@/server/contabilidad/posting";
import { validateMappingSet } from "@/server/finance/account-mapping/validation";
import { runReversalPipeline } from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF20A-${Date.now()}`;

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${name} ${detail}`);
  }
}

type Ids = {
  branchId: string;
  /** Sucursal con mapeo SIN la regla de impuesto. */
  untaxedBranchId: string;
  userId: string;
  accounts: Record<string, string>;
  mappingSetId: string;
  untaxedSetId: string;
};

const ACCOUNT_NAMES = ["GASTO", "CXP", "RETENCIONES", "IVA_ACREDITABLE"] as const;

async function createFixtures(): Promise<Ids> {
  const branch = await prisma.branch.create({
    data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
  });
  const untaxed = await prisma.branch.create({
    data: { code: `${TAG}-sin`.toLowerCase(), name: `${TAG} sin impuesto` },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} contador`,
      email: `${TAG.toLowerCase()}@smoke.local`,
      passwordHash: "smoke:not-a-real-hash",
      role: "CONTADOR",
    },
  });

  const accounts: Record<string, string> = {};
  for (const name of ACCOUNT_NAMES) {
    const isDebit = name === "GASTO" || name === "IVA_ACREDITABLE";
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "GASTO" ? "GASTO" : isDebit ? "ACTIVO" : "PASIVO",
        nature: isDebit ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  const baseRules = [
    {
      event: "GASTO" as const,
      component: "SUBTOTAL" as const,
      debitAccountId: accounts.GASTO,
      creditAccountId: accounts.CXP,
    },
    {
      event: "GASTO" as const,
      component: "RETENCION_1" as const,
      debitAccountId: accounts.CXP,
      creditAccountId: accounts.RETENCIONES,
    },
  ];

  const set = await prisma.accountMappingSet.create({
    data: {
      code: TAG,
      version: 1,
      name: `${TAG} mapeo`,
      status: "ACTIVO",
      branchId: branch.id,
      branchKey: branch.id,
      activeBranchKey: branch.id,
      effectiveFrom: new Date("2020-01-01"),
      createdByUserId: user.id,
      activatedByUserId: user.id,
      activatedAt: new Date(),
      rules: {
        create: [
          ...baseRules,
          {
            event: "GASTO" as const,
            component: "IMPUESTO" as const,
            debitAccountId: accounts.IVA_ACREDITABLE,
            creditAccountId: accounts.CXP,
          },
        ],
      },
    },
  });

  // Mismo mapeo, sin la regla de impuesto: sirve para probar el rollback.
  const untaxedSet = await prisma.accountMappingSet.create({
    data: {
      code: `${TAG}-B`,
      version: 1,
      name: `${TAG} mapeo sin impuesto`,
      status: "ACTIVO",
      branchId: untaxed.id,
      branchKey: untaxed.id,
      activeBranchKey: untaxed.id,
      effectiveFrom: new Date("2020-01-01"),
      createdByUserId: user.id,
      activatedByUserId: user.id,
      activatedAt: new Date(),
      rules: { create: baseRules },
    },
  });

  return {
    branchId: branch.id,
    untaxedBranchId: untaxed.id,
    userId: user.id,
    accounts,
    mappingSetId: set.id,
    untaxedSetId: untaxedSet.id,
  };
}

async function cleanup(ids: Ids | null) {
  if (!ids) return;
  const branchIds = [ids.branchId, ids.untaxedBranchId];
  const setIds = [ids.mappingSetId, ids.untaxedSetId];
  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: ids.userId },
  });
  await prisma.postingRecord.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.journalEntryLine.deleteMany({
    where: { entry: { branchId: { in: branchIds } } },
  });
  await prisma.journalEntry.deleteMany({
    where: { branchId: { in: branchIds }, reversalOfId: { not: null } },
  });
  await prisma.journalEntry.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.expense.deleteMany({ where: { branchId: { in: branchIds } } });
  const extraSets = await prisma.accountMappingSet.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const allSetIds = [...new Set([...setIds, ...extraSets.map((s) => s.id)])];
  await prisma.accountMappingRule.deleteMany({
    where: { setId: { in: allSetIds } },
  });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: allSetIds } } });
  await prisma.accountingClosing.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.chartAccount.deleteMany({
    where: { id: { in: Object.values(ids.accounts) } },
  });
  await prisma.user.deleteMany({ where: { id: ids.userId } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

/** Misma aritmética que `calculateExpenseTotal`. */
function expenseTotal(i: {
  subtotal: number;
  tax: number;
  retention1: number;
  retention2: number;
}): number {
  return Math.max(i.subtotal + i.tax - i.retention1 - i.retention2, 0);
}

async function createExpense(
  ids: Ids,
  input: {
    number: string;
    subtotal: number;
    tax?: number;
    retention1?: number;
    retention2?: number;
    date?: Date;
    branchId?: string;
  },
) {
  const tax = input.tax ?? 0;
  const retention1 = input.retention1 ?? 0;
  const retention2 = input.retention2 ?? 0;
  const total = expenseTotal({ subtotal: input.subtotal, tax, retention1, retention2 });
  return prisma.expense.create({
    data: {
      branchId: input.branchId ?? ids.branchId,
      createdByUserId: ids.userId,
      category: "SERVICIOS_BASICOS",
      status: "REGISTRADO",
      expenseDate: input.date ?? new Date(),
      supplier: "Proveedor de prueba",
      concept: "Servicio gravado",
      invoiceNumber: `${TAG}-${input.number}`,
      amount: input.subtotal as unknown as never,
      subtotal: input.subtotal as unknown as never,
      tax: tax as unknown as never,
      retention1: retention1 as unknown as never,
      retention2: retention2 as unknown as never,
      total: total as unknown as never,
      currency: "NIO",
    },
  });
}

/** Reproduce el cuerpo de `reviewExpenseAction`. */
async function reviewExpense(ids: Ids, expenseId: string) {
  return runFinancialTransaction({
    actor: { userId: ids.userId, role: "CONTADOR" as const },
    run: async (ctx) => {
      const expense = await ctx.tx.expense.findUnique({ where: { id: expenseId } });
      if (!expense) return ctx.fail("El gasto no existe.");
      ctx.ensure(expense.status === "REGISTRADO", "El gasto ya fue revisado.");
      const guarded = await ctx.tx.expense.updateMany({
        where: { id: expenseId, status: "REGISTRADO" },
        data: { status: "REVISADO", reviewedByUserId: ids.userId, reviewedAt: new Date() },
      });
      if (guarded.count !== 1) return ctx.fail("El gasto ya fue revisado.");
      const updated = await ctx.tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
      await ctx.audit({
        domain: "CONTABILIDAD",
        action: "EXPENSE_STATUS_CHANGED",
        entityType: "EXPENSE",
        entityId: updated.id,
        entityCode: updated.invoiceNumber,
        branchId: updated.branchId,
        after: { status: updated.status },
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
      const posting = await postExpenseInTransaction(ctx, updated);
      return { posting };
    },
  });
}

function sumOn(
  lines: Array<{ accountId: string; debit: unknown; credit: unknown }>,
  accountId: string,
) {
  const debit = lines
    .filter((l) => l.accountId === accountId)
    .reduce((s, l) => s + Number(l.debit), 0);
  const credit = lines
    .filter((l) => l.accountId === accountId)
    .reduce((s, l) => s + Number(l.credit), 0);
  return { debit, credit, net: debit - credit };
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();
    const gastoId = ids.accounts.GASTO;
    const cxpId = ids.accounts.CXP;
    const ivaId = ids.accounts.IVA_ACREDITABLE;

    console.log("\n=== 1. Gasto SIN impuesto -> comportamiento idéntico a FF1.4-E ===");
    const untaxed = await createExpense(ids, { number: "G-SIN", subtotal: 5000 });
    const untaxedPost = await reviewExpense(ids, untaxed.id);
    check("contabiliza", untaxedPost.ok, untaxedPost.ok ? "" : untaxedPost.error);
    if (!untaxedPost.ok) throw new Error("sin contabilización no hay smoke");
    const untaxedEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId },
      include: { lines: true },
    });
    check("dos líneas: no aparece componente de impuesto", untaxedEntry.lines.length === 2, String(untaxedEntry.lines.length));
    check("sin línea en IVA", sumOn(untaxedEntry.lines, ivaId).debit === 0);
    check("CxP = total", sumOn(untaxedEntry.lines, cxpId).credit === 5000);

    console.log("\n=== 2. Impuesto explícitamente cero -> tampoco emite el componente ===");
    const zeroTax = await createExpense(ids, { number: "G-CERO", subtotal: 800, tax: 0 });
    const zeroPost = await reviewExpense(ids, zeroTax.id);
    check("contabiliza", zeroPost.ok, zeroPost.ok ? "" : zeroPost.error);
    const zeroEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId, id: { not: untaxedEntry.id }, reversalOfId: null },
      include: { lines: true },
    });
    check("dos líneas", zeroEntry.lines.length === 2, String(zeroEntry.lines.length));

    console.log("\n=== 3. Gasto CON impuesto -> el impuesto llega a su cuenta ===");
    const taxed = await createExpense(ids, { number: "G-IVA", subtotal: 1000, tax: 150 });
    const taxedPost = await reviewExpense(ids, taxed.id);
    check("contabiliza (antes se rechazaba)", taxedPost.ok, taxedPost.ok ? "" : taxedPost.error);
    const taxedEntry = await prisma.journalEntry.findFirstOrThrow({
      where: {
        branchId: ids.branchId,
        id: { notIn: [untaxedEntry.id, zeroEntry.id] },
        reversalOfId: null,
      },
      include: { lines: true },
    });
    check("cuatro líneas (2 componentes)", taxedEntry.lines.length === 4, String(taxedEntry.lines.length));
    const taxedDebit = taxedEntry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const taxedCredit = taxedEntry.lines.reduce((s, l) => s + Number(l.credit), 0);
    check("cuadrado", taxedDebit === taxedCredit, `${taxedDebit} vs ${taxedCredit}`);
    check("gasto = subtotal, NO inflado por el impuesto", sumOn(taxedEntry.lines, gastoId).debit === 1000, String(sumOn(taxedEntry.lines, gastoId).debit));
    check("IVA acreditable = impuesto", sumOn(taxedEntry.lines, ivaId).debit === 150, String(sumOn(taxedEntry.lines, ivaId).debit));
    check("CxP = total del gasto (1150)", sumOn(taxedEntry.lines, cxpId).credit === 1150, String(sumOn(taxedEntry.lines, cxpId).credit));

    console.log("\n=== 4. Impuesto Y retenciones a la vez ===");
    const full = await createExpense(ids, {
      number: "G-FULL",
      subtotal: 10000,
      tax: 1500,
      retention1: 200,
    });
    const fullPost = await reviewExpense(ids, full.id);
    check("contabiliza", fullPost.ok, fullPost.ok ? "" : fullPost.error);
    const fullEntry = await prisma.journalEntry.findFirstOrThrow({
      where: {
        branchId: ids.branchId,
        id: { notIn: [untaxedEntry.id, zeroEntry.id, taxedEntry.id] },
        reversalOfId: null,
      },
      include: { lines: true },
    });
    check("seis líneas (3 componentes)", fullEntry.lines.length === 6, String(fullEntry.lines.length));
    check("gasto = subtotal", sumOn(fullEntry.lines, gastoId).debit === 10000);
    check("IVA = impuesto", sumOn(fullEntry.lines, ivaId).debit === 1500);
    // 10000 + 1500 - 200 = 11300
    check("CxP neto = total (11300)", sumOn(fullEntry.lines, cxpId).net === -11300, String(sumOn(fullEntry.lines, cxpId).net));

    console.log("\n=== 5. Sin regla de impuesto -> rollback completo ===");
    const noTaxMap = await createExpense(ids, {
      number: "G-NOMAP",
      subtotal: 500,
      tax: 75,
      branchId: ids.untaxedBranchId,
    });
    const noMapPost = await reviewExpense(ids, noTaxMap.id);
    check("falla por mapeo faltante", !noMapPost.ok, noMapPost.ok ? "aceptó" : "");
    check(
      "el gasto sigue REGISTRADO",
      (await prisma.expense.findUniqueOrThrow({ where: { id: noTaxMap.id } })).status === "REGISTRADO",
    );
    check(
      "sin asiento en esa sucursal",
      (await prisma.journalEntry.count({ where: { branchId: ids.untaxedBranchId } })) === 0,
    );

    console.log("\n=== 6. En esa misma sucursal, un gasto SIN impuesto sí contabiliza ===");
    // Prueba que la ausencia de regla de impuesto solo bloquea lo que la usa.
    const noTaxOk = await createExpense(ids, {
      number: "G-NOMAP-OK",
      subtotal: 500,
      branchId: ids.untaxedBranchId,
    });
    const noTaxOkPost = await reviewExpense(ids, noTaxOk.id);
    check("contabiliza sin regla de impuesto", noTaxOkPost.ok, noTaxOkPost.ok ? "" : noTaxOkPost.error);

    console.log("\n=== 7. Retenciones entre el subtotal y el subtotal+impuesto ===");
    // Antes de FF2.0-A el guard comparaba solo contra el subtotal. Con impuesto,
    // esto es un gasto legítimo: 1000 + 300 - 1100 = 200.
    const overSubtotal = await createExpense(ids, {
      number: "G-RET-MEDIA",
      subtotal: 1000,
      tax: 300,
      retention1: 1100,
    });
    const overPost = await reviewExpense(ids, overSubtotal.id);
    check("se acepta", overPost.ok, overPost.ok ? "" : overPost.error);
    const overEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId, reversalOfId: null, lines: { some: { debit: 1100 } } },
      include: { lines: true },
    });
    check("CxP neto = total (200)", sumOn(overEntry.lines, cxpId).net === -200, String(sumOn(overEntry.lines, cxpId).net));

    console.log("\n=== 8. Retenciones mayores que subtotal+impuesto -> rechazo ===");
    const tooMuch = await createExpense(ids, {
      number: "G-RET-EXC",
      subtotal: 1000,
      tax: 100,
      retention1: 1200,
    });
    const tooMuchPost = await reviewExpense(ids, tooMuch.id);
    check("rechazado", !tooMuchPost.ok, tooMuchPost.ok ? "aceptó" : "");
    check(
      "el mensaje menciona el impuesto",
      !tooMuchPost.ok && tooMuchPost.error.toLowerCase().includes("impuesto"),
      tooMuchPost.ok ? "" : tooMuchPost.error,
    );

    console.log("\n=== 9. Período cerrado ===");
    const closedExpense = await createExpense(ids, { number: "G-CERRADO", subtotal: 700, tax: 105 });
    await prisma.accountingClosing.create({
      data: {
        branchId: ids.branchId,
        period: new Date().toISOString().slice(0, 7),
        status: "CERRADO",
        closedByUserId: ids.userId,
        closedAt: new Date(),
      },
    });
    const closed = await reviewExpense(ids, closedExpense.id);
    check("período cerrado bloquea", !closed.ok, closed.ok ? "aceptó" : "");
    check(
      "gasto intacto",
      (await prisma.expense.findUniqueOrThrow({ where: { id: closedExpense.id } })).status === "REGISTRADO",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 10. Revisión concurrente de un gasto gravado ===");
    const raceExpense = await createExpense(ids, { number: "G-RACE", subtotal: 400, tax: 60 });
    const [a, b] = await Promise.all([
      reviewExpense(ids, raceExpense.id),
      reviewExpense(ids, raceExpense.id),
    ]);
    check("solo una gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo registro de contabilización",
      (await prisma.postingRecord.count({
        where: { sourceType: "EXPENSE", sourceId: raceExpense.id },
      })) === 1,
    );

    console.log("\n=== 11. Reversión de un asiento con impuesto ===");
    const active = await findActiveExpensePosting(prisma, full.id);
    check("hay contabilización activa", Boolean(active));
    const reversed = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: (ctx) =>
        runReversalPipeline(ctx, { postingRecordId: active!.id, reason: "IVA mal calculado." }),
    });
    check("revierte", reversed.ok, reversed.ok ? "" : reversed.error);
    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: fullEntry.id },
      include: { lines: true },
    });
    check("espejo con las mismas 6 líneas", mirror.lines.length === 6);
    check("el IVA se revierte al haber", sumOn(mirror.lines, ivaId).credit === 1500, String(sumOn(mirror.lines, ivaId).credit));
    check(
      "asiento original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: fullEntry.id } })).status === "CONTABILIZADO",
    );

    console.log("\n=== 12. Mapeo archivado -> deja de resolver ===");
    await prisma.accountMappingSet.update({
      where: { id: ids.untaxedSetId },
      data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
    });
    const afterArchive = await createExpense(ids, {
      number: "G-ARCHIVADO",
      subtotal: 300,
      branchId: ids.untaxedBranchId,
    });
    const archivedPost = await reviewExpense(ids, afterArchive.id);
    check("un conjunto archivado no contabiliza", !archivedPost.ok, archivedPost.ok ? "aceptó" : "");
    check(
      "el gasto sigue REGISTRADO",
      (await prisma.expense.findUniqueOrThrow({ where: { id: afterArchive.id } })).status === "REGISTRADO",
    );

    console.log("\n=== 13. Validación de mapeo: el impuesto no puede cancelar el subtotal ===");
    async function draftTaxSet(taxDebit: string, taxCredit: string) {
      const draft = await prisma.accountMappingSet.create({
        data: {
          code: `${TAG}-V${Math.random().toString(36).slice(2, 8)}`,
          version: 1,
          name: `${TAG} borrador`,
          status: "BORRADOR",
          branchId: ids!.branchId,
          branchKey: ids!.branchId,
          activeBranchKey: null,
          effectiveFrom: new Date("2020-01-01"),
          createdByUserId: ids!.userId,
          rules: {
            create: [
              {
                event: "GASTO" as const,
                component: "SUBTOTAL" as const,
                debitAccountId: ids!.accounts.GASTO,
                creditAccountId: ids!.accounts.CXP,
              },
              {
                event: "GASTO" as const,
                component: "IMPUESTO" as const,
                debitAccountId: ids!.accounts[taxDebit],
                creditAccountId: ids!.accounts[taxCredit],
              },
            ],
          },
        },
      });
      return validateMappingSet(prisma, draft.id);
    }

    const goodTaxMap = await draftTaxSet("IVA_ACREDITABLE", "CXP");
    check("mapeo correcto del impuesto es válido", goodTaxMap.valid, JSON.stringify(goodTaxMap.issues));

    const taxSubtracts = await draftTaxSet("CXP", "RETENCIONES");
    check("impuesto que debita lo que el subtotal acredita -> inválido", !taxSubtracts.valid);
    check(
      "el mensaje explica que el impuesto suma",
      taxSubtracts.issues.some((i) => i.message.includes("suma al importe adeudado")),
      JSON.stringify(taxSubtracts.issues),
    );

    const taxShrinksExpense = await draftTaxSet("IVA_ACREDITABLE", "GASTO");
    check("impuesto que acredita lo que el subtotal debita -> inválido", !taxShrinksExpense.valid);
    check(
      "el mensaje explica que el gasto se reduciría",
      taxShrinksExpense.issues.some((i) => i.message.includes("reducido por el impuesto")),
      JSON.stringify(taxShrinksExpense.issues),
    );

    console.log("\n=== 14. Consistencia final ===");
    const activePostings = await prisma.postingRecord.count({
      where: { branchId: ids.branchId, status: "CONTABILIZADO" },
    });
    const entries = await prisma.journalEntry.count({
      where: { branchId: ids.branchId, reversalOfId: null },
    });
    check("contabilizaciones activas", activePostings === 5, String(activePostings));
    check("asientos (sin espejos)", entries === 6, String(entries));
    check(
      "todo asiento del motor tiene registro",
      (
        await prisma.journalEntry.findMany({
          where: { branchId: ids.branchId, reversalOfId: null },
          include: { postingRecord: true },
        })
      ).every((e) => e.postingRecord !== null),
    );
  } finally {
    await cleanup(ids);
    console.log(`\nRESULTADO SMOKE-FF2.0-A: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
