import { expect, test, type Page } from "@playwright/test";

import { TAG, prisma } from "./fixtures";

/**
 * SUITE-POS1.0-C — carrito del punto de venta.
 *
 * Es la primera suite del repositorio que **no verifica contra la base de
 * datos**, y a propósito: el carrito vive en el navegador y nada se guarda. Lo
 * que sí se comprueba, y es lo que importa, es que los totales en pantalla
 * coincidan con `calculatePosSaleTotals` — la misma función del servidor — y que
 * recargar vacíe el carrito, que es el contrato declarado.
 *
 * Corre con la sesión de administrador: el POS reutiliza `canOperateCaja`.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/panel/pos/venta";

/** Artículos propios de esta suite, creados una vez. */
const CASCO = { sku: `${TAG}-CART-CASCO`, name: "Casco de carrito", price: 1000 };
const ACEITE = { sku: `${TAG}-CART-ACEITE`, name: "Aceite de carrito", price: 250 };

test.beforeAll(async () => {
  for (const item of [CASCO, ACEITE]) {
    await prisma.posProduct.upsert({
      where: { sku: item.sku },
      update: { name: item.name, unitPrice: item.price, isActive: true },
      create: { sku: item.sku, name: item.name, unitPrice: item.price },
    });
  }
});

async function openCheckout(page: Page) {
  await page.goto(VENTA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Punto de venta" }),
  ).toBeVisible({ timeout: 45_000 });
  // El formulario existe en el HTML del servidor antes de que React enganche.
  await page.waitForLoadState("networkidle");
}

/** Busca y agrega. La búsqueda es una acción: la página no navega. */
async function addProduct(page: Page, sku: string) {
  await page.getByLabel("Buscar artículo").fill(sku);
  await page.getByRole("button", { name: "Buscar" }).click();
  const row = page.getByTestId("pos-result-row").filter({ hasText: sku });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Agregar" }).click();
}

function cartLine(page: Page, sku: string) {
  return page.getByTestId("pos-cart-line").filter({ hasText: sku });
}

async function expectTotals(
  page: Page,
  expected: { subtotal: string; discount: string; tax: string; total: string },
) {
  await expect(page.getByTestId("pos-total-subtotal")).toContainText(expected.subtotal);
  await expect(page.getByTestId("pos-total-discount")).toContainText(expected.discount);
  await expect(page.getByTestId("pos-total-tax")).toContainText(expected.tax);
  await expect(page.getByTestId("pos-total-total")).toContainText(expected.total);
}

test("el carrito empieza vacío y con totales en cero", async ({ page }) => {
  await openCheckout(page);
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
  await expect(page.getByText("Carrito vacío")).toBeVisible();
  await expectTotals(page, {
    subtotal: "0.00",
    discount: "0.00",
    tax: "0.00",
    total: "0.00",
  });
});

test("buscar no navega: la URL no cambia", async ({ page }) => {
  await openCheckout(page);
  await page.getByLabel("Buscar artículo").fill(CASCO.sku);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByTestId("pos-result-row").filter({ hasText: CASCO.sku })).toBeVisible();
  // Si buscar navegara, el carrito se perdería en cada escaneo.
  await expect(page).toHaveURL(new RegExp(`${VENTA}$`));
});

test("agrega un artículo", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await expect(cartLine(page, CASCO.sku)).toBeVisible();
  await expect(cartLine(page, CASCO.sku).getByLabel("Cantidad")).toHaveValue("1");
  await expect(cartLine(page, CASCO.sku).getByLabel("Precio")).toHaveValue("1000");
  await expectTotals(page, {
    subtotal: "1,000.00",
    discount: "0.00",
    tax: "0.00",
    total: "1,000.00",
  });
});

test("agrega varios artículos distintos", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addProduct(page, ACEITE.sku);

  await expect(page.getByTestId("pos-cart-line")).toHaveCount(2);
  await expectTotals(page, {
    subtotal: "1,250.00",
    discount: "0.00",
    tax: "0.00",
    total: "1,250.00",
  });
});

test("escanear el mismo artículo dos veces suma cantidad", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addProduct(page, CASCO.sku);

  // Una sola línea, con cantidad 2: lo que espera quien escanea repetido.
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1);
  await expect(cartLine(page, CASCO.sku).getByLabel("Cantidad")).toHaveValue("2");
  await expectTotals(page, {
    subtotal: "2,000.00",
    discount: "0.00",
    tax: "0.00",
    total: "2,000.00",
  });
});

