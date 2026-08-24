/**
 * SMOKE-FF1.4-F — contabilización automática de planillas.
 *
 *   npm run smoke:payroll
 *
 * Reproduce el cuerpo transaccional de `preparePayrollRecordAction`
 * (`runFinancialTransaction` + transición guardada + `postPayrollInTransaction`)
 * porque las acciones de servidor autorizan contra la cookie de sesión y no se
 * pueden invocar fuera de una petición. La autorización queda fuera de cobertura.
 *
 * El escenario 6 reproduce el guard de edición de `updatePayrollRecordAction` y
 * el 11 el cuerpo de `markPayrollRecordPaidAction`. Verifican las reglas tal
 * como están escritas en las acciones, no las acciones mismas.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient } from "@prisma/client";

import {
  findActivePayrollPosting,
  payrollAccountingDate,
  postPayrollInTransaction,
} from "@/server/contabilidad/posting";
import { runReversalPipeline } from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF14F-${Date.now()}`;
const PERIOD = "2026-03";
const CLOSED_PERIOD = "2026-04";

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
  for (const name of ["GASTO_SALARIO", "SALARIOS_POR_PAGAR", "RETENCIONES"]) {
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "GASTO_SALARIO" ? "GASTO" : "PASIVO",
        nature: name === "GASTO_SALARIO" ? "DEUDORA" : "ACREEDORA",
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
            event: "PLANILLA",
            component: "PLANILLA_NETO",
            debitAccountId: accounts.GASTO_SALARIO,
            creditAccountId: accounts.SALARIOS_POR_PAGAR,
          },
          {
            event: "PLANILLA",
            component: "PLANILLA_DEDUCCIONES",
            debitAccountId: accounts.GASTO_SALARIO,
            creditAccountId: accounts.RETENCIONES,
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
  await prisma.payrollRecord.deleteMany({
    where: { branchId: { in: branchIds } },
  });
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

/** Misma aritmética que `calculatePayrollNetPay`. */
function netPayOf(input: {
  baseSalary: number;
  commissions: number;
  bonuses: number;
  deductions: number;
  advances: number;
}): number {
  return Math.max(
    input.baseSalary +
      input.commissions +
      input.bonuses -
      input.deductions -
      input.advances,
    0,
  );
}

async function createPayroll(
  ids: Ids,
  input: {
    employee: string;
    baseSalary: number;
    commissions?: number;
    bonuses?: number;
    deductions?: number;
    advances?: number;
    period?: string;
    status?: string;
    branchId?: string;
    /** Fuerza un neto distinto del calculado, para el caso inconsistente. */
    netPayOverride?: number;
  },
) {
  const commissions = input.commissions ?? 0;
  const bonuses = input.bonuses ?? 0;
  const deductions = input.deductions ?? 0;
  const advances = input.advances ?? 0;
  const netPay =
    input.netPayOverride ??
    netPayOf({
      baseSalary: input.baseSalary,
      commissions,
      bonuses,
      deductions,
      advances,
    });
  return prisma.payrollRecord.create({
    data: {
      branchId: input.branchId ?? ids.branchId,
      createdByUserId: ids.userId,
      employeeName: `${TAG}-${input.employee}`,
      position: "Puesto de prueba",
      period: input.period ?? PERIOD,
      status: (input.status ?? "BORRADOR") as "BORRADOR",
      baseSalary: input.baseSalary as unknown as never,
      commissions: commissions as unknown as never,
      bonuses: bonuses as unknown as never,
      deductions: deductions as unknown as never,
      advances: advances as unknown as never,
      netPay: netPay as unknown as never,
      currency: "NIO",
    },
  });
}

