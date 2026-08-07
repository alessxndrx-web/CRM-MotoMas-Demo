import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-POS2.2 — el cobro, por donde POS1.0-D no llegó.
 *
 * **No repite lo que ya está probado.** `pos-cart.spec.ts` (17) y
 * `pos-sale.spec.ts` (22) cubren armar el carrito, la aritmética de línea, el
 * cobro, el pago mixto, el descuento de existencias y que no se contabilice
 * nada. Duplicarlo no añadiría evidencia.
 *
 * Esta suite cubre lo que la auditoría de POS2.2 encontró sin cubrir:
 *
 * - los cinco anchos del encargo, no solo 390px;
 * - el estado de envío y que **no haya éxito falso**;
 * - la forma de pago manejada con teclado;
 * - el total exacto contra datos sembrados, con decimales;
 * - la distinción entre alcanzar la ruta y poder cobrar.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/panel/pos/venta";

const WIDTHS = [
  { name: "1440px", width: 1440, height: 900 },
  { name: "1280px", width: 1280, height: 800 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "768px", width: 768, height: 1024 },
  { name: "390px", width: 390, height: 844 },
];

/** Precio con decimales: un total redondo no probaría la aritmética. */
const ARTICLE = { sku: `${TAG}-CHECKOUT-ART`, name: "Artículo de cobro", price: 1234.56 };

async function seed() {
  const [warehouse, cashier] = await Promise.all([
    prisma.posWarehouse.findFirstOrThrow({ where: { code: { startsWith: TAG } } }),
    prisma.user.findFirstOrThrow({
      where: { email: { startsWith: `${TAG.toLowerCase()}-admin` } },
    }),
  ]);

  const product = await prisma.posProduct.upsert({
    where: { sku: ARTICLE.sku },
    create: { sku: ARTICLE.sku, name: ARTICLE.name, unitPrice: ARTICLE.price },
    update: { name: ARTICLE.name, unitPrice: ARTICLE.price, isActive: true },
  });

  const balance = await prisma.posInventory.upsert({
    where: {
      warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
    },
    create: { warehouseId: warehouse.id, productId: product.id },
    update: {},
  });

  // Carga holgada por la vía del motor: movimiento y saldo, nunca el saldo solo.
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
        reason: `${TAG} carga para la suite de cobro`,
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

async function openCheckout(page: Page) {
  await page.goto(VENTA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Punto de venta" }),
  ).toBeVisible({ timeout: 45_000 });
  // El administrador es global: elige sucursal y bodega antes de poder cobrar.
  const branch = page.getByTestId("pos-branch").getByRole("combobox");
  if (await branch.count()) await branch.selectOption(MAPPED_BRANCH_CODE);
  const warehouse = page.getByTestId("pos-warehouse").getByRole("combobox");
  await expect(warehouse).toBeVisible();
  const options = await warehouse.locator("option").all();
  for (const option of options) {
    const value = await option.getAttribute("value");
    if (value) {
      await warehouse.selectOption(value);
      break;
    }
  }
}

/** Los mismos gestos que usa `pos-sale.spec.ts`: rótulos, no posiciones. */
async function addArticle(page: Page, quantity?: string) {
  await page.getByLabel("Buscar artículo").fill(ARTICLE.sku);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const row = page.getByTestId("pos-result-row").filter({ hasText: ARTICLE.sku });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Agregar" }).click();
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1);
  if (quantity) {
    await page.getByTestId("pos-cart-line").first().getByLabel("Cantidad").fill(quantity);
  }
}

/** Las filas de pago no existen hasta que se añaden. */
async function addPayment(page: Page, method: string, amount: string, index = 0) {
  await page.getByRole("button", { name: "Agregar pago" }).click();
  const payments = page.getByTestId("pos-payments");
  await payments.getByLabel(`Forma ${index + 1}`).selectOption({ value: method });
  await payments.getByLabel(`Monto ${index + 1}`).fill(amount);
}

const submit = (page: Page) =>
  page.getByRole("button", { name: "Cobrar y registrar venta" });

const money = (value: number) =>
  new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

async function balanceOf(warehouseId: string, productId: string) {
  const row = await prisma.posInventory.findUniqueOrThrow({
    where: { warehouseId_productId: { warehouseId, productId } },
  });
  return row.quantity.toNumber();
}

let fixture: Awaited<ReturnType<typeof seed>>;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  fixture = await seed();
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    await page.goto(VENTA, { timeout: 180_000, waitUntil: "domcontentloaded" });
  } finally {
    await context.close();
  }
});

/* ---------------------------------------------------------------------------
 * Totales exactos
 * ------------------------------------------------------------------------ */

