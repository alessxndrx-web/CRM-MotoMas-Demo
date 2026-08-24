import { expect, test, type Page } from "@playwright/test";

import { TAG, prisma } from "./fixtures";

/**
 * SUITE-P-13 — el movimiento de inventario sabe de qué venta salió.
 *
 * ## Qué prueba esto que el smoke no puede
 *
 * Que lo escribe **el cobro de verdad**. `prisma/smoke/p13-movement-sale.ts`
 * comprueba la restricción de la base y la forma de la consulta insertando las
 * filas a mano; aquí la venta se cobra desde el terminal y se mira qué quedó.
 * Si `checkoutPosSaleAction` dejara de pasar `saleId`, el smoke seguiría verde y
 * esta suite no.
 *
 * ## P-13 es ortogonal a D3
 *
 * Una venta con tarjeta no necesita turno de caja (D3) y **sí** produce
 * movimientos de inventario, así que también los atribuye. Se prueba a
 * propósito: acoplar las dos reglas sería un error que solo se vería el día que
 * alguien cobre con tarjeta y su devolución no encuentre nada que revertir.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/pos/venta";
const INVENTARIO = "/pos/inventario";

const UNO = { sku: `${TAG}-P13-A`, name: "Artículo P13 A", price: 300 };
const DOS = { sku: `${TAG}-P13-B`, name: "Artículo P13 B", price: 200 };

let warehouseId = "";
const productIds: Record<string, string> = {};

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
  });
  warehouseId = warehouse.id;

  for (const item of [UNO, DOS]) {
    const product = await prisma.posProduct.upsert({
      where: { sku: item.sku },
      update: { name: item.name, unitPrice: item.price, isActive: true },
      create: { sku: item.sku, name: item.name, unitPrice: item.price },
    });
    productIds[item.sku] = product.id;
    const balance = await prisma.posInventory.upsert({
      where: {
        warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
      },
      update: {},
      create: { warehouseId: warehouse.id, productId: product.id },
    });
    await prisma.posInventory.update({
      where: { id: balance.id },
      data: { quantity: 500 },
    });
  }
});

/** Escanea uno o más artículos y cobra con las formas indicadas. */
async function sell(
  page: Page,
  skus: string[],
  payments: Array<{ method: string; amount: string }>,
) {
  test.setTimeout(120_000);
  await page.goto(VENTA);
  await expect(page.getByLabel("Buscar artículo")).toBeFocused({ timeout: 45_000 });

  for (const sku of skus) {
    await page.getByLabel("Buscar artículo").fill(sku);
    await page.getByLabel("Buscar artículo").press("Enter");
    // El SKU exacto entra solo; se espera a que el resumen lo refleje antes de
    // escanear el siguiente, o el segundo escaneo pisaría al primero.
    await expect(page.getByTestId("pos-resumen-articulos")).not.toHaveText(
      "Sin artículos",
      { timeout: 30_000 },
    );
  }

  await page.getByTestId("pos-abrir-carrito").click();
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(skus.length, {
    timeout: 30_000,
  });
  await page.getByTestId("pos-ir-a-cobro").click();
  await expect(page.getByTestId("pos-payments")).toBeVisible({ timeout: 20_000 });

  for (const [index, payment] of payments.entries()) {
    await page.getByRole("button", { name: "Agregar pago" }).click();
    const panel = page.getByTestId("pos-payments");
    await panel.getByLabel(`Forma ${index + 1}`).selectOption(payment.method);
    await panel.getByLabel(`Monto ${index + 1}`).fill(payment.amount);
  }
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 45_000 });

  return prisma.posSale.findFirstOrThrow({
    orderBy: { completedAt: "desc" },
    include: { items: true },
  });
}

/* ---------------------------------------------------------------------------
 * El cobro atribuye
 * ------------------------------------------------------------------------ */

test("una venta de una línea deja su movimiento atribuido", async ({ page }) => {
  const sale = await sell(page, [UNO.sku], [{ method: "EFECTIVO", amount: "300" }]);

  const movements = await prisma.posInventoryMovement.findMany({
    where: { saleId: sale.id },
  });
  expect(movements, "un movimiento, el de su única línea").toHaveLength(1);
  expect(movements[0]!.type).toBe("VENTA");
  expect(Number(movements[0]!.quantity), "una venta resta").toBeLessThan(0);
  // `reason` sigue ahí: `saleId` lo acompaña, no lo sustituye.
  expect(movements[0]!.reason).toBe(`Venta ${sale.saleNumber}`);
});

