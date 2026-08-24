/**
 * SMOKE-FF2.0-D — liquidación de IVA.
 *
 *   npm run smoke:vat-settlement
 *
 * A diferencia de las suites anteriores, aquí NO hay acción de servidor que
 * reproducir: la liquidación no tiene modelo de negocio ni flujo. La suite
 * construye la `PostingRequest` y la pasa por `runPostingPipeline`, que es
 * exactamente lo que haría un seam futuro. La autorización queda fuera de
 * cobertura, como en todas.
 *
 * Limpieza guiada por TAG, nunca por el objeto `ids`: un fixture a medio
 * construir se borra igual que uno completo (defecto detectado en FF2.0-C).
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { runPostingPipeline, runReversalPipeline } from "@/server/finance/posting/pipeline";
import { listPostingRecords } from "@/server/finance/posting/repository";
import type { PostingRequest } from "@/server/finance/posting/shared";
import { validateMappingSet } from "@/server/finance/account-mapping/validation";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF20D-${Date.now()}`;
const PERIOD = "2026-05";

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
  /** Liquidación a pagar: debita IVA por pagar, acredita banco. */
  payableBranchId: string;
  /** Liquidación a favor: debita IVA acreditable, acredita banco. */
  creditBranchId: string;
  /** Sin mapeo de liquidación. */
  unmappedBranchId: string;
  userId: string;
  accounts: Record<string, string>;
};

const ACCOUNT_NAMES = [
  "IVA_POR_PAGAR",
  "IVA_ACREDITABLE",
  "BANCO",
  "CXP",
  "GASTO",
] as const;

async function createFixtures(): Promise<Ids> {
  const payable = await prisma.branch.create({
    data: { code: `${TAG}-pag`.toLowerCase(), name: `${TAG} a pagar` },
  });
  const credit = await prisma.branch.create({
    data: { code: `${TAG}-fav`.toLowerCase(), name: `${TAG} a favor` },
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

  const accounts: Record<string, string> = {};
  for (const name of ACCOUNT_NAMES) {
    const isDebitNature =
      name === "IVA_ACREDITABLE" || name === "BANCO" || name === "GASTO";
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "GASTO" ? "GASTO" : isDebitNature ? "ACTIVO" : "PASIVO",
        nature: isDebitNature ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  async function activeSet(
    code: string,
    branchId: string,
    rules: Prisma.AccountMappingRuleCreateWithoutSetInput[],
  ) {
    return prisma.accountMappingSet.create({
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

  // Período que cierra debiendo: se cancela el pasivo contra el banco.
  await activeSet(`${TAG}-A`, payable.id, [
    {
      event: "LIQUIDACION_IVA",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.IVA_POR_PAGAR } },
      creditAccount: { connect: { id: accounts.BANCO } },
    },
    // Un gasto gravado convive en la misma sucursal (escenario 11).
    {
      event: "GASTO",
      component: "SUBTOTAL",
      debitAccount: { connect: { id: accounts.GASTO } },
      creditAccount: { connect: { id: accounts.CXP } },
    },
    {
      event: "GASTO",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.IVA_ACREDITABLE } },
      creditAccount: { connect: { id: accounts.CXP } },
    },
  ]);

  // Período que cierra a favor: el crédito fiscal se recupera contra el banco.
  await activeSet(`${TAG}-B`, credit.id, [
    {
      event: "LIQUIDACION_IVA",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.BANCO } },
      creditAccount: { connect: { id: accounts.IVA_ACREDITABLE } },
    },
  ]);

  return {
    payableBranchId: payable.id,
    creditBranchId: credit.id,
    unmappedBranchId: unmapped.id,
    userId: user.id,
    accounts,
  };
}

/** Guiada por TAG: funciona aunque `createFixtures` haya fallado a medias. */
async function cleanup() {
  const branches = await prisma.branch.findMany({
    where: { code: { startsWith: TAG.toLowerCase() } },
    select: { id: true },
  });
  const branchIds = branches.map((branch) => branch.id);
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

  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: { in: userIds } },
  });
  await prisma.postingRecord.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.journalEntryLine.deleteMany({
    where: { entry: { branchId: { in: branchIds } } },
  });
  await prisma.journalEntry.deleteMany({
    where: { branchId: { in: branchIds }, reversalOfId: { not: null } },
  });
  await prisma.journalEntry.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.expense.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.accountMappingRule.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.accountingClosing.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.chartAccount.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

