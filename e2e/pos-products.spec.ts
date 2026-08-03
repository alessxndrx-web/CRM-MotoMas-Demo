import { expect, test, type Page } from "@playwright/test";

import { TAG, prisma } from "./fixtures";

/**
 * SUITE-POS1.0-B — catálogo del punto de venta, a través de la interfaz real.
 *
 * Corre con la sesión de **administrador**: el POS reutiliza `canOperateCaja`,
 * que no admite a Contador.
 *
 * Un producto no tiene estados, así que no hay transiciones que probar; lo que
 * sí hay es unicidad de SKU y de código de barras, y una búsqueda que **resuelve
 * en el servidor**, no filtrando lo ya cargado.
 */
test.describe.configure({ mode: "serial" });

const CATALOGO = "/panel/pos/productos";

let counter = 0;
/** SKU único por prueba, con el tag que usa la limpieza. */
function skuFor(name: string) {
  counter += 1;
  return `${TAG}-${name}-${counter}`;
}

async function openCatalogue(page: Page, query?: string) {
  await page.goto(query ? `${CATALOGO}?q=${encodeURIComponent(query)}` : CATALOGO);
  // El shell repite el rótulo de navegación como encabezado, así que el
  // anclaje va acotado al contenido principal.
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Catálogo POS" }),
  ).toBeVisible({ timeout: 45_000 });
  // El formulario existe en el HTML del servidor antes de que React enganche.
  await page.waitForLoadState("networkidle");
}

async function createProduct(
  page: Page,
  input: { sku: string; name: string; price: string; barcode?: string },
) {
  await openCatalogue(page);
  const form = page.getByTestId("pos-product-create-form");
  await form.getByLabel("SKU").fill(input.sku);
  await form.getByLabel("Nombre").fill(input.name);
  if (input.barcode) await form.getByLabel("Código de barras").fill(input.barcode);
  await form.getByLabel("Precio").fill(input.price);
  await form.getByRole("button", { name: "Registrar producto" }).click();
}

function productRow(page: Page, sku: string) {
  return page.getByTestId("pos-product-row").filter({ hasText: sku });
}

async function stored(sku: string) {
  return prisma.posProduct.findUniqueOrThrow({ where: { sku } });
}

/** Espera a que la base refleje el cambio, o falla con el motivo del servidor. */
async function expectStored(
  page: Page,
  sku: string,
  read: (row: Record<string, unknown>) => unknown,
  expected: unknown,
) {
  await expect
    .poll(
      async () => {
        const notice = page.getByTestId("pos-error");
        if (await notice.count()) return `RECHAZADO: ${await notice.innerText()}`;
        const row = await prisma.posProduct.findUnique({ where: { sku } });
        if (!row) return "SIN FILA";
        return read(row as unknown as Record<string, unknown>);
      },
      { timeout: 45_000 },
    )
    .toBe(expected);
}

test("crea un producto", async ({ page }) => {
  const sku = skuFor("CASCO");
  await createProduct(page, {
    sku,
    name: "Casco integral",
    price: "1250.50",
    barcode: `${TAG}-BC-1`,
  });

  await expectStored(page, sku, (row) => row.name, "Casco integral");
  const row = await stored(sku);
  expect(Number(row.unitPrice)).toBe(1250.5);
  expect(row.barcode).toBe(`${TAG}-BC-1`);
  expect(row.isActive).toBe(true);

  await expect(productRow(page, sku)).toBeVisible();
  await expect(productRow(page, sku).getByTestId("pos-product-price")).toContainText(
    "1,250.50",
  );
});

test("crea un producto sin código de barras", async ({ page }) => {
  const sku = skuFor("ACEITE");
  await createProduct(page, { sku, name: "Aceite 20W50", price: "250" });

  await expectStored(page, sku, (row) => row.name, "Aceite 20W50");
  expect((await stored(sku)).barcode).toBeNull();
});

test("edita nombre y precio", async ({ page }) => {
  const sku = skuFor("EDIT");
  await createProduct(page, { sku, name: "Nombre viejo", price: "100" });
  await expectStored(page, sku, (row) => row.name, "Nombre viejo");

  await page.reload();
  await page.waitForLoadState("networkidle");
  await productRow(page, sku).getByRole("button", { name: "Editar" }).click();
  const editor = page.getByTestId("pos-product-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Nombre").fill("Nombre nuevo");
  await editor.getByLabel("Precio").fill("175.25");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expectStored(page, sku, (row) => row.name, "Nombre nuevo");
  expect(Number((await stored(sku)).unitPrice)).toBe(175.25);
});