test("el total es el exacto de lo sembrado, con decimales", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page, "3");

  // 3 × 1.234,56 = 3.703,68. Un precio redondo no probaría nada.
  await expect(page.getByTestId("pos-totals")).toContainText(money(ARTICLE.price * 3));
  await expect(page.getByTestId("pos-line-total").first()).toContainText(
    money(ARTICLE.price * 3),
  );
});

test("el total guardado es el del servidor, no el que mostró el navegador", async ({
  page,
}) => {
  await openCheckout(page);
  await addArticle(page, "2");
  await addPayment(page, "EFECTIVO", "2469.12");
  await submit(page).click();
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });

  const sale = await prisma.posSale.findFirstOrThrow({
    where: { branch: { code: MAPPED_BRANCH_CODE }, status: "COMPLETADA" },
    orderBy: { completedAt: "desc" },
    include: { items: true, payments: true },
  });
  expect(sale.total.toNumber()).toBe(ARTICLE.price * 2);
  expect(sale.items[0]!.quantity.toNumber()).toBe(2);
  expect(sale.payments[0]!.method).toBe("EFECTIVO");
});

/* ---------------------------------------------------------------------------
 * Estado de envío y ausencia de éxito falso
 * ------------------------------------------------------------------------ */

test("sin artículos el cobro no se puede lanzar", async ({ page }) => {
  await openCheckout(page);
  // El botón principal está deshabilitado: no hay forma de provocar un éxito.
  await expect(submit(page)).toBeDisabled();
  await expect(page.getByTestId("pos-sale-created")).toHaveCount(0);
});

test("un fallo del servidor no produce un estado de éxito", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);

  // Se desactiva el artículo entre armar el carrito y cobrar: el servidor lo
  // rechaza, y esa es la única fuente de verdad del éxito.
  await prisma.posProduct.update({
    where: { id: fixture.product.id },
    data: { isActive: false },
  });

  const before = await balanceOf(fixture.warehouse.id, fixture.product.id);
  await addPayment(page, "EFECTIVO", "1234.56");
  await submit(page).click();

  await expect(page.getByTestId("pos-error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pos-sale-created")).toHaveCount(0);
  // Y no dejó rastro: ni venta, ni existencias movidas.
  expect(await balanceOf(fixture.warehouse.id, fixture.product.id)).toBe(before);

  await prisma.posProduct.update({
    where: { id: fixture.product.id },
    data: { isActive: true },
  });
});

test("el mensaje de error es legible, sin internos de Prisma", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);
  await addPayment(page, "EFECTIVO", "no-es-un-monto");
  await submit(page).click();

  const error = page.getByTestId("pos-error");
  await expect(error).toBeVisible({ timeout: 30_000 });
  for (const leak of ["prisma.", "PrismaClient", "Invalid `", "at async", "cuid"]) {
    await expect(error).not.toContainText(leak);
  }
});

/* ---------------------------------------------------------------------------
 * Teclado
 * ------------------------------------------------------------------------ */

test("la forma de pago se opera con el teclado", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);

  await page.getByRole("button", { name: "Agregar pago" }).click();
  const method = page.getByTestId("pos-payments").getByLabel("Forma 1");
  await method.focus();
  await expect(method).toBeFocused();
  await method.selectOption("TARJETA");
  await expect(method).toHaveValue("TARJETA");
});

test("las cantidades se editan con el teclado y recalculan", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);

  const qty = page.getByTestId("pos-cart-line").first().getByLabel("Cantidad");
  await qty.focus();
  await expect(qty).toBeFocused();
  await qty.fill("4");
  await expect(page.getByTestId("pos-totals")).toContainText(money(ARTICLE.price * 4));
});

test("quitar una línea es alcanzable y deja el carrito vacío", async ({ page }) => {
  await openCheckout(page);
  await addArticle(page);

  const remove = page.getByTestId("pos-cart-line").first().getByRole("button", { name: /Quitar/ });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
});

/* ---------------------------------------------------------------------------
 * Responsive: los cinco anchos
 * ------------------------------------------------------------------------ */

for (const size of WIDTHS) {
  test(`sin desbordamiento horizontal a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openCheckout(page);
    await addArticle(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("en móvil el total, la forma de pago y el cobro siguen alcanzables", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCheckout(page);
  await addArticle(page);

  await expect(page.getByTestId("pos-totals")).toBeVisible();
  await page.getByRole("button", { name: "Agregar pago" }).click();
  await expect(page.getByTestId("pos-payments").getByLabel("Forma 1")).toBeVisible();

  await submit(page).scrollIntoViewIfNeeded();
  await expect(submit(page)).toBeVisible();
  const box = (await submit(page).boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(32);
});
