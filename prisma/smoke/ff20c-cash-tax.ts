/**
 * SMOKE-FF2.0-C — impuesto en documentos de caja.
 *
 *   npm run smoke:cash-tax
 *
 * Reproduce el cuerpo transaccional de `issueCashDocumentAction`, igual que
 * SMOKE-FF1.4-D, porque las acciones de servidor autorizan contra la cookie de
 * sesión. La autorización queda fuera de cobertura.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import {
  findActiveCashDocumentPosting,
  postCashDocumentInTransaction,
  readDocumentPaymentTotals,
} from "@/server/caja/posting";
import { calculateCashDocumentTotal } from "@/server/caja/shared";
import { runReversalPipeline } from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF20C-${Date.now()}`;

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
  untaxedBranchId: string;
  userId: string;
  sessionId: string;
  untaxedSessionId: string;
  accounts: Record<string, string>;
  mappingSetId: string;
  untaxedSetId: string;
};

const ACCOUNT_NAMES = ["CXC", "INGRESO", "RETENCION", "IVA_POR_PAGAR", "CAJA"] as const;

async function createFixtures(): Promise<Ids> {
  const branch = await prisma.branch.create({
    data: { code: `${TAG}-suc`.toLowerCase(), name: `${TAG} sucursal` },
  });
  const untaxed = await prisma.branch.create({
    data: { code: `${TAG}-sin`.toLowerCase(), name: `${TAG} sin impuesto` },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} cajero`,
      email: `${TAG.toLowerCase()}@smoke.local`,
      passwordHash: "smoke:not-a-real-hash",
      role: "CONTADOR",
    },
  });

  const accounts: Record<string, string> = {};
  for (const name of ACCOUNT_NAMES) {
    const isAsset = name === "CXC" || name === "CAJA";
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "INGRESO" ? "INGRESO" : isAsset ? "ACTIVO" : "PASIVO",
        nature: isAsset ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  const baseRules = [
    {
      event: "CAJA_FACTURA" as const,
      component: "SUBTOTAL" as const,
      debitAccountId: accounts.CXC,
      creditAccountId: accounts.INGRESO,
    },
    {
      event: "CAJA_FACTURA" as const,
      component: "RETENCION_1" as const,
      debitAccountId: accounts.RETENCION,
      creditAccountId: accounts.CXC,
    },
    {
      event: "CAJA_FACTURA" as const,
      component: "PAGO_EFECTIVO" as const,
      debitAccountId: accounts.CAJA,
      creditAccountId: accounts.CXC,
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
            event: "CAJA_FACTURA" as const,
            component: "IMPUESTO" as const,
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.IVA_POR_PAGAR,
          },
          {
            event: "CAJA_NOTA_DEBITO" as const,
            component: "SUBTOTAL" as const,
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.INGRESO,
          },
          {
            event: "CAJA_NOTA_DEBITO" as const,
            component: "IMPUESTO" as const,
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.IVA_POR_PAGAR,
          },
          // El recibo se cobra por método; no lleva componente bruto ni de
          // impuesto (§L-9).
          {
            event: "CAJA_RECIBO" as const,
            component: "PAGO_EFECTIVO" as const,
            debitAccountId: accounts.CAJA,
            creditAccountId: accounts.CXC,
          },
        ],
      },
    },
  });

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

  const session = await prisma.cashSession.create({
    data: {
      branchId: branch.id,
      cashierId: user.id,
      status: "ABIERTO",
    },
  });
  const untaxedSession = await prisma.cashSession.create({
    data: {
      branchId: untaxed.id,
      cashierId: user.id,
      status: "ABIERTO",
    },
  });

  return {
    branchId: branch.id,
    untaxedBranchId: untaxed.id,
    userId: user.id,
    sessionId: session.id,
    untaxedSessionId: untaxedSession.id,
    accounts,
    mappingSetId: set.id,
    untaxedSetId: untaxedSet.id,
  };
}

/**
 * Cleanup driven entirely by the TAG, never by the `Ids` object.
 *
 * The first run of this suite crashed inside `createFixtures`, which left `ids`
 * null — and the previous `if (!ids) return;` guard then skipped cleanup
 * altogether, leaking every row the fixture had already written. Deriving the
 * targets from the tag instead means a half-built fixture is cleaned up exactly
 * like a complete one.
 */
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
  await prisma.cashPayment.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.cashDocumentItem.deleteMany({
    where: { document: { branchId: { in: branchIds } } },
  });
  await prisma.cashDocument.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.cashSession.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.accountMappingRule.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.accountingClosing.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.chartAccount.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
}

