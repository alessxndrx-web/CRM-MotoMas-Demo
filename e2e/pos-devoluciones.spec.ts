import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, openHarnessShift, prisma, withoutShift } from "./fixtures";

/**
 * SUITE-DEV-A — devolución de venta desde el mostrador.
 *
 * ## Qué prueba esto que el smoke no puede
 *
 * Que lo hace **la acción real**, con la cookie firmada de mostrador que un
 * script fuera de Next no puede construir. `prisma/smoke/deva-sale-return.ts`
 * cubre la carrera entre dos devoluciones simultáneas; esto cubre el camino que
 * el cajero recorre y la frontera de autorización.
 *
 * ## Contra la base, siempre
 *
 * Una devolución rechazada no puede dejar nada: ni documento, ni movimiento de
 * inventario, ni salida de efectivo, ni saldo movido. Se cuenta antes y después.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/pos/venta";
const ART = { sku: `${TAG}-DEV-ART`, name: "Artículo devolución", price: 100 };

let warehouseId = "";
let productId = "";

test.beforeAll(async () => {
  test.setTimeout(300_000);
  /*
   * Patch E2E-Harness-Fix — **el turno lo abre esta suite, no otra.**
   *
   * Cobra en efectivo, y desde D3 eso exige turno abierto. Lo heredaba de
   * `pos-caja.spec.ts` por orden alfabético, que no es una garantía: esa suite
   * termina cerrando y borrando todos los turnos, porque su último test necesita
   * exactamente eso.
   */
  await openHarnessShift();
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

async function snapshot() {
  const balance = await prisma.posInventory.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  return {
    returns: await prisma.posSaleReturn.count(),
    movements: await prisma.posInventoryMovement.count({
      where: { type: "DEVOLUCION_CLIENTE" },
    }),
    payouts: await prisma.posCashMovement.count({
      where: { saleReturnId: { not: null } },
    }),
    quantity: Number(balance.quantity),
  };
}

/** Cobra `qty` unidades con las formas indicadas y devuelve la venta creada. */
async function sell(
  page: Page,
  qty: number,
  payments: Array<{ method: string; amount: string }>,
) {
  test.setTimeout(120_000);
  await page.goto(VENTA);
  await expect(page.getByLabel("Buscar artículo")).toBeFocused({ timeout: 45_000 });
  await page.getByLabel("Buscar artículo").fill(ART.sku);
  await page.getByLabel("Buscar artículo").press("Enter");

  await page.getByTestId("pos-abrir-carrito").click();
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1, { timeout: 30_000 });
  if (qty > 1) {
    await page.getByTestId("pos-cart-line").first().getByLabel("Cantidad").fill(String(qty));
  }
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

/** Abre el detalle de la venta. */
async function openSale(page: Page, saleId: string) {
  await page.goto(`/pos/ventas/${saleId}`);
  await expect(page.getByTestId("pos-devolucion")).toBeVisible({ timeout: 45_000 });
}

/** Rellena y confirma una devolución desde la pantalla. */
async function returnItems(page: Page, quantity: string, reason: string) {
  await page.getByTestId("pos-devolucion-abrir").click();
  await page.getByTestId(`pos-devolucion-cantidad-${ART.sku}`).fill(quantity);
  await page.getByTestId("pos-devolucion-motivo").fill(reason);
  await page.getByTestId("pos-devolucion-confirmar").click();
}

/* ---------------------------------------------------------------------------
 * 1. Devolución completa de una venta en efectivo
 * ------------------------------------------------------------------------ */

test("una venta en efectivo se devuelve entera: repone y paga", async ({ page }) => {
  const sale = await sell(page, 2, [{ method: "EFECTIVO", amount: "200" }]);
  const before = await snapshot();

  await openSale(page, sale.id);
  await returnItems(page, "2", "Artículo defectuoso");
  await expect(page.getByTestId("pos-devolucion-historial")).toBeVisible({
    timeout: 45_000,
  });

  const after = await snapshot();
  expect(after.returns).toBe(before.returns + 1);
  expect(after.movements, "un movimiento de reposición").toBe(before.movements + 1);
  expect(after.payouts, "una salida de efectivo").toBe(before.payouts + 1);
  expect(after.quantity, "las dos unidades volvieron").toBe(before.quantity + 2);

  const doc = await prisma.posSaleReturn.findFirstOrThrow({
    where: { saleId: sale.id },
    include: { items: true, payouts: true, movements: true },
  });
  expect(Number(doc.cashRefunded)).toBe(200);
  expect(doc.reason).toBe("Artículo defectuoso");
  expect(doc.items).toHaveLength(1);
  expect(doc.payouts, "el pago cuelga de la devolución").toHaveLength(1);
  expect(doc.payouts[0]!.type).toBe("SALIDA");
  expect(Number(doc.payouts[0]!.amount)).toBe(200);
  expect(doc.movements[0]!.type).toBe("DEVOLUCION_CLIENTE");

  // **Dos filas distintas**, no una mutada: la salida del cobro y la entrada.
  const all = await prisma.posInventoryMovement.findMany({
    where: { saleId: sale.id },
    select: { type: true, returnId: true },
  });
  expect(all).toHaveLength(2);
  expect(all.filter((m) => m.type === "VENTA" && m.returnId === null)).toHaveLength(1);
  expect(
    all.filter((m) => m.type === "DEVOLUCION_CLIENTE" && m.returnId === doc.id),
  ).toHaveLength(1);
});

