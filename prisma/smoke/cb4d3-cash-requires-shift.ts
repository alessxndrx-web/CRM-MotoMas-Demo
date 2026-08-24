/**
 * SMOKE-CB4-D3 — el efectivo exige turno, y el turno se bloquea.
 *
 *   npm run smoke:d3
 *
 * ## Qué prueba esto que un E2E no puede
 *
 * La carrera. `pos-d3.spec.ts` comprueba que la acción de cobro aplica la regla
 * y que el rechazo no deja rastro, pero **no puede solapar dos transacciones**:
 * Playwright habla por HTTP y no controla cuándo confirma cada una.
 *
 * Aquí se abren dos transacciones a la vez contra la misma fila y se comprueba
 * el orden que el `SELECT … FOR UPDATE` impone. Es la prueba de que D3 no es un
 * `check-then-act`.
 *
 * Lo que NO cubre: la autorización, que resuelve la cookie firmada de mostrador
 * y vive en `pos-d3.spec.ts`. Aquí se reproduce la **secuencia de bloqueos** que
 * `checkoutPosSaleAction` ejecuta —turno primero, inventario después—, no la
 * acción entera.
 *
 * Crea sus fixtures con prefijo reconocible y **los borra al terminar**, incluso
 * si una aserción falla.
 */
import { PrismaClient, Prisma } from "@prisma/client";

import { derivePosCashTotals } from "@/server/pos/cash";

const prisma = new PrismaClient();
const TAG = `SMOKE-CB4D3-${Date.now()}`;

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
  const product = await prisma.posProduct.create({
    data: { sku: `${TAG}-ART`, name: "Artículo D3", unitPrice: 100 },
    select: { id: true },
  });
  const shift = await prisma.posCashShift.create({
    data: {
      branchId: branch.id,
      operatorId: operator.id,
      openedByUserId: user.id,
      openingFloat: new Prisma.Decimal(1000),
      notes: TAG,
    },
    select: { id: true },
  });
  return {
    branchId: branch.id,
    operatorId: operator.id,
    userId: user.id,
    productId: product.id,
    shiftId: shift.id,
  };
}

/**
 * La secuencia de `checkoutPosSaleAction` para una venta en efectivo: bloquea el
 * turno, reafirma que está abierto y crea la venta con su `shiftId`.
 *
 * `hold` ensancha la ventana entre el bloqueo y el `commit` para que la carrera
 * ocurra de verdad y no por azar del planificador.
 */
async function cashCheckout(ids: Ids, suffix: string, amount: number, hold = 0) {
  return prisma.$transaction(async (tx) => {
    // 1. Turno. **Siempre antes que el inventario**, como en el cobro real.
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

    if (hold) await new Promise((resolve) => setTimeout(resolve, hold));

    const sale = await tx.posSale.create({
      data: {
        saleNumber: `${TAG}-${suffix}`,
        branchId: ids.branchId,
        cashierId: ids.userId,
        operatorId: ids.operatorId,
        shiftId: shift.id,
        status: "COMPLETADA",
        subtotal: amount,
        total: amount,
        completedAt: new Date(),
        items: {
          create: [
            {
              productId: ids.productId,
              productName: "Artículo D3",
              productSku: `${TAG}-ART`,
              quantity: 1,
              unitPrice: amount,
              total: amount,
              position: 0,
            },
          ],
        },
        payments: { create: [{ method: "EFECTIVO", amount }] },
      },
      select: { id: true, shiftId: true },
    });
    return sale;
  });
}