test("una venta de dos líneas deja dos movimientos con el mismo saleId", async ({
  page,
}) => {
  const sale = await sell(
    page,
    [UNO.sku, DOS.sku],
    [{ method: "EFECTIVO", amount: "500" }],
  );
  expect(sale.items, "la venta tiene dos líneas").toHaveLength(2);

  const movements = await prisma.posInventoryMovement.findMany({
    where: { saleId: sale.id },
  });
  expect(movements, "un movimiento por línea").toHaveLength(sale.items.length);
  expect(new Set(movements.map((m) => m.saleId)).size, "un solo saleId").toBe(1);
  expect(
    new Set(movements.map((m) => m.productId)),
    "uno por cada producto vendido",
  ).toEqual(new Set(sale.items.map((item) => item.productId)));
});

test("una venta solo con tarjeta también atribuye sus movimientos", async ({
  page,
}) => {
  /*
   * P-13 es **ortogonal a D3**. Una venta con tarjeta no exige turno de caja y
   * aun así mueve mercancía; si su movimiento no llevara `saleId`, su devolución
   * futura no encontraría nada que revertir.
   */
  const sale = await sell(page, [DOS.sku], [{ method: "TARJETA", amount: "200" }]);
  expect(sale.shiftId, "sin efectivo no pertenece a ningún turno").toBeNull();

  const movements = await prisma.posInventoryMovement.findMany({
    where: { saleId: sale.id },
  });
  expect(movements, "y sin embargo su movimiento está atribuido").toHaveLength(1);
});

/* ---------------------------------------------------------------------------
 * Lo que no es venta se queda en NULL
 * ------------------------------------------------------------------------ */

test("un ajuste manual no se atribuye a ninguna venta", async ({ page }) => {
  /*
   * La mitad que demuestra que el campo **distingue**: si se llenara siempre,
   * una devolución creería que un ajuste de inventario fue una venta.
   *
   * Se hace por la interfaz real —`adjustPosInventoryAction` a través de
   * `/pos/inventario`— y no insertando la fila, porque lo que se comprueba es
   * que esa acción no lo pone.
   */
  const before = await prisma.posInventoryMovement.count({
    where: { type: "AJUSTE", warehouseId },
  });

  await page.goto(INVENTARIO);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Existencias" }),
  ).toBeVisible({ timeout: 45_000 });

  await page.getByTestId("registrar-ajuste").click();
  await expect(page.getByTestId("operacion-formulario")).toBeVisible();
  await page.getByTestId("operacion-bodega").selectOption(warehouseId);
  await page.getByTestId("operacion-articulo").selectOption(productIds[UNO.sku]!);
  await page.getByTestId("operacion-cantidad").fill("3");
  await page.getByTestId("operacion-motivo").fill(`${TAG} ajuste P13`);
  await page.getByTestId("operacion-confirmar").click();

  await expect(async () => {
    const after = await prisma.posInventoryMovement.count({
      where: { type: "AJUSTE", warehouseId },
    });
    expect(after, "el ajuste se registró").toBe(before + 1);
  }).toPass({ timeout: 30_000 });

  const adjustment = await prisma.posInventoryMovement.findFirstOrThrow({
    where: { type: "AJUSTE", warehouseId },
    orderBy: { createdAt: "desc" },
  });
  expect(adjustment.saleId, "un ajuste no es una venta").toBeNull();
});

/* ---------------------------------------------------------------------------
 * La consulta que las devoluciones harán
 * ------------------------------------------------------------------------ */

test("preguntar por saleId devuelve exactamente lo que movió esa venta", async ({
  page,
}) => {
  const sale = await sell(
    page,
    [UNO.sku, DOS.sku],
    [{ method: "EFECTIVO", amount: "500" }],
  );

  const movements = await prisma.posInventoryMovement.findMany({
    where: { saleId: sale.id },
    orderBy: { createdAt: "asc" },
  });

  // Ni de menos: una fila por línea.
  expect(movements).toHaveLength(sale.items.length);
  // Ni de más: ningún movimiento de otra venta ni ningún ajuste se cuela.
  expect(movements.every((m) => m.saleId === sale.id)).toBe(true);
  expect(movements.every((m) => m.type === "VENTA")).toBe(true);

  // Y la cantidad movida coincide con la vendida, línea por línea.
  for (const item of sale.items) {
    const movement = movements.find((m) => m.productId === item.productId);
    expect(movement, `falta el movimiento de ${item.productSku}`).toBeTruthy();
    expect(Number(movement!.quantity)).toBe(-Number(item.quantity));
  }
});
