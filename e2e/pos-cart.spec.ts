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

const VENTA = "/pos/venta";

/** Artículos propios de esta suite, creados una vez. */
const CASCO_BARCODE = `${TAG}-CART-BC`;
const CASCO = { sku: `${TAG}-CART-CASCO`, name: "Casco de carrito", price: 1000 };
const ACEITE = { sku: `${TAG}-CART-ACEITE`, name: "Aceite de carrito", price: 250 };

test.beforeAll(async () => {
  await prisma.posProduct.updateMany({
    where: { barcode: CASCO_BARCODE },
    data: { barcode: null },
  });
  for (const item of [CASCO, ACEITE]) {
    await prisma.posProduct.upsert({
      where: { sku: item.sku },
      update: { name: item.name, unitPrice: item.price, isActive: true },
      create: { sku: item.sku, name: item.name, unitPrice: item.price },
    });
  }
  // Patch POS4.0 — el escaneo por código exige un código.
  await prisma.posProduct.update({
    where: { sku: CASCO.sku },
    data: { barcode: CASCO_BARCODE },
  });
});

async function openCheckout(page: Page) {
  await page.goto(VENTA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Punto de venta" }),
  ).toBeVisible({ timeout: 45_000 });
  // **Sin `networkidle`.** Misma conclusión que POS1.2-F y que `pos-sale.spec.ts`
  // desde POS4.0: bajo `next dev` la recarga en caliente y el prefetch de rutas
  // dejan la red nunca quieta, y la espera colgó con la pantalla ya pintada. El
  // encabezado ya afirma que el terminal está en pie; esto no afirmaba nada.
}

/** Busca y agrega. La búsqueda es una acción: la página no navega. */
async function scan(page: Page, sku: string) {
  // Patch POS4.0 — el flujo real del mostrador: se teclea/escanea el codigo y el
  // SKU exacto entra solo. Sin ratón y sin lista intermedia.
  await page.getByLabel("Buscar artículo").fill(sku);
  await page.getByLabel("Buscar artículo").press("Enter");
}

/** Abre el ajuste de precio de una linea: precio, descuento e impuesto viven ahi. */
/**
 * Patch POS6.0-A — abre el carrito **si la interfaz lo tiene guardado**.
 *
 * Preparado antes del rediseño a propósito. Hoy el carrito está permanentemente
 * a la vista y esta función no hace nada; cuando el carrito pase a un cajón, el
 * disparador existirá y la misma llamada lo abrirá. Así las pruebas describen la
 * intención del cajero —«mirar el carrito»— y no la disposición de la pantalla.
 *
 * Idempotente y segura con el carrito vacío: si no hay disparador, o ya está
 * abierto, retorna sin tocar nada.
 */
async function openCart(page: Page) {
  const trigger = page.getByTestId("pos-abrir-carrito");
  if ((await trigger.count()) === 0) return;
  if ((await page.getByTestId("pos-ir-a-cobro").count()) > 0) return;
  if (await trigger.isDisabled()) return;
  await trigger.click();
  await expect(page.getByTestId("pos-ir-a-cobro")).toBeVisible({ timeout: 20_000 });
}

async function adjust(page: Page, sku: string) {
  // El ajuste vive dentro del carrito: hay que tenerlo delante para tocarlo.
  await openCart(page);
  const line = page.getByTestId("pos-cart-line").filter({ hasText: sku });
  if (await line.getByTestId("pos-line-ajuste").count()) return;
  await line.getByTestId("pos-line-ajustar").click();
  await expect(line.getByTestId("pos-line-ajuste")).toBeVisible();
}

/**
 * Patch POS6.0-B — cierra el cajón **sin tocar el carrito**.
 *
 * Hace falta porque el buscador queda detrás del velo mientras el cajón está
 * abierto: sin cerrarlo, el siguiente escaneo no alcanzaría el campo. No-op si
 * la interfaz no separa el carrito.
 */
async function closeCart(page: Page) {
  const back = page.getByTestId("pos-seguir-vendiendo");
  if ((await back.count()) === 0) return;
  await back.click();
  await expect(back).toHaveCount(0);
}

