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
 * Patch POS2.4 — credenciales de mostrador **solo de prueba**.
 *
 * Se siembran aquí, en el arnés, y nunca por el código de producción: la única
 * vía real para crear un operador es la pantalla de administración. El operador
 * inactivo existe para poder comprobar que una cuenta desactivada no entra.
 */
export const POS_OPERATOR_USERNAME = `${TAG.toLowerCase()}-cajero`;
export const POS_OPERATOR_PASSWORD = "e2e-pos-operator-password";
export const POS_DISABLED_USERNAME = `${TAG.toLowerCase()}-inactivo`;
export const POS_DISABLED_PASSWORD = "e2e-pos-disabled-password";
/**
 * Operador **desechable** para las pruebas que invalidan sesión.
 *
 * Cerrar sesión rota `sessionVersion`, y eso mata *todas* las sesiones de ese
 * operador — incluida la que comparte el proyecto de Playwright. Sin una
 * identidad aparte, la prueba de cierre de sesión dejaba inservible al resto de
 * la suite.
 */
export const POS_THROWAWAY_USERNAME = `${TAG.toLowerCase()}-temporal`;
export const POS_THROWAWAY_PASSWORD = "e2e-pos-throwaway-password";

/**
 * Operador con **punto** en el usuario.
 *
 * Los otros tres usan guiones, así que ninguno demostraba que el mostrador
 * acepta un usuario con la forma `nombre.apellido` — la que adopta el personal
 * real. Sin este, «el campo Usuario se comporta como un email» era una sospecha
 * que la suite no podía ni confirmar ni desmentir.
 */