async function createDocument(
  ids: Ids,
  input: {
    number: string;
    type?: string;
    subtotal: number;
    tax?: number;
    retention1?: number;
    cashPayment?: number;
    branchId?: string;
    sessionId?: string;
  },
) {
  const tax = input.tax ?? 0;
  const retention1 = input.retention1 ?? 0;
  // La misma función que usan las acciones.
  const total = calculateCashDocumentTotal({
    subtotal: input.subtotal,
    tax,
    retention1,
  });
  const document = await prisma.cashDocument.create({
    data: {
      branchId: input.branchId ?? ids.branchId,
      cashSessionId: input.sessionId ?? ids.sessionId,
      issuedByUserId: ids.userId,
      type: (input.type ?? "FACTURA") as "FACTURA",
      status: "BORRADOR",
      documentNumber: `${TAG}-${input.number}`,
      thirdPartyName: "Cliente de prueba",
      concept: "Venta gravada",
      subtotal: new Prisma.Decimal(input.subtotal.toFixed(2)),
      tax: new Prisma.Decimal(tax.toFixed(2)),
      retention1: new Prisma.Decimal(retention1.toFixed(2)),
      retention2: new Prisma.Decimal(0),
      appliedPayment: new Prisma.Decimal(0),
      total: new Prisma.Decimal(total.toFixed(2)),
      currency: "NIO",
    },
  });
  if (input.cashPayment) {
    await prisma.cashPayment.create({
      data: {
        cashSessionId: input.sessionId ?? ids.sessionId,
        documentId: document.id,
        branchId: input.branchId ?? ids.branchId,
        recordedByUserId: ids.userId,
        method: "EFECTIVO",
        amount: new Prisma.Decimal(input.cashPayment.toFixed(2)),
      },
    });
  }
  return document;
}

/** Reproduce el cuerpo de `issueCashDocumentAction`. */
async function issueDocument(ids: Ids, documentId: string) {
  return runFinancialTransaction({
    actor: { userId: ids.userId, role: "CONTADOR" as const },
    run: async (ctx) => {
      const current = await ctx.tx.cashDocument.findUnique({
        where: { id: documentId },
      });
      if (!current) return ctx.fail("El documento no existe.");
      ctx.ensure(current.status === "BORRADOR", "El documento ya fue emitido.");
      const guarded = await ctx.tx.cashDocument.updateMany({
        where: { id: documentId, status: "BORRADOR" },
        data: { status: "EMITIDO", issuedAt: new Date() },
      });
      if (guarded.count !== 1) return ctx.fail("El documento ya fue emitido.");
      const updated = await ctx.tx.cashDocument.findUniqueOrThrow({
        where: { id: documentId },
      });
      await ctx.audit({
        domain: "CAJA",
        action: "CASH_DOCUMENT_ISSUED",
        entityType: "CASH_DOCUMENT",
        entityId: updated.id,
        entityCode: updated.documentNumber,
        branchId: updated.branchId,
        after: { status: updated.status },
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
      const posting = await postCashDocumentInTransaction(ctx, updated);
      return { posting };
    },
  });
}

function sumOn(
  lines: Array<{ accountId: string; debit: unknown; credit: unknown }>,
  accountId: string,
) {
  const debit = lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + Number(l.debit), 0);
  const credit = lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + Number(l.credit), 0);
  return { debit, credit, net: debit - credit };
}

async function entryForSource(documentId: string) {
  const record = await prisma.postingRecord.findFirstOrThrow({
    where: { sourceType: "CASH_DOCUMENT", sourceId: documentId, status: "CONTABILIZADO" },
  });
  return prisma.journalEntry.findFirstOrThrow({
    where: { id: record.journalEntryId },
    include: { lines: true },
  });
}

