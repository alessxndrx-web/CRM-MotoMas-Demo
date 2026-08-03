/**
 * SMOKE-FF1.4-A — contabilización automática de comprobantes, contra PostgreSQL.
 *
 *   npm run smoke:voucher
 *
 * Verifica que el ciclo de vida del comprobante y el motor de contabilización
 * son atómicos: crear contabiliza, anular revierte, y ninguna de las dos cosas
 * puede quedar a medias.
 *
 * Las acciones de servidor (`createAccountingVoucherAction`, …) autorizan contra
 * la cookie de sesión y no pueden invocarse fuera de una petición, así que este
 * smoke reproduce **exactamente** el cuerpo transaccional que ellas ejecutan:
 * `runFinancialTransaction` + la misma escritura + `postVoucherInTransaction` /
 * `reverseVoucherPostingInTransaction`. Lo que no cubre es la autorización.
 *
 * Crea sus fixtures con un prefijo reconocible y los borra siempre.
 */
import { PrismaClient } from "@prisma/client";

import {
  findActiveVoucherPosting,
  postVoucherInTransaction,
  reverseVoucherPostingInTransaction,
} from "@/server/contabilidad/posting";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF14A-${Date.now()}`;

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
  userId: string;
  debitAccountId: string;
  creditAccountId: string;
  mappingSetId: string;
};

async function createFixtures(): Promise<Ids> {
  const branch = await prisma.branch.create({
    data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} contador`,
      email: `${TAG.toLowerCase()}@smoke.local`,
      passwordHash: "smoke:not-a-real-hash",
      role: "CONTADOR",
    },
  });
  const debit = await prisma.chartAccount.create({
    data: {
      code: `${TAG}-D`,
      name: "Gasto",
      type: "GASTO",
      nature: "DEUDORA",
      origin: "EMPRESA",
      effectiveFrom: new Date("2020-01-01"),
    },
  });
  const credit = await prisma.chartAccount.create({
    data: {
      code: `${TAG}-C`,
      name: "Banco",
      type: "ACTIVO",
      nature: "DEUDORA",
      origin: "EMPRESA",
      effectiveFrom: new Date("2020-01-01"),
    },
  });
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
        create: {
          event: "COMPROBANTE_EGRESO",
          component: "TOTAL",
          debitAccountId: debit.id,
          creditAccountId: credit.id,
        },
      },
    },
  });

  return {
    branchId: branch.id,
    userId: user.id,
    debitAccountId: debit.id,
    creditAccountId: credit.id,
    mappingSetId: set.id,
  };
}

async function cleanup(ids: Ids | null) {
  if (!ids) return;
  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: ids.userId },
  });
  await prisma.postingRecord.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.journalEntryLine.deleteMany({
    where: { entry: { branchId: ids.branchId } },
  });
  await prisma.journalEntry.deleteMany({
    where: { branchId: ids.branchId, reversalOfId: { not: null } },
  });
  await prisma.journalEntry.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.accountingVoucher.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.accountMappingRule.deleteMany({
    where: { setId: ids.mappingSetId },
  });
  await prisma.accountMappingSet.deleteMany({ where: { id: ids.mappingSetId } });
  await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.chartAccount.deleteMany({
    where: { id: { in: [ids.debitAccountId, ids.creditAccountId] } },
  });
  await prisma.user.deleteMany({ where: { id: ids.userId } });
  await prisma.branch.deleteMany({ where: { id: ids.branchId } });
}

