/**
 * SMOKE-FF2.0-B — impuesto en documentos contables.
 *
 *   npm run smoke:document-tax
 *
 * Reproduce el cuerpo transaccional de `postAccountingDocumentAction`, igual que
 * SMOKE-FF1.4-C, porque las acciones de servidor autorizan contra la cookie de
 * sesión. La autorización queda fuera de cobertura.
 *
 * Fixtures con prefijo propio, borrados siempre.
 */
import { PrismaClient } from "@prisma/client";

import {
  findActiveDocumentPosting,
  postDocumentInTransaction,
} from "@/server/contabilidad/posting";
import { calculateAccountingDocumentTotal } from "@/server/contabilidad/shared";
import { validateMappingSet } from "@/server/finance/account-mapping/validation";
import { runReversalPipeline } from "@/server/finance/posting/pipeline";
import { runFinancialTransaction } from "@/server/finance/transaction";

const prisma = new PrismaClient();
const TAG = `SMOKE-FF20B-${Date.now()}`;

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
  /** Sucursal cuyo mapeo NO declara la regla de impuesto. */
  untaxedBranchId: string;
  userId: string;
  accounts: Record<string, string>;
  mappingSetId: string;
  untaxedSetId: string;
};

const ACCOUNT_NAMES = ["CXC", "INGRESO", "RETENCION", "IVA_POR_PAGAR"] as const;

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
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: name === "INGRESO" ? "INGRESO" : name === "CXC" ? "ACTIVO" : "PASIVO",
        nature: name === "CXC" ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  const baseRules = [
    {
      event: "DOCUMENTO_FACTURA" as const,
      component: "SUBTOTAL" as const,
      debitAccountId: accounts.CXC,
      creditAccountId: accounts.INGRESO,
    },
    {
      event: "DOCUMENTO_FACTURA" as const,
      component: "RETENCION_1" as const,
      debitAccountId: accounts.RETENCION,
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
          // El impuesto de una factura de venta es un pasivo: se cobra al
          // cliente (débito a CxC) y se debe al fisco (crédito).
          {
            event: "DOCUMENTO_FACTURA" as const,
            component: "IMPUESTO" as const,
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.IVA_POR_PAGAR,
          },
          {
            event: "DOCUMENTO_NOTA_DEBITO" as const,
            component: "SUBTOTAL" as const,
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.INGRESO,
          },
          {
            event: "DOCUMENTO_NOTA_DEBITO" as const,
            component: "IMPUESTO" as const,
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.IVA_POR_PAGAR,
          },
          {
            event: "DOCUMENTO_RECIBO_OFICIAL_CAJA" as const,
            component: "TOTAL" as const,
            debitAccountId: accounts.CXC,
            creditAccountId: accounts.INGRESO,
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
  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: ids.userId },
  });
  await prisma.postingRecord.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.journalEntryLine.deleteMany({
    where: { entry: { branchId: { in: branchIds } } },
  });
  await prisma.journalEntry.deleteMany({
    where: { branchId: { in: branchIds }, reversalOfId: { not: null } },
  });
  await prisma.journalEntry.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.accountingDocument.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  const sets = await prisma.accountMappingSet.findMany({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  const setIds = sets.map((s) => s.id);
  await prisma.accountMappingRule.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.accountingClosing.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.chartAccount.deleteMany({
    where: { id: { in: Object.values(ids.accounts) } },
  });
  await prisma.user.deleteMany({ where: { id: ids.userId } });
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
    appliedPayment?: number;
    branchId?: string;
    date?: Date;
  },
) {
  const tax = input.tax ?? 0;
  const retention1 = input.retention1 ?? 0;
  const appliedPayment = input.appliedPayment ?? 0;
  // La misma función que usan las acciones: si la aritmética cambiara, el
  // smoke cambiaría con ella en vez de fijar un número obsoleto.
  const total = calculateAccountingDocumentTotal({
    subtotal: input.subtotal,
    tax,
    retention1,
    appliedPayment,
  });
  return prisma.accountingDocument.create({
    data: {
      branchId: input.branchId ?? ids.branchId,
      createdByUserId: ids.userId,
      type: (input.type ?? "FACTURA") as "FACTURA",
      status: "REVISADO",
      documentNumber: `${TAG}-${input.number}`,
      documentDate: input.date ?? new Date(),
      thirdPartyName: "Tercero de prueba",
      concept: "Venta gravada",
      subtotal: input.subtotal as unknown as never,
      tax: tax as unknown as never,
      retention1: retention1 as unknown as never,
      retention2: 0 as unknown as never,
      appliedPayment: appliedPayment as unknown as never,
      total: total as unknown as never,
      currency: "NIO",
    },
  });
}

