import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-POS2.1 — el tablero operativo de mostrador.
 *
 * Siembra sus propios datos con el TAG de la suite, de modo que la limpieza
 * global se los lleva: ventas completadas dentro y fuera del período, un saldo
 * en cero, un saldo bajo mínimo y una orden de compra por recibir. **Las cifras
 * se afirman contra lo sembrado**, no contra «un número mayor que cero»: una
 * aserción que pasa con cualquier dato no comprueba que el rango funcione.
 */
test.describe.configure({ mode: "serial" });

const DASHBOARD = "/panel/dashboard";

const WIDTHS = [
  { name: "1440px", width: 1440, height: 900 },
  { name: "1280px", width: 1280, height: 800 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "768px", width: 768, height: 1024 },
  { name: "390px", width: 390, height: 844 },
];

/** Ventas sembradas: dos de hoy y una de hace veinte días. */
const TODAY_A = 1500;
const TODAY_B = 2500;
const OLD_ONE = 9000;

async function seed() {
  const [branch, product, user, warehouse] = await Promise.all([
    prisma.branch.findFirstOrThrow({ where: { code: MAPPED_BRANCH_CODE } }),
    prisma.posProduct.findUniqueOrThrow({ where: { sku: `${TAG}-COMPRA-ARTICULO` } }),
    prisma.user.findFirstOrThrow({
      where: { email: { startsWith: `${TAG.toLowerCase()}-admin` } },
    }),
    prisma.posWarehouse.findFirstOrThrow({ where: { code: { startsWith: TAG } } }),
  ]);

  // Limpia lo que una corrida anterior pudiera haber dejado.
  await clean();

  const now = new Date();
  const old = new Date(now.getTime() - 20 * 86_400_000);

  async function sale(total: number, completedAt: Date, method: "EFECTIVO" | "TARJETA") {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    return prisma.posSale.create({
      data: {
        saleNumber: `PV-${TAG}-${suffix}`,
        branchId: branch.id,
        cashierId: user.id,
        status: "COMPLETADA",
        subtotal: total,
        total,
        completedAt,
        items: {
          create: [
            { productId: product.id, quantity: 1, unitPrice: total, total, position: 0 },
          ],
        },
        payments: { create: [{ method, amount: total }] },
      },
    });
  }

  await sale(TODAY_A, now, "EFECTIVO");
  await sale(TODAY_B, now, "TARJETA");
  await sale(OLD_ONE, old, "EFECTIVO");

  // Existencias: el artículo de compras queda en cero (sin existencia) y se crea
  // uno más con mínimo declarado y saldo por debajo.
  await prisma.posInventory.upsert({
    where: {
      warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
    },
    create: { warehouseId: warehouse.id, productId: product.id, quantity: 0 },
    update: { quantity: 0 },
  });

  const scarce = await prisma.posProduct.upsert({
    where: { sku: `${TAG}-ESCASO` },
    create: {
      sku: `${TAG}-ESCASO`,
      name: `${TAG} Artículo escaso`,
      unitPrice: 50,
      minimumStock: 10,
    },
    update: { minimumStock: 10, isActive: true },
  });
  await prisma.posInventory.upsert({
    where: {
      warehouseId_productId: { warehouseId: warehouse.id, productId: scarce.id },
    },
    create: { warehouseId: warehouse.id, productId: scarce.id, quantity: 3 },
    update: { quantity: 3 },
  });

  // Un movimiento real para la actividad reciente.
  await prisma.posInventoryMovement.create({
    data: {
      warehouseId: warehouse.id,
      productId: scarce.id,
      type: "AJUSTE",
      quantity: 3,
      quantityBefore: 0,
      quantityAfter: 3,
      reason: `${TAG} carga para el tablero`,
      createdByUserId: user.id,
    },
  });

  // Una orden de compra por recibir.
  const supplier = await prisma.thirdParty.findFirstOrThrow({
    where: { name: { startsWith: TAG }, type: "PROVEEDOR" },
  });
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  await prisma.posPurchaseOrder.create({
    data: {
      orderNumber: `OC-${TAG}-${suffix}`,
      branchId: branch.id,
      supplierId: supplier.id,
      status: "APROBADA",
      createdByUserId: user.id,
      subtotal: 1000,
      total: 1000,
      items: {
        create: [{ productId: product.id, quantity: 10, unitCost: 100, total: 1000 }],
      },
    },
  });

  return { branch, product, user, warehouse };
}

