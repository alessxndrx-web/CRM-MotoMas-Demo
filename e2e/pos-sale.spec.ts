import { expect, test, type Page } from "@playwright/test";

import { TAG, prisma } from "./fixtures";

/**
 * SUITE-POS1.0-D — el cobro: del carrito a una venta persistida.
 *
 * A diferencia de POS1.0-C, aquí **sí** se verifica contra la base de datos: el
 * cobro es la frontera donde el carrito deja de ser la fuente de verdad.
 *
 * Lo que más importa comprobar no es que se guarde, sino **qué** se guarda: que
 * los totales almacenados sean los que el servidor deriva de las líneas, no los
 * que el navegador mostró. La entrada de la acción ni siquiera tiene campo de
 * total, así que la manipulación no se valida: no existe.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/panel/pos/venta";

const CASCO = { sku: `${TAG}-SALE-CASCO`, name: "Casco de venta", price: 1000 };
const ACEITE = { sku: `${TAG}-SALE-ACEITE`, name: "Aceite de venta", price: 250 };

test.beforeAll(async () => {
  // Patch POS1.1-E. El cobro descuenta existencias, así que cada artículo de la
  // suite necesita saldo abierto y cargado en la bodega del fixture. Sin saldo
  // el cobro se rechaza, que es el comportamiento correcto y no lo que estas
  // pruebas quieren medir.
  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
  });
  const cashier = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });

  for (const item of [CASCO, ACEITE]) {
    const product = await prisma.posProduct.upsert({
      where: { sku: item.sku },
      update: { name: item.name, unitPrice: item.price, isActive: true },
      create: { sku: item.sku, name: item.name, unitPrice: item.price },
    });
    const balance = await prisma.posInventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: warehouse.id,
          productId: product.id,
        },
      },
      update: {},
      create: { warehouseId: warehouse.id, productId: product.id },
    });
    // Carga holgada: las pruebas venden unidades sueltas y no miden existencias.
    const target = 10_000;
    const delta = target - balance.quantity.toNumber();
    if (delta !== 0) {
      await prisma.posInventoryMovement.create({
        data: {
          warehouseId: warehouse.id,
          productId: product.id,
          type: "AJUSTE",
          quantity: delta,
          quantityBefore: balance.quantity,
          quantityAfter: target,
          reason: "Carga de existencias para la suite de venta",
          createdByUserId: cashier.id,
        },
      });
      await prisma.posInventory.update({
        where: { id: balance.id },
        data: { quantity: target },
      });
    }
  }
});

async function openCheckout(page: Page) {
  await page.goto(VENTA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Punto de venta" }),
  ).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle");
  // Patch POS1.1-E. El administrador es global, así que elige sucursal — y la
  // bodega del fixture vive en `granada`. El servidor rechaza consumir de una
  // bodega de otra sucursal, así que la prueba dice explícitamente cuál usa en
  // vez de depender de cuál venga primero en la lista.
  const branchSelector = page.getByTestId("pos-branch").getByRole("combobox");
  if (await branchSelector.isVisible()) {
    await branchSelector.selectOption({ value: "granada" });
  }
}

async function addProduct(page: Page, sku: string) {
  await page.getByLabel("Buscar artículo").fill(sku);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const row = page.getByTestId("pos-result-row").filter({ hasText: sku });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Agregar" }).click();
}

function cartLine(page: Page, sku: string) {
  return page.getByTestId("pos-cart-line").filter({ hasText: sku });
}

async function addPayment(page: Page, method: string, amount: string, index = 0) {
  await page.getByRole("button", { name: "Agregar pago" }).click();
  const payments = page.getByTestId("pos-payments");
  await payments.getByLabel(`Forma ${index + 1}`).selectOption({ value: method });
  await payments.getByLabel(`Monto ${index + 1}`).fill(amount);
}

/** Cobra y devuelve el número de venta que la pantalla confirma. */
async function checkout(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  const notice = page.getByTestId("pos-sale-created");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  const text = await notice.innerText();
  const match = /POS-\d{8}-[A-Z0-9]{8}/.exec(text);
  expect(match).not.toBeNull();
  return match![0];
}

async function storedSale(saleNumber: string) {
  return prisma.posSale.findUniqueOrThrow({
    where: { saleNumber },
    include: { items: { orderBy: { position: "asc" } }, payments: true },
  });
}

test("cobra una venta en efectivo", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addPayment(page, "EFECTIVO", "1000");

  const saleNumber = await checkout(page);
  const sale = await storedSale(saleNumber);

  expect(sale.status).toBe("COMPLETADA");
  expect(sale.completedAt).not.toBeNull();
  expect(Number(sale.subtotal)).toBe(1000);
  expect(Number(sale.total)).toBe(1000);
  expect(sale.items).toHaveLength(1);
  expect(sale.payments).toHaveLength(1);
  expect(sale.payments[0]!.method).toBe("EFECTIVO");
  expect(Number(sale.payments[0]!.amount)).toBe(1000);
});

