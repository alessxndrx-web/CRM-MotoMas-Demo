import { PrismaClient, type Prisma } from "@prisma/client";

import { hashPassword } from "@/server/auth/password";

/**
 * Fixtures for the FF2.1-A browser suite.
 *
 * Same discipline as the Prisma smokes: one tag, everything derived from it, and
 * cleanup driven by the tag rather than by an object — so a half-built fixture
 * is removed exactly like a complete one.
 */
export const TAG = "E2E-FF21A";
export const TEST_EMAIL = `${TAG.toLowerCase()}@smoke.local`;
export const TEST_PASSWORD = "e2e-contador-password";

/**
 * Patch FF2.1-C — Caja needs a second identity.
 *
 * `canOperateCaja` admits only `ADMIN` and `CAJERO`, so the Contabilidad user
 * cannot create a cash document at all. The suite therefore signs in twice, and
 * that is itself worth having: it is the first time two different roles are
 * exercised against the real authorization layer.
 */
export const ADMIN_EMAIL = `${TAG.toLowerCase()}-admin@smoke.local`;
export const ADMIN_PASSWORD = "e2e-admin-password";

/**
 * **The branches must be real, seeded ones.**
 *
 * The expense screen does not read branches from the database: the page fills
 * its selector from `desiredBranches`, a static array in
 * `src/data/operations/leads.ts`, while `createExpenseAction` resolves the code
 * against the `branches` table. A branch is therefore usable from the UI only if
 * it exists in **both**, so a fixture branch invented here could never be picked.
 * These two codes appear in the static list and in the seed.
 */
export const MAPPED_BRANCH_CODE = "granada";
export const UNMAPPED_BRANCH_CODE = "rosita";

/**
 * Patch FF2.1-D. Los períodos de liquidación son la identidad del hecho, así que
 * la suite reserva un año propio: nada que empiece por este prefijo pertenece a
 * datos reales, y la limpieza puede borrarlo sin tocar nada ajeno.
 */
export const E2E_PERIOD_PREFIX = "2031-";

export const prisma = new PrismaClient();

