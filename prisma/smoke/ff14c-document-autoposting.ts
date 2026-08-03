/**
 * SMOKE-FF1.4-C — contabilización automática de documentos contables.
 *
 *   npm run smoke:document
 *
 * Reproduce el cuerpo transaccional de `postAccountingDocumentAction`
 * (`runFinancialTransaction` + transición guardada + `postDocumentInTransaction`)
 * porque las acciones de servidor autorizan contra la cookie de sesión y no se
 * pueden invocar fuera de una petición. La autorización queda fuera de cobertura.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient } from "@prisma/client";

import {
  findActiveDocumentPosting,
  postDocumentInTransaction,
} from "@/server/contabilidad/posting";
import { runReversalPipeline } from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF14C-${Date.now()}`;

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
  accounts: Record<string, string>;
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

  // Una cuenta por lado de cada componente. El motor nunca las elige: salen del
  // mapeo, y este smoke solo verifica que llegan hasta el asiento.
  const accounts: Record<string, string> = {};
  for (const name of ["CXC", "INGRESO", "RETENCION", "ANTICIPO", "CAJA"]) {
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
            event: "DOCUMENTO_FACTURA",
            component: "SUBTOTAL",
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.INGRESO,
          },
          {
            event: "DOCUMENTO_FACTURA",
            component: "RETENCION_1",
            debitAccountId: accounts.RETENCION,
            creditAccountId: accounts.CXC,
          },
          {
            event: "DOCUMENTO_FACTURA",
            component: "RETENCION_2",
            debitAccountId: accounts.RETENCION,
            creditAccountId: accounts.CXC,
          },
          {
            event: "DOCUMENTO_FACTURA",
            component: "ABONO_APLICADO",
            debitAccountId: accounts.ANTICIPO,
            creditAccountId: accounts.CXC,
          },
          {
            event: "DOCUMENTO_RECIBO_OFICIAL_CAJA",
            component: "TOTAL",
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
  await prisma.accountingDocument.deleteMany({
    where: { branchId: ids.branchId },
  });
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

async function createDocument(
  ids: Ids,
  input: {
    number: string;
    type: string;
    subtotal: number;
    retention1?: number;
    retention2?: number;
    appliedPayment?: number;
    status?: string;
    date?: Date;
  },
) {
  const retention1 = input.retention1 ?? 0;
  const retention2 = input.retention2 ?? 0;
  const appliedPayment = input.appliedPayment ?? 0;
  const total = Math.max(
    input.subtotal - retention1 - retention2 - appliedPayment,
    0,
  );
  return prisma.accountingDocument.create({
    data: {
      branchId: ids.branchId,
      createdByUserId: ids.userId,
      type: input.type as "FACTURA",
      status: (input.status ?? "REVISADO") as "REVISADO",
      documentNumber: `${TAG}-${input.number}`,
      documentDate: input.date ?? new Date(),
      thirdPartyName: "Tercero de prueba",
      concept: "Servicios profesionales",
      subtotal: input.subtotal as unknown as never,
      retention1: retention1 as unknown as never,
      retention2: retention2 as unknown as never,
      appliedPayment: appliedPayment as unknown as never,
      total: total as unknown as never,
      currency: "NIO",
    },
  });
}

/** Reproduce el cuerpo de `postAccountingDocumentAction`. */
async function postDocument(ids: Ids, documentId: string) {
  const actor = { userId: ids.userId, role: "CONTADOR" as const };
  return runFinancialTransaction({
    actor,
    run: async (ctx) => {
      const document = await ctx.tx.accountingDocument.findUnique({
        where: { id: documentId },
      });
      if (!document) return ctx.fail("El documento no existe.");
      ctx.ensure(
        document.status === "REVISADO",
        "Contabilizar requiere que el documento esté revisado.",
      );
      const guarded = await ctx.tx.accountingDocument.updateMany({
        where: { id: documentId, status: "REVISADO" },
        data: {
          status: "CONTABILIZADO",
          postedByUserId: ids.userId,
          postedAt: new Date(),
        },
      });
      if (guarded.count !== 1) {
        return ctx.fail("Contabilizar requiere que el documento esté revisado.");
      }
      const updated = await ctx.tx.accountingDocument.findUniqueOrThrow({
        where: { id: documentId },
      });
      await ctx.audit({
        domain: "CONTABILIDAD",
        action: "ACCOUNTING_DOCUMENT_STATUS_CHANGED",
        entityType: "ACCOUNTING_DOCUMENT",
        entityId: updated.id,
        entityCode: updated.documentNumber,
        branchId: updated.branchId,
        after: { status: updated.status },
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
      const posting = await postDocumentInTransaction(ctx, updated);
      return { posting };
    },
  });
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();

    console.log("\n=== 1. Documento en BORRADOR -> no se contabiliza ===");
    const draft = await createDocument(ids, {
      number: "D-DRAFT",
      type: "FACTURA",
      subtotal: 1000,
      status: "BORRADOR",
    });
    const draftPost = await postDocument(ids, draft.id);
    check("contabilizar un borrador falla", !draftPost.ok, draftPost.ok ? "aceptó" : "");
    check(
      "el borrador sigue en BORRADOR",
      (await prisma.accountingDocument.findUniqueOrThrow({ where: { id: draft.id } }))
        .status === "BORRADOR",
    );
    check(
      "sin asientos",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 0,
    );

    console.log("\n=== 2. Factura revisada -> asiento automático ===");
    const invoice = await createDocument(ids, {
      number: "D-1",
      type: "FACTURA",
      subtotal: 10000,
      retention1: 200,
      retention2: 100,
      appliedPayment: 1500,
    });
    const posted = await postDocument(ids, invoice.id);
    check("contabiliza", posted.ok, posted.ok ? "" : posted.error);
    if (!posted.ok) throw new Error("sin contabilización no hay smoke");
    check("hubo contabilización", posted.data.posting !== null);

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { branchId: ids.branchId },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    check("documento CONTABILIZADO",
      (await prisma.accountingDocument.findUniqueOrThrow({ where: { id: invoice.id } }))
        .status === "CONTABILIZADO",
    );
    check(
      "traza al documento (I-07 cerrado)",
      entry.accountingDocumentId === invoice.id,
      String(entry.accountingDocumentId),
    );
    check("ocho líneas (4 componentes)", entry.lines.length === 8, String(entry.lines.length));
    const debit = entry.lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = entry.lines.reduce((s, l) => s + Number(l.credit), 0);
    check("cuadrado", debit === credit, `${debit} vs ${credit}`);
    check("suma = subtotal + deducciones", debit === 10000 + 200 + 100 + 1500);

    // El saldo neto de CxC debe ser el total del documento: 10000-200-100-1500.
    const cxcId = ids.accounts.CXC;
    const cxcDebit = entry.lines
      .filter((l) => l.accountId === cxcId)
      .reduce((s, l) => s + Number(l.debit), 0);
    const cxcCredit = entry.lines
      .filter((l) => l.accountId === cxcId)
      .reduce((s, l) => s + Number(l.credit), 0);
    check(
      "saldo neto de CxC = total del documento",
      cxcDebit - cxcCredit === 8200,
      String(cxcDebit - cxcCredit),
    );

    console.log("\n=== 3. Contabilizar dos veces ===");
    const twice = await postDocument(ids, invoice.id);
    check("segunda contabilización rechazada", !twice.ok, twice.ok ? "aceptó" : "");
    check(
      "sigue habiendo un asiento",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );

    console.log("\n=== 4. Rollback: sin mapeo, nada queda ===");
    const noMapDoc = await createDocument(ids, {
      number: "D-NOMAP",
      type: "NOTA_DEBITO",
      subtotal: 500,
    });
    const noMap = await postDocument(ids, noMapDoc.id);
    check("falla por mapeo faltante", !noMap.ok, noMap.ok ? "aceptó" : noMap.error);
    check(
      "el documento NO quedó contabilizado",
      (await prisma.accountingDocument.findUniqueOrThrow({ where: { id: noMapDoc.id } }))
        .status === "REVISADO",
    );
    check(
      "sin asiento nuevo",
      (await prisma.journalEntry.count({ where: { branchId: ids.branchId } })) === 1,
    );

    console.log("\n=== 5. Forma no expresable -> rechazo explícito ===");
    const badReceipt = await createDocument(ids, {
      number: "D-RECIBO-RET",
      type: "RECIBO_OFICIAL_CAJA",
      subtotal: 1000,
      retention1: 50,
    });
    const badPost = await postDocument(ids, badReceipt.id);
    check(
      "recibo con retención rechazado",
      !badPost.ok,
      badPost.ok ? "aceptó" : badPost.error,
    );

    console.log("\n=== 6. Recibo simple -> un solo componente ===");
    const receipt = await createDocument(ids, {
      number: "D-RECIBO",
      type: "RECIBO_OFICIAL_CAJA",
      subtotal: 3000,
    });
    const receiptPost = await postDocument(ids, receipt.id);
    check("contabiliza el recibo", receiptPost.ok, receiptPost.ok ? "" : receiptPost.error);
    const receiptEntry = await prisma.journalEntry.findFirstOrThrow({
      where: { accountingDocumentId: receipt.id },
      include: { lines: true },
    });
    check("dos líneas", receiptEntry.lines.length === 2, String(receiptEntry.lines.length));
    check(
      "monto = total",
      receiptEntry.lines.reduce((s, l) => s + Number(l.debit), 0) === 3000,
    );

    console.log("\n=== 7. Contabilización concurrente ===");
    const raceDoc = await createDocument(ids, {
      number: "D-RACE",
      type: "FACTURA",
      subtotal: 400,
    });
    const [a, b] = await Promise.all([
      postDocument(ids, raceDoc.id),
      postDocument(ids, raceDoc.id),
    ]);
    check("solo una gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo asiento para el documento",
      (await prisma.journalEntry.count({
        where: { accountingDocumentId: raceDoc.id },
      })) === 1,
    );

    console.log("\n=== 8. Período cerrado ===");
    const closedDoc = await createDocument(ids, {
      number: "D-CERRADO",
      type: "FACTURA",
      subtotal: 700,
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
    const closed = await postDocument(ids, closedDoc.id);
    check("período cerrado bloquea", !closed.ok, closed.ok ? "aceptó" : "");
    check(
      "documento intacto",
      (await prisma.accountingDocument.findUniqueOrThrow({ where: { id: closedDoc.id } }))
        .status === "REVISADO",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 9. Evento sin estrategia ===");
    const creditNote = await createDocument(ids, {
      number: "D-NC",
      type: "NOTA_CREDITO",
      subtotal: 250,
    });
    const ncPost = await postDocument(ids, creditNote.id);
    // Hay estrategia para NOTA_CREDITO pero no hay mapeo: debe fallar por mapeo,
    // no por estrategia. Verifica que la distinción llega al llamante.
    check("nota de crédito falla por mapeo", !ncPost.ok, ncPost.ok ? "aceptó" : "");
    check(
      "mensaje menciona el mapeo",
      !ncPost.ok && ncPost.error.toLowerCase().includes("mapeo"),
      ncPost.ok ? "" : ncPost.error,
    );

    console.log("\n=== 10. Reversión de la contabilización ===");
    const active = await findActiveDocumentPosting(prisma, invoice.id);
    check("hay contabilización activa", Boolean(active));
    const reversed = await runFinancialTransaction({
      actor: { userId: ids.userId, role: "CONTADOR" as const },
      run: (ctx) =>
        runReversalPipeline(ctx, {
          postingRecordId: active!.id,
          reason: "Error de mapeo detectado.",
        }),
    });
    check("revierte", reversed.ok, reversed.ok ? "" : reversed.error);
    const mirror = await prisma.journalEntry.findFirstOrThrow({
      where: { reversalOfId: entry.id },
      include: { lines: true },
    });
    check("espejo con las mismas 8 líneas", mirror.lines.length === 8);
    check(
      "espejo invertido",
      mirror.lines.reduce((s, l) => s + Number(l.credit), 0) === debit,
    );
    check(
      "asiento original intacto",
      (
        await prisma.journalEntry.findUniqueOrThrow({ where: { id: entry.id } })
      ).status === "CONTABILIZADO",
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
    const docs = await prisma.accountingDocument.count({
      where: { branchId: ids.branchId },
    });
    const activePostings = await prisma.postingRecord.count({
      where: { branchId: ids.branchId, status: "CONTABILIZADO" },
    });
    const entries = await prisma.journalEntry.count({
      where: { branchId: ids.branchId, reversalOfId: null },
    });
    check("documentos creados", docs === 8, String(docs));
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
    console.log(`\nRESULTADO SMOKE-FF1.4-C: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