async function addProduct(page: Page, sku: string) {
  await scan(page, sku);
  // Patch POS6.0-B — la afirmación no se debilita, se mueve: el artículo sigue
  // teniendo que estar **en el carrito por su SKU**, solo que ahora el carrito
  // hay que abrirlo para verlo. Se cierra al salir para que el siguiente
  // escaneo vuelva a alcanzar el buscador.
  await openCart(page);
  await expect(
    page.getByTestId("pos-cart-line").filter({ hasText: sku }),
  ).toBeVisible({ timeout: 30_000 });
  await closeCart(page);
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
  await openCart(page);
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
  await scan(page, CASCO.sku);
  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible({ timeout: 20_000 });
  // Si buscar navegara, el carrito se perdería en cada escaneo.
  await expect(page).toHaveURL(new RegExp(`${VENTA}$`));
});

test("agrega un artículo", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible();
  await expect(cartLine(page, CASCO.sku).getByLabel("Cantidad")).toHaveValue("1");
  await adjust(page, CASCO.sku);
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

  await openCart(page);
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
  await openCart(page);
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

  await openCart(page);
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

  await adjust(page, CASCO.sku);
  await openCart(page);
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

  await adjust(page, CASCO.sku);
  await openCart(page);
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

  await adjust(page, CASCO.sku);
  await openCart(page);
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

  await openCart(page);
  await cartLine(page, CASCO.sku).getByLabel("Cantidad").fill("2");
  await adjust(page, CASCO.sku);
  await adjust(page, ACEITE.sku);
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

  await adjust(page, ACEITE.sku);
  await openCart(page);
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
  await openCart(page);
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
  await openCart(page);
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1);

  await page.reload();
  // **Sin `networkidle`.** La barra de resumen es la que afirma algo: en cuanto
  // dice «Sin artículos», la recarga terminó **y** el carrito se perdió, que es
  // exactamente lo que esta prueba sostiene.
  await expect(page.getByTestId("pos-resumen-articulos")).toHaveText(
    "Sin artículos",
    { timeout: 45_000 },
  );
  await openCart(page);
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
  await expect(page.getByText("Carrito vacío")).toBeVisible();
});

test("nada se guarda: el carrito no crea ventas", async ({ page }) => {
  // Patch POS1.0-D. Antes bastaba con exigir cero absoluto, porque nada en el
  // POS escribía. Desde que el cobro existe, cero absoluto sería una afirmación
  // sobre el resto de la suite y no sobre el carrito: lo que este test sostiene
  // es que **armar** el carrito no escribe, así que se mide contra el antes.
  const before = {
    sales: await prisma.posSale.count(),
    items: await prisma.posSaleItem.count(),
    payments: await prisma.posPayment.count(),
  };
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await openCart(page);
  await cartLine(page, CASCO.sku).getByLabel("Cantidad").fill("5");
  await expect(page.getByTestId("pos-total-total")).toContainText("5,000.00");

  // La promesa central del parche.
  expect(await prisma.posSale.count()).toBe(before.sales);
  expect(await prisma.posSaleItem.count()).toBe(before.items);
  expect(await prisma.posPayment.count()).toBe(before.payments);
});

test("una búsqueda sin resultados lo dice", async ({ page }) => {
  await openCheckout(page);
  await page.getByLabel("Buscar artículo").fill(`${TAG}-NO-EXISTE`);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page.getByText("Ningún artículo coincide")).toBeVisible({
    timeout: 20_000,
  });
});

test("los campos son alcanzables con teclado", async ({ page }) => {
  await openCheckout(page);
  // Enter en el buscador escanea, y el artículo entra sin tocar el ratón.
  await scan(page, CASCO.sku);
  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible({ timeout: 20_000 });

  // La cantidad se teclea sobre el campo, que conserva su nombre accesible
  // aunque ahora venga con pasos.
  const quantity = cartLine(page, CASCO.sku).getByLabel("Cantidad");
  await quantity.focus();
  await expect(quantity).toBeFocused();
  await quantity.fill("4");
  await expect(page.getByTestId("pos-totals")).toContainText("4,000.00");

  // Y el precio sigue alcanzable con teclado, tras abrir su ajuste.
  await adjust(page, CASCO.sku);
  const price = cartLine(page, CASCO.sku).getByLabel("Precio");
  await price.focus();
  await expect(price).toBeFocused();
});

