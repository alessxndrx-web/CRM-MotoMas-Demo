import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

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

const VENTA = "/pos/venta";

const CASCO = { sku: `${TAG}-SALE-CASCO`, name: "Casco de venta", price: 1000 };
const ACEITE = { sku: `${TAG}-SALE-ACEITE`, name: "Aceite de venta", price: 250 };
/** Patch POS4.0 — existe en el catálogo y **no** tiene saldo abierto en ninguna bodega. */
const SIN_SALDO = { sku: `${TAG}-SALE-SINSALDO`, name: "Sin saldo de venta", price: 300 };
/**
 * La bodega que siembra `prisma/seed.mjs` en cada sucursal.
 *
 * **No se crea una bodega de prueba**: una segunda con el prefijo del tag volvía
 * ambiguo el `findFirstOrThrow` del fixture y los saldos podían acabar en la que
 * no era. Esta ya existe, es de la misma sucursal y no tiene saldo de estos
 * artículos, que es justo lo que hace falta para ver el cambio.
 */
const SECOND_WAREHOUSE = "Bodega principal";
/** La bodega del fixture, donde esta suite siembra sus saldos. */
const FIXTURE_WAREHOUSE = `${TAG} Bodega`;

test.beforeAll(async ({ browser }) => {
  // Compilación en frío fuera del presupuesto de cualquier test, como en
  // SUITE-POS2.2/2.3/2.6. Esta suite nunca tuvo el bloque y el primer test
  // pagaba el minuto de compilación con su propio reloj de 60 s.
  test.setTimeout(300_000);
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

  // Sin saldo en ninguna bodega: es el estado que rompe el cobro y el que el
  // mostrador no podía ver hasta POS4.0.
  await prisma.posProduct.upsert({
    where: { sku: SIN_SALDO.sku },
    update: { name: SIN_SALDO.name, unitPrice: SIN_SALDO.price, isActive: true },
    create: {
      sku: SIN_SALDO.sku,
      name: SIN_SALDO.name,
      unitPrice: SIN_SALDO.price,
    },
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

async function openCheckout(page: Page) {
  await page.goto(VENTA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Punto de venta" }),
  ).toBeVisible({ timeout: 45_000 });
  // **Sin `networkidle`.** Misma conclusión que POS1.2-F: bajo `next dev` la red
  // nunca queda quieta —recarga en caliente, y cada ruta que la barra lateral
  // prefetcha se compila al pedirla—, y la espera colgó con la pantalla ya
  // pintada. No afirmaba nada; lo que sí afirma algo es que el terminal responda,
  // y eso lo comprueba cada interacción de aquí en adelante.
  // Patch POS1.1-E. El administrador es global, así que elige sucursal — y la
  // bodega del fixture vive en `granada`. El servidor rechaza consumir de una
  // bodega de otra sucursal, así que la prueba dice explícitamente cuál usa en
  // vez de depender de cuál venga primero en la lista.
  const branchSelector = page.getByTestId("pos-branch").getByRole("combobox");
  if (await branchSelector.isVisible()) {
    await branchSelector.selectOption({ value: "granada" });
  }
  // Patch POS4.0 — y la bodega se dice, no se hereda del orden de la lista: los
  // saldos de esta suite viven en la del fixture.
  await page
    .getByTestId("pos-warehouse")
    .getByRole("combobox")
    .selectOption({ label: FIXTURE_WAREHOUSE });
}

async function scan(page: Page, sku: string) {
  // Patch POS4.0 — el flujo real del mostrador: se teclea/escanea el codigo y el
  // SKU exacto entra solo. Sin ratón y sin lista intermedia.
  await page.getByLabel("Buscar artículo").fill(sku);
  await page.getByLabel("Buscar artículo").press("Enter");
}

/** Abre el ajuste de precio de una linea: precio, descuento e impuesto viven ahi. */
async function adjust(page: Page, sku: string) {
  const line = page.getByTestId("pos-cart-line").filter({ hasText: sku });
  if (await line.getByTestId("pos-line-ajuste").count()) return;
  await line.getByTestId("pos-line-ajustar").click();
  await expect(line.getByTestId("pos-line-ajuste")).toBeVisible();
}

async function addProduct(page: Page, sku: string) {
  await scan(page, sku);
  await expect(
    page.getByTestId("pos-cart-line").filter({ hasText: sku }),
  ).toBeVisible({ timeout: 30_000 });
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
  await adjust(page, CASCO.sku);
  await adjust(page, ACEITE.sku);
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
  await adjust(page, CASCO.sku);
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
  await adjust(page, CASCO.sku);
  await cartLine(page, CASCO.sku).getByLabel("Precio").fill("850");

  const saleNumber = await checkout(page);
  const sale = await storedSale(saleNumber);
  expect(Number(sale.items[0]!.unitPrice)).toBe(850);
  expect(Number(sale.total)).toBe(850);
});

test("un precio ilegible no se cobra como cero", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await adjust(page, CASCO.sku);
  await cartLine(page, CASCO.sku).getByLabel("Precio").fill("abc");

  // **Cero es un precio válido**, así que convertir el dedazo en cero producía
  // una venta gratis que el servidor no tenía cómo rechazar. El navegador ya no
  // inventa la cifra: la señala y no manda nada.
  await expect(cartLine(page, CASCO.sku)).toContainText("No es un número.");
  await expect(cartLine(page, CASCO.sku).getByLabel("Precio")).toHaveAttribute(
    "aria-invalid",
    "true",
  );

  const before = await prisma.posSale.count();
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  await expect(page.getByTestId("pos-error")).toContainText(/no es un número/i, {
    timeout: 30_000,
  });
  expect(await prisma.posSale.count()).toBe(before);

  // Corregido, se cobra con el precio corregido: la pantalla no queda atascada.
  await cartLine(page, CASCO.sku).getByLabel("Precio").fill("750");
  const saleNumber = await checkout(page);
  expect(Number((await storedSale(saleNumber)).items[0]!.unitPrice)).toBe(750);
});

test("la venta guarda la identidad del artículo, no una referencia viva", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);
  const saleNumber = await checkout(page);

  const sale = await storedSale(saleNumber);
  const item = sale.items[0]!;
  expect(item.productName).toBe(ACEITE.name);
  expect(item.productSku).toBe(ACEITE.sku);

  // Renombrar el artículo en el catálogo **no reescribe la venta pasada**. Antes
  // el detalle resolvía nombre y SKU por join contra el catálogo vivo, así que
  // un renombrado cambiaba en silencio todo lo vendido y el recibo reimpreso
  // decía algo que nadie compró.
  await prisma.posProduct.update({
    where: { sku: ACEITE.sku },
    data: { name: "Nombre cambiado después de la venta" },
  });

  const after = await prisma.posSaleItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  expect(after.productName).toBe(ACEITE.name);
  expect(after.productSku).toBe(ACEITE.sku);

  // Y se deja el catálogo como estaba: las demás pruebas cuentan con el nombre.
  await prisma.posProduct.update({
    where: { sku: ACEITE.sku },
    data: { name: ACEITE.name },
  });
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
  // Patch POS4.0 — la lista dejó de ocupar la pantalla; sigue siendo la misma
  // lectura de la capa de consultas, solo que se pide.
  await page.getByTestId("pos-ultimas-ventas").click();
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

test("la sucursal la impone el servidor, no la elige el mostrador", async ({ page }) => {
  // Patch POS2.4. **El selector de sucursal desapareció, y esa es la mejora.**
  // Hasta POS2.3 el cobro corría con la sesión administrativa, y un rol global
  // tenía que decir en qué mostrador registraba la venta. Ahora la identidad es
  // del operador y su sucursal viene con ella: no hay nada que elegir, y el
  // navegador no puede cambiarla.
  //
  // La garantía que la prueba protegía —que la venta cae en la sucursal
  // correcta— se mantiene; lo que se quitó es la posibilidad de equivocarse.
  await openCheckout(page);
  await expect(page.getByTestId("pos-branch")).toHaveCount(0);

  await addProduct(page, CASCO.sku);
  const saleNumber = await checkout(page);

  const sale = await prisma.posSale.findUniqueOrThrow({
    where: { saleNumber },
    include: { branch: { select: { code: true } } },
  });
  expect(sale.branch.code).toBe(MAPPED_BRANCH_CODE);
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

/* ---------------------------------------------------------------------------
 * Patch POS4.0 — el saldo, donde se decide
 * ------------------------------------------------------------------------ */

test("el saldo de la bodega se ve antes de agregar", async ({ page }) => {
  // El saldo se lee de la base en este momento: las pruebas anteriores de la
  // suite han vendido unidades, así que fijar «10,000» mediría el orden de
  // ejecución en vez de lo que la pantalla muestra.
  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
  });
  const product = await prisma.posProduct.findFirstOrThrow({
    where: { sku: CASCO.sku },
  });
  const balance = (
    await prisma.posInventory.findUniqueOrThrow({
      where: {
        warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
      },
    })
  ).quantity.toNumber();
  const expected = new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 3,
  }).format(balance);

  await openCheckout(page);
  // Por nombre: es la búsqueda que deja lista, que es donde vive el saldo.
  await page.getByLabel("Buscar artículo").fill(CASCO.name);
  await page.getByLabel("Buscar artículo").press("Enter");

  const row = page.getByTestId("pos-result-row").filter({ hasText: CASCO.sku });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTestId("pos-result-balance")).toContainText(expected);
});

