import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-POS2.5 — asignación de pagos en el mostrador.
 *
 * ## Qué prueba, y qué **no**
 *
 * La auditoría de POS2.5 encontró que el pago mixto ya funcionaba de punta a
 * punta: `PosPayment` es uno-a-muchos, el enum trae cuatro métodos, y
 * `pos-sale.spec.ts` ya persistía dos filas. Repetir eso no añadiría evidencia.
 *
 * Esta suite cubre lo que faltaba: **que la asignación se lea correctamente** —
 * total, pagado, saldo y estado— y que lo que el servidor guarda coincida
 * exactamente con lo tecleado, con tres métodos y decimales que no cuadran
 * redondos.
 *
 * **No afirma que el servidor exija cobertura.** No la exige, y esa es P-1: una
 * decisión de negocio que el repositorio no ha tomado. La suite fija la conducta
 * real, no la que sería cómoda.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/pos/venta";

/** 3 × 1.234,56 = 3.703,68. Ni el precio ni el total son redondos a propósito. */
const ART = { sku: `${TAG}-PAGOS`, name: "Articulo de pagos", price: 1234.56 };
const QTY = 3;
const TOTAL = 3703.68;

async function seed() {
  const [warehouse, cashier] = await Promise.all([
    prisma.posWarehouse.findFirstOrThrow({ where: { code: { startsWith: TAG } } }),
    prisma.user.findFirstOrThrow({
      where: { email: { startsWith: `${TAG.toLowerCase()}-admin` } },
    }),
  ]);
  const product = await prisma.posProduct.upsert({
    where: { sku: ART.sku },
    create: { sku: ART.sku, name: ART.name, unitPrice: ART.price },
    update: { name: ART.name, unitPrice: ART.price, isActive: true },
  });
  const balance = await prisma.posInventory.upsert({
    where: {
      warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
    },
    create: { warehouseId: warehouse.id, productId: product.id },
    update: {},
  });
  const target = 500;
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
        reason: `${TAG} carga para la suite de pagos`,
        createdByUserId: cashier.id,
      },
    });
    await prisma.posInventory.update({
      where: { id: balance.id },
      data: { quantity: target },
    });
  }
  return { warehouse, product };
}

let fx: Awaited<ReturnType<typeof seed>>;

const money = (value: number) =>
  new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

async function openCheckout(page: Page) {
  await page.goto(VENTA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Punto de venta" }),
  ).toBeVisible({ timeout: 45_000 });
  const warehouse = page.getByTestId("pos-warehouse").getByRole("combobox");
  await expect(warehouse).toBeVisible();
  for (const option of await warehouse.locator("option").all()) {
    const value = await option.getAttribute("value");
    if (value) {
      await warehouse.selectOption(value);
      break;
    }
  }
}

async function addArticle(page: Page) {
  // Patch POS4.0 — SKU exacto: entra solo, sin lista intermedia ni ratón.
  await page.getByLabel("Buscar artículo").fill(ART.sku);
  await page.getByLabel("Buscar artículo").press("Enter");
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("pos-cart-line").first().getByLabel("Cantidad").fill(String(QTY));
  await expect(page.getByTestId("pos-totals")).toContainText(money(TOTAL));
}

async function addPayment(page: Page, method: string, amount: string, index: number) {
  await page.getByRole("button", { name: "Agregar pago" }).click();
  const payments = page.getByTestId("pos-payments");
  await payments.getByLabel(`Forma ${index + 1}`).selectOption({ value: method });
  await payments.getByLabel(`Monto ${index + 1}`).fill(amount);
}

const submit = (page: Page) =>
  page.getByRole("button", { name: "Cobrar y registrar venta" });

const state = (page: Page) => page.getByTestId("pos-estado-pago");

async function lastSale() {
  return prisma.posSale.findFirstOrThrow({
    where: { branch: { code: MAPPED_BRANCH_CODE }, status: "COMPLETADA" },
    orderBy: { completedAt: "desc" },
    include: { items: true, payments: true },
  });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  fx = await seed();
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/pos.json",
  });
  const page = await context.newPage();
  try {
    await page.goto(VENTA, { timeout: 180_000, waitUntil: "domcontentloaded" });
  } finally {
    await context.close();
  }
});

/* ---------------------------------------------------------------------------
 * El estado de la asignación
 * ------------------------------------------------------------------------ */

test("sin pagos, el estado lo dice con palabras", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  // **No depende del color**: el estado se lee.
  await expect(state(page)).toHaveText("Sin pagos registrados.");
});

test("un cobro corto enuncia cuánto falta", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "1000", 0);

  await expect(state(page)).toHaveText(`Faltan ${money(TOTAL - 1000)} por cobrar.`);
  await expect(page.getByTestId("pos-balance")).toContainText(money(TOTAL - 1000));
});

test("tres métodos que cuadran dan «cobro exacto»", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "1000", 0);
  await addPayment(page, "TARJETA", "2000", 1);
  await addPayment(page, "TRANSFERENCIA", "703.68", 2);

  await expect(state(page)).toHaveText("Cobro exacto.");
  await expect(page.getByTestId("pos-balance")).toContainText(money(0));
});

test("cobrar de más lo dice, y no lo llama vuelto", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "4000", 0);

  // **No se inventa el vuelto**: el repositorio no lo modela (P-1).
  await expect(state(page)).toHaveText(
    `El cobro supera el total en ${money(4000 - TOTAL)}.`,
  );
  await expect(state(page)).not.toContainText("vuelto");
});