/* ---------------------------------------------------------------------------
 * Patch POS4.0 — el terminal como escáner
 * ------------------------------------------------------------------------ */

test("dos escaneos seguidos dan dos líneas, sin tocar el ratón", async ({ page }) => {
  await openCheckout(page);
  await scan(page, CASCO.sku);
  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible({ timeout: 20_000 });
  await scan(page, ACEITE.sku);
  await expect(cartLine(page, ACEITE.sku)).toBeVisible({ timeout: 20_000 });

  await expect(page.getByTestId("pos-cart-line")).toHaveCount(2);
});

test("un SKU exacto entra solo, vacía el buscador y le devuelve el foco", async ({
  page,
}) => {
  await openCheckout(page);
  await scan(page, CASCO.sku);

  /*
   * Patch POS6.0-B — el orden importa, y antes no lo hacía.
   *
   * El contrato del escaneo inequívoco se cumple **en la pantalla de venta**:
   * el buscador se vacía y recupera el foco para la siguiente lectura sin que
   * el cajero abra nada. Comprobarlo con el cajón abierto medía una carrera —el
   * cajón atrapa el foco, el alta lo devuelve— y no el contrato: se cumplía o no
   * según qué llegara antes. Se comprueba donde ocurre, y después se confirma
   * que el artículo entró.
   */
  const search = page.getByLabel("Buscar artículo");
  await expect(search).toHaveValue("", { timeout: 20_000 });
  await expect(search).toBeFocused();
  // Sin lista intermedia: lo tecleado era inequívoco.
  await expect(page.getByTestId("pos-result-row")).toHaveCount(0);

  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible({ timeout: 20_000 });
});

test("un código de barras exacto entra solo", async ({ page }) => {
  await openCheckout(page);
  await scan(page, CASCO_BARCODE);

  // El buscador se vacía en la pantalla de venta, antes de abrir nada.
  await expect(page.getByLabel("Buscar artículo")).toHaveValue("", {
    timeout: 20_000,
  });
  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible({ timeout: 20_000 });
});

test("un nombre nunca entra solo: elegir es del cajero", async ({ page }) => {
  await openCheckout(page);
  await scan(page, "carrito");

  // «carrito» describe dos artículos; agregar uno sería inventar una preferencia.
  await expect(page.getByTestId("pos-result-row").first()).toBeVisible({
    timeout: 20_000,
  });
  await openCart(page);
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
});

test("una búsqueda nueva no deja ver el resultado anterior", async ({ page }) => {
  await openCheckout(page);
  await scan(page, "carrito");
  await expect(page.getByTestId("pos-result-row").first()).toBeVisible({
    timeout: 20_000,
  });

  // La siguiente consulta se retiene para poder mirar el estado intermedio, que
  // es donde vivía el fallo: el artículo anterior seguía ahí, y pulsable.
  await page.route("**/pos/venta", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.continue();
  });

  await page.getByLabel("Buscar artículo").fill("aceite");
  await page.getByLabel("Buscar artículo").press("Enter");

  await expect(page.getByTestId("pos-buscando")).toBeVisible();
  await expect(page.getByTestId("pos-result-row")).toHaveCount(0);
});

test("los pasos de cantidad recalculan la línea y el total", async ({ page }) => {
  await openCheckout(page);
  await scan(page, CASCO.sku);
  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible({ timeout: 20_000 });

  await cartLine(page, CASCO.sku).getByRole("button", { name: "Sumar" }).click();
  await expect(cartLine(page, CASCO.sku).getByLabel("Cantidad")).toHaveValue("2");
  await expect(cartLine(page, CASCO.sku).getByTestId("pos-line-total")).toContainText(
    "2,000.00",
  );
  await expectTotals(page, {
    subtotal: "2,000.00",
    discount: "0.00",
    tax: "0.00",
    total: "2,000.00",
  });

  await cartLine(page, CASCO.sku).getByRole("button", { name: "Restar" }).click();
  await expect(cartLine(page, CASCO.sku).getByLabel("Cantidad")).toHaveValue("1");
  await expectTotals(page, {
    subtotal: "1,000.00",
    discount: "0.00",
    tax: "0.00",
    total: "1,000.00",
  });
});

test("el cobro es usable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await openCart(page);
  await expect(cartLine(page, CASCO.sku)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
