import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-CB4-D3 — el efectivo exige turno de caja abierto.
 *
 * ## Qué prueba esto que el smoke no puede
 *
 * Que la regla vive **en la acción de cobro** y no en la pantalla: cada caso
 * pasa por `checkoutPosSaleAction` con la cookie firmada de mostrador, que un
 * script fuera de Next no puede construir. El smoke cubre la carrera; esto cubre
 * el camino real y la frontera de autorización.
 *
 * ## Contra la base, siempre
 *
 * Un cobro rechazado tiene que no dejar **nada**: ni venta, ni pagos, ni
 * movimiento de inventario, ni saldo movido. Comprobarlo mirando la pantalla no
 * demostraría nada; se cuenta en la base antes y después.
 *
 * ## El turno del arnés
 *
 * `fixtures.ts` abre un turno para el operador del arnés, que es el estado
 * normal de un mostrador. Los casos que exigen **ausencia** de turno lo cierran
 * primero y lo reabren al terminar, para no arrastrar estado a las demás suites.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/pos/venta";
const ART = { sku: `${TAG}-D3-ART`, name: "Artículo D3", price: 500 };

let warehouseId = "";
let productId = "";

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
  });
  warehouseId = warehouse.id;
  const product = await prisma.posProduct.upsert({
    where: { sku: ART.sku },
    update: { name: ART.name, unitPrice: ART.price, isActive: true },
    create: { sku: ART.sku, name: ART.name, unitPrice: ART.price },
  });
  productId = product.id;
  const balance = await prisma.posInventory.upsert({
    where: { warehouseId_productId: { warehouseId: warehouse.id, productId: product.id } },
    update: {},
    create: { warehouseId: warehouse.id, productId: product.id },
  });
  await prisma.posInventory.update({
    where: { id: balance.id },
    data: { quantity: 1000 },
  });
});

/** El turno abierto del operador del arnés. */
async function harnessShift() {
  return prisma.posCashShift.findFirst({
    where: {
      status: "ABIERTO",
      branch: { code: MAPPED_BRANCH_CODE },
      operator: { username: { startsWith: TAG.toLowerCase() } },
    },
  });
}

/** Cierra el turno del arnés para probar su ausencia. Devuelve cómo reabrirlo. */
async function withoutShift<T>(body: () => Promise<T>): Promise<T> {
  const shift = await harnessShift();
  if (shift) {
    await prisma.posCashShift.update({
      where: { id: shift.id },
      data: { status: "CERRADO", closedAt: new Date() },
    });
  }
  try {
    return await body();
  } finally {
    // Se reabre uno nuevo: el índice único parcial impide reabrir el mismo.
    if (shift) {
      await prisma.posCashShift.create({
        data: {
          branchId: shift.branchId,
          operatorId: shift.operatorId,
          openedByUserId: shift.openedByUserId,
          openingFloat: shift.openingFloat,
          notes: shift.notes,
        },
      });
    }
  }
}

/** Fotografía de todo lo que un cobro escribiría. */
async function snapshot() {
  const balance = await prisma.posInventory.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  return {
    sales: await prisma.posSale.count(),
    payments: await prisma.posPayment.count(),
    movements: await prisma.posInventoryMovement.count(),
    quantity: Number(balance.quantity),
  };
}

/** Cobra desde el terminal con las formas de pago indicadas. */
async function sell(page: Page, payments: Array<{ method: string; amount: string }>) {
  test.setTimeout(120_000);
  await page.goto(VENTA);
  await expect(page.getByLabel("Buscar artículo")).toBeFocused({ timeout: 45_000 });
  await page.getByLabel("Buscar artículo").fill(ART.sku);
  await page.getByLabel("Buscar artículo").press("Enter");

  await page.getByTestId("pos-abrir-carrito").click();
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("pos-ir-a-cobro").click();
  await expect(page.getByTestId("pos-payments")).toBeVisible({ timeout: 20_000 });

  for (const [index, payment] of payments.entries()) {
    await page.getByRole("button", { name: "Agregar pago" }).click();
    const panel = page.getByTestId("pos-payments");
    await panel.getByLabel(`Forma ${index + 1}`).selectOption(payment.method);
    await panel.getByLabel(`Monto ${index + 1}`).fill(payment.amount);
  }
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
}

/* ---------------------------------------------------------------------------
 * 1. Efectivo sin turno — rechazado, y sin dejar rastro
 * ------------------------------------------------------------------------ */

