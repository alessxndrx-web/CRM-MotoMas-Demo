/**
 * SMOKE-CB4-B — el cajón del mostrador, contra PostgreSQL real.
 *
 *   npm run smoke:pos-cash
 *
 * Ejercita la aritmética del efectivo, las restricciones de la base y las
 * carreras, que es lo que un E2E no puede provocar: dos transacciones a la vez
 * contra la misma fila.
 *
 * Lo que NO cubre: la autorización. `openPosCashShiftAction` y sus hermanas
 * resuelven la identidad desde la cookie firmada de mostrador, que un script
 * fuera de Next no puede construir. El alcance por sucursal y operador se
 * comprueba en `e2e/pos-caja.spec.ts`, incluida la denegación cruzada.
 *
 * Crea sus propios fixtures con prefijo reconocible y **los borra al terminar**,
 * incluso si una aserción falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { derivePosCashTotals, sumPosCashSales } from "@/server/pos/cash";

const prisma = new PrismaClient();
const TAG = `SMOKE-CB4B-${Date.now()}`;

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

function isUnique(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

type Ids = {
  branchId: string;
  otherBranchId: string;
  operatorId: string;
  userId: string;
  productId: string;
};

async function seed(): Promise<Ids> {
  const branches = await prisma.branch.findMany({
    select: { id: true },
    take: 2,
    orderBy: { code: "asc" },
  });
  const branchId = branches[0]!.id;
  const otherBranchId = branches[1]!.id;
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });

  const operator = await prisma.posOperator.create({
    data: {
      username: `${TAG.toLowerCase()}-op`,
      passwordHash: "x",
      userId: user.id,
      branchId,
    },
    select: { id: true },
  });
  const product = await prisma.posProduct.create({
    data: { sku: `${TAG}-ART`, name: "Artículo de smoke", unitPrice: 100 },
    select: { id: true },
  });

  return {
    branchId,
    otherBranchId,
    operatorId: operator.id,
    userId: user.id,
    productId: product.id,
  };
}

/** Una venta completada con los pagos indicados, atribuible a un turno. */
async function sell(
  ids: Ids,
  suffix: string,
  payments: Array<{ method: "EFECTIVO" | "TARJETA"; amount: number }>,
  completedAt: Date,
) {
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  await prisma.posSale.create({
    data: {
      saleNumber: `${TAG}-${suffix}`,
      branchId: ids.branchId,
      cashierId: ids.userId,
      operatorId: ids.operatorId,
      status: "COMPLETADA",
      subtotal: total,
      total,
      completedAt,
      items: {
        create: [
          {
            productId: ids.productId,
            productName: "Artículo de smoke",
            productSku: `${TAG}-ART`,
            quantity: 1,
            unitPrice: total,
            total,
            position: 0,
          },
        ],
      },
      payments: { create: payments },
    },
  });
}