/** Reproduce el cuerpo de `postAccountingDocumentAction`. */
async function postDocument(ids: Ids, documentId: string) {
  return runFinancialTransaction({
    actor: { userId: ids.userId, role: "CONTADOR" as const },
    run: async (ctx) => {
      const document = await ctx.tx.accountingDocument.findUnique({
        where: { id: documentId },
      });
      if (!document) return ctx.fail("El documento no existe.");
      ctx.ensure(document.status === "REVISADO", "Contabilizar requiere revisión.");
      const guarded = await ctx.tx.accountingDocument.updateMany({
        where: { id: documentId, status: "REVISADO" },
        data: { status: "CONTABILIZADO", postedByUserId: ids.userId, postedAt: new Date() },
      });
      if (guarded.count !== 1) return ctx.fail("Contabilizar requiere revisión.");
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

function sumOn(
  lines: Array<{ accountId: string; debit: unknown; credit: unknown }>,
  accountId: string,
) {
  const debit = lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + Number(l.debit), 0);
  const credit = lines.filter((l) => l.accountId === accountId).reduce((s, l) => s + Number(l.credit), 0);
  return { debit, credit, net: debit - credit };
}

async function entryFor(documentId: string) {
  return prisma.journalEntry.findFirstOrThrow({
    where: { accountingDocumentId: documentId },
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

    console.log("\n=== 1. La aritmética con impuesto cero no cambió ===");
    check(
      "total sin impuesto = subtotal − deducciones",
      calculateAccountingDocumentTotal({ subtotal: 1000, retention1: 50, appliedPayment: 100 }) === 850,
    );
    check(
      "el impuesto suma",
      calculateAccountingDocumentTotal({ subtotal: 1000, tax: 150 }) === 1150,
    );

    console.log("\n=== 2. Factura SIN impuesto -> idéntica a FF1.4-C ===");
    const untaxedDoc = await createDocument(ids, { number: "D-SIN", subtotal: 10000, retention1: 200 });
    const untaxedPost = await postDocument(ids, untaxedDoc.id);
    check("contabiliza", untaxedPost.ok, untaxedPost.ok ? "" : untaxedPost.error);
    if (!untaxedPost.ok) throw new Error("sin contabilización no hay smoke");
    const untaxedEntry = await entryFor(untaxedDoc.id);
    check("cuatro líneas (2 componentes)", untaxedEntry.lines.length === 4, String(untaxedEntry.lines.length));
    check("sin línea de impuesto", sumOn(untaxedEntry.lines, ivaId).credit === 0);
    check("CxC neta = total (9800)", sumOn(untaxedEntry.lines, cxcId).net === 9800, String(sumOn(untaxedEntry.lines, cxcId).net));

    console.log("\n=== 3. Impuesto cero explícito -> igual que sin impuesto ===");
    const zeroDoc = await createDocument(ids, { number: "D-CERO", subtotal: 500, tax: 0 });
    const zeroPost = await postDocument(ids, zeroDoc.id);
    check("contabiliza", zeroPost.ok, zeroPost.ok ? "" : zeroPost.error);
    const zeroEntry = await entryFor(zeroDoc.id);
    check("dos líneas: no emite IMPUESTO", zeroEntry.lines.length === 2, String(zeroEntry.lines.length));

    console.log("\n=== 4. Factura CON impuesto -> subtotal e impuesto por separado ===");
    const taxedDoc = await createDocument(ids, { number: "D-IVA", subtotal: 1000, tax: 150 });
    const taxedPost = await postDocument(ids, taxedDoc.id);
    check("contabiliza", taxedPost.ok, taxedPost.ok ? "" : taxedPost.error);
    const taxedEntry = await entryFor(taxedDoc.id);
    check("cuatro líneas (2 componentes)", taxedEntry.lines.length === 4, String(taxedEntry.lines.length));
    const tDebit = taxedEntry.lines.reduce((s, l) => s + Number(l.debit), 0);
    check("cuadrado", tDebit === taxedEntry.lines.reduce((s, l) => s + Number(l.credit), 0));
    check("ingreso = subtotal, NO inflado por el impuesto", sumOn(taxedEntry.lines, ingresoId).credit === 1000, String(sumOn(taxedEntry.lines, ingresoId).credit));
    check("IVA por pagar = impuesto", sumOn(taxedEntry.lines, ivaId).credit === 150, String(sumOn(taxedEntry.lines, ivaId).credit));
    check("CxC = total (1150)", sumOn(taxedEntry.lines, cxcId).net === 1150, String(sumOn(taxedEntry.lines, cxcId).net));

    console.log("\n=== 5. Impuesto Y retenciones ===");
    const fullDoc = await createDocument(ids, {
      number: "D-FULL",
      subtotal: 10000,
      tax: 1500,
      retention1: 200,
    });
    const fullPost = await postDocument(ids, fullDoc.id);
    check("contabiliza", fullPost.ok, fullPost.ok ? "" : fullPost.error);
    const fullEntry = await entryFor(fullDoc.id);
    check("seis líneas (3 componentes)", fullEntry.lines.length === 6, String(fullEntry.lines.length));
    check("ingreso = subtotal", sumOn(fullEntry.lines, ingresoId).credit === 10000);
    check("IVA = impuesto", sumOn(fullEntry.lines, ivaId).credit === 1500);
    // 10000 + 1500 - 200 = 11300
    check("CxC neta = total (11300)", sumOn(fullEntry.lines, cxcId).net === 11300, String(sumOn(fullEntry.lines, cxcId).net));
    check(
      "coincide con la fórmula del modelo",
      sumOn(fullEntry.lines, cxcId).net ===
        calculateAccountingDocumentTotal({ subtotal: 10000, tax: 1500, retention1: 200 }),
    );

    console.log("\n=== 6. Nota de débito gravada ===");
    const noteDoc = await createDocument(ids, {
      number: "D-ND",
      type: "NOTA_DEBITO",
      subtotal: 400,
      tax: 60,
    });
    const notePost = await postDocument(ids, noteDoc.id);
    check("contabiliza", notePost.ok, notePost.ok ? "" : notePost.error);
    const noteEntry = await entryFor(noteDoc.id);
    check("cuatro líneas", noteEntry.lines.length === 4, String(noteEntry.lines.length));
    check("IVA = 60", sumOn(noteEntry.lines, ivaId).credit === 60);

    console.log("\n=== 7. Recibo oficial con impuesto -> rechazo explícito ===");
    // RECIBO no tiene componente bruto, así que el impuesto no tendría a qué
    // sumarse. La estrategia rechaza en vez de perder el movimiento.
    const receiptDoc = await createDocument(ids, {
      number: "D-RECIBO-IVA",
      type: "RECIBO_OFICIAL_CAJA",
      subtotal: 300,
      tax: 45,
    });
    const receiptPost = await postDocument(ids, receiptDoc.id);
    check("rechazado", !receiptPost.ok, receiptPost.ok ? "aceptó" : "");
    check(
      "rechazado por la estrategia (componente no admitido), no por el mapeo",
      !receiptPost.ok &&
        receiptPost.error.includes("IMPUESTO") &&
        receiptPost.error.includes("no admite ese componente"),
      receiptPost.ok ? "" : receiptPost.error,
    );
    check(
      "el documento NO quedó contabilizado",
      (await prisma.accountingDocument.findUniqueOrThrow({ where: { id: receiptDoc.id } })).status === "REVISADO",
    );

    console.log("\n=== 8. Sin regla de impuesto -> rollback completo ===");
    const noMapDoc = await createDocument(ids, {
      number: "D-NOMAP",
      subtotal: 800,
      tax: 120,
      branchId: ids.untaxedBranchId,
    });
    const noMapPost = await postDocument(ids, noMapDoc.id);
    check("falla por mapeo faltante", !noMapPost.ok, noMapPost.ok ? "aceptó" : "");
    check(
      "el documento sigue REVISADO",
      (await prisma.accountingDocument.findUniqueOrThrow({ where: { id: noMapDoc.id } })).status === "REVISADO",
    );
    check(
      "sin asiento en esa sucursal",
      (await prisma.journalEntry.count({ where: { branchId: ids.untaxedBranchId } })) === 0,
    );

    console.log("\n=== 9. En esa sucursal, una factura sin impuesto sí contabiliza ===");
    const noMapOk = await createDocument(ids, {
      number: "D-NOMAP-OK",
      subtotal: 800,
      branchId: ids.untaxedBranchId,
    });
    const noMapOkPost = await postDocument(ids, noMapOk.id);
    check("contabiliza sin regla de impuesto", noMapOkPost.ok, noMapOkPost.ok ? "" : noMapOkPost.error);

    console.log("\n=== 10. Período cerrado ===");
    const closedDoc = await createDocument(ids, { number: "D-CERRADO", subtotal: 700, tax: 105 });
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
      (await prisma.accountingDocument.findUniqueOrThrow({ where: { id: closedDoc.id } })).status === "REVISADO",
    );
    await prisma.accountingClosing.deleteMany({ where: { branchId: ids.branchId } });

    console.log("\n=== 11. Contabilización concurrente de un documento gravado ===");
    const raceDoc = await createDocument(ids, { number: "D-RACE", subtotal: 400, tax: 60 });
    const [a, b] = await Promise.all([postDocument(ids, raceDoc.id), postDocument(ids, raceDoc.id)]);
    check("solo una gana", a.ok !== b.ok, `a=${a.ok} b=${b.ok}`);
    check(
      "un solo asiento para el documento",
      (await prisma.journalEntry.count({ where: { accountingDocumentId: raceDoc.id } })) === 1,
    );

    console.log("\n=== 12. Reversión: el espejo invierte la línea de impuesto ===");
    const active = await findActiveDocumentPosting(prisma, fullDoc.id);
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
    check("el IVA se revierte al debe", sumOn(mirror.lines, ivaId).debit === 1500, String(sumOn(mirror.lines, ivaId).debit));
    check(
      "asiento original intacto",
      (await prisma.journalEntry.findUniqueOrThrow({ where: { id: fullEntry.id } })).status === "CONTABILIZADO",
    );

    console.log("\n=== 13. La invariante X3 también rige en documentos ===");
    const draft = await prisma.accountMappingSet.create({
      data: {
        code: `${TAG}-V`,
        version: 1,
        name: `${TAG} borrador`,
        status: "BORRADOR",
        branchId: ids.branchId,
        branchKey: ids.branchId,
        activeBranchKey: null,
        effectiveFrom: new Date("2020-01-01"),
        createdByUserId: ids.userId,
        rules: {
          create: [
            {
              event: "DOCUMENTO_FACTURA" as const,
              component: "SUBTOTAL" as const,
              debitAccountId: ids.accounts.CXC,
              creditAccountId: ids.accounts.INGRESO,
            },
            // El impuesto acreditando la CxC que el subtotal debita: cancelaría.
            {
              event: "DOCUMENTO_FACTURA" as const,
              component: "IMPUESTO" as const,
              debitAccountId: ids.accounts.RETENCION,
              creditAccountId: ids.accounts.CXC,
            },
          ],
        },
      },
    });
    const draftResult = await validateMappingSet(prisma, draft.id);
    check("mapeo que cancela el subtotal -> inválido", !draftResult.valid);

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
    console.log(`\nRESULTADO SMOKE-FF2.0-B: ${passed} OK · ${failed} fallas\n`);
    await prisma.$disconnect();
    if (failed) process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