test("efectivo sin turno abierto se rechaza y no escribe nada", async ({ page }) => {
  await withoutShift(async () => {
    const before = await snapshot();

    await sell(page, [{ method: "EFECTIVO", amount: "500" }]);

    await expect(page.getByTestId("pos-error")).toContainText(
      /turno de caja antes de cobrar en efectivo/i,
      { timeout: 45_000 },
    );

    const after = await snapshot();
    expect(after.sales, "ninguna venta").toBe(before.sales);
    expect(after.payments, "ningún pago").toBe(before.payments);
    expect(after.movements, "ningún movimiento").toBe(before.movements);
    expect(after.quantity, "el saldo no se tocó").toBe(before.quantity);
  });
});

test("el rechazo ofrece el camino a la caja", async ({ page }) => {
  await withoutShift(async () => {
    await sell(page, [{ method: "EFECTIVO", amount: "500" }]);
    const link = page.getByTestId("pos-error-abrir-turno");
    await expect(link).toBeVisible({ timeout: 45_000 });
    await expect(link).toHaveAttribute("href", "/pos/caja");
  });
});

/* ---------------------------------------------------------------------------
 * 2. Efectivo con turno — pasa y queda atribuido por clave foránea
 * ------------------------------------------------------------------------ */

test("efectivo con turno abierto se cobra y se atribuye al turno", async ({
  page,
}) => {
  const shift = await harnessShift();
  expect(shift, "el arnés debe tener turno abierto").not.toBeNull();
  const before = await snapshot();

  await sell(page, [{ method: "EFECTIVO", amount: "500" }]);
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 45_000 });

  const after = await snapshot();
  expect(after.sales).toBe(before.sales + 1);
  expect(after.payments).toBe(before.payments + 1);
  expect(after.movements).toBe(before.movements + 1);
  expect(after.quantity, "el saldo bajó una unidad").toBe(before.quantity - 1);

  // **Por clave foránea, no por ventana de tiempo.**
  const sale = await prisma.posSale.findFirstOrThrow({
    where: { shiftId: shift!.id },
    orderBy: { completedAt: "desc" },
    include: { payments: true },
  });
  expect(sale.shiftId).toBe(shift!.id);
  expect(sale.payments.some((p) => p.method === "EFECTIVO")).toBe(true);
});

/* ---------------------------------------------------------------------------
 * 3 y 4. Sin efectivo, sin turno: se cobra igual
 * ------------------------------------------------------------------------ */

test("solo tarjeta sin turno se cobra, y la venta no pertenece a ningún turno", async ({
  page,
}) => {
  await withoutShift(async () => {
    await sell(page, [{ method: "TARJETA", amount: "500" }]);
    await expect(page.getByTestId("pos-sale-created")).toBeVisible({
      timeout: 45_000,
    });

    const sale = await prisma.posSale.findFirstOrThrow({
      orderBy: { completedAt: "desc" },
    });
    // `null` es información: esta venta no tocó el cajón.
    expect(sale.shiftId).toBeNull();
  });
});