export const POS_DOTTED_USERNAME = `${TAG.toLowerCase()}.punto`;
export const POS_DOTTED_PASSWORD = "e2e-pos-dotted-password";

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

  // Patch POS2.4. El operador de mostrador se atribuye al usuario admin para las
  // claves foráneas de auditoría; su contraseña es propia y no autentica nada
  // del panel.
  const posOperator = await prisma.posOperator.create({
    data: {
      username: POS_OPERATOR_USERNAME,
      passwordHash: hashPassword(POS_OPERATOR_PASSWORD),
      userId: admin.id,
      branchId: mapped.id,
    },
  });

  /*
   * Patch D3 — el mostrador del arnés **abre con turno**, como un mostrador real.
   *
   * Desde D3 un cobro en efectivo exige turno abierto. Sin este fixture, cada
   * suite que cobra en efectivo estaría probando «qué pasa si el cajero olvidó
   * abrir la caja», que es un caso concreto y no el estado normal.
   *
   * No debilita nada: las suites que quieren probar la **ausencia** de turno lo
   * cierran o lo borran primero, y `pos-caja.spec.ts` ya lo hace en su limpieza
   * porque el operador lleva el prefijo del arnés.
   */
  await prisma.posCashShift.create({
    data: {
      branchId: mapped.id,
      operatorId: posOperator.id,
      openedByUserId: admin.id,
      openingFloat: 0,
      notes: `${TAG} turno del arnés`,
    },
  });
  const dottedUser = await prisma.user.create({
    data: {
      name: `${TAG} Punto`,
      email: `${TAG.toLowerCase()}-punto@smoke.local`,
      passwordHash: hashPassword(POS_DOTTED_PASSWORD),
      role: "CAJERO",
    },
  });
  await prisma.posOperator.create({
    data: {
      username: POS_DOTTED_USERNAME,
      passwordHash: hashPassword(POS_DOTTED_PASSWORD),
      userId: dottedUser.id,
      branchId: mapped.id,
    },
  });
  const throwawayUser = await prisma.user.create({
    data: {
      name: `${TAG} Temporal`,
      email: `${TAG.toLowerCase()}-temporal@smoke.local`,
      passwordHash: hashPassword(POS_THROWAWAY_PASSWORD),
      role: "CAJERO",
    },
  });
  await prisma.posOperator.create({
    data: {
      username: POS_THROWAWAY_USERNAME,
      passwordHash: hashPassword(POS_THROWAWAY_PASSWORD),
      userId: throwawayUser.id,
      branchId: mapped.id,
    },
  });
  const disabledUser = await prisma.user.create({
    data: {
      name: `${TAG} Inactivo`,
      email: `${TAG.toLowerCase()}-inactivo@smoke.local`,
      passwordHash: hashPassword(POS_DISABLED_PASSWORD),
      role: "CAJERO",
    },
  });
  await prisma.posOperator.create({
    data: {
      username: POS_DISABLED_USERNAME,
      passwordHash: hashPassword(POS_DISABLED_PASSWORD),
      userId: disabledUser.id,
      branchId: mapped.id,
      isActive: false,
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
  //
  // Patch POS1.2-F. **Ya no basta con el número.** Mientras crear era una acción
  // sin pantalla, todas las órdenes de la suite las sembraba `makeOrder` con un
  // número que llevaba el TAG. Ahora la suite crea órdenes **por la aplicación**,
  // y el número lo genera el servidor —`OC-<fecha>-<aleatorio>`, sin TAG—, así
  // que sobrevivían a la limpieza y sus líneas impedían borrar el artículo. Se
  // identifican por lo que de verdad las ata al fixture: su proveedor o sus
  // artículos.
  const posSuppliers = await prisma.thirdParty.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  const posOrderIds = (
    await prisma.posPurchaseOrder.findMany({
      where: {
        OR: [
          { orderNumber: { contains: TAG } },
          { supplierId: { in: posSuppliers.map((supplier) => supplier.id) } },
          { items: { some: { productId: { in: posProductIds } } } },
        ],
      },
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

  /*
   * Patch P-13 — **las ventas se recogen por dos vías, no por una.**
   *
   * `posSaleIds` se deriva de las líneas de venta que usan productos del TAG. Eso
   * dejaba fuera una venta **sin líneas**, que es lo que queda cuando una corrida
   * anterior borró las líneas y no llegó a borrar la venta. Esas huérfanas
   * sobrevivían invisibles, y desde D3 bloquean el borrado de su turno con
   * `pos_sales_shift_id_fkey`. Comprobado: tres de ellas rompían el teardown.
   *
   * El cajero es la segunda vía: toda venta que el arnés cobra se atribuye a un
   * usuario del arnés, tenga líneas o no.
   */
  const harnessSaleIds = [
    ...new Set([
      ...posSaleIds,
      ...(
        await prisma.posSale.findMany({
          where: { cashierId: { in: userIds } },
          select: { id: true },
        })
      ).map((sale) => sale.id),
    ]),
  ];

  /*
   * Patch P-13 — **los movimientos antes que sus ventas.**
   *
   * `PosInventoryMovement.saleId` apunta a la venta con `RESTRICT`, así que
   * borrar una venta con movimientos atribuidos falla. El borrado general de
   * movimientos vive más abajo —va con el producto— pero los de estas ventas
   * tienen que caer aquí, antes que ellas.
   */
  await prisma.posInventoryMovement.deleteMany({
    where: { saleId: { in: harnessSaleIds } },
  });

  await prisma.posPayment.deleteMany({ where: { saleId: { in: harnessSaleIds } } });
  await prisma.posSaleItem.deleteMany({ where: { saleId: { in: harnessSaleIds } } });
  await prisma.posSale.deleteMany({ where: { id: { in: harnessSaleIds } } });

  /*
   * Patch CB4-B — los turnos del mostrador, **antes que sus usuarios**.
   * Patch CB4-D3 — y **después de sus ventas**.
   *
   * Dos restricciones que se cruzan:
   *
   * - `PosCashShift.openedByUserId` y `PosCashMovement.createdByUserId` apuntan
   *   a `User` con `RESTRICT`, así que los turnos tienen que morir antes que el
   *   usuario del arnés.
   * - Desde D3, `PosSale.shiftId` apunta al turno **también con `RESTRICT`**, así
   *   que los turnos tienen que morir después de las ventas.
   *
   * De ahí este sitio exacto: justo tras borrar las ventas y bastante antes de
   * los usuarios. Estaba arriba y funcionaba porque ninguna venta señalaba a un
   * turno; D3 lo cambió y dejarlo allí habría hecho fallar el sembrado entero.
   *
   * El movimiento va primero: también restringe contra el turno.
   */
  await prisma.posCashMovement.deleteMany({
    where: {
      OR: [
        { createdByUserId: { in: userIds } },
        { shift: { openedByUserId: { in: userIds } } },
      ],
    },
  });
  await prisma.posCashShift.deleteMany({
    where: { openedByUserId: { in: userIds } },
  });
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
  // Patch POS2.4. Los operadores referencian usuario y sucursal con RESTRICT.
  await prisma.posOperator.deleteMany({
    where: { username: { startsWith: TAG.toLowerCase() } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
