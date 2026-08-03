/**
 * SMOKE-FF2.0-E — flujo de liquidación de IVA.
 *
 *   npm run smoke:vat-settlement-workflow
 *
 * Reproduce los cuerpos transaccionales de `createVatSettlementAction`,
 * `updateVatSettlementAction` y `executeVatSettlementAction`, porque las
 * acciones de servidor autorizan contra la cookie de sesión. La autorización
 * queda fuera de cobertura.
 *
 * Limpieza guiada por TAG, nunca por el objeto `ids`.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  findActiveVatSettlementPosting,
  postVatSettlementInTransaction,
  vatSettlementAccountingDate,
  vatSettlementSourceId,
} from "@/server/contabilidad/posting";
import { runReversalPipeline } from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF20E-${Date.now()}`;
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
  branchId: string;
  unmappedBranchId: string;
  userId: string;
  accounts: Record<string, string>;
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

  const accounts: Record<string, string> = {};
  for (const name of ["IVA_POR_PAGAR", "BANCO"]) {
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "BANCO" ? "ACTIVO" : "PASIVO",
        nature: name === "BANCO" ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  await prisma.accountMappingSet.create({
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
            event: "LIQUIDACION_IVA",
            component: "IMPUESTO",
            debitAccountId: accounts.IVA_POR_PAGAR,
            creditAccountId: accounts.BANCO,
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
  };
}

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
  await prisma.vatSettlement.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.accountMappingRule.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.accountingClosing.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.chartAccount.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

/** Reproduce `createVatSettlementAction`: valida período y unicidad. */
async function createSettlement(
  ids: Ids,
  input: { period: string; amount: number; branchId?: string; notes?: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) {
    return { ok: false, error: "El período contable no es válido." };
  }
  try {
    const row = await prisma.vatSettlement.create({
      data: {
        branchId: input.branchId ?? ids.branchId,
        createdByUserId: ids.userId,
        period: input.period,
        amount: new Prisma.Decimal(input.amount.toFixed(2)),
        status: "BORRADOR",
        notes: input.notes ?? null,
      },
    });
    return { ok: true, id: row.id };
  } catch {
    return {
      ok: false,
      error: "Ya existe una liquidación de IVA para esa sucursal y período.",
    };
  }
}

/** Reproduce `updateVatSettlementAction`: solo se edita un BORRADOR. */
async function updateSettlement(
  settlementId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await prisma.vatSettlement.findUnique({
    where: { id: settlementId },
  });
  if (!current) return { ok: false, error: "La liquidación de IVA no existe." };
  if (current.status !== "BORRADOR") {
    return { ok: false, error: "Solo puedes editar una liquidación en borrador." };
  }
  await prisma.vatSettlement.update({
    where: { id: settlementId },
    data: { amount: new Prisma.Decimal(amount.toFixed(2)) },
  });
  return { ok: true };
}