function settlementRequest(input: {
  branchId: string;
  period?: string;
  amount: number;
  date?: Date;
}): PostingRequest {
  const period = input.period ?? PERIOD;
  return {
    event: "LIQUIDACION_IVA",
    // Sin modelo de negocio, el período ES la identidad de la liquidación.
    source: { type: "VAT_SETTLEMENT", id: `${input.branchId}:${period}` },
    branchId: input.branchId,
    accountingDate: input.date ?? new Date(`${period}-28T00:00:00.000Z`),
    currency: "NIO",
    description: `Liquidación de IVA ${period}`,
    journalSource: "MANUAL",
    payload: {
      period,
      amount: input.amount,
      concept: "Declaración mensual",
    },
  };
}

/** Lo que haría un seam futuro: abrir la transacción y pasar por el pipeline. */
async function settle(
  ids: Ids,
  input: { branchId: string; period?: string; amount: number; date?: Date },
) {
  return runFinancialTransaction({
    actor: { userId: ids.userId, role: "CONTADOR" as const },
    run: (ctx) => runPostingPipeline(ctx, settlementRequest(input)),
  });
}

function sumOn(
  lines: Array<{ accountId: string; debit: unknown; credit: unknown }>,
  accountId: string,
) {
  return {
    debit: lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + Number(l.debit), 0),
    credit: lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + Number(l.credit), 0),
  };
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();
    const ivaPorPagarId = ids.accounts.IVA_POR_PAGAR;
    const ivaAcreditableId = ids.accounts.IVA_ACREDITABLE;
    const bancoId = ids.accounts.BANCO;

    console.log("\n=== 1. Liquidación a pagar -> se cancela el pasivo ===");
    const payable = await settle(ids, { branchId: ids.payableBranchId, amount: 12500 });
    check("contabiliza", payable.ok, payable.ok ? "" : payable.error);
    if (!payable.ok) throw new Error("sin contabilización no hay smoke");
    const payableEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { id: payable.data.journalEntryId },
      include: { lines: true },
    });
    check("dos líneas (un componente)", payableEntry.lines.length === 2, String(payableEntry.lines.length));
    check("debita IVA por pagar", sumOn(payableEntry.lines, ivaPorPagarId).debit === 12500);
    check("acredita banco", sumOn(payableEntry.lines, bancoId).credit === 12500);
    check(
      "fechado dentro del período liquidado",
      payableEntry.entryDate.toISOString().slice(0, 7) === PERIOD,
      payableEntry.entryDate.toISOString(),
    );

    console.log("\n=== 2. Liquidación a favor -> la dirección la fija el mapeo ===");
    const credit = await settle(ids, { branchId: ids.creditBranchId, amount: 3200 });
    check("contabiliza", credit.ok, credit.ok ? "" : credit.error);
    const creditEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { id: credit.ok ? credit.data.journalEntryId : "" },
      include: { lines: true },
    });
    check("debita banco", sumOn(creditEntry.lines, bancoId).debit === 3200);
    check("acredita IVA acreditable", sumOn(creditEntry.lines, ivaAcreditableId).credit === 3200);
    check(
      "el mismo componente produjo asientos opuestos",
      sumOn(payableEntry.lines, bancoId).credit === 12500 &&
        sumOn(creditEntry.lines, bancoId).debit === 3200,
    );

    console.log("\n=== 3. Monto cero -> rechazo explícito ===");
    const zero = await settle(ids, { branchId: ids.payableBranchId, period: "2026-06", amount: 0 });
    check("rechazado", !zero.ok, zero.ok ? "aceptó" : "");
    check(
      "el mensaje nombra la liquidación, no un fallo genérico",
      !zero.ok && zero.error.toLowerCase().includes("no tiene monto por contabilizar"),
      zero.ok ? "" : zero.error,
    );

    console.log("\n=== 4. Período malformado -> carga útil inválida ===");
    const badPeriod = await settle(ids, {
      branchId: ids.payableBranchId,
      period: "2026-13",
      amount: 100,
    });
    check("rechazado", !badPeriod.ok, badPeriod.ok ? "aceptó" : "");

    console.log("\n=== 5. Sin mapeo -> rollback, nada queda ===");
    const noMap = await settle(ids, { branchId: ids.unmappedBranchId, amount: 500 });
    check("falla por mapeo faltante", !noMap.ok, noMap.ok ? "aceptó" : "");
    check(
      "el mensaje nombra el evento y el componente",
      !noMap.ok && noMap.error.includes("LIQUIDACION_IVA") && noMap.error.includes("IMPUESTO"),
      noMap.ok ? "" : noMap.error,
    );
    check(
      "sin asiento en esa sucursal",
      (await prisma.journalEntry.count({ where: { branchId: ids.unmappedBranchId } })) === 0,
    );
    check(
      "sin registro de contabilización",
      (await prisma.postingRecord.count({ where: { branchId: ids.unmappedBranchId } })) === 0,
    );

    console.log("\n=== 6. Idempotencia: el mismo período no se liquida dos veces ===");
    const again = await settle(ids, { branchId: ids.payableBranchId, amount: 12500 });
    check("converge en la contabilización existente", again.ok, again.ok ? "" : again.error);
    check("marcada como ya contabilizada", again.ok && again.data.alreadyPosted === true);
    check(
      "sigue habiendo un solo asiento para ese período",
      (await prisma.journalEntry.count({ where: { branchId: ids.payableBranchId } })) === 1,
    );

    console.log("\n=== 7. Otro período sí se liquida ===");
    const other = await settle(ids, {
      branchId: ids.payableBranchId,
      period: "2026-06",
      amount: 4000,
    });
    check("contabiliza", other.ok, other.ok ? "" : other.error);
    check("es una contabilización nueva", other.ok && other.data.alreadyPosted !== true);

    console.log("\n=== 8. Liquidación concurrente del mismo período ===");
    const [a, b] = await Promise.all([
      settle(ids, { branchId: ids.payableBranchId, period: "2026-07", amount: 900 }),
      settle(ids, { branchId: ids.payableBranchId, period: "2026-07", amount: 900 }),
    ]);
    // Cuál de las dos gana depende del instante en que cada transacción lee: si
    // la segunda lee antes del commit de la primera, choca contra el índice
    // único y su transacción falla; si lee después, converge. Las dos salidas
    // son correctas. Lo que el motor garantiza —y lo único que se puede
    // afirmar— es que al menos una gana y que queda exactamente un registro.
    check("al menos una gana", a.ok || b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo registro para ese período",
      (await prisma.postingRecord.count({
        where: {
          sourceType: "VAT_SETTLEMENT",
          sourceId: `${ids.payableBranchId}:2026-07`,
          status: "CONTABILIZADO",
        },
      })) === 1,
    );

    console.log("\n=== 9. Período contable cerrado ===");
    await prisma.accountingClosing.create({
      data: {
        branchId: ids.payableBranchId,
        period: "2026-08",
        status: "CERRADO",
        closedByUserId: ids.userId,
        closedAt: new Date(),
      },
    });
    const closed = await settle(ids, {
      branchId: ids.payableBranchId,
      period: "2026-08",
      amount: 700,
    });
    check("período cerrado bloquea", !closed.ok, closed.ok ? "aceptó" : "");
    await prisma.accountingClosing.deleteMany({
      where: { branchId: ids.payableBranchId },
    });

    console.log("\n=== 10. Mapeo archivado -> deja de resolver ===");
    await prisma.accountMappingSet.updateMany({
      where: { code: `${TAG}-B` },
      data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
    });
    const afterArchive = await settle(ids, {
      branchId: ids.creditBranchId,
      period: "2026-06",
      amount: 100,
    });
    check("un conjunto archivado no contabiliza", !afterArchive.ok, afterArchive.ok ? "aceptó" : "");

    console.log("\n=== 11. Convive con las contabilizaciones de FF2.0-A ===");
    const expense = await prisma.expense.create({
      data: {
        branchId: ids.payableBranchId,
        createdByUserId: ids.userId,
        category: "SERVICIOS_BASICOS",
        status: "REGISTRADO",
        expenseDate: new Date(`${PERIOD}-15T00:00:00.000Z`),
        supplier: "Proveedor",
        concept: "Servicio gravado",
        invoiceNumber: `${TAG}-G1`,
        amount: new Prisma.Decimal("1000.00"),
        subtotal: new Prisma.Decimal("1000.00"),
        tax: new Prisma.Decimal("150.00"),
        retention1: new Prisma.Decimal(0),
        retention2: new Prisma.Decimal(0),
        total: new Prisma.Decimal("1150.00"),
        currency: "NIO",
      },
    });
    const expensePosted = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: async (ctx) => {
        const { postExpenseInTransaction } = await import(
          "@/server/contabilidad/posting"
        );
        return postExpenseInTransaction(ctx, expense);
      },
    });
    check("el gasto gravado contabiliza igual", expensePosted.ok, expensePosted.ok ? "" : expensePosted.error);
    const expenseEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { id: expensePosted.ok ? expensePosted.data!.journalEntryId : "" },
      include: { lines: true },
    });
    check("IVA acreditable del gasto = 150", sumOn(expenseEntry.lines, ivaAcreditableId).debit === 150);
    check(
      "los dos eventos usan IMPUESTO sin interferirse",
      (await prisma.postingRecord.count({
        where: { branchId: ids.payableBranchId, status: "CONTABILIZADO" },
      })) === 4,
      String(
        await prisma.postingRecord.count({
          where: { branchId: ids.payableBranchId, status: "CONTABILIZADO" },
        }),
      ),
    );

    console.log("\n=== 12. Reversión de una liquidación ===");
    const records = await listPostingRecords(prisma, {
      sourceType: "VAT_SETTLEMENT",
      sourceId: `${ids.payableBranchId}:${PERIOD}`,
      status: "CONTABILIZADO",
    });
    check("hay contabilización activa", records.length === 1);
    const reversed = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: records[0]!.id,
          reason: "Declaración rectificada.",
        }),
    });
    check("revierte", reversed.ok, reversed.ok ? "" : reversed.error);
    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: payableEntry.id },
      include: { lines: true },
    });
    check("espejo con dos líneas", mirror.lines.length === 2);
    check("el pasivo vuelve al haber", sumOn(mirror.lines, ivaPorPagarId).credit === 12500);
    check("el banco vuelve al debe", sumOn(mirror.lines, bancoId).debit === 12500);
    check(
      "asiento original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: payableEntry.id } })).status ===
        "CONTABILIZADO",
    );

    console.log("\n=== 13. Validación de mapeo: X3 no aplica a la liquidación ===");
    // X3 busca IMPUESTO junto a SUBTOTAL. La liquidación no tiene SUBTOTAL, así
    // que un conjunto con solo la regla de impuesto debe ser válido.
    const draft = await prisma.accountMappingSet.create({
      data: {
        code: `${TAG}-V`,
        version: 1,
        name: `${TAG} borrador`,
        status: "BORRADOR",
        branchId: ids.payableBranchId,
        branchKey: ids.payableBranchId,
        activeBranchKey: null,
        effectiveFrom: new Date("2020-01-01"),
        createdByUserId: ids.userId,
        rules: {
          create: [
            {
              event: "LIQUIDACION_IVA",
              component: "IMPUESTO",
              debitAccount: { connect: { id: ids.accounts.IVA_POR_PAGAR } },
              creditAccount: { connect: { id: ids.accounts.BANCO } },
            },
          ],
        },
      },
    });
    const draftResult = await validateMappingSet(prisma, draft.id);
    check(
      "un conjunto con solo IMPUESTO de liquidación es válido",
      draftResult.valid,
      JSON.stringify(draftResult.issues),
    );

    console.log("\n=== 14. Consistencia final ===");
    const entries = await prisma.journalEntry.count({
      where: { branchId: ids.payableBranchId, reversalOfId: null },
    });
    check("asientos en la sucursal a pagar", entries === 4, String(entries));
    check(
      "todo asiento del motor tiene registro",
      (
        await prisma.journalEntry.findMany({
          where: {
            branchId: { in: [ids.payableBranchId, ids.creditBranchId] },
            reversalOfId: null,
          },
          include: { postingRecord: true },
        })
      ).every((e) => e.postingRecord !== null),
    );
  } finally {
    await cleanup();
    console.log(`\nRESULTADO SMOKE-FF2.0-D: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