test("desactiva y vuelve a activar", async ({ page }) => {
  const sku = skuFor("BAJA");
  await createProduct(page, { sku, name: "Retirable", price: "90" });
  await expectStored(page, sku, (row) => row.isActive, true);

  await page.reload();
  await page.waitForLoadState("networkidle");
  await productRow(page, sku).getByRole("button", { name: "Desactivar" }).click();
  await expectStored(page, sku, (row) => row.isActive, false);
  // Un inactivo sigue en la lista: desactivar retira, no borra.
  await expect(productRow(page, sku)).toContainText("Inactivo");

  await productRow(page, sku).getByRole("button", { name: "Activar" }).click();
  await expectStored(page, sku, (row) => row.isActive, true);
});

test("el SKU duplicado se rechaza con el mensaje del servidor", async ({ page }) => {
  const sku = skuFor("DUP");
  await createProduct(page, { sku, name: "Original", price: "10" });
  await expectStored(page, sku, (row) => row.name, "Original");

  await createProduct(page, { sku, name: "Copia", price: "20" });
  await expect(page.getByTestId("pos-error")).toContainText(/SKU o código/i, {
    timeout: 20_000,
  });
  // El original no cambió.
  expect((await stored(sku)).name).toBe("Original");
});

test("el código de barras duplicado se rechaza", async ({ page }) => {
  const barcode = `${TAG}-BC-UNICO`;
  const first = skuFor("BC1");
  await createProduct(page, { sku: first, name: "Primero", price: "10", barcode });
  await expectStored(page, first, (row) => row.barcode, barcode);

  const second = skuFor("BC2");
  await createProduct(page, { sku: second, name: "Segundo", price: "20", barcode });
  await expect(page.getByTestId("pos-error")).toContainText(/SKU o código/i, {
    timeout: 20_000,
  });
  expect(await prisma.posProduct.count({ where: { sku: second } })).toBe(0);
});

test("busca por código de barras exacto", async ({ page }) => {
  const sku = skuFor("SCAN");
  const barcode = `${TAG}-BC-SCAN`;
  await createProduct(page, { sku, name: "Escaneable", price: "500", barcode });
  await expectStored(page, sku, (row) => row.barcode, barcode);

  // Lo que hace un lector: teclear el código y encontrar el artículo.
  await openCatalogue(page, barcode);
  await expect(page.getByTestId("pos-product-row")).toHaveCount(1);
  await expect(productRow(page, sku)).toBeVisible();
});

test("busca por SKU exacto", async ({ page }) => {
  const sku = skuFor("PORSKU");
  await createProduct(page, { sku, name: "Buscable", price: "300" });
  await expectStored(page, sku, (row) => row.name, "Buscable");

  await openCatalogue(page, sku);
  await expect(page.getByTestId("pos-product-row")).toHaveCount(1);
  await expect(productRow(page, sku)).toBeVisible();
});

test("busca por nombre parcial", async ({ page }) => {
  const sku = skuFor("PARCIAL");
  await createProduct(page, { sku, name: "Guantes de cuero reforzados", price: "400" });
  await expectStored(page, sku, (row) => row.name, "Guantes de cuero reforzados");

  await openCatalogue(page, "cuero reforz");
  await expect(productRow(page, sku)).toBeVisible();
});

test("la búsqueda se resuelve en el servidor, no filtrando lo cargado", async ({
  page,
}) => {
  const sku = skuFor("SERVIDOR");
  await createProduct(page, { sku, name: "Solo por servidor", price: "77" });
  await expectStored(page, sku, (row) => row.name, "Solo por servidor");

  await openCatalogue(page);
  const total = await page.getByTestId("pos-product-row").count();
  expect(total).toBeGreaterThan(1);

  // Escribir en el campo y pulsar Enter navega: el término viaja en la URL.
  await page.getByLabel("Buscar").fill(sku);
  await page.getByLabel("Buscar").press("Enter");
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(sku)}`));
  await expect(page.getByTestId("pos-product-row")).toHaveCount(1);
});

test("el producto persiste tras recargar", async ({ page }) => {
  const sku = skuFor("PERSIST");
  await createProduct(page, { sku, name: "Persistente", price: "2500" });
  await expectStored(page, sku, (row) => row.name, "Persistente");

  await page.reload();
  const row = productRow(page, sku);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("pos-product-price")).toContainText("2,500.00");
});

test("los campos son alcanzables con teclado y están etiquetados", async ({
  page,
}) => {
  await openCatalogue(page);
  const form = page.getByTestId("pos-product-create-form");

  const skuField = form.getByLabel("SKU");
  await expect(skuField).toBeVisible();
  await skuField.focus();
  await page.keyboard.press("Tab");
  await expect(form.getByLabel("Nombre")).toBeFocused();

  await expect(form.getByLabel("Precio")).toHaveAttribute("inputmode", "decimal");
});

test("el catálogo es usable en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalogue(page);

  await expect(page.getByTestId("pos-product-create-form")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