/** Reproduce el cuerpo de `executeVatSettlementAction`. */
async function executeSettlement(ids: Ids, settlementId: string) {
  return runFinancialTransaction({
    actor: { userId: ids.userId, role: "CONTADOR" as const },
    run: async (ctx) => {
      const settlement = await ctx.tx.vatSettlement.findUnique({
        where: { id: settlementId },
      });
      if (!settlement) return ctx.fail("La liquidación de IVA no existe.");
      ctx.ensure(
        settlement.status === "BORRADOR",
        "La liquidación ya fue ejecutada.",
      );
      ctx.ensure(
        settlement.amount.greaterThan(0),
        "La liquidación no tiene monto por ejecutar.",
      );
      const guarded = await ctx.tx.vatSettlement.updateMany({
        where: { id: settlementId, status: "BORRADOR" },
        data: {
          status: "EJECUTADA",
          executedByUserId: ids.userId,
          executedAt: new Date(),
        },
      });
      if (guarded.count !== 1) return ctx.fail("La liquidación ya fue ejecutada.");
      const updated = await ctx.tx.vatSettlement.findUniqueOrThrow({
        where: { id: settlementId },
      });
      await ctx.audit({
        domain: "CONTABILIDAD",
        action: "VAT_SETTLEMENT_STATUS_CHANGED",
        entityType: "VAT_SETTLEMENT",
        entityId: updated.id,
        entityCode: updated.period,
        branchId: updated.branchId,
        after: { status: updated.status },
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
      const posting = await postVatSettlementInTransaction(ctx, updated);
      return { posting };
    },
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
    const ivaId = ids.accounts.IVA_POR_PAGAR;
    const bancoId = ids.accounts.BANCO;

    console.log("\n=== 1. Crear borrador ===");
    const draft = await createSettlement(ids, { period: PERIOD, amount: 5000 });
    check("crea", draft.ok, draft.ok ? "" : draft.error);
    if (!draft.ok) throw new Error("sin borrador no hay smoke");
    const draftRow = await prisma.vatSettlement.findUniqueOrThrow({
      where: { id: draft.id },
    });
    check("nace en BORRADOR", draftRow.status === "BORRADOR");
    check("sin ejecutor", draftRow.executedByUserId === null && draftRow.executedAt === null);
    check("sin asiento todavía", (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 0);

    console.log("\n=== 2. Editar el borrador ===");
    const edited = await updateSettlement(draft.id, 12500);
    check("edita", edited.ok, edited.ok ? "" : edited.error);
    check(
      "monto actualizado",
      Number(
        (await prisma.vatSettlement.findUniqueOrThrow({ where: { id: draft.id } })).amount,
      ) === 12500,
    );

    console.log("\n=== 3. Período duplicado -> lo impide la base de datos ===");
    const duplicate = await createSettlement(ids, { period: PERIOD, amount: 999 });
    check("rechazado", !duplicate.ok, duplicate.ok ? "aceptó" : "");
    check(
      "el mensaje nombra sucursal y período",
      !duplicate.ok && duplicate.error.includes("sucursal y período"),
      duplicate.ok ? "" : duplicate.error,
    );

    console.log("\n=== 4. Período malformado ===");
    const malformed = await createSettlement(ids, { period: "2026-13", amount: 100 });
    check("rechazado", !malformed.ok, malformed.ok ? "aceptó" : "");

    console.log("\n=== 5. Ejecutar -> asiento y registro de contabilización ===");
    const executed = await executeSettlement(ids, draft.id);
    check("ejecuta", executed.ok, executed.ok ? "" : executed.error);
    check("hubo contabilización", executed.ok && executed.data.posting !== null);
    const executedRow = await prisma.vatSettlement.findUniqueOrThrow({
      where: { id: draft.id },
    });
    check("queda EJECUTADA", executedRow.status === "EJECUTADA");
    check("sella ejecutor y fecha", executedRow.executedByUserId === ids.userId && executedRow.executedAt !== null);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId },
      include: { lines: true },
    });
    check("dos líneas (un componente)", entry.lines.length === 2, String(entry.lines.length));
    check("debita IVA por pagar", sumOn(entry.lines, ivaId).debit === 12500);
    check("acredita banco", sumOn(entry.lines, bancoId).credit === 12500);
    check(
      "fechado dentro del período liquidado",
      entry.entryDate.toISOString().slice(0, 7) === PERIOD,
      entry.entryDate.toISOString(),
    );
    check(
      "la fecha es el último día del período",
      vatSettlementAccountingDate(PERIOD).toISOString().slice(0, 10) === "2026-05-31",
    );

    const record = await prisma.postingRecord.findFirstOrThrow({
      where: { sourceType: "VAT_SETTLEMENT", status: "CONTABILIZADO" },
    });
    check(
      "el origen es sucursal:período, no el id de la fila",
      record.sourceId === vatSettlementSourceId({ branchId: ids.branchId, period: PERIOD }),
      record.sourceId,
    );

    console.log("\n=== 6. Inmutable tras ejecutar ===");
    const lateEdit = await updateSettlement(draft.id, 1);
    check("editar una ejecutada está prohibido", !lateEdit.ok, lateEdit.ok ? "aceptó" : "");
    check(
      "el monto no cambió",
      Number(
        (await prisma.vatSettlement.findUniqueOrThrow({ where: { id: draft.id } })).amount,
      ) === 12500,
    );

    console.log("\n=== 7. Ejecutar dos veces ===");
    const twice = await executeSettlement(ids, draft.id);
    check("segunda ejecución rechazada", !twice.ok, twice.ok ? "aceptó" : "");
    check(
      "sigue habiendo un solo asiento",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );

    console.log("\n=== 8. Monto cero -> no se ejecuta ===");
    const zero = await createSettlement(ids, { period: "2026-06", amount: 0 });
    check("el borrador se crea", zero.ok, zero.ok ? "" : zero.error);
    const zeroExec = await executeSettlement(ids, zero.ok ? zero.id : "");
    check("ejecutar rechazado", !zeroExec.ok, zeroExec.ok ? "aceptó" : "");
    check(
      "el mensaje nombra la regla de negocio",
      !zeroExec.ok && zeroExec.error.includes("no tiene monto por ejecutar"),
      zeroExec.ok ? "" : zeroExec.error,
    );
    check(
      "sigue en BORRADOR (rollback)",
      (await prisma.vatSettlement.findUniqueOrThrow({ where: { id: zero.ok ? zero.id : "" } }))
        .status === "BORRADOR",
    );

    console.log("\n=== 9. Sin mapeo -> rollback completo ===");
    const noMap = await createSettlement(ids, {
      period: PERIOD,
      amount: 700,
      branchId: ids.unmappedBranchId,
    });
    const noMapExec = await executeSettlement(ids, noMap.ok ? noMap.id : "");
    check("falla por mapeo faltante", !noMapExec.ok, noMapExec.ok ? "aceptó" : "");
    check(
      "la liquidación NO quedó ejecutada",
      (await prisma.vatSettlement.findUniqueOrThrow({ where: { id: noMap.ok ? noMap.id : "" } }))
        .status === "BORRADOR",
    );
    check(
      "sin asiento en esa sucursal",
      (await prisma.journalEntry.count({ where: { branchId: ids.unmappedBranchId } })) === 0,
    );

    console.log("\n=== 10. Período contable cerrado ===");
    const closedDraft = await createSettlement(ids, { period: "2026-07", amount: 800 });
    await prisma.accountingClosing.create({
      data: {
        branchId: ids.branchId,
        period: "2026-07",
        status: "CERRADO",
        closedByUserId: ids.userId,
        closedAt: new Date(),
      },
    });
    const closedExec = await executeSettlement(ids, closedDraft.ok ? closedDraft.id : "");
    check("período cerrado bloquea", !closedExec.ok, closedExec.ok ? "aceptó" : "");
    check(
      "la liquidación sigue en BORRADOR",
      (
        await prisma.vatSettlement.findUniqueOrThrow({
          where: { id: closedDraft.ok ? closedDraft.id : "" },
        })
      ).status === "BORRADOR",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 11. Mapeo archivado -> rollback ===");
    await prisma.accountMappingSet.updateMany({
      where: { code: TAG },
      data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
    });
    const archivedExec = await executeSettlement(ids, closedDraft.ok ? closedDraft.id : "");
    check("un conjunto archivado no contabiliza", !archivedExec.ok, archivedExec.ok ? "aceptó" : "");
    check(
      "sigue en BORRADOR",
      (
        await prisma.vatSettlement.findUniqueOrThrow({
          where: { id: closedDraft.ok ? closedDraft.id : "" },
        })
      ).status === "BORRADOR",
    );
    await prisma.accountMappingSet.updateMany({
      where: { code: TAG },
      data: { status: "ACTIVO", activeBranchKey: ids.branchId, archivedAt: null },
    });

    console.log("\n=== 12. Ejecución concurrente ===");
    const raceDraft = await createSettlement(ids, { period: "2026-08", amount: 900 });
    const [a, b] = await Promise.all([
      executeSettlement(ids, raceDraft.ok ? raceDraft.id : ""),
      executeSettlement(ids, raceDraft.ok ? raceDraft.id : ""),
    ]);
    check("solo una gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo registro de contabilización",
      (await prisma.postingRecord.count({
        where: {
          sourceType: "VAT_SETTLEMENT",
          sourceId: vatSettlementSourceId({ branchId: ids.branchId, period: "2026-08" }),
        },
      })) === 1,
    );

    console.log("\n=== 13. Reversión ===");
    const active = await findActiveVatSettlementPosting(prisma, {
      branchId: ids.branchId,
      period: PERIOD,
    });
    check("hay contabilización activa", Boolean(active));
    const reversed = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: active!.id,
          reason: "Declaración rectificada.",
        }),
    });
    check("revierte", reversed.ok, reversed.ok ? "" : reversed.error);
    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: entry.id },
      include: { lines: true },
    });
    check("espejo con dos líneas", mirror.lines.length === 2);
    check("el pasivo vuelve al haber", sumOn(mirror.lines, ivaId).credit === 12500);
    check(
      "asiento original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })).status ===
        "CONTABILIZADO",
    );
    check(
      "la liquidación sigue EJECUTADA (la reversión no toca el negocio)",
      (await prisma.vatSettlement.findUniqueOrThrow({ where: { id: draft.id } })).status ===
        "EJECUTADA",
    );

    console.log("\n=== 14. Consistencia final ===");
    const settlements = await prisma.vatSettlement.count({
      where: { branchId: { in: [ids.branchId, ids.unmappedBranchId] } },
    });
    const activePostings = await prisma.postingRecord.count({
      where: { branchId: ids.branchId, status: "CONTABILIZADO" },
    });
    const entries = await prisma.journalEntry.count({
      where: { branchId: ids.branchId, reversalOfId: null },
    });
    check("liquidaciones creadas", settlements === 5, String(settlements));
    check("contabilizaciones activas", activePostings === 1, String(activePostings));
    check("asientos (sin espejos)", entries === 2, String(entries));
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
    await cleanup();
    console.log(`\nRESULTADO SMOKE-FF2.0-E: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
