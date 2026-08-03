/**
 * SMOKE-FF1.4-D — contabilización automática de documentos de caja.
 *
 *   npm run smoke:cash
 *
 * Reproduce el cuerpo transaccional de `issueCashDocumentAction` y
 * `cancelCashDocumentAction`, porque las acciones autorizan contra la cookie de
 * sesión y no se pueden invocar fuera de una petición. La autorización queda
 * fuera de cobertura.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient } from "@prisma/client";

import {
  findActiveCashDocumentPosting,
  postCashDocumentInTransaction,
  reverseCashDocumentPostingInTransaction,
} from "@/server/caja/posting";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF14D-${Date.now()}`;

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
  sessionId: string;
  accounts: Record<string, string>;
  mappingSetId: string;
};

async function createFixtures(): Promise<Ids> {
  const branch = await prisma.branch.create({
    data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} cajero`,
      email: `${TAG.toLowerCase()}@smoke.local`,
      passwordHash: "smoke:not-a-real-hash",
      role: "CAJERO",
    },
  });
  const session = await prisma.cashSession.create({
    data: { branchId: branch.id, cashierId: user.id, status: "ABIERTO" },
  });

  const accounts: Record<string, string> = {};
  for (const name of ["CXC", "INGRESO", "RETENCION", "CAJA", "BANCO"]) {
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "INGRESO" ? "INGRESO" : "ACTIVO",
        nature: name === "INGRESO" ? "ACREEDORA" : "DEUDORA",
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
            event: "CAJA_FACTURA",
            component: "SUBTOTAL",
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.INGRESO,
          },
          {
            event: "CAJA_FACTURA",
            component: "RETENCION_1",
            debitAccountId: accounts.RETENCION,
            creditAccountId: accounts.CXC,
          },
          {
            event: "CAJA_FACTURA",
            component: "PAGO_EFECTIVO",
            debitAccountId: accounts.CAJA,
            creditAccountId: accounts.CXC,
          },
          {
            event: "CAJA_FACTURA",
            component: "PAGO_TRANSFERENCIA",
            debitAccountId: accounts.BANCO,
            creditAccountId: accounts.CXC,
          },
          {
            event: "CAJA_RECIBO",
            component: "PAGO_EFECTIVO",
            debitAccountId: accounts.CAJA,
            creditAccountId: accounts.CXC,
          },
        ],
      },
    },
  });

  return {
    branchId: branch.id,
    userId: user.id,
    sessionId: session.id,
    accounts,
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
  await prisma.cashPayment.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.cashDocumentItem.deleteMany({
    where: { document: { branchId: ids.branchId } },
  });
  await prisma.cashDocument.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.cashClosing.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.cashSession.deleteMany({ where: { id: ids.sessionId } });
  await prisma.accountMappingRule.deleteMany({
    where: { setId: ids.mappingSetId },
  });
  await prisma.accountMappingSet.deleteMany({ where: { id: ids.mappingSetId } });
  await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });
  await prisma.chartAccount.deleteMany({
    where: { id: { in: Object.values(ids.accounts) } },
  });
  await prisma.user.deleteMany({ where: { id: ids.userId } });
  await prisma.branch.deleteMany({ where: { id: ids.branchId } });
}

async function createDraft(
  ids: Ids,
  input: {
    number: string;
    type: string;
    subtotal: number;
    retention1?: number;
    payments?: Array<{ method: string; amount: number }>;
    withItem?: boolean;
  },
) {
  const retention1 = input.retention1 ?? 0;
  const total = Math.max(input.subtotal - retention1, 0);
  const document = await prisma.cashDocument.create({
    data: {
      cashSessionId: ids.sessionId,
      branchId: ids.branchId,
      issuedByUserId: ids.userId,
      type: input.type as "FACTURA",
      documentNumber: `${TAG}-${input.number}`,
      status: "BORRADOR",
      thirdPartyName: "Cliente de prueba",
      concept: "Venta de mostrador",
      subtotal: input.subtotal as unknown as never,
      retention1: retention1 as unknown as never,
      total: total as unknown as never,
      currency: "NIO",
    },
  });
  if (input.withItem !== false) {
    await prisma.cashDocumentItem.create({
      data: {
        documentId: document.id,
        description: "Artículo",
        quantity: 1 as unknown as never,
        unitPrice: input.subtotal as unknown as never,
        total: input.subtotal as unknown as never,
      },
    });
  }
  for (const payment of input.payments ?? []) {
    await prisma.cashPayment.create({
      data: {
        cashSessionId: ids.sessionId,
        documentId: document.id,
        branchId: ids.branchId,
        recordedByUserId: ids.userId,
        method: payment.method as "EFECTIVO",
        amount: payment.amount as unknown as never,
      },
    });
  }
  return document;
}

/** Reproduce el cuerpo de `issueCashDocumentAction`. */
async function issueDocument(ids: Ids, documentId: string) {
  const actor = { userId: ids.userId, role: "CAJERO" as const };
  return runFinancialTransaction({
    actor,
    run: async (ctx) => {
      const current = await ctx.tx.cashDocument.findUnique({
        where: { id: documentId },
        include: { payments: { select: { amount: true } } },
      });
      if (!current) return ctx.fail("El documento no existe.");
      ctx.ensure(
        current.status === "BORRADOR",
        "Solo puedes emitir un documento en borrador.",
      );
      const guarded = await ctx.tx.cashDocument.updateMany({
        where: { id: current.id, status: "BORRADOR" },
        data: { status: "EMITIDO", issuedAt: new Date() },
      });
      if (guarded.count !== 1) {
        return ctx.fail("Solo puedes emitir un documento en borrador.");
      }
      const updated = await ctx.tx.cashDocument.findUniqueOrThrow({
        where: { id: current.id },
      });
      await ctx.audit({
        domain: "CAJA",
        action: "CASH_DOCUMENT_ISSUED",
        entityType: "CASH_DOCUMENT",
        entityId: updated.id,
        entityCode: updated.documentNumber,
        branchId: updated.branchId,
        after: { status: updated.status },
      });
      const posting = await postCashDocumentInTransaction(ctx, updated);
      return { posting };
    },
  });
}