/* ---------------------------------------------------------------------------
 * 2 y 4. Devoluciones parciales y su acumulado
 * ------------------------------------------------------------------------ */

test("dos devoluciones parciales acumulan, y la tercera que excede se rechaza", async ({
  page,
}) => {
  const sale = await sell(page, 5, [{ method: "EFECTIVO", amount: "500" }]);

  await openSale(page, sale.id);
  await returnItems(page, "2", "Primera parcial");
  await expect(page.getByTestId("pos-devolucion-historial")).toBeVisible({
    timeout: 45_000,
  });

  await openSale(page, sale.id);
  // El tope ya descuenta lo devuelto: 500 − 200 = 300.
  await expect(page.getByTestId("pos-devolucion-tope")).toContainText("300.00");
  await returnItems(page, "2", "Segunda parcial");
  await expect(page.getByTestId("pos-devolucion-fila")).toHaveCount(2, {
    timeout: 45_000,
  });

  const acumulado = await prisma.posSaleReturn.aggregate({
    where: { saleId: sale.id },
    _sum: { cashRefunded: true },
  });
  expect(Number(acumulado._sum.cashRefunded), "200 + 200").toBe(400);

  // Queda 1 unidad. Pedir 2 excede: se rechaza sin dejar nada.
  await openSale(page, sale.id);
  const before = await snapshot();
  await returnItems(page, "2", "Excede");
  await expect(page.getByTestId("pos-devolucion-error-cajon")).toContainText(
    /quedan 1 por devolver/i,
    { timeout: 45_000 },
  );
  const after = await snapshot();
  expect(after.returns, "no se registró").toBe(before.returns);
  expect(after.quantity, "el saldo no se tocó").toBe(before.quantity);
});

/* ---------------------------------------------------------------------------
 * 3. El tope es el efectivo, no el total
 * ------------------------------------------------------------------------ */

test("una venta mixta se acota al efectivo cobrado, no al total", async ({ page }) => {
  // 5 unidades = C$500, cobradas C$100 efectivo + C$400 tarjeta.
  const sale = await sell(page, 5, [
    { method: "EFECTIVO", amount: "100" },
    { method: "TARJETA", amount: "400" },
  ]);

  await openSale(page, sale.id);
  // El tope que la pantalla anuncia es el efectivo, no los 500.
  await expect(page.getByTestId("pos-devolucion-tope")).toContainText("100.00");

  // Devolver 1 vale C$100 = el tope exacto. Pasa.
  await returnItems(page, "1", "Dentro del tope");
  await expect(page.getByTestId("pos-devolucion-historial")).toBeVisible({
    timeout: 45_000,
  });
  const doc = await prisma.posSaleReturn.findFirstOrThrow({
    where: { saleId: sale.id },
  });
  expect(Number(doc.cashRefunded)).toBe(100);

  // Devolver otra valdría C$100 y el efectivo ya se agotó: rechazo entero.
  await openSale(page, sale.id);
  const before = await snapshot();
  await returnItems(page, "1", "Excede el efectivo");
  await expect(page.getByTestId("pos-devolucion-error-cajon")).toContainText(
    /solo admite 0\.00 de devolución en efectivo/i,
    { timeout: 45_000 },
  );
  const after = await snapshot();
  expect(after.returns).toBe(before.returns);
  expect(after.quantity).toBe(before.quantity);
});

/* ---------------------------------------------------------------------------
 * 5. Venta sin efectivo: fuera de alcance, y lo dice
 * ------------------------------------------------------------------------ */