test("sin saldo abierto se dice, y no es lo mismo que cero", async ({ page }) => {
  await openCheckout(page);
  await page.getByLabel("Buscar artículo").fill(SIN_SALDO.name);
  await page.getByLabel("Buscar artículo").press("Enter");

  const row = page.getByTestId("pos-result-row").filter({ hasText: SIN_SALDO.sku });
  await expect(row).toBeVisible({ timeout: 20_000 });
  // **Informativo, no bloqueante**: P-8 sigue sin responderse y esta pantalla
  // no la responde. Lo único que cambia es que el cajero lo sabe antes.
  await expect(row.getByTestId("pos-result-balance")).toContainText(
    "Sin saldo abierto",
  );
});

test("cambiar de bodega actualiza el saldo mostrado", async ({ page }) => {
  await openCheckout(page);
  await page.getByLabel("Buscar artículo").fill(CASCO.name);
  await page.getByLabel("Buscar artículo").press("Enter");

  const row = page.getByTestId("pos-result-row").filter({ hasText: CASCO.sku });
  // Con saldo: lo que importa es que diga una cifra, no cuál — las pruebas
  // anteriores han vendido y el número depende del orden de ejecución.
  await expect(row.getByTestId("pos-result-balance")).toBeVisible({
    timeout: 20_000,
  });
  await expect(row.getByTestId("pos-result-balance")).not.toContainText(
    "Sin saldo abierto",
  );

  // El mismo artículo, otra bodega, otra realidad de inventario.
  await page
    .getByTestId("pos-warehouse")
    .getByRole("combobox")
    .selectOption({ label: SECOND_WAREHOUSE });
  await expect(row.getByTestId("pos-result-balance")).toContainText(
    "Sin saldo abierto",
    { timeout: 20_000 },
  );
});