/** Reproduce el cuerpo transaccional de `createAccountingVoucherAction`. */
async function createVoucher(
  ids: Ids,
  input: { type: string; number: string; amount: number; date?: Date },
) {
  const actor = { userId: ids.userId, role: "CONTADOR" as const };
  return runFinancialTransaction({
    actor,
    run: async (ctx) => {
      const row = await ctx.tx.accountingVoucher.create({
        data: {
          branchId: ids.branchId,
          createdByUserId: ids.userId,
          type: input.type as "EGRESO",
          status: "REGISTRADO",
          voucherNumber: `${TAG}-${input.number}`,
          voucherDate: input.date ?? new Date(),
          beneficiary: "Proveedor de prueba",
          concept: "Pago de servicios",
          amount: input.amount as unknown as never,
          total: input.amount as unknown as never,
          currency: "NIO",
        },
      });
      await ctx.audit({
        domain: "CONTABILIDAD",
        action: "VOUCHER_CREATED",
        entityType: "ACCOUNTING_VOUCHER",
        entityId: row.id,
        entityCode: row.voucherNumber,
        branchId: row.branchId,
        after: { status: row.status, type: row.type },
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      const posting = await postVoucherInTransaction(ctx, row);
      return { voucherId: row.id, posting };
    },
  });
}

/** Reproduce el cuerpo transaccional de `cancelAccountingVoucherAction`. */
async function cancelVoucher(ids: Ids, voucherId: string, reason: string) {
  const actor = { userId: ids.userId, role: "CONTADOR" as const };
  return runFinancialTransaction({
    actor,
    run: async (ctx) => {
      const voucher = await ctx.tx.accountingVoucher.findUnique({
        where: { id: voucherId },
      });
      if (!voucher) return ctx.fail("El comprobante no existe.");
      ctx.ensure(voucher.status !== "ANULADO", "El comprobante ya está anulado.");
      const updated = await ctx.tx.accountingVoucher.update({
        where: { id: voucherId },
        data: { status: "ANULADO" },
      });
      await ctx.audit({
        domain: "CONTABILIDAD",
        action: "VOUCHER_CANCELLED",
        entityType: "ACCOUNTING_VOUCHER",
        entityId: updated.id,
        entityCode: updated.voucherNumber,
        branchId: updated.branchId,
        reason,
        before: { status: voucher.status },
        after: { status: updated.status },
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
      const reversalId = await reverseVoucherPostingInTransaction(
        ctx,
        updated.id,
        `Anulación del comprobante ${updated.voucherNumber}: ${reason}`,
      );
      return { reversalId };
    },
  });
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();

    console.log("\n=== 1. EGRESO creado -> asiento automático ===");
    const egreso = await createVoucher(ids, {
      type: "EGRESO",
      number: "E1",
      amount: 2500,
    });
    check("crea", egreso.ok, egreso.ok ? "" : egreso.error);
    if (!egreso.ok) throw new Error("sin comprobante no hay smoke");
    check("contabilizó al crear", egreso.data.posting !== null);
    check(
      "un asiento en la sucursal",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );
    const record = await prisma.postingRecord.findFirstOrThrow({
      where: { sourceId: egreso.data.voucherId },
    });
    check("registro CONTABILIZADO", record.status === "CONTABILIZADO");
    check("monto del asiento", Number(record.totalAmount) === 2500);

    console.log("\n=== 2. Tipo sin estrategia -> sin contabilizar ===");
    const cheque = await createVoucher(ids, {
      type: "CHEQUE",
      number: "C1",
      amount: 900,
    });
    check("crea el cheque", cheque.ok, cheque.ok ? "" : cheque.error);
    check(
      "no contabilizó (sin estrategia)",
      cheque.ok && cheque.data.posting === null,
    );
    check(
      "sigue habiendo un solo asiento",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );

    console.log("\n=== 3. Contabilización idempotente ===");
    const repost = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: async (ctx) => {
        const voucher = await ctx.tx.accountingVoucher.findUniqueOrThrow({
          where: { id: egreso.data.voucherId },
        });
        return postVoucherInTransaction(ctx, voucher);
      },
    });
    check(
      "re-contabilizar converge",
      repost.ok && repost.data?.alreadyPosted === true,
      repost.ok ? "" : repost.error,
    );
    check(
      "no se creó otro asiento",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );

    console.log("\n=== 4. Fallo de contabilización -> rollback total ===");
    // Sin regla de mapeo activa, la contabilización falla: el comprobante
    // tampoco debe quedar.
    const rule = await prisma.accountMappingRule.findFirstOrThrow({
      where: { setId: ids.mappingSetId },
    });
    await prisma.accountMappingRule.delete({ where: { id: rule.id } });
    const beforeVouchers = await prisma.accountingVoucher.count({
      where: { branchId: ids.branchId },
    });
    const doomed = await createVoucher(ids, {
      type: "EGRESO",
      number: "E-FAIL",
      amount: 100,
    });
    check("la creación falla", !doomed.ok, doomed.ok ? "aceptó" : doomed.error);
    check(
      "el comprobante NO quedó",
      (await prisma.accountingVoucher.count({ where: { branchId: ids.branchId } })) ===
        beforeVouchers,
    );
    check(
      "no quedó asiento huérfano",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );
    await prisma.accountMappingRule.create({
      data: {
        setId: ids.mappingSetId,
        event: "COMPROBANTE_EGRESO",
        component: "TOTAL",
        debitAccountId: ids.debitAccountId,
        creditAccountId: ids.creditAccountId,
      },
    });

    console.log("\n=== 5. Creación concurrente -> una sola contabilización ===");
    const [r1, r2] = await Promise.all([
      createVoucher(ids, { type: "EGRESO", number: "E-RACE-A", amount: 700 }),
      createVoucher(ids, { type: "EGRESO", number: "E-RACE-B", amount: 700 }),
    ]);
    check("ambas creaciones resuelven", r1.ok && r2.ok);
    check(
      "cada comprobante tiene su propia contabilización",
      (await prisma.postingRecord.count({ where: { branchId: ids.branchId } })) === 3,
      String(await prisma.postingRecord.count({ where: { branchId: ids.branchId } })),
    );

    console.log("\n=== 6. Anulación -> reversión automática ===");
    const cancelled = await cancelVoucher(
      ids,
      egreso.data.voucherId,
      "Pago duplicado detectado.",
    );
    check("anula", cancelled.ok, cancelled.ok ? "" : cancelled.error);
    check("generó asiento espejo", Boolean(cancelled.ok && cancelled.data.reversalId));

    const voucherAfter = await prisma.accountingVoucher.findUniqueOrThrow({
      where: { id: egreso.data.voucherId },
    });
    check("comprobante ANULADO", voucherAfter.status === "ANULADO");

    const recordAfter = await prisma.postingRecord.findUniqueOrThrow({
      where: { id: record.id },
    });
    check("registro REVERTIDO", recordAfter.status === "REVERTIDO");
    check("clave activa liberada", recordAfter.activeIdempotencyKey === null);

    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: record.journalEntryId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    check(
      "espejo cuadrado e invertido",
      mirror.lines.reduce((s, l) => s + Number(l.debit), 0) ===
        mirror.lines.reduce((s, l) => s + Number(l.credit), 0) &&
        Number(mirror.lines[0].debit) === 0,
    );
    check(
      "auditoría de la anulación completa",
      (
        await prisma.financialAuditEvent.findMany({
          where: { actorUserId: ids.userId },
        })
      ).some((e) => e.action === "POSTING_REVERSED"),
    );

    console.log("\n=== 7. Anular dos veces ===");
    const twice = await cancelVoucher(ids, egreso.data.voucherId, "Otra vez.");
    check("segunda anulación rechazada", !twice.ok, twice.ok ? "aceptó" : "");
    check(
      "sigue habiendo un solo espejo",
      (await prisma.journalEntry.count({
        where: { branchId: ids.branchId, reversalOfId: { not: null } },
      })) === 1,
    );

    console.log("\n=== 8. Anular un comprobante sin contabilizar ===");
    const cancelCheque = await cancelVoucher(
      ids,
      cheque.ok ? cheque.data.voucherId : "",
      "Sin efecto contable.",
    );
    check("anula el cheque", cancelCheque.ok, cancelCheque.ok ? "" : cancelCheque.error);
    check(
      "no generó espejo",
      cancelCheque.ok && cancelCheque.data.reversalId === null,
    );

    console.log("\n=== 9. Edición bloqueada tras contabilizar ===");
    const stillPosted = await prisma.postingRecord.findFirst({
      where: { sourceId: r1.ok ? r1.data.voucherId : "", status: "CONTABILIZADO" },
    });
    check("el comprobante de la carrera sigue contabilizado", Boolean(stillPosted));
    const blocked = await findActiveVoucherPosting(
      prisma,
      r1.ok ? r1.data.voucherId : "",
    );
    check("findActiveVoucherPosting lo detecta", Boolean(blocked));

    console.log("\n=== 10. Estado final coherente ===");
    const finalVouchers = await prisma.accountingVoucher.count({
      where: { branchId: ids.branchId },
    });
    const finalActive = await prisma.postingRecord.count({
      where: { branchId: ids.branchId, status: "CONTABILIZADO" },
    });
    check("comprobantes creados", finalVouchers === 4, String(finalVouchers));
    check(
      "contabilizaciones activas = comprobantes EGRESO vivos",
      finalActive === 2,
      String(finalActive),
    );
  } finally {
    await cleanup(ids);
    console.log(`\nRESULTADO SMOKE-FF1.4-A: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
