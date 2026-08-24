import { expect, test, type Page } from "@playwright/test";

import { TAG, prisma } from "./fixtures";

/**
 * SUITE-POS2.3 — existencias del mostrador.
 *
 * Lo que se prueba es **la invariante del motor a través de la pantalla**: que un
 * ingreso y un ajuste escriban su movimiento con antes y después, que el saldo
 * siga siendo la suma de su bitácora, y que un ajuste que deja el saldo bajo cero
 * **se acepte** — porque P-8 sigue abierta y la pantalla no inventa política de
 * existencias.
 */
test.describe.configure({ mode: "serial" });

const RUTA = "/pos/inventario";

const WIDTHS = [
  { name: "1440px", width: 1440, height: 900 },
  { name: "1280px", width: 1280, height: 800 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "768px", width: 768, height: 1024 },
  { name: "390px", width: 390, height: 844 },
];

const ART = { sku: `${TAG}-EXIST`, name: "Articulo de existencias" };

async function seed() {
  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
  });
  const product = await prisma.posProduct.upsert({
    where: { sku: ART.sku },
    create: { sku: ART.sku, name: ART.name, unitPrice: 100, minimumStock: 10 },
    update: { minimumStock: 10, isActive: true },
  });
  await prisma.posInventoryMovement.deleteMany({ where: { productId: product.id } });
  await prisma.posInventory.deleteMany({ where: { productId: product.id } });
  return { warehouse, product };
}

let fx: Awaited<ReturnType<typeof seed>>;

async function balance() {
  const row = await prisma.posInventory.findUnique({
    where: {
      warehouseId_productId: { warehouseId: fx.warehouse.id, productId: fx.product.id },
    },
  });
  return row ? row.quantity.toNumber() : null;
}

async function movements() {
  return prisma.posInventoryMovement.findMany({
    where: { productId: fx.product.id },
    orderBy: { createdAt: "asc" },
  });
}

/** La tabla de saldos, que es la que los filtros controlan. */
const saldos = (page: Page) => page.getByTestId("tabla-saldos");

async function open(page: Page) {
  await page.goto(RUTA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Existencias" }),
  ).toBeVisible({ timeout: 45_000 });
}

async function runOperation(
  page: Page,
  kind: "abrir" | "ingreso" | "ajuste",
  values?: { quantity: string; reason: string },
) {
  const trigger =
    kind === "abrir"
      ? "abrir-saldo"
      : kind === "ingreso"
        ? "registrar-ingreso"
        : "registrar-ajuste";
  await page.getByTestId(trigger).click();
  await expect(page.getByTestId("operacion-formulario")).toBeVisible();
  await page.getByTestId("operacion-bodega").selectOption(fx.warehouse.id);
  await page.getByTestId("operacion-articulo").selectOption(fx.product.id);
  if (values) {
    await page.getByTestId("operacion-cantidad").fill(values.quantity);
    await page.getByTestId("operacion-motivo").fill(values.reason);
  }
  await page.getByTestId("operacion-confirmar").click();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  fx = await seed();
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    await page.goto(RUTA, { timeout: 180_000, waitUntil: "domcontentloaded" });
  } finally {
    await context.close();
  }
});

test("la pantalla es alcanzable desde el terminal", async ({ page }) => {
  // Patch POS2.4. **Ya no se alcanza desde el menú administrativo**, y eso es el
  // parche funcionando: el mostrador salió del panel. La propiedad que importa
  // —que la pantalla sea alcanzable— se afirma donde ahora vive.
  await page.goto("/pos/venta");
  await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 45_000 });

  const link = page
    .getByRole("navigation", { name: "Punto de venta" })
    .getByRole("link", { name: "Existencias" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/pos\/inventario$/);
  await expect(link).toHaveAttribute("aria-current", "page");
});

test("abrir un saldo lo crea en cero, sin escribir movimiento", async ({ page }) => {
  await open(page);
  expect(await balance()).toBeNull();

  await runOperation(page, "abrir");
  await expect(page.getByTestId("inventario-ok")).toBeVisible({ timeout: 30_000 });

  expect(await balance()).toBe(0);
  // Abrir no es mover: la bitácora sigue vacía.
  expect(await movements()).toHaveLength(0);
});

test("un ingreso escribe su movimiento con antes y después", async ({ page }) => {
  await open(page);
  await runOperation(page, "ingreso", { quantity: "25.5", reason: "Carga inicial" });
  await expect(page.getByTestId("inventario-ok")).toBeVisible({ timeout: 30_000 });

  expect(await balance()).toBe(25.5);
  const rows = await movements();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.type).toBe("COMPRA");
  expect(rows[0]!.quantity.toNumber()).toBe(25.5);
  expect(rows[0]!.quantityBefore.toNumber()).toBe(0);
  expect(rows[0]!.quantityAfter.toNumber()).toBe(25.5);
  expect(rows[0]!.reason).toBe("Carga inicial");
  expect(rows[0]!.createdByUserId).toBeTruthy();
});