test("«Importe exacto» deja el cobro en exacto", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  await page.getByTestId("pos-pago-exacto").click();
  await expect(
    page.getByTestId("pos-payments").getByLabel("Monto 1"),
  ).toHaveValue("1000");
  await expect(page.getByTestId("pos-estado-pago")).toHaveText("Cobro exacto.");
});

test("tras cobrar, el mostrador queda listo para el siguiente cliente", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  await page.getByTestId("pos-pago-exacto").click();
  const saleNumber = await checkout(page);

  await expect(page.getByTestId("pos-cart-line")).toHaveCount(0);
  await expect(page.getByTestId("pos-sale-created")).toContainText(saleNumber);
  // El escáner puede leer el siguiente artículo sin tocar el ratón.
  await expect(page.getByLabel("Buscar artículo")).toBeFocused();

  // Y una segunda activación no puede duplicar: sin líneas el botón está apagado.
  const before = await prisma.posSale.count();
  await expect(
    page.getByRole("button", { name: "Cobrar y registrar venta" }),
  ).toBeDisabled();
  expect(await prisma.posSale.count()).toBe(before);
});

/* ---------------------------------------------------------------------------
 * Patch POS5.0 — la frontera del servidor, ejercitada sin la interfaz
 *
 * Estas pruebas **no pulsan botones**: capturan la petición real de la Server
 * Action y la reenvían con la cookie de sesión, como haría alguien con las
 * herramientas del navegador. Es la única forma de afirmar que la garantía vive
 * en el servidor y no en lo que la pantalla deja de pintar.
 * ------------------------------------------------------------------------ */