test("editar la cantidad recalcula", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await cartLine(page, CASCO.sku).getByLabel("Cantidad").fill("3");
  await expect(cartLine(page, CASCO.sku).getByTestId("pos-line-total")).toContainText(
    "3,000.00",
  );
  await expectTotals(page, {
    subtotal: "3,000.00",
    discount: "0.00",
    tax: "0.00",
    total: "3,000.00",
  });
});

test("sobrescribir el precio recalcula", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await cartLine(page, CASCO.sku).getByLabel("Precio").fill("850");
  await expectTotals(page, {
    subtotal: "850.00",
    discount: "0.00",
    tax: "0.00",
    total: "850.00",
  });
});

test("el descuento de línea recalcula", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await cartLine(page, CASCO.sku).getByLabel("Descuento").fill("150");
  await expect(cartLine(page, CASCO.sku).getByTestId("pos-line-total")).toContainText(
    "850.00",
  );
  await expectTotals(page, {
    subtotal: "1,000.00",
    discount: "150.00",
    tax: "0.00",
    total: "850.00",
  });
});

test("el impuesto de línea recalcula", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await cartLine(page, CASCO.sku).getByLabel("Impuesto").fill("150");
  // El impuesto suma; el subtotal no se toca.
  await expectTotals(page, {
    subtotal: "1,000.00",
    discount: "0.00",
    tax: "150.00",
    total: "1,150.00",
  });
});

test("descuento e impuesto juntos, en dos líneas", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addProduct(page, ACEITE.sku);

  await cartLine(page, CASCO.sku).getByLabel("Cantidad").fill("2");
  await cartLine(page, CASCO.sku).getByLabel("Descuento").fill("200");
  await cartLine(page, CASCO.sku).getByLabel("Impuesto").fill("270");
  await cartLine(page, ACEITE.sku).getByLabel("Impuesto").fill("37.5");

  // 2000 + 250 = 2250 · descuento 200 · impuesto 307.5 · total 2357.5
  await expectTotals(page, {
    subtotal: "2,250.00",
    discount: "200.00",
    tax: "307.50",
    total: "2,357.50",
  });
});

test("un descuento mayor que la línea la deja en cero, no negativa", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);

  await cartLine(page, ACEITE.sku).getByLabel("Descuento").fill("999");
  await expect(cartLine(page, ACEITE.sku).getByTestId("pos-line-total")).toContainText(
    "0.00",
  );
  await expect(page.getByTestId("pos-total-total")).toContainText("0.00");
});

test("quitar una línea recalcula", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await addProduct(page, ACEITE.sku);
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(2);

  await cartLine(page, CASCO.sku)
    .getByRole("button", { name: `Quitar ${CASCO.name}` })
    .click();

  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1);
  await expectTotals(page, {
    subtotal: "250.00",
    discount: "0.00",
    tax: "0.00",
    total: "250.00",
  });
});

test("recargar vacía el carrito, por diseño", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
  await expect(page.getByText("Carrito vacío")).toBeVisible();
});

test("nada se guarda: el carrito no crea ventas", async ({ page }) => {
  const before = await prisma.posSale.count();
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await cartLine(page, CASCO.sku).getByLabel("Cantidad").fill("5");
  await expect(page.getByTestId("pos-total-total")).toContainText("5,000.00");

  // La promesa central del parche.
  expect(await prisma.posSale.count()).toBe(before);
  expect(await prisma.posSaleItem.count()).toBe(0);
  expect(await prisma.posPayment.count()).toBe(0);
});

test("una búsqueda sin resultados lo dice", async ({ page }) => {
  await openCheckout(page);
  await page.getByLabel("Buscar artículo").fill(`${TAG}-NO-EXISTE`);
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByText("Ningún artículo coincide")).toBeVisible({
    timeout: 20_000,
  });
});

test("los campos son alcanzables con teclado", async ({ page }) => {
  await openCheckout(page);
  // Enter en el buscador dispara la búsqueda sin usar el ratón.
  await page.getByLabel("Buscar artículo").fill(CASCO.sku);
  await page.getByLabel("Buscar artículo").press("Enter");
  await expect(
    page.getByTestId("pos-result-row").filter({ hasText: CASCO.sku }),
  ).toBeVisible({ timeout: 20_000 });

  await addProduct(page, CASCO.sku);
  const quantity = cartLine(page, CASCO.sku).getByLabel("Cantidad");
  await quantity.focus();
  await page.keyboard.press("Tab");
  await expect(cartLine(page, CASCO.sku).getByLabel("Precio")).toBeFocused();
});

test("el cobro es usable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await expect(cartLine(page, CASCO.sku)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