test("solo transferencia sin turno se cobra", async ({ page }) => {
  await withoutShift(async () => {
    await sell(page, [{ method: "TRANSFERENCIA", amount: "500" }]);
    await expect(page.getByTestId("pos-sale-created")).toBeVisible({
      timeout: 45_000,
    });
    const sale = await prisma.posSale.findFirstOrThrow({
      orderBy: { completedAt: "desc" },
    });
    expect(sale.shiftId).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * 5 y 6. Pago mixto
 * ------------------------------------------------------------------------ */

test("un pago mixto con efectivo, sin turno, se rechaza entero", async ({
  page,
}) => {
  await withoutShift(async () => {
    const before = await snapshot();
    // C$100 en efectivo + C$400 con tarjeta: basta el efectivo para exigir turno.
    await sell(page, [
      { method: "EFECTIVO", amount: "100" },
      { method: "TARJETA", amount: "400" },
    ]);

    await expect(page.getByTestId("pos-error")).toContainText(
      /turno de caja antes de cobrar en efectivo/i,
      { timeout: 45_000 },
    );

    const after = await snapshot();
    expect(after.sales).toBe(before.sales);
    expect(after.payments, "tampoco se guardó la parte de tarjeta").toBe(
      before.payments,
    );
    expect(after.quantity).toBe(before.quantity);
  });
});

test("un pago mixto con turno abierto se cobra y se atribuye", async ({ page }) => {
  const shift = await harnessShift();
  await sell(page, [
    { method: "EFECTIVO", amount: "100" },
    { method: "TARJETA", amount: "400" },
  ]);
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 45_000 });

  const sale = await prisma.posSale.findFirstOrThrow({
    orderBy: { completedAt: "desc" },
    include: { payments: true },
  });
  expect(sale.shiftId).toBe(shift!.id);
  expect(sale.payments).toHaveLength(2);
});

/* ---------------------------------------------------------------------------
 * 7. La frontera de autorización
 * ------------------------------------------------------------------------ */

test("el turno no viaja en la petición: lo impone la sesión", async ({ page }) => {
  /*
   * `checkoutPosSaleAction` **no acepta ningún identificador de turno**: lo
   * resuelve de la sucursal y el operador de la sesión firmada. La superficie de
   * ataque no se valida — no existe.
   *
   * Lo que sí se puede comprobar es la consecuencia: con un turno abierto en
   * **otra** sucursal y ninguno en la propia, el cobro en efectivo se rechaza.
   * Si el servidor mirase cualquier turno abierto en vez del de la sesión, este
   * cobro pasaría.
   */
  const foreignBranch = await prisma.branch.findFirstOrThrow({
    where: { code: { not: MAPPED_BRANCH_CODE } },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  const foreignOperator = await prisma.posOperator.create({
    data: {
      username: `${TAG.toLowerCase()}-d3-ajeno`,
      passwordHash: "x",
      userId: user.id,
      branchId: foreignBranch.id,
    },
  });
  const foreignShift = await prisma.posCashShift.create({
    data: {
      branchId: foreignBranch.id,
      operatorId: foreignOperator.id,
      openedByUserId: user.id,
      openingFloat: 5000,
      notes: `${TAG}-D3-AJENO`,
    },
  });

  try {
    await withoutShift(async () => {
      const before = await snapshot();
      await sell(page, [{ method: "EFECTIVO", amount: "500" }]);

      await expect(page.getByTestId("pos-error")).toContainText(
        /turno de caja antes de cobrar en efectivo/i,
        { timeout: 45_000 },
      );
      const after = await snapshot();
      expect(after.sales, "el turno ajeno no habilita nada").toBe(before.sales);
    });
  } finally {
    await prisma.posCashShift.delete({ where: { id: foreignShift.id } });
    await prisma.posOperator.delete({ where: { id: foreignOperator.id } });
  }
});

/* ---------------------------------------------------------------------------
 * 8. Turno cerrado
 * ------------------------------------------------------------------------ */

test("un turno cerrado no habilita el cobro en efectivo", async ({ page }) => {
  // `withoutShift` cierra el turno: exactamente el caso «hay turno, pero cerrado».
  await withoutShift(async () => {
    const closed = await prisma.posCashShift.count({
      where: {
        status: "CERRADO",
        branch: { code: MAPPED_BRANCH_CODE },
        operator: { username: { startsWith: TAG.toLowerCase() } },
      },
    });
    expect(closed, "debe existir el turno, cerrado").toBeGreaterThan(0);

    const before = await snapshot();
    await sell(page, [{ method: "EFECTIVO", amount: "500" }]);
    await expect(page.getByTestId("pos-error")).toContainText(
      /turno de caja antes de cobrar en efectivo/i,
      { timeout: 45_000 },
    );
    expect((await snapshot()).sales).toBe(before.sales);
  });
});

/* ---------------------------------------------------------------------------
 * 10. Idempotencia: rechazo, apertura, reintento con la misma clave
 * ------------------------------------------------------------------------ */

test("tras el rechazo, abrir turno y reintentar el mismo cobro funciona", async ({
  page,
}) => {
  /*
   * El caso que la idempotencia podría estropear: un intento **rechazado** no
   * escribe fila alguna, así que su clave no queda ocupada. Al reintentarlo con
   * el turno ya abierto, la lectura de idempotencia no encuentra nada y la regla
   * se evalúa de nuevo — ahora pasa.
   *
   * Si el rechazo hubiera dejado una venta, este reintento devolvería aquella y
   * el cajero cobraría sin cobrar.
   */
  await withoutShift(async () => {
    await sell(page, [{ method: "EFECTIVO", amount: "500" }]);
    await expect(page.getByTestId("pos-error")).toContainText(
      /turno de caja antes de cobrar en efectivo/i,
      { timeout: 45_000 },
    );
  });

  // El turno vuelve a estar abierto al salir de `withoutShift`. El carrito de la
  // pantalla conserva su clave de intento, así que reintentar es el mismo cobro.
  const before = await snapshot();
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 45_000 });

  const after = await snapshot();
  expect(after.sales, "exactamente una venta").toBe(before.sales + 1);

  const shift = await harnessShift();
  const sale = await prisma.posSale.findFirstOrThrow({
    orderBy: { completedAt: "desc" },
  });
  expect(sale.shiftId, "atribuida al turno que se abrió").toBe(shift!.id);
});