test("el número de venta lo genera el servidor", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);
  const saleNumber = await checkout(page);

  // Formato del servidor, independiente de la numeración contable.
  expect(saleNumber).toMatch(/^POS-\d{8}-[A-Z0-9]{8}$/);
  expect((await storedSale(saleNumber)).saleNumber).toBe(saleNumber);
});

test("cobra con pago mixto", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addPayment(page, "EFECTIVO", "600", 0);
  await addPayment(page, "TARJETA", "400", 1);

  const saleNumber = await checkout(page);
  const sale = await storedSale(saleNumber);

  expect(sale.payments).toHaveLength(2);
  const methods = sale.payments.map((payment) => payment.method).sort();
  expect(methods).toEqual(["EFECTIVO", "TARJETA"]);
  expect(
    sale.payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
  ).toBe(1000);
});

test("los totales guardados son los que el servidor deriva de las líneas", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addProduct(page, ACEITE.sku);
  await cartLine(page, CASCO.sku).getByLabel("Cantidad").fill("2");
  await cartLine(page, CASCO.sku).getByLabel("Descuento").fill("200");
  await cartLine(page, CASCO.sku).getByLabel("Impuesto").fill("270");
  await cartLine(page, ACEITE.sku).getByLabel("Impuesto").fill("37.5");

  // 2000 + 250 = 2250 · descuento 200 · impuesto 307.5 · total 2357.5
  await expect(page.getByTestId("pos-total-total")).toContainText("2,357.50");

  const saleNumber = await checkout(page);
  const sale = await storedSale(saleNumber);

  expect(Number(sale.subtotal)).toBe(2250);
  expect(Number(sale.discount)).toBe(200);
  expect(Number(sale.tax)).toBe(307.5);
  expect(Number(sale.total)).toBe(2357.5);
});

test("descuentos e impuestos de línea se guardan por línea", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await cartLine(page, CASCO.sku).getByLabel("Descuento").fill("150");
  await cartLine(page, CASCO.sku).getByLabel("Impuesto").fill("120");

  const saleNumber = await checkout(page);
  const sale = await storedSale(saleNumber);

  expect(sale.items).toHaveLength(1);
  const item = sale.items[0]!;
  expect(Number(item.discount)).toBe(150);
  expect(Number(item.tax)).toBe(120);
  // 1000 - 150 + 120
  expect(Number(item.total)).toBe(970);
});

test("el precio sobrescrito en el carrito es el que se guarda", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await cartLine(page, CASCO.sku).getByLabel("Precio").fill("850");

  const saleNumber = await checkout(page);
  const sale = await storedSale(saleNumber);
  expect(Number(sale.items[0]!.unitPrice)).toBe(850);
  expect(Number(sale.total)).toBe(850);
});

test("el cliente es opcional: sin cliente también se cobra", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);
  const saleNumber = await checkout(page);
  expect((await storedSale(saleNumber)).customerId).toBeNull();
});

test("con cliente, la venta lo guarda", async ({ page }) => {
  const customer = await prisma.customer.findFirstOrThrow({
    where: { name: { startsWith: TAG } },
    select: { id: true, name: true },
  });

  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await page.getByLabel("Cliente").fill(customer.name);
  await page.getByRole("button", { name: "Buscar cliente" }).click();
  const option = page
    .getByTestId("pos-customer-results")
    .getByRole("button", { name: new RegExp(customer.name) });
  await expect(option).toBeVisible({ timeout: 20_000 });
  await option.click();
  await expect(page.getByTestId("pos-customer-selected")).toContainText(
    customer.name,
  );

  const saleNumber = await checkout(page);
  expect((await storedSale(saleNumber)).customerId).toBe(customer.id);
});

test("las notas son opcionales y se guardan", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);
  await page.getByLabel("Notas").fill("Venta de mostrador");

  const saleNumber = await checkout(page);
  expect((await storedSale(saleNumber)).notes).toBe("Venta de mostrador");
});

test("el carrito se vacía tras cobrar", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addPayment(page, "EFECTIVO", "1000");
  await checkout(page);

  // Deja de ser la fuente de verdad en cuanto la venta existe.
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
  await expect(page.getByTestId("pos-total-total")).toContainText("0.00");
  await expect(page.getByText("Carrito vacío")).toBeVisible();
});

test("un segundo cobro seguido no duplica la venta", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  const saleNumber = await checkout(page);

  const before = await prisma.posSale.count();
  // El carrito quedó vacío, así que el botón está deshabilitado: no hay forma
  // de reenviar el mismo cobro.
  await expect(
    page.getByRole("button", { name: "Cobrar y registrar venta" }),
  ).toBeDisabled();
  expect(await prisma.posSale.count()).toBe(before);
  expect(await prisma.posSale.count({ where: { saleNumber } })).toBe(1);
});

test("sin artículos no se puede cobrar", async ({ page }) => {
  await openCheckout(page);
  await expect(
    page.getByRole("button", { name: "Cobrar y registrar venta" }),
  ).toBeDisabled();
});