test("una venta solo con tarjeta explica por qué no se devuelve aquí", async ({
  page,
}) => {
  const sale = await sell(page, 1, [{ method: "TARJETA", amount: "100" }]);
  const before = await snapshot();

  await openSale(page, sale.id);
  // La pantalla no esconde el botón: dice el motivo.
  await expect(page.getByTestId("pos-devolucion-sin-efectivo")).toContainText(
    /sin efectivo/i,
  );
  await expect(page.getByTestId("pos-devolucion-abrir")).toHaveCount(0);

  const after = await snapshot();
  expect(after.returns).toBe(before.returns);
  expect(after.movements).toBe(before.movements);
});

/* ---------------------------------------------------------------------------
 * 6. Sin turno abierto no se paga efectivo
 * ------------------------------------------------------------------------ */

test("sin turno abierto, la devolución en efectivo se rechaza", async ({ page }) => {
  const sale = await sell(page, 1, [{ method: "EFECTIVO", amount: "100" }]);

  /*
   * Patch E2E-Harness-Fix — el cierre temporal del turno era una copia a mano de
   * `withoutShift`. Ahora usa el helper compartido: **la misma prueba**, con una
   * sola implementación que reabre el turno pase lo que pase dentro.
   */
  await withoutShift(async () => {
    await openSale(page, sale.id);
    const before = await snapshot();
    await returnItems(page, "1", "Sin turno");

    await expect(page.getByTestId("pos-devolucion-error-cajon")).toContainText(
      /turno de caja antes de devolver efectivo/i,
      { timeout: 45_000 },
    );
    // Y ofrece el camino, como hace el cobro.
    await expect(page.getByTestId("pos-devolucion-abrir-turno")).toHaveAttribute(
      "href",
      "/pos/caja",
    );

    const after = await snapshot();
    expect(after.returns, "nada persistido").toBe(before.returns);
    expect(after.movements).toBe(before.movements);
    expect(after.payouts).toBe(before.payouts);
    expect(after.quantity).toBe(before.quantity);
  });
});

/* ---------------------------------------------------------------------------
 * 7. La frontera de sucursal
 * ------------------------------------------------------------------------ */

test("una venta de otra sucursal no se devuelve, ni por su URL", async ({ page }) => {
  /*
   * La venta existe y su id es válido. El servidor la busca acotada por la
   * sucursal de la sesión, así que una ajena no se distingue de una inexistente.
   * Sin esa condición en el `WHERE`, esta prueba falla.
   */
  const foreign = await prisma.branch.findFirstOrThrow({
    where: { code: { not: MAPPED_BRANCH_CODE } },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  const alien = await prisma.posSale.create({
    data: {
      saleNumber: `${TAG}-DEV-AJENA`,
      branchId: foreign.id,
      cashierId: user.id,
      status: "COMPLETADA",
      subtotal: 100,
      total: 100,
      completedAt: new Date(),
      items: {
        create: [
          {
            productId,
            productName: ART.name,
            productSku: ART.sku,
            quantity: 1,
            unitPrice: 100,
            total: 100,
            position: 0,
          },
        ],
      },
      payments: { create: [{ method: "EFECTIVO", amount: 100 }] },
    },
  });

  try {
    // Ni siquiera se puede abrir el detalle: la página ya acota por sucursal.
    const response = await page.goto(`/pos/ventas/${alien.id}`);
    expect(response?.status()).toBe(404);
    expect(
      await prisma.posSaleReturn.count({ where: { saleId: alien.id } }),
      "ninguna devolución contra la venta ajena",
    ).toBe(0);
  } finally {
    await prisma.posPayment.deleteMany({ where: { saleId: alien.id } });
    await prisma.posSaleItem.deleteMany({ where: { saleId: alien.id } });
    await prisma.posSale.delete({ where: { id: alien.id } });
  }
});

/* ---------------------------------------------------------------------------
 * 10. El estado se ve al recargar, derivado
 * ------------------------------------------------------------------------ */

test("el estado de devolución sobrevive a la recarga y se deriva", async ({
  page,
}) => {
  const sale = await sell(page, 2, [{ method: "EFECTIVO", amount: "200" }]);
  await openSale(page, sale.id);
  await returnItems(page, "1", "Parcial visible");
  await expect(page.getByTestId("pos-devolucion-historial")).toBeVisible({
    timeout: 45_000,
  });

  // Recarga: el estado viene del servidor, no de memoria del navegador.
  await openSale(page, sale.id);
  await expect(page.getByTestId("pos-devolucion")).toContainText("Devuelta en parte");
  await expect(page.getByTestId("pos-devolucion-tope")).toContainText("100.00");

  // Y la venta original **no se mutó**: sigue diciendo lo que se cobró.
  const original = await prisma.posSale.findUniqueOrThrow({ where: { id: sale.id } });
  expect(original.status, "la venta sigue completada").toBe("COMPLETADA");
  expect(Number(original.total), "su total no cambió").toBe(200);
});