type CapturedAction = { url: string; headers: Record<string, string>; body: string };

/** Captura la petición de la Server Action que dispare `trigger`. */
async function captureAction(
  page: Page,
  trigger: () => Promise<void>,
): Promise<CapturedAction> {
  const [request] = await Promise.all([
    page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        Boolean(candidate.headers()["next-action"]),
      { timeout: 30_000 },
    ),
    trigger(),
  ]);
  const headers = { ...request.headers() };
  // La longitud la recalcula el reenvío; conservarla la haría mentir.
  delete headers["content-length"];
  return { url: request.url(), headers, body: request.postData() ?? "" };
}

/** Reenvía la petición capturada, opcionalmente con el cuerpo alterado. */
async function replay(page: Page, action: CapturedAction, body?: string) {
  return page.request.post(action.url, {
    headers: action.headers,
    data: body ?? action.body,
  });
}

test("un reintento del mismo cobro no crea una segunda venta", async ({ page }) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);

  const action = await captureAction(page, async () => {
    await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  });
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });

  const sales = await prisma.posSale.count();
  const movements = await prisma.posInventoryMovement.count();
  const payments = await prisma.posPayment.count();

  // El mismo cobro, otra vez: es lo que hace una red que reintenta.
  await replay(page, action);
  await replay(page, action);

  // **Ni venta, ni pago, ni mercancía descontada de más.**
  expect(await prisma.posSale.count()).toBe(sales);
  expect(await prisma.posInventoryMovement.count()).toBe(movements);
  expect(await prisma.posPayment.count()).toBe(payments);
});

test("dos cobros simultáneos con la misma clave dejan una sola venta", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, ACEITE.sku);

  const action = await captureAction(page, async () => {
    await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  });
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });

  // Una clave nueva, para un intento que todavía no existe en la base.
  const fresh = crypto.randomUUID();
  const key = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(
    action.body,
  );
  expect(key).not.toBeNull();
  const body = action.body.replace(key![0], fresh);

  const sales = await prisma.posSale.count();
  const movements = await prisma.posInventoryMovement.count();

  // A la vez, como dos pestañas o un reintento que se solapa con el original.
  await Promise.all([replay(page, action, body), replay(page, action, body)]);

  // El índice único es la autoridad: una gana, la otra relee y devuelve la suya.
  expect(await prisma.posSale.count({ where: { idempotencyKey: fresh } })).toBe(1);
  expect(await prisma.posSale.count()).toBe(sales + 1);
  expect(await prisma.posInventoryMovement.count()).toBe(movements + 1);
});

test("una clave nueva sí puede cobrar: la idempotencia no bloquea al siguiente cliente", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  const first = await checkout(page);

  await addProduct(page, CASCO.sku);
  const second = await checkout(page);

  // Dos clientes seguidos son dos ventas: el carrito estrena clave al vender.
  expect(second).not.toBe(first);
  expect(await prisma.posSale.count({ where: { saleNumber: { in: [first, second] } } })).toBe(2);
});

test("el cobro no alcanza la bodega de otra sucursal", async ({ page }) => {
  const foreign = await prisma.posWarehouse.findFirstOrThrow({
    where: { branch: { code: { not: MAPPED_BRANCH_CODE } } },
    select: { id: true, branchId: true },
  });
  const product = await prisma.posProduct.findFirstOrThrow({
    where: { sku: CASCO.sku },
    select: { id: true },
  });
  // **El saldo ajeno se abre a propósito.** Sin él el consumo fallaría por «no
  // tiene saldo abierto» y la prueba pasaría sin llegar nunca a la comprobación
  // de sucursal. Así lo único que puede detener la venta es esa comprobación.
  await prisma.posInventory.upsert({
    where: {
      warehouseId_productId: { warehouseId: foreign.id, productId: product.id },
    },
    update: {},
    create: { warehouseId: foreign.id, productId: product.id, quantity: 50 },
  });

  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  const action = await captureAction(page, async () => {
    await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  });
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });

  const own = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
    select: { id: true },
  });
  // Misma petición, otra bodega, y una clave nueva para que no la deduplique.
  const key = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.exec(
    action.body,
  );
  const body = action.body
    .replace(own.id, foreign.id)
    .replace(key![0], crypto.randomUUID());

  const before = await prisma.posSale.count();
  const foreignMoves = await prisma.posInventoryMovement.count({
    where: { warehouseId: foreign.id },
  });
  await replay(page, action, body);

  // **La sucursal la pone la sesión**, así que la bodega ajena no le pertenece:
  // ni venta nueva, ni un solo movimiento en el inventario de la otra sucursal.
  expect(await prisma.posSale.count()).toBe(before);
  expect(
    await prisma.posInventoryMovement.count({ where: { warehouseId: foreign.id } }),
  ).toBe(foreignMoves);
});

