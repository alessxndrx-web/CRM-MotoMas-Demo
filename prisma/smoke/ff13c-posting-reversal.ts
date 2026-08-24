/**
 * SMOKE-FF1.3-C — motor de contabilización y reversión, contra PostgreSQL real.
 *
 *   npm run smoke:posting
 *
 * Ejercita el motor completo con la base de datos de verdad: escrituras,
 * restricciones únicas, claves foráneas, reversión de transacción, persistencia
 * de auditoría y el bloqueo de período. Sigue la metodología de los smokes 4.0S:
 * crea sus propios fixtures con un prefijo reconocible y **los borra todos al
 * terminar**, incluso si una aserción falla.
 *
 * Lo que NO cubre: la autorización. `authorizeFinancialFoundation` resuelve la
 * sesión desde la cookie firmada de la petición, que un script fuera de Next no
 * puede construir. El motor es inalcanzable sin ella — `executePosting` y
 * `reversePosting` autorizan antes de abrir la transacción — pero eso se verifica
 * leyendo el código, no aquí.
 */
import { PrismaClient } from "@prisma/client";

import { isPostingError } from "@/server/finance/posting/errors";
import {
  runPostingPipeline,
  runReversalPipeline,
} from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF13C-${Date.now()}`;

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
  ruleId: string;
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
      name: "Gasto de prueba",
      type: "GASTO",
      nature: "DEUDORA",
      origin: "EMPRESA",
      effectiveFrom: new Date("2020-01-01"),
    },
  });
  const credit = await prisma.chartAccount.create({
    data: {
      code: `${TAG}-C`,
      name: "Banco de prueba",
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
    },
  });
  const rule = await prisma.accountMappingRule.create({
    data: {
      setId: set.id,
      event: "COMPROBANTE_EGRESO",
      component: "TOTAL",
      debitAccountId: debit.id,
      creditAccountId: credit.id,
    },
  });

  return {
    branchId: branch.id,
    userId: user.id,
    debitAccountId: debit.id,
    creditAccountId: credit.id,
    mappingSetId: set.id,
    ruleId: rule.id,
  };
}

async function cleanup(ids: Ids | null) {
  if (!ids) return;
  // Orden inverso a las claves foráneas. Nada queda vivo.
  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: ids.userId },
  });
  await prisma.postingRecord.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.journalEntryLine.deleteMany({
    where: { entry: { branchId: ids.branchId } },
  });
  // Las reversiones apuntan al original con FK Restrict: se borran primero.
  await prisma.journalEntry.deleteMany({
    where: { branchId: ids.branchId, reversalOfId: { not: null } },
  });
  await prisma.journalEntry.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.accountMappingRule.deleteMany({
    where: { setId: ids.mappingSetId },
  });
  await prisma.accountMappingSet.deleteMany({ where: { id: ids.mappingSetId } });
  await prisma.accountingClosing.deleteMany({
    where: { branchId: ids.branchId },
  });
  await prisma.chartAccount.deleteMany({
    where: { id: { in: [ids.debitAccountId, ids.creditAccountId] } },
  });
  await prisma.user.deleteMany({ where: { id: ids.userId } });
  await prisma.branch.deleteMany({ where: { id: ids.branchId } });
}

function buildRequest(ids: Ids, sourceId: string, date: Date) {
  return {
    event: "COMPROBANTE_EGRESO" as const,
    source: { type: "ACCOUNTING_VOUCHER" as const, id: sourceId },
    branchId: ids.branchId,
    accountingDate: date,
    currency: "NIO",
    description: `${TAG} comprobante ${sourceId}`,
    payload: {
      voucherId: sourceId,
      voucherNumber: `${TAG}-${sourceId}`,
      amount: 1234.56,
      beneficiary: "Proveedor de prueba",
      concept: "Pago de servicios",
    },
  };
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();
    const actor = { userId: ids.userId, role: "CONTADOR" as const };
    const today = new Date();

    console.log("\n=== 1. Contabilización exitosa ===");
    const posted = await runFinancialTransaction({
      actor,
      run: (ctx) => runPostingPipeline(ctx, buildRequest(ids!, "vch-1", today)),
    });
    check("contabiliza", posted.ok, posted.ok ? "" : posted.error);
    if (!posted.ok) throw new Error("sin contabilización no hay smoke");

    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: posted.data.journalEntryId },
      include: { lines: true },
    });
    check("asiento CONTABILIZADO", entry.status === "CONTABILIZADO");
    check("dos líneas", entry.lines.length === 2, `(${entry.lines.length})`);
    const debitTotal = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const creditTotal = entry.lines.reduce((s, l) => s + Number(l.credit), 0);
    check("cuadrado", debitTotal === creditTotal && debitTotal === 1234.56);

    const record = await prisma.postingRecord.findUniqueOrThrow({
      where: { id: posted.data.postingRecordId },
    });
    check("registro CONTABILIZADO", record.status === "CONTABILIZADO");
    check("clave activa tomada", record.activeIdempotencyKey === record.idempotencyKey);

    const auditPost = await prisma.financialAuditEvent.findMany({
      where: { actorUserId: ids.userId },
      orderBy: { createdAt: "asc" },
    });
    check(
      "auditoría persistida: POSTED + EXECUTED",
      auditPost.some((e) => e.action === "JOURNAL_ENTRY_POSTED") &&
        auditPost.some((e) => e.action === "POSTING_EXECUTED"),
      auditPost.map((e) => e.action).join(","),
    );

    console.log("\n=== 2. Idempotencia de contabilización ===");
    const again = await runFinancialTransaction({
      actor,
      run: (ctx) => runPostingPipeline(ctx, buildRequest(ids!, "vch-1", today)),
    });
    check(
      "reejecución converge",
      again.ok && again.data.alreadyPosted === true,
      again.ok ? "" : again.error,
    );
    check(
      "no se creó otro asiento",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );

    const strict = await runFinancialTransaction({
      actor,
      run: (ctx) =>
        runPostingPipeline(ctx, buildRequest(ids!, "vch-1", today), {
          strictDuplicates: true,
        }),
    });
    check("modo estricto rechaza", !strict.ok, strict.ok ? "aceptó" : strict.error);

    console.log("\n=== 3. Contabilización concurrente (índice único) ===");
    const [c1, c2] = await Promise.all([
      runFinancialTransaction({
        actor,
        run: (ctx) => runPostingPipeline(ctx, buildRequest(ids!, "vch-race", today)),
      }),
      runFinancialTransaction({
        actor,
        run: (ctx) => runPostingPipeline(ctx, buildRequest(ids!, "vch-race", today)),
      }),
    ]);
    const raceRecords = await prisma.postingRecord.count({
      where: { sourceId: "vch-race" },
    });
    check(
      "solo una contabilización sobrevive",
      raceRecords === 1,
      `(registros: ${raceRecords}, r1=${c1.ok}, r2=${c2.ok})`,
    );

    console.log("\n=== 4. Reversión ===");
    const reversed = await runFinancialTransaction({
      actor,
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: posted.data.postingRecordId,
          reason: "Mapeo incorrecto detectado por contabilidad.",
        }),
    });
    check("revierte", reversed.ok, reversed.ok ? "" : reversed.error);
    if (!reversed.ok) throw new Error("sin reversión no hay smoke");

    const reversalEntry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: reversed.data.reversalJournalEntryId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    check("asiento de reversión enlazado", reversalEntry.reversalOfId === entry.id);
    check("reversión CONTABILIZADA", reversalEntry.status === "CONTABILIZADO");

    const originalAfter = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: entry.id },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    check(
      "ORIGINAL INMUTABLE: estado",
      originalAfter.status === entry.status,
    );
    check(
      "ORIGINAL INMUTABLE: fecha",
      originalAfter.entryDate.getTime() === entry.entryDate.getTime(),
    );
    check(
      "ORIGINAL INMUTABLE: líneas",
      JSON.stringify(originalAfter.lines.map((l) => [l.accountId, String(l.debit), String(l.credit)])) ===
        JSON.stringify(entry.lines.sort((a, b) => a.position - b.position).map((l) => [l.accountId, String(l.debit), String(l.credit)])),
    );

    const originalSorted = entry.lines.sort((a, b) => a.position - b.position);
    check(
      "débito y crédito invertidos",
      Number(reversalEntry.lines[0].credit) === Number(originalSorted[0].debit) &&
        Number(reversalEntry.lines[0].debit) === Number(originalSorted[0].credit),
    );
    check(
      "reversión cuadra",
      reversalEntry.lines.reduce((s, l) => s + Number(l.debit), 0) ===
        reversalEntry.lines.reduce((s, l) => s + Number(l.credit), 0),
    );

    const recordAfter = await prisma.postingRecord.findUniqueOrThrow({
      where: { id: posted.data.postingRecordId },
    });
    check("registro REVERTIDO", recordAfter.status === "REVERTIDO");
    check("clave activa liberada", recordAfter.activeIdempotencyKey === null);
    check("motivo guardado", Boolean(recordAfter.reversalReason));
    check("autor de la reversión", recordAfter.reversedByUserId === ids.userId);

    const auditRev = await prisma.financialAuditEvent.findMany({
      where: { actorUserId: ids.userId },
    });
    check(
      "auditoría de reversión persistida",
      auditRev.some((e) => e.action === "POSTING_REVERSED") &&
        auditRev.some((e) => e.action === "JOURNAL_ENTRY_REVERSED"),
      auditRev.map((e) => e.action).join(","),
    );

    console.log("\n=== 5. Doble reversión ===");
    const twice = await runFinancialTransaction({
      actor,
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: posted.data.postingRecordId,
          reason: "Segundo intento.",
        }),
    });
    check(
      "segunda reversión converge",
      twice.ok && twice.data.alreadyReversed === true,
      twice.ok ? "" : twice.error,
    );
    check(
      "sigue habiendo un solo asiento de reversión",
      (await prisma.journalEntry.count({
        where: { branchId: ids.branchId, reversalOfId: { not: null } },
      })) === 1,
    );

    console.log("\n=== 6. Recontabilización tras revertir (defecto corregido) ===");
    const reposted = await runFinancialTransaction({
      actor,
      run: (ctx) => runPostingPipeline(ctx, buildRequest(ids!, "vch-1", today)),
    });
    check(
      "el evento corregido vuelve a contabilizarse",
      reposted.ok && reposted.data.alreadyPosted === false,
      reposted.ok ? "" : reposted.error,
    );
    check(
      "dos registros con la misma clave, uno activo",
      (await prisma.postingRecord.count({ where: { sourceId: "vch-1" } })) === 2 &&
        (await prisma.postingRecord.count({
          where: { sourceId: "vch-1", activeIdempotencyKey: { not: null } },
        })) === 1,
    );

    console.log("\n=== 7. Motivo obligatorio ===");
    const noReason = await runFinancialTransaction({
      actor,
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: reposted.ok ? reposted.data.postingRecordId : "",
          reason: "   ",
        }),
    });
    check("reversión sin motivo rechazada", !noReason.ok, noReason.ok ? "aceptó" : "");

    console.log("\n=== 8. Bloqueo de período ===");
    const period = `${today.toISOString().slice(0, 7)}`;
    await prisma.accountingClosing.create({
      data: {
        branchId: ids.branchId,
        period,
        status: "CERRADO",
        closedByUserId: ids.userId,
        closedAt: new Date(),
      },
    });
    const blockedPost = await runFinancialTransaction({
      actor,
      run: (ctx) => runPostingPipeline(ctx, buildRequest(ids!, "vch-blocked", today)),
    });
    check("período cerrado bloquea contabilizar", !blockedPost.ok, blockedPost.ok ? "aceptó" : "");
    check(
      "nada escrito tras el bloqueo",
      (await prisma.postingRecord.count({ where: { sourceId: "vch-blocked" } })) === 0,
    );

    const blockedReversal = await runFinancialTransaction({
      actor,
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: reposted.ok ? reposted.data.postingRecordId : "",
          reason: "Intento en período cerrado.",
        }),
    });
    check(
      "período cerrado bloquea revertir",
      !blockedReversal.ok,
      blockedReversal.ok ? "aceptó" : "",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 9. Reversión de transacción ===");
    const beforeEntries = await prisma.journalEntry.count({
      where: { branchId: ids.branchId },
    });
    const beforeAudit = await prisma.financialAuditEvent.count({
      where: { actorUserId: ids.userId },
    });
    const rolledBack = await runFinancialTransaction({
      actor,
      run: async (ctx) => {
        await runPostingPipeline(ctx, buildRequest(ids!, "vch-rollback", today));
        // Falla DESPUÉS de escribir asiento, registro y auditoría.
        return ctx.fail("Fallo deliberado del smoke tras escribir.");
      },
    });
    check("la transacción falla", !rolledBack.ok);
    check(
      "no quedó asiento",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) ===
        beforeEntries,
    );
    check(
      "no quedó registro",
      (await prisma.postingRecord.count({ where: { sourceId: "vch-rollback" } })) === 0,
    );
    check(
      "no quedó auditoría",
      (await prisma.financialAuditEvent.count({
        where: { actorUserId: ids.userId },
      })) === beforeAudit,
    );

    console.log("\n=== 10. Claves foráneas ===");
    let fkBlocked = false;
    try {
      await prisma.chartAccount.delete({ where: { id: ids.debitAccountId } });
    } catch {
      fkBlocked = true;
    }
    check("no se puede borrar una cuenta con movimientos", fkBlocked);

    let entryFkBlocked = false;
    try {
      await prisma.journalEntry.delete({ where: { id: entry.id } });
    } catch {
      entryFkBlocked = true;
    }
    check("no se puede borrar un asiento contabilizado", entryFkBlocked);

    console.log("\n=== 11. Errores tipados ===");
    const noStrategy = await runFinancialTransaction({
      actor,
      run: (ctx) =>
        runPostingPipeline(ctx, {
          ...buildRequest(ids!, "vch-nostrat", today),
          event: "GASTO" as const,
        }),
    });
    check("evento sin estrategia rechazado", !noStrategy.ok, noStrategy.ok ? "aceptó" : "");

    let mappingCode = "";
    await prisma.accountMappingRule.delete({ where: { id: ids.ruleId } });
    try {
      await prisma.$transaction(async (tx) => {
        await runPostingPipeline(
          {
            tx,
            actor,
            audit: async () => {},
            fail: (m: string) => {
              throw new Error(m);
            },
            ensure: () => {},
          } as never,
          buildRequest(ids!, "vch-nomap", today),
        );
      });
    } catch (error) {
      mappingCode = isPostingError(error) ? error.code : String(error);
    }
    check("sin mapeo -> MAPPING_MISSING", mappingCode === "MAPPING_MISSING", mappingCode);
  } finally {
    await cleanup(ids);
    const leftovers = await prisma.postingRecord.count({
      where: { sourceId: { startsWith: "vch-" }, idempotencyKey: { contains: TAG } },
    });
    check("cero fixtures remanentes", leftovers === 0, `(${leftovers})`);
    console.log(`\nRESULTADO SMOKE-FF1.3-C: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
