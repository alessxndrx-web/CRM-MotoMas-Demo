/**
 * SMOKE-FF1.4-E — contabilización automática de gastos.
 *
 *   npm run smoke:expense
 *
 * Reproduce el cuerpo transaccional de `reviewExpenseAction`
 * (`runFinancialTransaction` + transición guardada + `postExpenseInTransaction`)
 * porque las acciones de servidor autorizan contra la cookie de sesión y no se
 * pueden invocar fuera de una petición. La autorización queda fuera de cobertura.
 *
 * El escenario 6 reproduce también el guard de edición de `updateExpenseAction`.
 * Verifica la regla tal como está escrita en la acción, no la acción misma.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient } from "@prisma/client";

import {
  findActiveExpensePosting,
  postExpenseInTransaction,
} from "@/server/contabilidad/posting";
import { runReversalPipeline } from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF14E-${Date.now()}`;

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
  /** Sucursal sin mapeo: sirve para provocar el rollback. */
  unmappedBranchId: string;
  userId: string;
  accounts: Record<string, string>;
  mappingSetId: string;
};

async function createFixtures(): Promise<Ids> {
  const branch = await prisma.branch.create({
    data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
  });
  const unmapped = await prisma.branch.create({
    data: { code: `${TAG}-sin`.toLowerCase(), name: `${TAG} sin mapeo` },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} contador`,
      email: `${TAG.toLowerCase()}@smoke.local`,
      passwordHash: "smoke:not-a-real-hash",
      role: "CONTADOR",
    },
  });

  // Una cuenta por lado de cada componente. El motor nunca las elige: salen del
  // mapeo, y este smoke solo verifica que llegan hasta el asiento.
  const accounts: Record<string, string> = {};
  for (const name of ["GASTO", "CXP", "RETENCION"]) {
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "GASTO" ? "GASTO" : "PASIVO",
        nature: name === "GASTO" ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

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
          {
            event: "GASTO",
            component: "SUBTOTAL",
            debitAccountId: accounts.GASTO,
            creditAccountId: accounts.CXP,
          },
          {
            event: "GASTO",
            component: "RETENCION_1",
            debitAccountId: accounts.CXP,
            creditAccountId: accounts.RETENCION,
          },
          {
            event: "GASTO",
            component: "RETENCION_2",
            debitAccountId: accounts.CXP,
            creditAccountId: accounts.RETENCION,
          },
        ],
      },
    },
  });

  return {
    branchId: branch.id,
    unmappedBranchId: unmapped.id,
    userId: user.id,
    accounts,
    mappingSetId: set.id,
  };
}

async function cleanup(ids: Ids | null) {
  if (!ids) return;
  const branchIds = [ids.branchId, ids.unmappedBranchId];
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
  await prisma.accountMappingRule.deleteMany({
    where: { setId: ids.mappingSetId },
  });
  await prisma.accountMappingSet.deleteMany({ where: { id: ids.mappingSetId } });
  await prisma.accountingClosing.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.chartAccount.deleteMany({
    where: { id: { in: Object.values(ids.accounts) } },
  });
  await prisma.user.deleteMany({ where: { id: ids.userId } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

/** Misma aritmética que `calculateExpenseTotal`: subtotal + impuesto − retenciones. */
function expenseTotal(input: {
  subtotal: number;
  tax: number;
  retention1: number;
  retention2: number;
}): number {
  return Math.max(
    input.subtotal + input.tax - input.retention1 - input.retention2,
    0,
  );
}

async function createExpense(
  ids: Ids,
  input: {
    number: string;
    subtotal: number;
    tax?: number;
    retention1?: number;
    retention2?: number;
    status?: string;
    date?: Date;
    branchId?: string;
  },
) {
  const tax = input.tax ?? 0;
  const retention1 = input.retention1 ?? 0;
  const retention2 = input.retention2 ?? 0;
  const total = expenseTotal({
    subtotal: input.subtotal,
    tax,
    retention1,
    retention2,
  });
  return prisma.expense.create({
    data: {
      branchId: input.branchId ?? ids.branchId,
      createdByUserId: ids.userId,
      category: "SERVICIOS_BASICOS",
      status: (input.status ?? "REGISTRADO") as "REGISTRADO",
      expenseDate: input.date ?? new Date(),
      supplier: "Proveedor de prueba",
      concept: "Servicio contratado",
      invoiceNumber: `${TAG}-${input.number}`,
      // `amount` y `subtotal` son espejos en las acciones actuales.
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
  const actor = { userId: ids.userId, role: "CONTADOR" as const };
  return runFinancialTransaction({
    actor,
    run: async (ctx) => {
      const expense = await ctx.tx.expense.findUnique({
        where: { id: expenseId },
      });
      if (!expense) return ctx.fail("El gasto no existe.");
      ctx.ensure(expense.status === "REGISTRADO", "El gasto ya fue revisado.");
      const guarded = await ctx.tx.expense.updateMany({
        where: { id: expenseId, status: "REGISTRADO" },
        data: {
          status: "REVISADO",
          reviewedByUserId: ids.userId,
          reviewedAt: new Date(),
        },
      });
      if (guarded.count !== 1) return ctx.fail("El gasto ya fue revisado.");
      const updated = await ctx.tx.expense.findUniqueOrThrow({
        where: { id: expenseId },
      });
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

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();

    console.log("\n=== 1. Gasto simple revisado -> asiento automático ===");
    const simple = await createExpense(ids, { number: "G-1", subtotal: 5000 });
    const simplePost = await reviewExpense(ids, simple.id);
    check("contabiliza", simplePost.ok, simplePost.ok ? "" : simplePost.error);
    if (!simplePost.ok) throw new Error("sin contabilización no hay smoke");
    check("hubo contabilización", simplePost.data.posting !== null);
    check(
      "gasto REVISADO",
      (await prisma.expense.findUniqueOrThrow({ where: { id: simple.id } }))
        .status === "REVISADO",
    );
    const simpleEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId },
      include: { lines: true },
    });
    check("dos líneas", simpleEntry.lines.length === 2, String(simpleEntry.lines.length));
    check(
      "monto = subtotal",
      simpleEntry.lines.reduce((s, l) => s + Number(l.debit), 0) === 5000,
    );

    console.log("\n=== 2. Gasto con retenciones -> SUBTOTAL + retenciones ===");
    const withRetentions = await createExpense(ids, {
      number: "G-RET",
      subtotal: 10000,
      retention1: 200,
      retention2: 100,
    });
    const retPost = await reviewExpense(ids, withRetentions.id);
    check("contabiliza", retPost.ok, retPost.ok ? "" : retPost.error);
    const retEntry = await prisma.journalEntry.findFirstOrThrow({
      where: {
        branchId: ids.branchId,
        id: { not: simpleEntry.id },
        reversalOfId: null,
      },
      include: { lines: true },
    });
    check("seis líneas (3 componentes)", retEntry.lines.length === 6, String(retEntry.lines.length));
    const retDebit = retEntry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const retCredit = retEntry.lines.reduce((s, l) => s + Number(l.credit), 0);
    check("cuadrado", retDebit === retCredit, `${retDebit} vs ${retCredit}`);
    check("suma = subtotal + retenciones", retDebit === 10000 + 200 + 100);

    // Lo que decide si la derivación es correcta: la CxP debe quedar en el
    // total del gasto, no en el subtotal.
    const cxpId = ids.accounts.CXP;
    const cxpCredit = retEntry.lines
      .filter((l) => l.accountId === cxpId)
      .reduce((s, l) => s + Number(l.credit), 0);
    const cxpDebit = retEntry.lines
      .filter((l) => l.accountId === cxpId)
      .reduce((s, l) => s + Number(l.debit), 0);
    check(
      "saldo neto de CxP = total del gasto",
      cxpCredit - cxpDebit === 9700,
      String(cxpCredit - cxpDebit),
    );

    console.log("\n=== 3. Gasto con impuesto -> rechazo explícito y rollback ===");
    const taxed = await createExpense(ids, {
      number: "G-IVA",
      subtotal: 1000,
      tax: 150,
    });
    const taxedPost = await reviewExpense(ids, taxed.id);
    check("gasto con impuesto rechazado", !taxedPost.ok, taxedPost.ok ? "aceptó" : "");
    check(
      "el mensaje explica el impuesto",
      !taxedPost.ok && taxedPost.error.toLowerCase().includes("impuesto"),
      taxedPost.ok ? "" : taxedPost.error,
    );
    check(
      "el gasto sigue REGISTRADO (rollback)",
      (await prisma.expense.findUniqueOrThrow({ where: { id: taxed.id } }))
        .status === "REGISTRADO",
    );
    check(
      "sin asiento huérfano",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 2,
    );

    console.log("\n=== 4. Retenciones mayores que el subtotal -> rechazo ===");
    const overRetained = await createExpense(ids, {
      number: "G-RET-EXC",
      subtotal: 100,
      retention1: 150,
    });
    const overPost = await reviewExpense(ids, overRetained.id);
    check("rechazado", !overPost.ok, overPost.ok ? "aceptó" : "");
    check(
      "el gasto sigue REGISTRADO",
      (await prisma.expense.findUniqueOrThrow({ where: { id: overRetained.id } }))
        .status === "REGISTRADO",
    );

    console.log("\n=== 5. Revisar dos veces ===");
    const twice = await reviewExpense(ids, simple.id);
    check("segunda revisión rechazada", !twice.ok, twice.ok ? "aceptó" : "");
    check(
      "sigue habiendo dos asientos",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 2,
    );

    console.log("\n=== 6. Inmutabilidad tras la revisión ===");
    // Guard de `updateExpenseAction`, reproducido: solo se edita un REGISTRADO.
    const reviewed = await prisma.expense.findUniqueOrThrow({
      where: { id: simple.id },
    });
    check(
      "editar un gasto revisado está prohibido",
      reviewed.status !== "REGISTRADO",
      reviewed.status,
    );
    check(
      "editar un gasto registrado sigue permitido",
      (await prisma.expense.findUniqueOrThrow({ where: { id: taxed.id } }))
        .status === "REGISTRADO",
    );

    console.log("\n=== 7. Rollback: sin mapeo, nada queda ===");
    const noMap = await createExpense(ids, {
      number: "G-NOMAP",
      subtotal: 500,
      branchId: ids.unmappedBranchId,
    });
    const noMapPost = await reviewExpense(ids, noMap.id);
    check("falla por mapeo faltante", !noMapPost.ok, noMapPost.ok ? "aceptó" : noMapPost.error);
    check(
      "el gasto NO quedó revisado",
      (await prisma.expense.findUniqueOrThrow({ where: { id: noMap.id } }))
        .status === "REGISTRADO",
    );
    check(
      "sin asiento en esa sucursal",
      (await prisma.journalEntry.count({
        where: { branchId: ids.unmappedBranchId },
      })) === 0,
    );

    console.log("\n=== 8. Revisión concurrente ===");
    const raceExpense = await createExpense(ids, { number: "G-RACE", subtotal: 400 });
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

    console.log("\n=== 9. Período cerrado ===");
    const closedExpense = await createExpense(ids, { number: "G-CERRADO", subtotal: 700 });
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
      (await prisma.expense.findUniqueOrThrow({ where: { id: closedExpense.id } }))
        .status === "REGISTRADO",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 10. Reversión de la contabilización ===");
    const active = await findActiveExpensePosting(prisma, withRetentions.id);
    check("hay contabilización activa", Boolean(active));
    const reversedResult = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: active!.id,
          reason: "Retención mal calculada.",
        }),
    });
    check("revierte", reversedResult.ok, reversedResult.ok ? "" : reversedResult.error);
    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: retEntry.id },
      include: { lines: true },
    });
    check("espejo con las mismas 6 líneas", mirror.lines.length === 6);
    check(
      "espejo invertido",
      mirror.lines.reduce((s, l) => s + Number(l.credit), 0) === retDebit,
    );
    check(
      "asiento original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: retEntry.id } }))
        .status === "CONTABILIZADO",
    );
    check(
      "el gasto sigue REVISADO (la reversión no toca el negocio)",
      (await prisma.expense.findUniqueOrThrow({ where: { id: withRetentions.id } }))
        .status === "REVISADO",
    );

    console.log("\n=== 11. Revertir dos veces ===");
    const twiceRev = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: active!.id,
          reason: "Otra vez.",
        }),
    });
    check(
      "segunda reversión converge",
      twiceRev.ok && twiceRev.data.alreadyReversed === true,
    );
    check(
      "un solo espejo",
      (await prisma.journalEntry.count({
        where: { branchId: ids.branchId, reversalOfId: { not: null } },
      })) === 1,
    );

    console.log("\n=== 12. Consistencia final ===");
    const expenses = await prisma.expense.count({
      where: { branchId: { in: [ids.branchId, ids.unmappedBranchId] } },
    });
    const activePostings = await prisma.postingRecord.count({
      where: { branchId: ids.branchId, status: "CONTABILIZADO" },
    });
    const entries = await prisma.journalEntry.count({
      where: { branchId: ids.branchId, reversalOfId: null },
    });
    check("gastos creados", expenses === 7, String(expenses));
    check("contabilizaciones activas", activePostings === 2, String(activePostings));
    check("asientos (sin espejos)", entries === 3, String(entries));
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
    console.log(`\nRESULTADO SMOKE-FF1.4-E: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