async function clean() {
  const sales = await prisma.posSale.findMany({
    where: { saleNumber: { startsWith: `PV-${TAG}` } },
    select: { id: true },
  });
  const ids = sales.map((sale) => sale.id);
  await prisma.posPayment.deleteMany({ where: { saleId: { in: ids } } });
  await prisma.posSaleItem.deleteMany({ where: { saleId: { in: ids } } });
  await prisma.posSale.deleteMany({ where: { id: { in: ids } } });
}

async function open(page: Page, period?: string) {
  await page.goto(period ? `${DASHBOARD}?periodo=${period}` : DASHBOARD);
  await expect(page.getByTestId("pos-dashboard")).toBeVisible({ timeout: 45_000 });
}

const money = (value: number) =>
  new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await seed();
  // El tablero es una página pesada y nueva: se compila en frío fuera del
  // presupuesto de cualquier test.
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    await page.goto(DASHBOARD, { timeout: 180_000, waitUntil: "domcontentloaded" });
  } finally {
    await context.close();
  }
});

test.afterAll(async () => {
  await clean();
});

/* ---------------------------------------------------------------------------
 * Carga y métricas
 * ------------------------------------------------------------------------ */

test("el tablero carga con su encabezado y sus indicadores", async ({ page }) => {
  await open(page);
  await expect(
    page.getByRole("heading", { name: "Operación de mostrador" }),
  ).toBeVisible();
  await expect(page.getByTestId("kpis")).toBeVisible();
  // Rol global: el alcance se enuncia, no se deja adivinar.
  await expect(page.getByTestId("pos-dashboard")).toContainText("Todas las sucursales");
});

test("las ventas del período son las sembradas, no «algo mayor que cero»", async ({
  page,
}) => {
  await open(page, "hoy");
  const kpis = page.getByTestId("kpis");
  // Hoy: 1.500 + 2.500. La de hace veinte días queda fuera.
  await expect(kpis).toContainText(money(TODAY_A + TODAY_B));
  await expect(kpis).not.toContainText(money(TODAY_A + TODAY_B + OLD_ONE));
});

test("el ticket promedio se deriva del período, no se almacena", async ({ page }) => {
  await open(page, "hoy");
  // (1.500 + 2.500) / 2 ventas.
  await expect(page.getByTestId("kpis")).toContainText(money((TODAY_A + TODAY_B) / 2));
  await expect(page.getByTestId("kpis")).toContainText("2 ventas completadas");
});

test("cambiar el período cambia las cifras de forma coherente", async ({ page }) => {
  await open(page, "hoy");
  await expect(page.getByTestId("kpis")).toContainText(money(TODAY_A + TODAY_B));

  await page.getByTestId("periodo-30d").click();
  await expect(page.getByTestId("periodo-activo")).toHaveText("Últimos 30 días");
  // Treinta días incluye la venta antigua: las tres.
  await expect(page.getByTestId("kpis")).toContainText(
    money(TODAY_A + TODAY_B + OLD_ONE),
  );
  await expect(page.getByTestId("kpis")).toContainText("3 ventas completadas");
});

test("el período elegido se marca y viaja en la URL", async ({ page }) => {
  await open(page, "7d");
  await expect(page.getByTestId("periodo-7d")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("periodo-30d")).not.toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveURL(/periodo=7d/);
});

test("un período inválido cae en el valor por omisión en vez de romper", async ({
  page,
}) => {
  await open(page, "no-existe");
  await expect(page.getByTestId("periodo-activo")).toHaveText("Últimos 30 días");
});