export async function seedFixtures() {
  await cleanupFixtures();

  const mapped = await prisma.branch.findFirstOrThrow({
    where: { code: MAPPED_BRANCH_CODE },
  });
  const unmapped = await prisma.branch.findFirstOrThrow({
    where: { code: UNMAPPED_BRANCH_CODE },
  });
  const user = await prisma.user.create({
    data: {
      name: `${TAG} Contador`,
      email: TEST_EMAIL,
      passwordHash: hashPassword(TEST_PASSWORD),
      role: "CONTADOR",
    },
  });
  const admin = await prisma.user.create({
    data: {
      name: `${TAG} Admin`,
      email: ADMIN_EMAIL,
      passwordHash: hashPassword(ADMIN_PASSWORD),
      role: "ADMIN",
    },
  });

  const debitNature = new Set(["GASTO", "IVA_ACREDITABLE", "CXC", "CAJA", "BANCO"]);
  const accountType: Record<string, "GASTO" | "ACTIVO" | "PASIVO" | "INGRESO"> = {
    GASTO: "GASTO",
    IVA_ACREDITABLE: "ACTIVO",
    CXC: "ACTIVO",
    INGRESO: "INGRESO",
    CXP: "PASIVO",
    RETENCIONES: "PASIVO",
    IVA_POR_PAGAR: "PASIVO",
    CAJA: "ACTIVO",
    BANCO: "ACTIVO",
  };

  const accounts: Record<string, string> = {};
  for (const name of Object.keys(accountType)) {
    const account = await prisma.chartAccount.create({
      data: {
        code: `${TAG}-${name}`,
        name,
        type: accountType[name],
        nature: debitNature.has(name) ? "DEUDORA" : "ACREEDORA",
        origin: "EMPRESA",
        effectiveFrom: new Date("2020-01-01"),
      },
    });
    accounts[name] = account.id;
  }

  type RuleInput = Prisma.AccountMappingRuleCreateWithoutSetInput;

  const baseRules: RuleInput[] = [
    {
      event: "GASTO",
      component: "SUBTOTAL",
      debitAccount: { connect: { id: accounts.GASTO } },
      creditAccount: { connect: { id: accounts.CXP } },
    },
    {
      event: "GASTO",
      component: "RETENCION_1",
      debitAccount: { connect: { id: accounts.CXP } },
      creditAccount: { connect: { id: accounts.RETENCIONES } },
    },
    // Patch FF2.1-B. En una factura de venta el impuesto es un pasivo: se cobra
    // al cliente (débito a CxC) y se debe al fisco (crédito).
    {
      event: "DOCUMENTO_FACTURA",
      component: "SUBTOTAL",
      debitAccount: { connect: { id: accounts.CXC } },
      creditAccount: { connect: { id: accounts.INGRESO } },
    },
    {
      event: "DOCUMENTO_FACTURA",
      component: "RETENCION_1",
      debitAccount: { connect: { id: accounts.RETENCIONES } },
      creditAccount: { connect: { id: accounts.CXC } },
    },
    // Patch FF2.1-C — caja.
    {
      event: "CAJA_FACTURA",
      component: "SUBTOTAL",
      debitAccount: { connect: { id: accounts.CXC } },
      creditAccount: { connect: { id: accounts.INGRESO } },
    },
    {
      event: "CAJA_FACTURA",
      component: "RETENCION_1",
      debitAccount: { connect: { id: accounts.RETENCIONES } },
      creditAccount: { connect: { id: accounts.CXC } },
    },
    {
      event: "CAJA_FACTURA",
      component: "PAGO_EFECTIVO",
      debitAccount: { connect: { id: accounts.CAJA } },
      creditAccount: { connect: { id: accounts.CXC } },
    },
  ];

  async function activeSet(code: string, branchId: string, rules: RuleInput[]) {
    await prisma.accountMappingSet.create({
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

  await activeSet(`${TAG}-A`, mapped.id, [
    ...baseRules,
    {
      event: "GASTO",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.IVA_ACREDITABLE } },
      creditAccount: { connect: { id: accounts.CXP } },
    },
    {
      event: "DOCUMENTO_FACTURA",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.CXC } },
      creditAccount: { connect: { id: accounts.IVA_POR_PAGAR } },
    },
    {
      event: "CAJA_FACTURA",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.CXC } },
      creditAccount: { connect: { id: accounts.IVA_POR_PAGAR } },
    },
    // Patch FF2.1-D. Un período que cierra debiendo: se cancela el pasivo de IVA
    // contra el banco. La dirección la fija el mapeo, no el componente.
    {
      event: "LIQUIDACION_IVA",
      component: "IMPUESTO",
      debitAccount: { connect: { id: accounts.IVA_POR_PAGAR } },
      creditAccount: { connect: { id: accounts.BANCO } },
    },
  ]);
  await activeSet(`${TAG}-B`, unmapped.id, baseRules);

  // Patch POS1.2-C. Compras necesita un proveedor —`ThirdParty` con
  // `type = PROVEEDOR`, que es el agregado de proveedor del repositorio— y un
  // artículo propio: la suite de compras no debe depender de que otra suite haya
  // creado el suyo primero.
  await prisma.thirdParty.create({
    data: {
      branchId: mapped.id,
      type: "PROVEEDOR",
      name: `${TAG} Proveedor`,
      taxId: "J0310000000000",
    },
  });
  await prisma.posProduct.create({
    data: {
      sku: `${TAG}-COMPRA-ARTICULO`,
      name: `${TAG} Artículo de compra`,
      unitPrice: 100,
    },
  });

  // Patch POS1.1-E. El cobro descuenta existencias, así que necesita una bodega
  // de la que descontar. Sin ella el botón de cobro queda deshabilitado y toda
  // la suite de venta dejaría de poder ejercitarse.
  await prisma.posWarehouse.create({
    data: {
      branchId: mapped.id,
      code: `${TAG}-BODEGA`,
      name: `${TAG} Bodega`,
    },
  });

  // Patch POS1.0-D. El cobro admite un cliente opcional, y la base sembrada no
  // trae ninguno: sin este fixture la cobertura del cliente no existiría.
  await prisma.customer.create({
    data: {
      branchId: mapped.id,
      name: `${TAG} Cliente`,
      phone: "88880000",
      phoneNormalized: "88880000",
    },
  });

  // Un turno abierto por sucursal: sin él la pantalla de caja no ofrece el
  // formulario, porque el servidor tampoco aceptaría el documento.
  await prisma.cashSession.create({
    data: { branchId: mapped.id, cashierId: admin.id, status: "ABIERTO" },
  });
  await prisma.cashSession.create({
    data: { branchId: unmapped.id, cashierId: admin.id, status: "ABIERTO" },
  });

  return {
    mappedBranchId: mapped.id,
    unmappedBranchId: unmapped.id,
    userId: user.id,
    adminId: admin.id,
  };
}