async function main() {
  console.log(`\nSMOKE-CB4-B — cajón del mostrador (${TAG})\n`);
  const ids = await seed();

  // --- 1. Apertura y fondo -----------------------------------------------
  const shift = await prisma.posCashShift.create({
    data: {
      branchId: ids.branchId,
      operatorId: ids.operatorId,
      openedByUserId: ids.userId,
      openingFloat: new Prisma.Decimal(2000),
      notes: TAG,
    },
  });
  check(
    "el fondo inicial se persiste tal cual",
    Number(shift.openingFloat) === 2000,
    `fondo=${shift.openingFloat}`,
  );

  // --- 2. Un solo turno abierto, incluso con aperturas simultáneas -------
  const openTwice = await Promise.allSettled([
    prisma.posCashShift.create({
      data: {
        branchId: ids.branchId,
        operatorId: ids.operatorId,
        openedByUserId: ids.userId,
        openingFloat: new Prisma.Decimal(1),
        notes: TAG,
      },
    }),
    prisma.posCashShift.create({
      data: {
        branchId: ids.branchId,
        operatorId: ids.operatorId,
        openedByUserId: ids.userId,
        openingFloat: new Prisma.Decimal(1),
        notes: TAG,
      },
    }),
  ]);
  check(
    "un segundo turno abierto lo rechaza la base",
    openTwice.every((r) => r.status === "rejected" && isUnique(r.reason)),
  );
  const openCount = await prisma.posCashShift.count({
    where: { branchId: ids.branchId, operatorId: ids.operatorId, status: "ABIERTO" },
  });
  check("queda exactamente un turno abierto", openCount === 1, `abiertos=${openCount}`);

  // --- 3. Ventas: solo la parte en efectivo llega al cajón ---------------
  const now = new Date();
  await sell(ids, "V1", [{ method: "EFECTIVO", amount: 8500 }], now);
  // La venta mixta del enunciado: C$1,000 = C$400 efectivo + C$600 tarjeta.
  await sell(
    ids,
    "V2",
    [
      { method: "EFECTIVO", amount: 400 },
      { method: "TARJETA", amount: 600 },
    ],
    now,
  );

  const cashSales = await sumPosCashSales(prisma, {
    branchId: shift.branchId,
    operatorId: shift.operatorId,
    openedAt: shift.openedAt,
    closedAt: null,
  });
  check(
    "el pago mixto aporta solo su efectivo (8500 + 400)",
    cashSales === 8900,
    `efectivo=${cashSales}`,
  );

  // Una venta **fuera** de la ventana no cuenta.
  const past = new Date(shift.openedAt.getTime() - 60 * 60 * 1000);
  await sell(ids, "V0", [{ method: "EFECTIVO", amount: 999 }], past);
  const afterPast = await sumPosCashSales(prisma, {
    branchId: shift.branchId,
    operatorId: shift.operatorId,
    openedAt: shift.openedAt,
    closedAt: null,
  });
  check(
    "una venta anterior al turno no lo alimenta",
    afterPast === 8900,
    `efectivo=${afterPast}`,
  );

  // --- 4. Entradas y salidas --------------------------------------------
  await prisma.posCashMovement.create({
    data: {
      shiftId: shift.id,
      type: "ENTRADA",
      amount: new Prisma.Decimal(500),
      reason: "Cambio adicional",
      createdByUserId: ids.userId,
    },
  });
  await prisma.posCashMovement.create({
    data: {
      shiftId: shift.id,
      type: "SALIDA",
      amount: new Prisma.Decimal(1200),
      reason: "Depósito al banco",
      createdByUserId: ids.userId,
    },
  });

  // --- 5. La invariante del enunciado ------------------------------------
  const totals = await derivePosCashTotals(prisma, {
    id: shift.id,
    branchId: shift.branchId,
    operatorId: shift.operatorId,
    openedAt: shift.openedAt,
    closedAt: null,
    openingFloat: Number(shift.openingFloat),
  });
  // 2000 + 8900 + 500 − 1200 = 10 200
  check(
    "esperado = fondo + efectivo + entradas − salidas",
    totals.expectedCash === 10_200,
    `esperado=${totals.expectedCash}`,
  );
  check("las entradas se suman aparte", totals.cashIn === 500, `entradas=${totals.cashIn}`);
  check("las salidas se suman aparte", totals.cashOut === 1200, `salidas=${totals.cashOut}`);

  // --- 6. Idempotencia del movimiento manual -----------------------------
  const key = `${TAG}-KEY`;
  await prisma.posCashMovement.create({
    data: {
      shiftId: shift.id,
      type: "ENTRADA",
      amount: new Prisma.Decimal(10),
      reason: "Con clave",
      createdByUserId: ids.userId,
      idempotencyKey: key,
    },
  });
  let duplicated = false;
  try {
    await prisma.posCashMovement.create({
      data: {
        shiftId: shift.id,
        type: "ENTRADA",
        amount: new Prisma.Decimal(10),
        reason: "Con clave",
        createdByUserId: ids.userId,
        idempotencyKey: key,
      },
    });
    duplicated = true;
  } catch (error) {
    duplicated = !isUnique(error);
  }
  check("el reenvío con la misma clave no duplica dinero", !duplicated);

  // --- 7. Cierre: congela y no vuelve a derivar ---------------------------
  const closedAt = new Date();
  const atClose = await derivePosCashTotals(prisma, {
    id: shift.id,
    branchId: shift.branchId,
    operatorId: shift.operatorId,
    openedAt: shift.openedAt,
    closedAt,
    openingFloat: Number(shift.openingFloat),
  });
  const counted = 10_060; // faltante deliberado de 150 sobre 10 210
  const difference = counted - atClose.expectedCash;

  await prisma.posCashShift.updateMany({
    where: { id: shift.id, status: "ABIERTO" },
    data: {
      status: "CERRADO",
      closedAt,
      cashSalesTotal: new Prisma.Decimal(atClose.cashSales),
      cashInTotal: new Prisma.Decimal(atClose.cashIn),
      cashOutTotal: new Prisma.Decimal(atClose.cashOut),
      expectedCash: new Prisma.Decimal(atClose.expectedCash),
      countedCash: new Prisma.Decimal(counted),
      difference: new Prisma.Decimal(difference),
    },
  });

  const closed = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: shift.id },
  });
  check("el turno queda cerrado", closed.status === "CERRADO");
  check(
    "la diferencia negativa se guarda con su signo",
    Number(closed.difference) === difference && difference < 0,
    `diferencia=${closed.difference}`,
  );

  // **La prueba que importa**: una venta posterior NO reescribe el arqueo.
  const frozenExpected = Number(closed.expectedCash);
  await sell(ids, "V3", [{ method: "EFECTIVO", amount: 5000 }], new Date());
  const reread = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: shift.id },
  });
  check(
    "una venta posterior no reescribe el esperado congelado",
    Number(reread.expectedCash) === frozenExpected,
    `antes=${frozenExpected} después=${reread.expectedCash}`,
  );
  check(
    "ni el contado ni la diferencia se recalculan",
    Number(reread.countedCash) === counted &&
      Number(reread.difference) === difference,
  );

  // --- 8. Cierre concurrente ---------------------------------------------
  const second = await prisma.posCashShift.create({
    data: {
      branchId: ids.branchId,
      operatorId: ids.operatorId,
      openedByUserId: ids.userId,
      openingFloat: new Prisma.Decimal(100),
      notes: TAG,
    },
  });
  const closeOnce = () =>
    prisma.posCashShift.updateMany({
      where: { id: second.id, status: "ABIERTO" },
      data: {
        status: "CERRADO",
        closedAt: new Date(),
        expectedCash: new Prisma.Decimal(100),
        countedCash: new Prisma.Decimal(100),
        difference: new Prisma.Decimal(0),
      },
    });
  const closes = await Promise.all([closeOnce(), closeOnce()]);
  const winners = closes.filter((r) => r.count === 1).length;
  check(
    "dos cierres simultáneos: gana uno solo",
    winners === 1,
    `ganadores=${winners}`,
  );

  // --- 9. Un turno cerrado libera la unicidad ----------------------------
  let reopened = false;
  try {
    await prisma.posCashShift.create({
      data: {
        branchId: ids.branchId,
        operatorId: ids.operatorId,
        openedByUserId: ids.userId,
        openingFloat: new Prisma.Decimal(50),
        notes: TAG,
      },
    });
    reopened = true;
  } catch {
    reopened = false;
  }
  check("con todos cerrados, el operador puede reabrir", reopened);
}

main()
  .catch((error) => {
    failed += 1;
    console.error("  ERROR", error);
  })
  .finally(async () => {
    await prisma.posCashMovement.deleteMany({
      where: { shift: { notes: TAG } },
    });
    await prisma.posCashShift.deleteMany({ where: { notes: TAG } });
    await prisma.posPayment.deleteMany({
      where: { sale: { saleNumber: { startsWith: TAG } } },
    });
    await prisma.posSaleItem.deleteMany({
      where: { sale: { saleNumber: { startsWith: TAG } } },
    });
    await prisma.posSale.deleteMany({ where: { saleNumber: { startsWith: TAG } } });
    await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.posOperator.deleteMany({
      where: { username: { startsWith: TAG.toLowerCase() } },
    });
    await prisma.$disconnect();
    console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