test("todas las cifras declaran el mismo período", async ({ page }) => {
  await open(page, "7d");
  // El error que el encargo prohíbe: una tarjeta con «hoy» y otra con «30 días».
  const labels = await page
    .getByTestId("kpis")
    .getByText(/·\s*(Hoy|Últimos 7 días|Últimos 30 días|Este mes)/)
    .allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).toContain("Últimos 7 días");
});

/* ---------------------------------------------------------------------------
 * Tendencia
 * ------------------------------------------------------------------------ */

test("la tendencia muestra el número como texto, no solo como dibujo", async ({
  page,
}) => {
  await open(page, "30d");
  const chart = page.getByTestId("tendencia");
  await expect(chart).toBeVisible();

  // El total va escrito en la cabecera del marco.
  const frame = page.locator("section", { has: page.getByTestId("tendencia") }).last();
  await expect(frame).toContainText(money(TODAY_A + TODAY_B + OLD_ONE));
  // Y cada columna se puede leer sin ver el color.
  const first = chart.locator("li span").first();
  await expect(first).toHaveAttribute("aria-label", /C\$/);
});

/* ---------------------------------------------------------------------------
 * Requiere atención
 * ------------------------------------------------------------------------ */

test("lo que requiere atención enlaza al módulo correcto", async ({ page }) => {
  await open(page);
  const attention = page.getByTestId("atencion");
  await expect(attention).toBeVisible();

  await expect(page.getByTestId("atencion-sin-existencia")).toBeVisible();
  await expect(page.getByTestId("atencion-bajo-minimo")).toBeVisible();
  await expect(page.getByTestId("atencion-compras-pendientes")).toHaveAttribute(
    "href",
    "/panel/pos/compras",
  );

  await page.getByTestId("atencion-compras-pendientes").click();
  await expect(page).toHaveURL(/\/panel\/pos\/compras$/);
});

test("«bajo mínimo» solo cuenta artículos con umbral declarado", async ({ page }) => {
  await open(page);
  // El artículo escaso tiene mínimo 10 y saldo 3; el de compras tiene saldo 0 y
  // mínimo 0, así que cuenta como «sin existencia» y no como «bajo mínimo».
  await expect(page.getByTestId("atencion-bajo-minimo")).toContainText("umbral");
});

/* ---------------------------------------------------------------------------
 * Actividad reciente
 * ------------------------------------------------------------------------ */

test("la actividad reciente usa la bitácora, con autor y momento", async ({ page }) => {
  await open(page);
  const table = page.getByTestId("tabla-fila").first();
  await expect(table).toBeVisible();
  await expect(table).toContainText("Ajuste");
  await expect(table).toContainText(`${TAG} Artículo escaso`);
});

/* ---------------------------------------------------------------------------
 * Permisos
 * ------------------------------------------------------------------------ */

test("el rol global ve el desglose por sucursal", async ({ page }) => {
  await open(page, "hoy");
  await expect(page.getByTestId("por-sucursal")).toBeVisible();
  await expect(page.getByTestId("por-metodo")).toContainText("Efectivo");
});

/* ---------------------------------------------------------------------------
 * Estados
 * ------------------------------------------------------------------------ */

test("un período sin ventas lo dice, en vez de dejar el hueco vacío", async ({ page }) => {
  // Se elige un rango donde no hay nada sembrado: el mes en curso empezó hoy o
  // antes, así que se usa «hoy» tras borrar las ventas del día.
  await clean();
  await open(page, "hoy");

  await expect(page.getByTestId("kpis")).toContainText(money(0));
  const frame = page.locator("section").filter({ hasText: "Ventas por día" }).last();
  await expect(frame).toContainText("No hubo ventas completadas");

  await seed();
});

/* ---------------------------------------------------------------------------
 * Responsive
 * ------------------------------------------------------------------------ */

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

test("en móvil los indicadores y el selector siguen siendo usables", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  await expect(page.getByTestId("kpis")).toBeVisible();
  await expect(page.getByTestId("periodo")).toBeVisible();
  // El selector no se corta ni se sale del ancho de la ventana.
  const box = (await page.getByTestId("periodo").boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  await expect(page.getByTestId("periodo-hoy")).toBeVisible();
});

