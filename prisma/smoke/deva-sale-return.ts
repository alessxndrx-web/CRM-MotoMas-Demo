/**
 * SMOKE-DEV-A — devolución de venta: tope de efectivo y carrera de la cabecera.
 *
 *   npm run smoke:return
 *
 * ## Qué prueba esto que un E2E no puede
 *
 * La carrera. `e2e/pos-devoluciones.spec.ts` ejercita la acción real con su
 * cookie de mostrador; lo que no puede es **solapar dos devoluciones** contra la
 * misma venta y comprobar que el bloqueo de la cabecera las serializa.
 *
 * Aquí se reproduce la secuencia de `returnPosSaleAction` —cabecera → turno →
 * inventario— en dos transacciones simultáneas y se afirma que solo una gana.
 *
 * Lo que NO cubre: la autorización, que resuelve la cookie firmada y vive en el
 * E2E.
 *
 * Crea sus fixtures con prefijo reconocible y **los borra al terminar**, incluso
 * si una aserción falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const TAG = `SMOKE-DEVA-${Date.now()}`;

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
  operatorId: string;
  userId: string;
  warehouseId: string;
  productId: string;
  shiftId: string;
};

async function seed(): Promise<Ids> {
  const branch = await prisma.branch.findFirstOrThrow({ select: { id: true } });
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const operator = await prisma.posOperator.create({
    data: {
      username: `${TAG.toLowerCase()}-op`,
      passwordHash: "x",
      userId: user.id,
      branchId: branch.id,
    },
    select: { id: true },
  });
  const warehouse = await prisma.posWarehouse.create({
    data: { branchId: branch.id, code: `${TAG}-BOD`, name: `${TAG} Bodega` },
    select: { id: true },
  });
  const product = await prisma.posProduct.create({
    data: { sku: `${TAG}-ART`, name: "Artículo DEV-A", unitPrice: 100 },
    select: { id: true },
  });
  await prisma.posInventory.create({
    data: {
      warehouseId: warehouse.id,
      productId: product.id,
      quantity: new Prisma.Decimal(100),
    },
  });
  const shift = await prisma.posCashShift.create({
    data: {
      branchId: branch.id,
      operatorId: operator.id,
      openedByUserId: user.id,
      openingFloat: new Prisma.Decimal(5000),
      notes: TAG,
    },
    select: { id: true },
  });
  return {
    branchId: branch.id,
    operatorId: operator.id,
    userId: user.id,
    warehouseId: warehouse.id,
    productId: product.id,
    shiftId: shift.id,
  };
}

/** Una venta con los pagos indicados y una línea de `qty` unidades a 100. */
async function sell(
  ids: Ids,
  suffix: string,
  qty: number,
  payments: Array<{ method: "EFECTIVO" | "TARJETA"; amount: number }>,
) {
  const total = qty * 100;
  return prisma.posSale.create({
    data: {
      saleNumber: `${TAG}-${suffix}`,
      branchId: ids.branchId,
      cashierId: ids.userId,
      operatorId: ids.operatorId,
      warehouseId: ids.warehouseId,
      status: "COMPLETADA",
      subtotal: total,
      total,
      completedAt: new Date(),
      items: {
        create: [
          {
            productId: ids.productId,
            productName: "Artículo DEV-A",
            productSku: `${TAG}-ART`,
            quantity: qty,
            unitPrice: 100,
            total,
            position: 0,
          },
        ],
      },
      payments: { create: payments },
    },
    include: { items: true },
  });
}

/**
 * La secuencia de `returnPosSaleAction`: cabecera → (turno) → inventario.
 *
 * `hold` ensancha la ventana tras tomar el bloqueo de la cabecera para que la
 * carrera ocurra de verdad y no por azar del planificador.
 */