/** Reproduce el cuerpo de `preparePayrollRecordAction`. */
async function preparePayroll(ids: Ids, payrollRecordId: string) {
  const actor = { userId: ids.userId, role: "CONTADOR" as const };
  return runFinancialTransaction({
    actor,
    run: async (ctx) => {
      const record = await ctx.tx.payrollRecord.findUnique({
        where: { id: payrollRecordId },
      });
      if (!record) return ctx.fail("La planilla no existe.");
      ctx.ensure(
        record.status === "BORRADOR",
        "Solo puedes preparar una planilla en borrador.",
      );
      const guarded = await ctx.tx.payrollRecord.updateMany({
        where: { id: payrollRecordId, status: "BORRADOR" },
        data: { status: "PREPARADA" },
      });
      if (guarded.count !== 1) {
        return ctx.fail("Solo puedes preparar una planilla en borrador.");
      }
      const updated = await ctx.tx.payrollRecord.findUniqueOrThrow({
        where: { id: payrollRecordId },
      });
      await ctx.audit({
        domain: "CONTABILIDAD",
        action: "PAYROLL_RECORD_STATUS_CHANGED",
        entityType: "PAYROLL_RECORD",
        entityId: updated.id,
        entityCode: updated.period,
        branchId: updated.branchId,
        after: { status: updated.status },
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
      const posting = await postPayrollInTransaction(ctx, updated);
      return { posting };
    },
  });
}

/** Reproduce el cuerpo de `markPayrollRecordPaidAction`: NO contabiliza. */
async function markPaid(ids: Ids, payrollRecordId: string) {
  return runFinancialTransaction({
    actor: { userId: ids.userId, role: "CONTADOR" as const },
    run: async (ctx) => {
      const record = await ctx.tx.payrollRecord.findUnique({
        where: { id: payrollRecordId },
      });
      if (!record) return ctx.fail("La planilla no existe.");
      ctx.ensure(
        record.status === "PREPARADA",
        "Solo puedes pagar una planilla preparada.",
      );
      const guarded = await ctx.tx.payrollRecord.updateMany({
        where: { id: payrollRecordId, status: "PREPARADA" },
        data: { status: "PAGADA" },
      });
      if (guarded.count !== 1) {
        return ctx.fail("Solo puedes pagar una planilla preparada.");
      }
      return { ok: true as const };
    },
  });
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();

    console.log("\n=== 1. Fecha contable derivada del período ===");
    check(
      "último día del mes, en UTC",
      payrollAccountingDate(PERIOD).toISOString().slice(0, 10) === "2026-03-31",
      payrollAccountingDate(PERIOD).toISOString(),
    );
    check(
      "el período derivado coincide con el declarado",
      payrollAccountingDate(PERIOD).toISOString().slice(0, 7) === PERIOD,
    );
    check(
      "un período malformado produce fecha inválida",
      Number.isNaN(payrollAccountingDate("2026-13").getTime()),
    );

    console.log("\n=== 2. Planilla sin deducciones -> solo PLANILLA_NETO ===");
    const simple = await createPayroll(ids, {
      employee: "E-SIMPLE",
      baseSalary: 12000,
      commissions: 1500,
      bonuses: 500,
    });
    const simplePost = await preparePayroll(ids, simple.id);
    check("contabiliza", simplePost.ok, simplePost.ok ? "" : simplePost.error);
    if (!simplePost.ok) throw new Error("sin contabilización no hay smoke");
    check("hubo contabilización", simplePost.data.posting !== null);
    check(
      "planilla PREPARADA",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: simple.id } }))
        .status === "PREPARADA",
    );
    const simpleEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId },
      include: { lines: true },
    });
    check("dos líneas", simpleEntry.lines.length === 2, String(simpleEntry.lines.length));
    check(
      "monto = devengado",
      simpleEntry.lines.reduce((s, l) => s + Number(l.debit), 0) === 14000,
    );
    check(
      "asiento fechado en el período",
      simpleEntry.entryDate.toISOString().slice(0, 7) === PERIOD,
      simpleEntry.entryDate.toISOString(),
    );

    console.log("\n=== 3. Planilla con deducciones -> NETO + DEDUCCIONES ===");
    const withDeductions = await createPayroll(ids, {
      employee: "E-DED",
      baseSalary: 20000,
      commissions: 0,
      bonuses: 0,
      deductions: 3000,
    });
    const dedPost = await preparePayroll(ids, withDeductions.id);
    check("contabiliza", dedPost.ok, dedPost.ok ? "" : dedPost.error);
    const dedEntry = await prisma.journalEntry.findFirstOrThrow({
      where: {
        branchId: ids.branchId,
        id: { not: simpleEntry.id },
        reversalOfId: null,
      },
      include: { lines: true },
    });
    check("cuatro líneas (2 componentes)", dedEntry.lines.length === 4, String(dedEntry.lines.length));
    const dedDebit = dedEntry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const dedCredit = dedEntry.lines.reduce((s, l) => s + Number(l.credit), 0);
    check("cuadrado", dedDebit === dedCredit, `${dedDebit} vs ${dedCredit}`);

    // Lo que decide si la derivación es correcta: el gasto debe quedar en el
    // DEVENGADO (20000), no en el neto (17000).
    const gastoId = ids.accounts.GASTO_SALARIO;
    const gastoDebit = dedEntry.lines
      .filter((l) => l.accountId === gastoId)
      .reduce((s, l) => s + Number(l.debit), 0);
    check("gasto = devengado, no el neto", gastoDebit === 20000, String(gastoDebit));
    const porPagarId = ids.accounts.SALARIOS_POR_PAGAR;
    const retencionesId = ids.accounts.RETENCIONES;
    const porPagar = dedEntry.lines
      .filter((l) => l.accountId === porPagarId)
      .reduce((s, l) => s + Number(l.credit), 0);
    const retenciones = dedEntry.lines
      .filter((l) => l.accountId === retencionesId)
      .reduce((s, l) => s + Number(l.credit), 0);
    check("salarios por pagar = neto", porPagar === 17000, String(porPagar));
    check("retenciones por pagar = deducciones", retenciones === 3000, String(retenciones));

    console.log("\n=== 4. Planilla con anticipos -> rechazo y rollback ===");
    const withAdvances = await createPayroll(ids, {
      employee: "E-ANT",
      baseSalary: 10000,
      advances: 2000,
    });
    const advPost = await preparePayroll(ids, withAdvances.id);
    check("planilla con anticipos rechazada", !advPost.ok, advPost.ok ? "aceptó" : "");
    check(
      "el mensaje explica el anticipo",
      !advPost.ok && advPost.error.toLowerCase().includes("anticipo"),
      advPost.ok ? "" : advPost.error,
    );
    check(
      "sigue en BORRADOR (rollback)",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: withAdvances.id } }))
        .status === "BORRADOR",
    );
    check(
      "sin asiento huérfano",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 2,
    );

    console.log("\n=== 5. Deducciones mayores que el devengado -> rechazo ===");
    const overDeducted = await createPayroll(ids, {
      employee: "E-DED-EXC",
      baseSalary: 1000,
      deductions: 1500,
    });
    const overPost = await preparePayroll(ids, overDeducted.id);
    check("rechazado", !overPost.ok, overPost.ok ? "aceptó" : "");
    check(
      "sigue en BORRADOR",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: overDeducted.id } }))
        .status === "BORRADOR",
    );

    console.log("\n=== 6. Neto inconsistente con sus partes -> rechazo ===");
    const inconsistent = await createPayroll(ids, {
      employee: "E-INC",
      baseSalary: 5000,
      deductions: 500,
      netPayOverride: 4000, // debería ser 4500
    });
    const incPost = await preparePayroll(ids, inconsistent.id);
    check("rechazado", !incPost.ok, incPost.ok ? "aceptó" : "");
    check(
      "el mensaje menciona la inconsistencia",
      !incPost.ok && incPost.error.toLowerCase().includes("inconsistente"),
      incPost.ok ? "" : incPost.error,
    );

    console.log("\n=== 7. Preparar dos veces ===");
    const twice = await preparePayroll(ids, simple.id);
    check("segunda preparación rechazada", !twice.ok, twice.ok ? "aceptó" : "");
    check(
      "siguen habiendo dos asientos",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 2,
    );

    console.log("\n=== 8. Inmutabilidad tras preparar ===");
    // Guard de `updatePayrollRecordAction`: solo se edita un BORRADOR.
    const prepared = await prisma.payrollRecord.findUniqueOrThrow({
      where: { id: simple.id },
    });
    check(
      "editar una planilla preparada está prohibido",
      prepared.status !== "BORRADOR",
      prepared.status,
    );
    check(
      "editar un borrador sigue permitido",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: withAdvances.id } }))
        .status === "BORRADOR",
    );

    console.log("\n=== 9. Rollback: sin mapeo, nada queda ===");
    const noMap = await createPayroll(ids, {
      employee: "E-NOMAP",
      baseSalary: 800,
      branchId: ids.unmappedBranchId,
    });
    const noMapPost = await preparePayroll(ids, noMap.id);
    check("falla por mapeo faltante", !noMapPost.ok, noMapPost.ok ? "aceptó" : noMapPost.error);
    check(
      "la planilla NO quedó preparada",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: noMap.id } }))
        .status === "BORRADOR",
    );
    check(
      "sin asiento en esa sucursal",
      (await prisma.journalEntry.count({
        where: { branchId: ids.unmappedBranchId },
      })) === 0,
    );

    console.log("\n=== 10. Preparación concurrente ===");
    const racePayroll = await createPayroll(ids, {
      employee: "E-RACE",
      baseSalary: 900,
    });
    const [a, b] = await Promise.all([
      preparePayroll(ids, racePayroll.id),
      preparePayroll(ids, racePayroll.id),
    ]);
    check("solo una gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo registro de contabilización",
      (await prisma.postingRecord.count({
        where: { sourceType: "PAYROLL_RECORD", sourceId: racePayroll.id },
      })) === 1,
    );

    console.log("\n=== 11. Período cerrado, juzgado contra el período ===");
    const closedPayroll = await createPayroll(ids, {
      employee: "E-CERRADO",
      baseSalary: 700,
      period: CLOSED_PERIOD,
    });
    await prisma.accountingClosing.create({
      data: {
        branchId: ids.branchId,
        period: CLOSED_PERIOD,
        status: "CERRADO",
        closedByUserId: ids.userId,
        closedAt: new Date(),
      },
    });
    const closed = await preparePayroll(ids, closedPayroll.id);
    check("período cerrado bloquea", !closed.ok, closed.ok ? "aceptó" : "");
    check(
      "planilla intacta",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: closedPayroll.id } }))
        .status === "BORRADOR",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 12. PAGADA no genera un segundo asiento ===");
    const entriesBeforePaid = await prisma.journalEntry.count({
      where: { branchId: ids.branchId },
    });
    const paid = await markPaid(ids, simple.id);
    check("marca pagada", paid.ok, paid.ok ? "" : paid.error);
    check(
      "planilla PAGADA",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: simple.id } }))
        .status === "PAGADA",
    );
    check(
      "ningún asiento nuevo (el pago no se contabiliza)",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) ===
        entriesBeforePaid,
    );
    check(
      "una sola contabilización para esa planilla",
      (await prisma.postingRecord.count({
        where: { sourceType: "PAYROLL_RECORD", sourceId: simple.id },
      })) === 1,
    );

    console.log("\n=== 13. Reversión de la contabilización ===");
    const active = await findActivePayrollPosting(prisma, withDeductions.id);
    check("hay contabilización activa", Boolean(active));
    const reversedResult = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: active!.id,
          reason: "Deducción mal calculada.",
        }),
    });
    check("revierte", reversedResult.ok, reversedResult.ok ? "" : reversedResult.error);
    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: dedEntry.id },
      include: { lines: true },
    });
    check("espejo con las mismas 4 líneas", mirror.lines.length === 4);
    check(
      "espejo invertido",
      mirror.lines.reduce((s, l) => s + Number(l.credit), 0) === dedDebit,
    );
    check(
      "asiento original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: dedEntry.id } }))
        .status === "CONTABILIZADO",
    );
    check(
      "la planilla sigue PREPARADA (la reversión no toca el negocio)",
      (await prisma.payrollRecord.findUniqueOrThrow({ where: { id: withDeductions.id } }))
        .status === "PREPARADA",
    );

    console.log("\n=== 14. Revertir dos veces ===");
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

    console.log("\n=== 15. Consistencia final ===");
    const payrolls = await prisma.payrollRecord.count({
      where: { branchId: { in: [ids.branchId, ids.unmappedBranchId] } },
    });
    const activePostings = await prisma.postingRecord.count({
      where: { branchId: ids.branchId, status: "CONTABILIZADO" },
    });
    const entries = await prisma.journalEntry.count({
      where: { branchId: ids.branchId, reversalOfId: null },
    });
    check("planillas creadas", payrolls === 8, String(payrolls));
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
    console.log(`\nRESULTADO SMOKE-FF1.4-F: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