test("editar una fila recalcula el estado", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "1000", 0);
  await expect(state(page)).toContainText("Faltan");

  await page.getByTestId("pos-payments").getByLabel("Monto 1").fill("3703.68");
  await expect(state(page)).toHaveText("Cobro exacto.");
});

test("quitar una fila recalcula el estado", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "3703.68", 0);
  await addPayment(page, "TARJETA", "500", 1);
  await expect(state(page)).toContainText("supera el total");

  await page
    .getByTestId("pos-payments")
    .getByRole("button", { name: /Quitar/ })
    .last()
    .click();
  await expect(state(page)).toHaveText("Cobro exacto.");
});

/* ---------------------------------------------------------------------------
 * Lo que el servidor persiste
 * ------------------------------------------------------------------------ */

test("tres métodos se guardan con sus importes exactos", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "1000", 0);
  await addPayment(page, "TARJETA", "2000", 1);
  await addPayment(page, "TRANSFERENCIA", "703.68", 2);
  await submit(page).click();
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });

  const sale = await lastSale();
  // El total lo deriva el servidor de las líneas, no del navegador.
  expect(sale.total.toNumber()).toBe(TOTAL);
  expect(sale.items[0]!.quantity.toNumber()).toBe(QTY);

  expect(sale.payments).toHaveLength(3);
  const byMethod = Object.fromEntries(
    sale.payments.map((payment) => [payment.method, payment.amount.toNumber()]),
  );
  expect(byMethod).toEqual({ EFECTIVO: 1000, TARJETA: 2000, TRANSFERENCIA: 703.68 });
  // Y la suma de lo guardado es exactamente el total.
  const paid = sale.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
  expect(Math.round(paid * 100)).toBe(Math.round(TOTAL * 100));
});

test("dos filas del mismo método se guardan como dos filas", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "1500", 0);
  await addPayment(page, "EFECTIVO", "2203.68", 1);
  await submit(page).click();
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });

  // **El contrato real del repositorio**: no se agrupan ni se rechazan.
  const sale = await lastSale();
  expect(sale.payments).toHaveLength(2);
  expect(sale.payments.every((payment) => payment.method === "EFECTIVO")).toBe(true);
});

test("un importe cero o negativo se rechaza y no deja venta", async ({ page }) => {
  const before = await prisma.posSale.count({ where: { status: "COMPLETADA" } });

  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "-100", 0);
  await submit(page).click();

  await expect(page.getByTestId("pos-error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pos-sale-created")).toHaveCount(0);
  expect(await prisma.posSale.count({ where: { status: "COMPLETADA" } })).toBe(before);
});

test("P-1 sigue abierta: el servidor acepta una venta con cobro corto", async ({
  page,
}) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "1000", 0);
  // La pantalla avisa de que falta…
  await expect(state(page)).toContainText("Faltan");
  // …y aun así deja cobrar, porque **el repositorio no ha decidido** si una
  // venta puede cerrarse corta. Fijar aquí lo contrario sería inventar política.
  await expect(submit(page)).toBeEnabled();

  await submit(page).click();
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });

  const sale = await lastSale();
  expect(sale.total.toNumber()).toBe(TOTAL);
  expect(sale.payments).toHaveLength(1);
  expect(sale.payments[0]!.amount.toNumber()).toBe(1000);
});

test("el fallo del servidor no deja pagos huérfanos ni movimiento", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "1000", 0);
  await addPayment(page, "TARJETA", "2703.68", 1);

  await prisma.posProduct.update({
    where: { id: fx.product.id },
    data: { isActive: false },
  });
  const payments = await prisma.posPayment.count();
  const movements = await prisma.posInventoryMovement.count();

  await submit(page).click();
  await expect(page.getByTestId("pos-error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pos-sale-created")).toHaveCount(0);

  // Ni un pago, ni un movimiento: la transacción se deshizo entera.
  expect(await prisma.posPayment.count()).toBe(payments);
  expect(await prisma.posInventoryMovement.count()).toBe(movements);

  await prisma.posProduct.update({
    where: { id: fx.product.id },
    data: { isActive: true },
  });
});

/* ---------------------------------------------------------------------------
 * Accesibilidad y teclado
 * ------------------------------------------------------------------------ */

test("las filas de pago se operan con teclado y tienen nombre accesible", async ({
  page,
}) => {
  await openCheckout(page);
  await addArticle(page);
  await page.getByRole("button", { name: "Agregar pago" }).click();

  const method = page.getByTestId("pos-payments").getByLabel("Forma 1");
  await method.focus();
  await expect(method).toBeFocused();
  await method.selectOption("TARJETA");

  const amount = page.getByTestId("pos-payments").getByLabel("Monto 1");
  await amount.focus();
  await expect(amount).toBeFocused();
  await amount.fill("3703.68");
  await expect(state(page)).toHaveText("Cobro exacto.");
});

test("el estado se anuncia como región de estado", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await expect(page.getByTestId("pos-paid")).toHaveAttribute("role", "status");
});

/* ---------------------------------------------------------------------------
 * Responsive
 * ------------------------------------------------------------------------ */

for (const size of [
  { name: "1440px", width: 1440, height: 900 },
  { name: "1280px", width: 1280, height: 800 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "768px", width: 768, height: 1024 },
  { name: "390px", width: 390, height: 844 },
]) {
  test(`la asignación de pagos cabe a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openCheckout(page);
    await addArticle(page);
    await addPayment(page, "EFECTIVO", "1000", 0);
    await addPayment(page, "TARJETA", "2703.68", 1);

    await expect(state(page)).toHaveText("Cobro exacto.");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