test("un producto desactivado a media venta impide el cobro y no deja nada", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);

  // El artículo se retira del catálogo mientras el carrito ya lo contiene.
  await prisma.posProduct.update({
    where: { sku: ACEITE.sku },
    data: { isActive: false },
  });

  const before = await prisma.posSale.count();
  try {
    await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
    await expect(page.getByTestId("pos-error")).toContainText(/inactivo/i, {
      timeout: 30_000,
    });
    // Todo el cobro es una transacción: no queda venta a medias.
    expect(await prisma.posSale.count()).toBe(before);
  } finally {
    await prisma.posProduct.update({
      where: { sku: ACEITE.sku },
      data: { isActive: true },
    });
  }
});

test("la venta creada aparece tras recargar, por la capa de consultas", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  const saleNumber = await checkout(page);

  await page.reload();
  await page.waitForLoadState("networkidle");
  const row = page.getByTestId("pos-sale-row").filter({ hasText: saleNumber });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("Completada");
});

test("un monto de pago inválido se rechaza, no se descarta", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addPayment(page, "EFECTIVO", "abc");

  const before = await prisma.posSale.count();
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  await expect(page.getByTestId("pos-error")).toContainText(/no son válidos/i, {
    timeout: 30_000,
  });
  expect(await prisma.posSale.count()).toBe(before);
});

test("una fila de pago vacía no impide cobrar", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);
  // Agregada y no rellenada: no es un pago, es una fila de más.
  await page.getByRole("button", { name: "Agregar pago" }).click();

  const saleNumber = await checkout(page);
  expect((await storedSale(saleNumber)).payments).toHaveLength(0);
});

test("cobrar descuenta existencias de la bodega", async ({ page }) => {
  // Patch POS1.1-E, verificado por navegador: el cobro pasa por la acción real,
  // que consume dentro de la misma transacción que persiste la venta.
  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
  });
  const product = await prisma.posProduct.findFirstOrThrow({
    where: { sku: CASCO.sku },
  });
  const beforeBalance = (
    await prisma.posInventory.findUniqueOrThrow({
      where: {
        warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
      },
    })
  ).quantity.toNumber();

  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await cartLine(page, CASCO.sku).getByLabel("Cantidad").fill("4");
  const saleNumber = await checkout(page);

  const afterBalance = (
    await prisma.posInventory.findUniqueOrThrow({
      where: {
        warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
      },
    })
  ).quantity.toNumber();
  expect(afterBalance).toBe(beforeBalance - 4);

  const movement = await prisma.posInventoryMovement.findFirstOrThrow({
    where: { reason: `Venta ${saleNumber}` },
  });
  expect(movement.type).toBe("VENTA");
  expect(movement.quantity.toNumber()).toBe(-4);
  expect(movement.quantityBefore.toNumber()).toBe(beforeBalance);
  expect(movement.quantityAfter.toNumber()).toBe(afterBalance);
});

test("el saldo se muestra mientras se cobra", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await expect(page.getByTestId("pos-balance")).toContainText("1,000.00");

  await addPayment(page, "EFECTIVO", "400");
  await expect(page.getByTestId("pos-balance")).toContainText("600.00");
});

test("cobrar no crea asientos, contabilizaciones ni documentos de caja", async ({
  page,
}) => {
  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    inventory: await prisma.inventoryMovement.count(),
    posMovements: await prisma.posInventoryMovement.count(),
  };

  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addPayment(page, "EFECTIVO", "1000");
  await checkout(page);

  // El contrato de POS1.0-A, comprobado en el camino que sí escribe.
  expect(await prisma.journalEntry.count()).toBe(before.entries);
  expect(await prisma.postingRecord.count()).toBe(before.postings);
  expect(await prisma.cashDocument.count()).toBe(before.cash);
  // El inventario **serializado** sigue intacto: es de motocicletas.
  expect(await prisma.inventoryMovement.count()).toBe(before.inventory);
  // Patch POS1.1-E. Lo que **sí** cambió: la venta consume existencias del
  // mostrador. Antes esta línea habría afirmado que no se movía nada.
  expect(await prisma.posInventoryMovement.count()).toBe(before.posMovements + 1);
});

test("un rol global elige la sucursal y ahí queda la venta", async ({ page }) => {
  await openCheckout(page);
  const selector = page.getByTestId("pos-branch").getByRole("combobox");
  await expect(selector).toBeVisible();
  await selector.selectOption({ value: "granada" });

  await addProduct(page, CASCO.sku);
  const saleNumber = await checkout(page);

  const sale = await prisma.posSale.findUniqueOrThrow({
    where: { saleNumber },
    include: { branch: { select: { code: true } } },
  });
  expect(sale.branch.code).toBe("granada");
});

test("el cobro se puede activar con el teclado", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  const button = page.getByRole("button", { name: "Cobrar y registrar venta" });
  await button.focus();
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("pos-sale-created")).toBeVisible({
    timeout: 30_000,
  });
});

test("el cobro es usable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  // Con una fila de pago: es la parte más ancha de la pantalla, y con anchos
  // fijos no cabía.
  await addPayment(page, "EFECTIVO", "1000");

  await expect(page.getByTestId("pos-checkout")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