async function doReturn(
  ids: Ids,
  saleId: string,
  saleItemId: string,
  quantity: number,
  hold = 0,
) {
  return prisma.$transaction(async (tx) => {
    // 1. Cabecera de la venta. Todo lo que se calcula sale de aquí.
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "pos_sales" WHERE "id" = ${saleId} FOR UPDATE`,
    );
    const sale = await tx.posSale.findFirstOrThrow({
      where: { id: saleId },
      include: { items: true, payments: true },
    });

    const cashTendered = sale.payments
      .filter((p) => p.method === "EFECTIVO")
      .reduce((sum, p) => sum + Number(p.amount), 0);
    if (cashTendered <= 0) throw new Error("CARD_ONLY_SALE");

    const prior = await tx.posSaleReturn.aggregate({
      where: { saleId },
      _sum: { cashRefunded: true },
    });
    const refundable = cashTendered - Number(prior._sum.cashRefunded ?? 0);

    const priorItems = await tx.posSaleReturnItem.groupBy({
      by: ["saleItemId"],
      where: { saleItem: { saleId } },
      _sum: { quantity: true },
    });
    const returned =
      priorItems.find((r) => r.saleItemId === saleItemId)?._sum.quantity ?? 0;
    const item = sale.items.find((i) => i.id === saleItemId)!;
    const remaining = Number(item.quantity) - Number(returned);

    if (hold) await new Promise((resolve) => setTimeout(resolve, hold));

    if (quantity > remaining) throw new Error("OVER_RETURN");

    const value =
      Math.round(((Number(item.total) * quantity) / Number(item.quantity)) * 100) /
      100;
    if (value > refundable + 1e-9) throw new Error("CASH_CAP_EXCEEDED");

    // 2. Turno, si hay efectivo. Antes que el inventario, como D3 estableció.
    if (value > 0) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "pos_cash_shifts" WHERE "branch_id" = ${ids.branchId} AND "operator_id" = ${ids.operatorId} AND "status" = 'ABIERTO' FOR UPDATE`,
      );
      const shift = await tx.posCashShift.findFirst({
        where: {
          branchId: ids.branchId,
          operatorId: ids.operatorId,
          status: "ABIERTO",
        },
        select: { id: true },
      });
      if (!shift) throw new Error("NO_OPEN_SHIFT");
    }

    const created = await tx.posSaleReturn.create({
      data: {
        returnNumber: `${TAG}-DEV-${crypto.randomUUID().slice(0, 8)}`,
        saleId,
        branchId: ids.branchId,
        warehouseId: ids.warehouseId,
        operatorId: ids.operatorId,
        reason: `${TAG} motivo`,
        cashRefunded: new Prisma.Decimal(value),
        createdByUserId: ids.userId,
        items: {
          create: [{ saleItemId, quantity: new Prisma.Decimal(quantity) }],
        },
      },
      select: { id: true },
    });

    // 3. Inventario: repone.
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "pos_inventory" WHERE "warehouse_id" = ${ids.warehouseId} AND "product_id" = ${ids.productId} FOR UPDATE`,
    );
    const balance = await tx.posInventory.findUniqueOrThrow({
      where: {
        warehouseId_productId: {
          warehouseId: ids.warehouseId,
          productId: ids.productId,
        },
      },
    });
    const after = balance.quantity.add(new Prisma.Decimal(quantity));
    await tx.posInventoryMovement.create({
      data: {
        warehouseId: ids.warehouseId,
        productId: ids.productId,
        type: "DEVOLUCION_CLIENTE",
        quantity: new Prisma.Decimal(quantity),
        quantityBefore: balance.quantity,
        quantityAfter: after,
        reason: `Devolución de ${sale.saleNumber}`,
        createdByUserId: ids.userId,
        saleId,
        returnId: created.id,
      },
    });
    await tx.posInventory.update({
      where: { id: balance.id },
      data: { quantity: after },
    });

    if (value > 0) {
      await tx.posCashMovement.create({
        data: {
          shiftId: ids.shiftId,
          type: "SALIDA",
          amount: new Prisma.Decimal(value),
          reason: `Devolución ${TAG}`,
          createdByUserId: ids.userId,
          saleReturnId: created.id,
        },
      });
    }
    return { returnId: created.id, value };
  });
}

async function main() {
  console.log(`\nSMOKE-DEV-A — devolución de venta (${TAG})\n`);
  const ids = await seed();

  // --- 1. Venta mixta: el tope es el efectivo, no el total ---------------
  // 10 unidades = C$1 000, cobradas C$300 efectivo + C$700 tarjeta.
  const mixed = await sell(ids, "MIX", 10, [
    { method: "EFECTIVO", amount: 300 },
    { method: "TARJETA", amount: 700 },
  ]);
  const mixedItem = mixed.items[0]!.id;

  // Devolver 3 unidades vale C$300 = exactamente el tope. Pasa.
  const first = await doReturn(ids, mixed.id, mixedItem, 3);
  check(
    "una venta mixta admite devolución hasta su efectivo (C$300)",
    first.value === 300,
    `valor=${first.value}`,
  );

  // Devolver 1 más valdría C$100 y el tope ya está agotado. Se rechaza.
  let capped = false;
  try {
    await doReturn(ids, mixed.id, mixedItem, 1);
  } catch (error) {
    capped = (error as Error).message === "CASH_CAP_EXCEEDED";
  }
  check("agotado el efectivo, la siguiente devolución se rechaza entera", capped);

  const mixedReturns = await prisma.posSaleReturn.count({
    where: { saleId: mixed.id },
  });
  check(
    "el rechazo no dejó documento",
    mixedReturns === 1,
    `devoluciones=${mixedReturns}`,
  );

  // --- 2. Venta solo con tarjeta: fuera de alcance ------------------------
  const card = await sell(ids, "CARD", 2, [{ method: "TARJETA", amount: 200 }]);
  let cardOnly = false;
  try {
    await doReturn(ids, card.id, card.items[0]!.id, 1);
  } catch (error) {
    cardOnly = (error as Error).message === "CARD_ONLY_SALE";
  }
  check("una venta sin efectivo se rechaza con su propio código", cardOnly);
  check(
    "y no deja ni documento ni movimiento",
    (await prisma.posSaleReturn.count({ where: { saleId: card.id } })) === 0,
  );

  // --- 3. Devoluciones secuenciales: la segunda ve lo que hizo la primera --
  const cash = await sell(ids, "CASH", 10, [{ method: "EFECTIVO", amount: 1000 }]);
  const cashItem = cash.items[0]!.id;
  await doReturn(ids, cash.id, cashItem, 4);
  const second = await doReturn(ids, cash.id, cashItem, 3);
  check(
    "la segunda devolución descuenta lo que la primera ya reembolsó",
    second.value === 300,
    `valor=${second.value}`,
  );
  const remainingReturns = await prisma.posSaleReturn.aggregate({
    where: { saleId: cash.id },
    _sum: { cashRefunded: true },
  });
  check(
    "el acumulado devuelto es 700 de 1000",
    Number(remainingReturns._sum.cashRefunded) === 700,
    `acumulado=${remainingReturns._sum.cashRefunded}`,
  );

  // --- 4. LA CARRERA: dos devoluciones simultáneas de la misma línea ------
  //
  // Quedan 3 unidades. Las dos piden 3: si el bloqueo de la cabecera no
  // serializara, ambas leerían «quedan 3» y devolverían 6 de 10.
  const raceA = doReturn(ids, cash.id, cashItem, 3, 700);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const raceB = doReturn(ids, cash.id, cashItem, 3);
  const results = await Promise.allSettled([raceA, raceB]);
  const won = results.filter((r) => r.status === "fulfilled").length;
  const lost = results.filter(
    (r) => r.status === "rejected" && (r.reason as Error).message === "OVER_RETURN",
  ).length;
  check("de dos devoluciones simultáneas, solo una prospera", won === 1, `ganadas=${won}`);
  check("la otra se rechaza por exceder lo devuelto", lost === 1, `perdidas=${lost}`);

  const totalReturned = await prisma.posSaleReturnItem.aggregate({
    where: { saleItem: { saleId: cash.id } },
    _sum: { quantity: true },
  });
  check(
    "nunca se devuelve más de lo vendido (10 de 10)",
    Number(totalReturned._sum.quantity) === 10,
    `devuelto=${totalReturned._sum.quantity}`,
  );

  // --- 5. Dos filas de movimiento, no una mutada --------------------------
  const movements = await prisma.posInventoryMovement.findMany({
    where: { saleId: cash.id },
    select: { type: true, returnId: true, quantity: true },
  });
  const returnMovements = movements.filter((m) => m.returnId !== null);
  check(
    "los movimientos de devolución llevan saleId **y** returnId",
    returnMovements.length > 0 &&
      returnMovements.every((m) => m.type === "DEVOLUCION_CLIENTE"),
    JSON.stringify(returnMovements.map((m) => m.type)),
  );
  check(
    "y reponen: cantidad positiva",
    returnMovements.every((m) => Number(m.quantity) > 0),
  );

  // --- 6. El pago de efectivo cuelga de su devolución ---------------------
  const payouts = await prisma.posCashMovement.findMany({
    where: { saleReturn: { saleId: cash.id } },
    select: { type: true, amount: true, saleReturnId: true },
  });
  check(
    "cada reembolso es una SALIDA atada a su devolución",
    payouts.length > 0 &&
      payouts.every((p) => p.type === "SALIDA" && p.saleReturnId !== null),
    `pagos=${payouts.length}`,
  );
}

main()
  .catch((error) => {
    failed += 1;
    console.error("  ERROR", error);
  })
  .finally(async () => {
    await prisma.posCashMovement.deleteMany({
      where: { saleReturn: { branchId: { not: undefined }, reason: `${TAG} motivo` } },
    });
    await prisma.posCashMovement.deleteMany({ where: { shift: { notes: TAG } } });
    await prisma.posInventoryMovement.deleteMany({
      where: { warehouse: { code: { startsWith: TAG } } },
    });
    await prisma.posSaleReturnItem.deleteMany({
      where: { return: { reason: `${TAG} motivo` } },
    });
    await prisma.posSaleReturn.deleteMany({ where: { reason: `${TAG} motivo` } });
    await prisma.posInventory.deleteMany({
      where: { warehouse: { code: { startsWith: TAG } } },
    });
    await prisma.posPayment.deleteMany({
      where: { sale: { saleNumber: { startsWith: TAG } } },
    });
    await prisma.posSaleItem.deleteMany({
      where: { sale: { saleNumber: { startsWith: TAG } } },
    });
    await prisma.posSale.deleteMany({ where: { saleNumber: { startsWith: TAG } } });
    await prisma.posCashShift.deleteMany({ where: { notes: TAG } });
    await prisma.posWarehouse.deleteMany({ where: { code: { startsWith: TAG } } });
    await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.posOperator.deleteMany({
      where: { username: { startsWith: TAG.toLowerCase() } },
    });
    await prisma.$disconnect();
    console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