/** Reproduce el cuerpo de `cancelCashDocumentAction`. */
async function cancelDocument(ids: Ids, documentId: string, reason: string) {
  const actor = { userId: ids.userId, role: "CAJERO" as const };
  return runFinancialTransaction({
    actor,
    run: async (ctx) => {
      const current = await ctx.tx.cashDocument.findUnique({
        where: { id: documentId },
      });
      if (!current) return ctx.fail("El documento no existe.");
      ctx.ensure(current.status !== "ANULADO", "El documento ya está anulado.");
      const updated = await ctx.tx.cashDocument.update({
        where: { id: current.id },
        data: { status: "ANULADO", cancelledAt: new Date() },
      });
      await ctx.audit({
        domain: "CAJA",
        action: "CASH_DOCUMENT_CANCELLED",
        entityType: "CASH_DOCUMENT",
        entityId: updated.id,
        entityCode: updated.documentNumber,
        branchId: updated.branchId,
        reason,
        after: { status: updated.status },
      });
      const reversalId = await reverseCashDocumentPostingInTransaction(
        ctx,
        updated.id,
        reason,
      );
      return { reversalId };
    },
  });
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();

    console.log("\n=== 1. Factura pagada -> asiento automático ===");
    const invoice = await createDraft(ids, {
      number: "F1",
      type: "FACTURA",
      subtotal: 5000,
      retention1: 100,
      payments: [
        { method: "EFECTIVO", amount: 3000 },
        { method: "TRANSFERENCIA", amount: 1000 },
      ],
    });
    const issued = await issueDocument(ids, invoice.id);
    check("emite", issued.ok, issued.ok ? "" : issued.error);
    if (!issued.ok) throw new Error("sin emisión no hay smoke");
    check("contabilizó al emitir", issued.data.posting !== null);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    check("origen CAJA en el asiento", entry.source === "CAJA", entry.source);
    check(
      "ocho líneas (subtotal + retención + 2 pagos)",
      entry.lines.length === 8,
      String(entry.lines.length),
    );
    const debit = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = entry.lines.reduce((s, l) => s + Number(l.credit), 0);
    check("cuadrado", debit === credit, `${debit} vs ${credit}`);
    check("suma = 5000 + 100 + 3000 + 1000", debit === 9100, String(debit));

    const cxcId = ids.accounts.CXC;
    const cxcNet =
      entry.lines
        .filter((l) => l.accountId === cxcId)
        .reduce((s, l) => s + Number(l.debit), 0) -
      entry.lines
        .filter((l) => l.accountId === cxcId)
        .reduce((s, l) => s + Number(l.credit), 0);
    check(
      "saldo pendiente en cartera = 900",
      cxcNet === 900,
      String(cxcNet),
    );

    console.log("\n=== 2. Idempotencia ===");
    const twice = await issueDocument(ids, invoice.id);
    check("emitir dos veces rechazado", !twice.ok, twice.ok ? "aceptó" : "");
    check(
      "un solo asiento",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );

    console.log("\n=== 3. Recibo con cobro exacto ===");
    const receipt = await createDraft(ids, {
      number: "R1",
      type: "RECIBO",
      subtotal: 800,
      payments: [{ method: "EFECTIVO", amount: 800 }],
      withItem: false,
    });
    const receiptIssued = await issueDocument(ids, receipt.id);
    check("emite el recibo", receiptIssued.ok, receiptIssued.ok ? "" : receiptIssued.error);
    const receiptEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId, notes: { contains: "R1" } },
      include: { lines: true },
    });
    check("dos líneas", receiptEntry.lines.length === 2, String(receiptEntry.lines.length));
    check(
      "monto = cobro",
      receiptEntry.lines.reduce((s, l) => s + Number(l.debit), 0) === 800,
    );

    console.log("\n=== 4. Recibo con cobro parcial -> rechazo explícito ===");
    const partial = await createDraft(ids, {
      number: "R2",
      type: "RECIBO",
      subtotal: 500,
      payments: [{ method: "EFECTIVO", amount: 200 }],
      withItem: false,
    });
    const partialIssued = await issueDocument(ids, partial.id);
    check(
      "recibo parcial rechazado (ambigüedad documentada)",
      !partialIssued.ok,
      partialIssued.ok ? "aceptó" : partialIssued.error,
    );
    check(
      "el documento sigue en BORRADOR",
      (await prisma.cashDocument.findUniqueOrThrow({ where: { id: partial.id } }))
        .status === "BORRADOR",
    );

    console.log("\n=== 5. Rollback: sin mapeo, nada queda ===");
    const rule = await prisma.accountMappingRule.findFirstOrThrow({
      where: { setId: ids.mappingSetId, component: "SUBTOTAL" },
    });
    await prisma.accountMappingRule.delete({ where: { id: rule.id } });
    const noMap = await createDraft(ids, {
      number: "F-NOMAP",
      type: "FACTURA",
      subtotal: 300,
      payments: [{ method: "EFECTIVO", amount: 300 }],
    });
    const noMapIssued = await issueDocument(ids, noMap.id);
    check("falla por mapeo faltante", !noMapIssued.ok, noMapIssued.ok ? "aceptó" : "");
    check(
      "el documento NO quedó emitido",
      (await prisma.cashDocument.findUniqueOrThrow({ where: { id: noMap.id } }))
        .status === "BORRADOR",
    );
    check(
      "sin asiento nuevo",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 2,
    );
    await prisma.accountMappingRule.create({
      data: {
        setId: ids.mappingSetId,
        event: "CAJA_FACTURA",
        component: "SUBTOTAL",
        debitAccountId: ids.accounts.CXC,
        creditAccountId: ids.accounts.INGRESO,
      },
    });

    console.log("\n=== 6. Nota de crédito: sin estrategia mapeada ===");
    const note = await createDraft(ids, {
      number: "NC1",
      type: "NOTA_CREDITO",
      subtotal: 250,
      withItem: false,
    });
    const noteIssued = await issueDocument(ids, note.id);
    check("nota falla por mapeo", !noteIssued.ok, noteIssued.ok ? "aceptó" : "");
    check(
      "mensaje menciona el mapeo",
      !noteIssued.ok && noteIssued.error.toLowerCase().includes("mapeo"),
      noteIssued.ok ? "" : noteIssued.error,
    );

    console.log("\n=== 7. Emisión concurrente ===");
    const raceDoc = await createDraft(ids, {
      number: "F-RACE",
      type: "FACTURA",
      subtotal: 400,
      payments: [{ method: "EFECTIVO", amount: 400 }],
    });
    const [a, b] = await Promise.all([
      issueDocument(ids, raceDoc.id),
      issueDocument(ids, raceDoc.id),
    ]);
    check("solo una emisión gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo registro para el documento",
      (await prisma.postingRecord.count({ where: { sourceId: raceDoc.id } })) === 1,
    );

    console.log("\n=== 8. Período contable cerrado ===");
    const closedDoc = await createDraft(ids, {
      number: "F-CERRADO",
      type: "FACTURA",
      subtotal: 600,
      payments: [{ method: "EFECTIVO", amount: 600 }],
    });
    await prisma.accountingClosing.create({
      data: {
        branchId: ids.branchId,
        period: new Date().toISOString().slice(0, 7),
        status: "CERRADO",
        closedByUserId: ids.userId,
        closedAt: new Date(),
      },
    });
    const closed = await issueDocument(ids, closedDoc.id);
    check("período cerrado bloquea la emisión", !closed.ok, closed.ok ? "aceptó" : "");
    check(
      "documento intacto",
      (await prisma.cashDocument.findUniqueOrThrow({ where: { id: closedDoc.id } }))
        .status === "BORRADOR",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 9. Anulación -> reversión automática ===");
    const before = await findActiveCashDocumentPosting(prisma, invoice.id);
    check("hay contabilización activa", Boolean(before));
    const cancelled = await cancelDocument(ids, invoice.id, "Cliente desistió.");
    check("anula", cancelled.ok, cancelled.ok ? "" : cancelled.error);
    check("generó espejo", Boolean(cancelled.ok && cancelled.data.reversalId));
    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: entry.id },
      include: { lines: true },
    });
    check("espejo con 8 líneas", mirror.lines.length === 8);
    check(
      "espejo invertido",
      mirror.lines.reduce((s, l) => s + Number(l.credit), 0) === debit,
    );
    check(
      "original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } }))
        .status === "CONTABILIZADO",
    );
    check(
      "registro REVERTIDO",
      (await prisma.postingRecord.findUniqueOrThrow({ where: { id: before!.id } }))
        .status === "REVERTIDO",
    );
    check("sin contabilización activa", !(await findActiveCashDocumentPosting(prisma, invoice.id)));

    console.log("\n=== 10. Auditoría y consistencia final ===");
    const audit = await prisma.financialAuditEvent.findMany({
      where: { actorUserId: ids.userId },
    });
    check(
      "auditoría de caja y de motor",
      audit.some((e) => e.action === "CASH_DOCUMENT_ISSUED") &&
        audit.some((e) => e.action === "POSTING_EXECUTED") &&
        audit.some((e) => e.action === "POSTING_REVERSED"),
      [...new Set(audit.map((e) => e.action))].join(","),
    );
    check(
      "todo asiento del motor tiene registro",
      (
        await prisma.journalEntry.findMany({
          where: { branchId: ids.branchId, reversalOfId: null },
          include: { postingRecord: true },
        })
      ).every((e) => e.postingRecord !== null),
    );
    const activePostings = await prisma.postingRecord.count({
      where: { branchId: ids.branchId, status: "CONTABILIZADO" },
    });
    check("contabilizaciones activas", activePostings === 2, String(activePostings));
  } finally {
    await cleanup(ids);
    console.log(`\nRESULTADO SMOKE-FF1.4-D: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