async function main() {
  let ids: Ids | null = null;
  try {
    ids = await createFixtures();
    const cxcId = ids.accounts.CXC;
    const ingresoId = ids.accounts.INGRESO;
    const ivaId = ids.accounts.IVA_POR_PAGAR;
    const cajaId = ids.accounts.CAJA;

    console.log("\n=== 1. La aritmética de caja iguala a la de contabilidad ===");
    check(
      "sin impuesto no cambió",
      calculateCashDocumentTotal({ subtotal: 1000, retention1: 50, appliedPayment: 100 }) === 850,
    );
    check("el impuesto suma", calculateCashDocumentTotal({ subtotal: 1000, tax: 150 }) === 1150);

    console.log("\n=== 2. Factura de caja SIN impuesto -> idéntica a FF1.4-D ===");
    const untaxedDoc = await createDocument(ids, {
      number: "C-SIN",
      subtotal: 1000,
      retention1: 50,
      cashPayment: 300,
    });
    const untaxedPost = await issueDocument(ids, untaxedDoc.id);
    check("emite y contabiliza", untaxedPost.ok, untaxedPost.ok ? "" : untaxedPost.error);
    if (!untaxedPost.ok) throw new Error("sin contabilización no hay smoke");
    const untaxedEntry = await entryForSource(untaxedDoc.id);
    check("seis líneas (3 componentes)", untaxedEntry.lines.length === 6, String(untaxedEntry.lines.length));
    check("sin línea de impuesto", sumOn(untaxedEntry.lines, ivaId).credit === 0);
    // 1000 - 50 - 300 cobrado = 650 pendiente
    check("CxC pendiente = 650", sumOn(untaxedEntry.lines, cxcId).net === 650, String(sumOn(untaxedEntry.lines, cxcId).net));

    console.log("\n=== 3. Factura de caja CON impuesto ===");
    const taxedDoc = await createDocument(ids, { number: "C-IVA", subtotal: 1000, tax: 150 });
    const taxedPost = await issueDocument(ids, taxedDoc.id);
    check("contabiliza", taxedPost.ok, taxedPost.ok ? "" : taxedPost.error);
    const taxedEntry = await entryForSource(taxedDoc.id);
    check("cuatro líneas (2 componentes)", taxedEntry.lines.length === 4, String(taxedEntry.lines.length));
    const tDebit = taxedEntry.lines.reduce((s, l) => s + Number(l.debit), 0);
    check("cuadrado", tDebit === taxedEntry.lines.reduce((s, l) => s + Number(l.credit), 0));
    check("ingreso = subtotal, NO inflado", sumOn(taxedEntry.lines, ingresoId).credit === 1000, String(sumOn(taxedEntry.lines, ingresoId).credit));
    check("IVA por pagar = impuesto", sumOn(taxedEntry.lines, ivaId).credit === 150, String(sumOn(taxedEntry.lines, ivaId).credit));
    check("CxC = total (1150)", sumOn(taxedEntry.lines, cxcId).net === 1150, String(sumOn(taxedEntry.lines, cxcId).net));

    console.log("\n=== 4. Impuesto, retención y cobro a la vez ===");
    const fullDoc = await createDocument(ids, {
      number: "C-FULL",
      subtotal: 10000,
      tax: 1500,
      retention1: 200,
      cashPayment: 5000,
    });
    const fullPost = await issueDocument(ids, fullDoc.id);
    check("contabiliza", fullPost.ok, fullPost.ok ? "" : fullPost.error);
    const fullEntry = await entryForSource(fullDoc.id);
    check("ocho líneas (4 componentes)", fullEntry.lines.length === 8, String(fullEntry.lines.length));
    check("ingreso = subtotal", sumOn(fullEntry.lines, ingresoId).credit === 10000);
    check("IVA = impuesto", sumOn(fullEntry.lines, ivaId).credit === 1500);
    check("caja = cobro", sumOn(fullEntry.lines, cajaId).debit === 5000);
    // 10000 + 1500 - 200 - 5000 = 6300 pendiente
    check("CxC pendiente = 6300", sumOn(fullEntry.lines, cxcId).net === 6300, String(sumOn(fullEntry.lines, cxcId).net));
    check(
      "total del modelo = 11300, y lo cobrado lo reduce a 6300",
      calculateCashDocumentTotal({ subtotal: 10000, tax: 1500, retention1: 200 }) === 11300,
    );

    console.log("\n=== 5. Nota de débito de caja gravada ===");
    const noteDoc = await createDocument(ids, {
      number: "C-ND",
      type: "NOTA_DEBITO",
      subtotal: 400,
      tax: 60,
    });
    const notePost = await issueDocument(ids, noteDoc.id);
    check("contabiliza", notePost.ok, notePost.ok ? "" : notePost.error);
    const noteEntry = await entryForSource(noteDoc.id);
    check("cuatro líneas", noteEntry.lines.length === 4, String(noteEntry.lines.length));
    check("IVA = 60", sumOn(noteEntry.lines, ivaId).credit === 60);

    console.log("\n=== 6. Recibo de caja con impuesto -> rechazo explícito ===");
    const receiptDoc = await createDocument(ids, {
      number: "C-RECIBO-IVA",
      type: "RECIBO",
      subtotal: 300,
      tax: 45,
      cashPayment: 345,
    });
    const receiptPost = await issueDocument(ids, receiptDoc.id);
    check("rechazado", !receiptPost.ok, receiptPost.ok ? "aceptó" : "");
    check(
      "rechazado por componente no admitido, no por otra causa",
      !receiptPost.ok &&
        receiptPost.error.includes("IMPUESTO") &&
        receiptPost.error.includes("no admite ese componente"),
      receiptPost.ok ? "" : receiptPost.error,
    );
    check(
      "el documento sigue en BORRADOR",
      (await prisma.cashDocument.findUniqueOrThrow({ where: { id: receiptDoc.id } })).status === "BORRADOR",
    );

    console.log("\n=== 7. Recibo SIN impuesto -> se comporta como antes ===");
    const plainReceipt = await createDocument(ids, {
      number: "C-RECIBO",
      type: "RECIBO",
      subtotal: 300,
      cashPayment: 300,
    });
    const plainPost = await issueDocument(ids, plainReceipt.id);
    check("contabiliza", plainPost.ok, plainPost.ok ? "" : plainPost.error);

    console.log("\n=== 8. Sin regla de impuesto -> rollback completo ===");
    const noMapDoc = await createDocument(ids, {
      number: "C-NOMAP",
      subtotal: 800,
      tax: 120,
      branchId: ids.untaxedBranchId,
      sessionId: ids.untaxedSessionId,
    });
    const noMapPost = await issueDocument(ids, noMapDoc.id);
    check("falla por mapeo faltante", !noMapPost.ok, noMapPost.ok ? "aceptó" : "");
    check(
      "el documento sigue en BORRADOR",
      (await prisma.cashDocument.findUniqueOrThrow({ where: { id: noMapDoc.id } })).status === "BORRADOR",
    );
    check(
      "sin asiento en esa sucursal",
      (await prisma.journalEntry.count({ where: { branchId: ids.untaxedBranchId } })) === 0,
    );

    console.log("\n=== 9. En esa sucursal, una factura sin impuesto sí emite ===");
    const noMapOk = await createDocument(ids, {
      number: "C-NOMAP-OK",
      subtotal: 800,
      branchId: ids.untaxedBranchId,
      sessionId: ids.untaxedSessionId,
    });
    const noMapOkPost = await issueDocument(ids, noMapOk.id);
    check("contabiliza sin regla de impuesto", noMapOkPost.ok, noMapOkPost.ok ? "" : noMapOkPost.error);

    console.log("\n=== 10. Período cerrado ===");
    const closedDoc = await createDocument(ids, { number: "C-CERRADO", subtotal: 700, tax: 105 });
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
    check("período cerrado bloquea", !closed.ok, closed.ok ? "aceptó" : "");
    check(
      "documento intacto",
      (await prisma.cashDocument.findUniqueOrThrow({ where: { id: closedDoc.id } })).status === "BORRADOR",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 11. Emisión concurrente de un documento gravado ===");
    const raceDoc = await createDocument(ids, { number: "C-RACE", subtotal: 400, tax: 60 });
    const [a, b] = await Promise.all([issueDocument(ids, raceDoc.id), issueDocument(ids, raceDoc.id)]);
    check("solo una gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo registro de contabilización",
      (await prisma.postingRecord.count({
        where: { sourceType: "CASH_DOCUMENT", sourceId: raceDoc.id },
      })) === 1,
    );

    console.log("\n=== 12. Reversión: el espejo invierte la línea de impuesto ===");
    const active = await findActiveCashDocumentPosting(prisma, fullDoc.id);
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
    check("espejo con las mismas 8 líneas", mirror.lines.length === 8);
    check("el IVA se revierte al debe", sumOn(mirror.lines, ivaId).debit === 1500, String(sumOn(mirror.lines, ivaId).debit));
    check(
      "asiento original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: fullEntry.id } })).status === "CONTABILIZADO",
    );

    console.log("\n=== 13. Mapeo archivado -> deja de resolver ===");
    await prisma.accountMappingSet.update({
      where: { id: ids.untaxedSetId },
      data: { status: "ARCHIVADO", activeBranchKey: null, archivedAt: new Date() },
    });
    const afterArchive = await createDocument(ids, {
      number: "C-ARCHIVADO",
      subtotal: 300,
      branchId: ids.untaxedBranchId,
      sessionId: ids.untaxedSessionId,
    });
    const archivedPost = await issueDocument(ids, afterArchive.id);
    check("un conjunto archivado no contabiliza", !archivedPost.ok, archivedPost.ok ? "aceptó" : "");
    check(
      "el documento sigue en BORRADOR",
      (await prisma.cashDocument.findUniqueOrThrow({ where: { id: afterArchive.id } })).status === "BORRADOR",
    );

    console.log("\n=== 14. Los pagos leídos siguen viniendo de la base ===");
    const totals = await readDocumentPaymentTotals(prisma, fullDoc.id);
    check("efectivo = 5000", totals.EFECTIVO === 5000, String(totals.EFECTIVO));

    console.log("\n=== 15. Consistencia final ===");
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
    await cleanup();
    console.log(`\nRESULTADO SMOKE-FF2.0-C: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