/** El cierre, con su bloqueo antes de derivar — como `closePosCashShiftAction`. */
async function closeShift(ids: Ids) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "pos_cash_shifts" WHERE "id" = ${ids.shiftId} FOR UPDATE`,
    );
    const locked = await tx.posCashShift.findUniqueOrThrow({
      where: { id: ids.shiftId },
    });
    if (locked.status !== "ABIERTO") throw new Error("SHIFT_CLOSED");

    const closedAt = new Date();
    const totals = await derivePosCashTotals(tx, {
      id: locked.id,
      branchId: locked.branchId,
      operatorId: locked.operatorId,
      openedAt: locked.openedAt,
      closedAt,
      openingFloat: Number(locked.openingFloat),
    });
    await tx.posCashShift.updateMany({
      where: { id: locked.id, status: "ABIERTO" },
      data: {
        status: "CERRADO",
        closedAt,
        expectedCash: new Prisma.Decimal(totals.expectedCash),
        countedCash: new Prisma.Decimal(totals.expectedCash),
        difference: new Prisma.Decimal(0),
      },
    });
    return totals.expectedCash;
  });
}

async function main() {
  console.log(`\nSMOKE-CB4-D3 — efectivo exige turno (${TAG})\n`);
  const ids = await seed();

  // --- 1. Con turno abierto, el cobro en efectivo pasa y queda atribuido ---
  const sale = await cashCheckout(ids, "V1", 500);
  check(
    "la venta en efectivo se atribuye al turno por clave foránea",
    sale.shiftId === ids.shiftId,
    `shiftId=${sale.shiftId}`,
  );

  const bySh = await prisma.posSale.findMany({
    where: { shiftId: ids.shiftId },
    select: { id: true },
  });
  check(
    "la venta es consultable por el turno, no por ventana de tiempo",
    bySh.length === 1,
    `ventas=${bySh.length}`,
  );

  // --- 2. LA CARRERA: cobro en vuelo contra cierre concurrente -------------
  //
  // El cobro toma el bloqueo y lo retiene 800 ms. El cierre arranca 200 ms
  // después: encuentra la fila bloqueada y **espera**. Cuando entra, el cobro ya
  // confirmó, así que su derivación ve la venta.
  const inFlight = cashCheckout(ids, "V2", 300, 800);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const closing = closeShift(ids);

  const [saleResult, expected] = await Promise.all([inFlight, closing]);
  check("el cobro en vuelo se completó", Boolean(saleResult.id));
  // 1000 fondo + 500 + 300 de efectivo = 1800. Si el cierre no hubiera esperado,
  // habría congelado 1500 y esos 300 serían efectivo invisible.
  check(
    "el cierre esperó al cobro y su esperado incluye esa venta",
    expected === 1800,
    `esperado=${expected} (sin el bloqueo habrían sido 1500)`,
  );

  const frozen = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: ids.shiftId },
  });
  check(
    "lo congelado coincide con lo derivado bajo el bloqueo",
    Number(frozen.expectedCash) === 1800,
    `congelado=${frozen.expectedCash}`,
  );

  // --- 3. Con el turno ya cerrado, el efectivo se rechaza -------------------
  let rejected = false;
  try {
    await cashCheckout(ids, "V3", 100);
  } catch (error) {
    rejected = (error as Error).message === "NO_OPEN_SHIFT";
  }
  check("con el turno cerrado, el cobro en efectivo se rechaza", rejected);

  const after = await prisma.posSale.count({
    where: { saleNumber: `${TAG}-V3` },
  });
  check("el rechazo no dejó venta", after === 0, `ventas=${after}`);
}

main()
  .catch((error) => {
    failed += 1;
    console.error("  ERROR", error);
  })
  .finally(async () => {
    await prisma.posPayment.deleteMany({
      where: { sale: { saleNumber: { startsWith: TAG } } },
    });
    await prisma.posSaleItem.deleteMany({
      where: { sale: { saleNumber: { startsWith: TAG } } },
    });
    await prisma.posSale.deleteMany({ where: { saleNumber: { startsWith: TAG } } });
    await prisma.posCashMovement.deleteMany({ where: { shift: { notes: TAG } } });
    await prisma.posCashShift.deleteMany({ where: { notes: TAG } });
    await prisma.posProduct.deleteMany({ where: { sku: { startsWith: TAG } } });
    await prisma.posOperator.deleteMany({
      where: { username: { startsWith: TAG.toLowerCase() } },
    });
    await prisma.$disconnect();
    console.log(`\n  ${passed} correctas, ${failed} fallidas\n`);
    process.exit(failed === 0 ? 0 : 1);
  });