/**
 * Cleanup is **tag-scoped, never branch-scoped**, because the branches are real
 * seeded ones this suite borrows rather than owns. Deleting by branch would
 * destroy data the suite did not create.
 */
export async function cleanupFixtures() {
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
  // Every record this suite creates carries the tag in a free-text field: the
  // supplier for expenses, the third party for documents. Document numbers are
  // server-generated, so they cannot be used as the marker.
  const expenses = await prisma.expense.findMany({
    where: { supplier: { startsWith: TAG } },
    select: { id: true },
  });
  const expenseIds = expenses.map((expense) => expense.id);
  const documents = await prisma.accountingDocument.findMany({
    where: { thirdPartyName: { startsWith: TAG } },
    select: { id: true },
  });
  const documentIds = documents.map((document) => document.id);
  const cashDocuments = await prisma.cashDocument.findMany({
    where: { thirdPartyName: { startsWith: TAG } },
    select: { id: true },
  });
  const cashDocumentIds = cashDocuments.map((document) => document.id);
  // Las liquidaciones se identifican por sucursal+período, así que se limpian
  // por las sucursales que esta suite usa y por el período reservado para ella.
  const branchIds = (
    await prisma.branch.findMany({
      where: { code: { in: [MAPPED_BRANCH_CODE, UNMAPPED_BRANCH_CODE] } },
      select: { id: true },
    })
  ).map((branch) => branch.id);
  const settlements = await prisma.vatSettlement.findMany({
    where: { branchId: { in: branchIds }, period: { startsWith: E2E_PERIOD_PREFIX } },
    select: { id: true, branchId: true, period: true },
  });
  const settlementSourceIds = settlements.map(
    (settlement) => `${settlement.branchId}:${settlement.period}`,
  );
  const records = await prisma.postingRecord.findMany({
    where: {
      OR: [
        { sourceType: "EXPENSE", sourceId: { in: expenseIds } },
        { sourceType: "ACCOUNTING_DOCUMENT", sourceId: { in: documentIds } },
        { sourceType: "CASH_DOCUMENT", sourceId: { in: cashDocumentIds } },
        { sourceType: "VAT_SETTLEMENT", sourceId: { in: settlementSourceIds } },
      ],
    },
    select: { id: true, journalEntryId: true },
  });
  const entryIds = records.map((record) => record.journalEntryId);

  await prisma.financialAuditEvent.deleteMany({
    where: { actorUserId: { in: userIds } },
  });
  await prisma.postingRecord.deleteMany({
    where: { id: { in: records.map((record) => record.id) } },
  });
  await prisma.journalEntryLine.deleteMany({
    where: { entryId: { in: entryIds } },
  });
  await prisma.journalEntry.deleteMany({
    where: { reversalOfId: { in: entryIds } },
  });
  await prisma.journalEntry.deleteMany({
    where: { accountingDocumentId: { in: documentIds } },
  });
  await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } });
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.accountingDocument.deleteMany({ where: { id: { in: documentIds } } });
  await prisma.cashPayment.deleteMany({
    where: { documentId: { in: cashDocumentIds } },
  });
  await prisma.cashDocumentItem.deleteMany({
    where: { documentId: { in: cashDocumentIds } },
  });
  await prisma.cashDocument.deleteMany({ where: { id: { in: cashDocumentIds } } });
  await prisma.cashSession.deleteMany({ where: { cashierId: { in: userIds } } });
  // Patch POS1.0-B. Los productos del catálogo llevan el tag en su SKU; sus
  // líneas de venta lo referencian con ON DELETE RESTRICT, así que primero se
  // borran las ventas que los usan.
  const posProducts = await prisma.posProduct.findMany({
    where: { sku: { startsWith: TAG } },
    select: { id: true },
  });
  const posProductIds = posProducts.map((product) => product.id);
  const posSaleIds = (
    await prisma.posSaleItem.findMany({
      where: { productId: { in: posProductIds } },
      select: { saleId: true },
    })
  ).map((item) => item.saleId);
  // Patch POS1.2-C. Las órdenes de compra referencian sucursal, proveedor,
  // producto y usuario con ON DELETE RESTRICT, así que van antes que todos
  // ellos; sus líneas caen en cascada con la orden.
  const posOrderIds = (
    await prisma.posPurchaseOrder.findMany({
      where: { orderNumber: { contains: TAG } },
      select: { id: true },
    })
  ).map((order) => order.id);
  // Patch POS1.2-E. La bitácora cuelga de la orden con Cascade, pero la limpieza
  // borra por id y no por cascada de Prisma, así que va explícita y primero.
  await prisma.posPurchaseOrderEvent.deleteMany({
    where: { orderId: { in: posOrderIds } },
  });
  await prisma.posPurchaseOrderItem.deleteMany({
    where: { orderId: { in: posOrderIds } },
  });
  await prisma.posPurchaseOrder.deleteMany({ where: { id: { in: posOrderIds } } });

  await prisma.posPayment.deleteMany({ where: { saleId: { in: posSaleIds } } });
  await prisma.posSaleItem.deleteMany({ where: { saleId: { in: posSaleIds } } });
  await prisma.posSale.deleteMany({ where: { id: { in: posSaleIds } } });
  // Patch POS1.1-E. Movimientos y saldos referencian el producto con
  // ON DELETE RESTRICT, así que van antes que él; la bodega, después de ambos.
  const posWarehouseIds = (
    await prisma.posWarehouse.findMany({
      where: { code: { startsWith: TAG } },
      select: { id: true },
    })
  ).map((warehouse) => warehouse.id);
  await prisma.posInventoryMovement.deleteMany({
    where: {
      OR: [
        { warehouseId: { in: posWarehouseIds } },
        { productId: { in: posProductIds } },
      ],
    },
  });
  await prisma.posInventory.deleteMany({
    where: {
      OR: [
        { warehouseId: { in: posWarehouseIds } },
        { productId: { in: posProductIds } },
      ],
    },
  });
  await prisma.posWarehouse.deleteMany({ where: { id: { in: posWarehouseIds } } });
  await prisma.posProduct.deleteMany({ where: { id: { in: posProductIds } } });
  await prisma.customer.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.thirdParty.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.vatSettlement.deleteMany({
    where: { id: { in: settlements.map((settlement) => settlement.id) } },
  });
  await prisma.accountMappingRule.deleteMany({ where: { setId: { in: setIds } } });
  await prisma.accountMappingSet.deleteMany({ where: { id: { in: setIds } } });
  await prisma.chartAccount.deleteMany({ where: { code: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