/* ---------------------------------------------------------------------------
 * Patch INT4 — la venta reconstruible desde la base
 * ------------------------------------------------------------------------ */

test("la venta guarda su bodega y su operador, y el movimiento se puede reconstruir", async ({
  page,
}) => {
  await openCheckout(page);
  await addProduct(page, CASCO.sku);
  const saleNumber = await checkout(page);

  const sale = await prisma.posSale.findUniqueOrThrow({
    where: { saleNumber },
    select: { id: true, warehouseId: true, operatorId: true, branchId: true },
  });

  // **De qué bodega salió**: hasta INT4 la única traza era el texto del motivo.
  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
    select: { id: true, branchId: true },
  });
  expect(sale.warehouseId).toBe(warehouse.id);
  // La bodega es de la sucursal de la venta: la relación no cruza fronteras.
  expect(warehouse.branchId).toBe(sale.branchId);

  // **Quién cobró**: el operador de mostrador, no solo el usuario de auditoría.
  expect(sale.operatorId).not.toBeNull();
  const operator = await prisma.posOperator.findUniqueOrThrow({
    where: { id: sale.operatorId! },
    select: { branchId: true },
  });
  expect(operator.branchId).toBe(sale.branchId);

  // Y el movimiento que generó se puede alcanzar desde la venta, por relación.
  const movement = await prisma.posInventoryMovement.findFirstOrThrow({
    where: { warehouseId: sale.warehouseId!, reason: `Venta ${saleNumber}` },
    select: { type: true, warehouseId: true },
  });
  expect(movement.type).toBe("VENTA");
  expect(movement.warehouseId).toBe(sale.warehouseId);
});

/* ---------------------------------------------------------------------------
 * Patch INT3 — la cartera de otra sucursal no es visible desde el mostrador
 * ------------------------------------------------------------------------ */

test("el buscador de clientes no alcanza la cartera de otra sucursal", async ({
  page,
}) => {
  const foreignBranch = await prisma.branch.findFirstOrThrow({
    where: { code: { not: MAPPED_BRANCH_CODE } },
    select: { id: true },
  });
  const ownBranch = await prisma.branch.findUniqueOrThrow({
    where: { code: MAPPED_BRANCH_CODE },
    select: { id: true },
  });

  const marker = `${TAG}-CARTERA`;
  await prisma.customer.deleteMany({ where: { name: { startsWith: marker } } });
  await prisma.customer.createMany({
    data: [
      {
        branchId: ownBranch.id,
        name: `${marker} Propia`,
        phone: "50500001",
        phoneNormalized: "50500001",
      },
      {
        branchId: foreignBranch.id,
        name: `${marker} Ajena`,
        phone: "50500002",
        phoneNormalized: "50500002",
      },
    ],
  });

  try {
    await openCheckout(page);
    await page.getByTestId("pos-customer-search").getByLabel("Cliente").fill(marker);
    await page.getByRole("button", { name: "Buscar cliente" }).click();

    const results = page.getByTestId("pos-customer-results");
    await expect(results).toBeVisible({ timeout: 20_000 });
    // La de la sucursal propia sí; la ajena **no existe para este mostrador**.
    await expect(results).toContainText(`${marker} Propia`);
    await expect(results).not.toContainText(`${marker} Ajena`);
  } finally {
    await prisma.customer.deleteMany({ where: { name: { startsWith: marker } } });
  }
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