test("un ajuste negativo reduce y encadena con el anterior", async ({ page }) => {
  await open(page);
  await runOperation(page, "ajuste", { quantity: "-5.5", reason: "Merma" });
  await expect(page.getByTestId("inventario-ok")).toBeVisible({ timeout: 30_000 });

  expect(await balance()).toBe(20);
  const rows = await movements();
  expect(rows).toHaveLength(2);
  expect(rows[1]!.type).toBe("AJUSTE");
  expect(rows[1]!.quantityBefore.toNumber()).toBe(25.5);
  expect(rows[1]!.quantityAfter.toNumber()).toBe(20);
});

test("el saldo es la suma de su bitácora", async () => {
  const rows = await movements();
  const sum = rows.reduce((total, row) => total + row.quantity.toNumber(), 0);
  expect(await balance()).toBeCloseTo(sum, 3);
  expect(
    rows.every((row) => row.quantityBefore.add(row.quantity).equals(row.quantityAfter)),
  ).toBe(true);
});

test("P-8 sigue abierta: un ajuste puede dejar el saldo negativo", async ({ page }) => {
  await open(page);
  // **La pantalla no inventa política de existencias.** El repositorio no dice
  // si el saldo puede bajar de cero, así que no lo impide.
  await runOperation(page, "ajuste", { quantity: "-30", reason: "Prueba de P-8" });
  await expect(page.getByTestId("inventario-ok")).toBeVisible({ timeout: 30_000 });
  expect(await balance()).toBe(-10);

  // Se devuelve a positivo para no arrastrar el estado a las pruebas siguientes.
  await open(page);
  await runOperation(page, "ingreso", { quantity: "30", reason: "Reposición" });
  await expect(page.getByTestId("inventario-ok")).toBeVisible({ timeout: 30_000 });
  expect(await balance()).toBe(20);
});

test("el motivo es obligatorio y su error queda asociado al campo", async ({ page }) => {
  await open(page);
  await page.getByTestId("registrar-ingreso").click();
  await page.getByTestId("operacion-bodega").selectOption(fx.warehouse.id);
  await page.getByTestId("operacion-articulo").selectOption(fx.product.id);
  await page.getByTestId("operacion-cantidad").fill("5");
  await page.getByTestId("operacion-confirmar").click();

  const reason = page.getByTestId("operacion-motivo");
  await expect(reason).toHaveAttribute("aria-invalid", "true");
  const describedBy = await reason.getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy}`)).toHaveText("Indica el motivo.");
  await expect(page.getByTestId("inventario-ok")).toHaveCount(0);
});

test("un ingreso de cero se rechaza sin viajar al servidor", async ({ page }) => {
  await open(page);
  await page.getByTestId("registrar-ingreso").click();
  await page.getByTestId("operacion-bodega").selectOption(fx.warehouse.id);
  await page.getByTestId("operacion-articulo").selectOption(fx.product.id);
  await page.getByTestId("operacion-cantidad").fill("0");
  await page.getByTestId("operacion-motivo").fill("Cero");
  await page.getByTestId("operacion-confirmar").click();

  await expect(page.getByTestId("operacion-cantidad")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByTestId("inventario-ok")).toHaveCount(0);
});

test("el estado se calcula contra umbrales declarados", async ({ page }) => {
  await open(page);
  // Saldo 20 con mínimo 10: normal.
  const row = saldos(page).getByTestId("tabla-fila").filter({ hasText: ART.sku });
  await expect(row).toContainText("Normal");
});

test("el detalle dice lo ausente en vez de dejarlo en blanco", async ({ page }) => {
  await open(page);
  await saldos(page).getByTestId("tabla-fila").filter({ hasText: ART.sku }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Punto de reposición");
  await expect(drawer).toContainText("—");
});

test("los filtros reducen la tabla y se limpian", async ({ page }) => {
  await open(page);
  await page.getByTestId("filtros-busqueda").fill(ART.sku);
  // **Acotado a la tabla que el filtro controla.** La página tiene dos tablas y
  // los movimientos no se filtran: contar `tabla-fila` sin acotar mezclaba las
  // dos y la aserción medía otra cosa.
  await expect(saldos(page).getByTestId("tabla-fila")).toHaveCount(1);

  await page.getByTestId("filtros-limpiar").click();
  await expect(page.getByTestId("filtros-limpiar")).toHaveCount(0);
});

for (const size of WIDTHS) {
  test(`sin desbordamiento horizontal a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("en móvil la tabla sigue siendo tabla y la operación es alcanzable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.locator("table").first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Bodega" }).first()).toBeHidden();
  await expect(page.getByTestId("registrar-ingreso")).toBeVisible();
});
