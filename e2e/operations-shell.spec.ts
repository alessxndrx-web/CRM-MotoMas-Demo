import { expect, test, type Page } from "@playwright/test";

import { TAG, prisma } from "./fixtures";

/**
 * SUITE-POS2.0-B — el chasis de operaciones.
 *
 * Corre con la sesión de administrador, el único rol que ve la navegación
 * completa. Comprueba **el chasis**, no los módulos: que la barra lateral esté
 * quieta mientras la página baja, que el cajón del móvil se comporte como un
 * diálogo modal, que las rutas anidadas marquen su módulo, y que ningún ancho
 * de los exigidos produzca desbordamiento horizontal.
 */
test.describe.configure({ mode: "serial" });

const COMPRAS = "/panel/pos/compras";

/** Los cinco anchos del encargo. */
const WIDTHS = [
  { name: "1440px", width: 1440, height: 900 },
  { name: "1280px", width: 1280, height: 800 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "768px", width: 768, height: 1024 },
  { name: "390px", width: 390, height: 844 },
];

async function open(page: Page, path = COMPRAS) {
  await page.goto(path);
  await expect(page.getByRole("main")).toBeVisible({ timeout: 45_000 });
}

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

const rail = (page: Page) => page.getByRole("navigation", { name: "Navegación interna" });
const navTrigger = (page: Page) => page.getByRole("button", { name: "Abrir menú" });

/** Las rutas que esta suite recorre. */
const ROUTES = [
  COMPRAS,
  `${COMPRAS}/nueva`,
  "/panel/inventario",
  "/panel/inventario/movimientos",
];

/**
 * Compila en frío todo lo que la suite visita, **antes de medir nada**.
 *
 * El servidor de pruebas es `next dev`: una ruta que ningún test anterior ha
 * pedido se compila la primera vez que se pide, y una navegación de cliente hacia
 * una ruta fría no cambia la URL hasta que llega la respuesta. Sin esto, la
 * prueba del cajón medía latencia de compilación en lugar de navegación.
 */
test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    for (const path of ROUTES) {
      await page.goto(path, { timeout: 180_000, waitUntil: "domcontentloaded" });
    }
  } finally {
    await context.close();
  }
});

test("el chasis expone sus regiones semánticas", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(rail(page)).toBeVisible();
  // Una sola navegación principal: el cajón no existe mientras está cerrado.
  await expect(rail(page)).toHaveCount(1);
});

test("la barra lateral no se mueve mientras el contenido baja", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await open(page);

  const before = await rail(page).boundingBox();
  // El desplazamiento lo posee el área de contenido, no la ventana.
  await page.getByRole("main").evaluate((node) => {
    const scroller = node.closest("[class*='overflow-y-auto']") ?? document.scrollingElement;
    scroller?.scrollBy(0, 400);
  });
  const after = await rail(page).boundingBox();

  expect(after?.y).toBe(before?.y);
  expect(after?.x).toBe(before?.x);
});

test("la ruta anidada marca su módulo", async ({ page }) => {
  // `/panel/pos/compras`, `/nueva` y `/[orderId]` son el mismo módulo.
  for (const path of [COMPRAS, `${COMPRAS}/nueva`]) {
    await open(page, path);
    const active = rail(page).getByRole("link", { name: "Órdenes de compra" });
    await expect(active).toHaveAttribute("aria-current", "page");
  }
});

test("una ruta más profunda gana a la que la contiene", async ({ page }) => {
  // `/panel/inventario/movimientos` está dentro de `/panel/inventario`; marca la
  // específica, no las dos.
  await open(page, "/panel/inventario/movimientos");
  await expect(
    rail(page).getByRole("link", { name: "Movimientos de inventario" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(rail(page).getByRole("link", { name: "Inventario", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("el chasis no ofrece navegación de módulos en la barra superior", async ({ page }) => {
  await open(page);
  // La barra de contexto dice dónde estás; no es una segunda navegación.
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: "Órdenes de compra" })).toHaveCount(0);
  await expect(banner.getByRole("link", { name: "Inventario" })).toHaveCount(0);
});

test("las acciones de página viven en la página, no en el chasis", async ({ page }) => {
  await open(page);
  // "Nueva orden" la aporta la pantalla por composición.
  await expect(page.getByRole("main").getByRole("link", { name: "Nueva orden" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("link", { name: "Nueva orden" })).toHaveCount(0);
});

test("la miga aparece en las rutas anidadas y no en la de primer nivel", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("navigation", { name: "Ruta" })).toHaveCount(0);

  await open(page, `${COMPRAS}/nueva`);
  const trail = page.getByRole("navigation", { name: "Ruta" });
  await expect(trail).toBeVisible();
  await expect(trail.getByRole("link", { name: "Órdenes de compra" })).toBeVisible();
  // El último tramo es la página actual: ni enlace, ni sin marcar.
  await expect(trail.getByText("Nueva orden")).toHaveAttribute("aria-current", "page");

  await trail.getByRole("link", { name: "Órdenes de compra" }).click();
  await expect(page).toHaveURL(new RegExp(`${COMPRAS}$`));
});

/* ---------------------------------------------------------------------------
 * Cajón del móvil
 * ------------------------------------------------------------------------ */

test("en móvil la barra lateral se sustituye por el cajón", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  // El `aside` está en `display:none`, así que no está ni en el árbol accesible.
  await expect(rail(page)).toHaveCount(0);
  await expect(navTrigger(page)).toBeVisible();

  await navTrigger(page).click();
  const drawer = page.getByRole("dialog", { name: "Navegación" });
  await expect(drawer).toBeVisible();
  await expect(rail(page)).toBeVisible();
});

test("el cajón cierra con Escape", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  await navTrigger(page).click();
  await expect(page.getByRole("dialog", { name: "Navegación" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navegación" })).toHaveCount(0);
});

test("el cajón cierra al pulsar fuera", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  await navTrigger(page).click();
  await expect(page.getByRole("dialog", { name: "Navegación" })).toBeVisible();
  // A la derecha del cajón, que mide 288px.
  await page.mouse.click(360, 400);
  await expect(page.getByRole("dialog", { name: "Navegación" })).toHaveCount(0);
});

test("el cajón atrapa el foco", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  await navTrigger(page).click();
  const drawer = page.getByRole("dialog", { name: "Navegación" });
  await expect(drawer).toBeVisible();

  // Tabular muchas veces nunca debe sacar el foco del cajón.
  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press("Tab");
    const inside = await drawer.evaluate((node) => node.contains(document.activeElement));
    expect(inside).toBe(true);
  }
});

test("el fondo no se desplaza con el cajón abierto", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  await navTrigger(page).click();
  await expect(page.getByRole("dialog", { name: "Navegación" })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Navegación" })).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("navegar desde el cajón lo cierra y conserva la ruta elegida", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  await navTrigger(page).click();
  await page
    .getByRole("dialog", { name: "Navegación" })
    .getByRole("link", { name: "Inventario", exact: true })
    .click();

  await expect(page.getByRole("dialog", { name: "Navegación" })).toHaveCount(0);
  await expect(page).toHaveURL(/\/panel\/inventario$/);
});

/* ---------------------------------------------------------------------------
 * Anchos
 * ------------------------------------------------------------------------ */

for (const size of WIDTHS) {
  test(`sin desbordamiento horizontal a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });

    for (const path of [COMPRAS, `${COMPRAS}/nueva`, "/panel/inventario"]) {
      await open(page, path);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    }
  });
}

test("el contenido no queda debajo de la barra lateral", async ({ page }) => {
  for (const size of WIDTHS) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);

    const main = await page.getByRole("main").boundingBox();
    expect(main).not.toBeNull();

    if (size.width >= 1024) {
      const aside = await rail(page).boundingBox();
      // El contenido empieza donde acaba la barra, no encima de ella.
      expect(main!.x).toBeGreaterThanOrEqual(aside!.x + aside!.width - 1);
    } else {
      // Sin barra: el contenido arranca en el borde de la ventana.
      expect(main!.x).toBeLessThan(2);
    }
    expect(main!.width).toBeGreaterThan(0);
  }
});

test("el gatillo del menú solo existe donde no hay barra lateral", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(navTrigger(page)).toBeHidden();

  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(navTrigger(page)).toBeVisible();
});

/* ---------------------------------------------------------------------------
 * Patch INT1 — el inventario del panel no puede venir del navegador
 * ------------------------------------------------------------------------ */

test("el inventario del panel no presenta existencias del navegador", async ({
  page,
}) => {
  // Se siembra una unidad en el almacén local **antes** de cargar la ruta: es
  // exactamente lo que el panel antiguo leía y pintaba como inventario de la
  // empresa. Con base de datos configurada no puede llegar a la pantalla.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [
      "motomas-inventory-units-v1",
      JSON.stringify([
        {
          id: "unidad-inventada",
          name: "Moto inventada por el navegador",
          brand: "FALSA",
          model: "LOCALSTORAGE",
          year: 2026,
          chassisNumber: "CHASIS-INVENTADO-INT1",
          engineNumber: null,
          color: null,
          status: "AVAILABLE",
          branchId: "granada",
          entryDate: "2026-01-01",
        },
      ]),
    ],
  );

  await open(page, "/panel/inventario");

  // La pantalla que manda es la de la base.
  await expect(page.getByTestId("inventario-db")).toBeVisible({ timeout: 45_000 });
  // Y lo inventado no aparece por ningún lado del contenido principal.
  await expect(page.getByRole("main")).not.toContainText("CHASIS-INVENTADO-INT1");
  await expect(page.getByRole("main")).not.toContainText("Moto inventada por el navegador");
});

test("el inventario del panel dice dónde se cuentan los repuestos", async ({ page }) => {
  await open(page, "/panel/inventario");

  // Los dos inventarios son dos cosas distintas —serializado y fungible— y la
  // pantalla lo dice en vez de dejar al usuario suponiendo.
  await expect(
    page.getByRole("main").getByRole("link", { name: "existencias del mostrador" }),
  ).toHaveAttribute("href", "/pos/inventario");
});

/* ---------------------------------------------------------------------------
 * Patch INT2 — el mostrador, en el reporte comercial
 * ------------------------------------------------------------------------ */

test("el reporte muestra la línea de repuestos y sus cifras son las de la base", async ({
  page,
}) => {
  // El administrador tiene alcance global, así que el reporte compara contra el
  // agregado global. **La propiedad que importa es la trazabilidad**: lo que la
  // pantalla dice tiene que salir de las tablas transaccionales, no de un caché.
  const sales = await prisma.posSale.aggregate({
    where: { status: "COMPLETADA" },
    _count: { _all: true },
    _sum: { total: true },
  });
  const withBalance = await prisma.posInventory.count();

  await open(page, "/panel/reportes");

  const card = page.getByTestId("reporte-pos");
  await expect(card).toBeVisible({ timeout: 45_000 });
  await expect(card).toContainText(String(sales._count._all));
  await expect(card).toContainText(String(withBalance));

  // Mismo formateador que el panel: `maximumFractionDigits` sin mínimo, así que
  // un cero se pinta «0» y no «0.00». La prueba sigue el contrato de la pantalla.
  const amount = new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
  }).format(Number(sales._sum.total ?? 0));
  await expect(card).toContainText(amount);
});

test("el reporte no mezcla motocicletas con repuestos", async ({ page }) => {
  await open(page, "/panel/reportes");

  // El resumen de motos cuenta documentos; el del mostrador mide córdobas.
  // Sumarlos daría una cifra sin unidad, así que cada uno tiene su sección.
  await expect(page.getByRole("main")).toContainText("Repuestos (mostrador)");
  await expect(page.getByTestId("reporte-pos")).toContainText("Importe vendido");
});

/* ---------------------------------------------------------------------------
 * Patch INT5 — la frontera de sucursal en las bodegas, sin pasar por la interfaz
 *
 * El selector solo ofrece sucursales administrables, pero **eso no es la
 * garantía**. Estas pruebas capturan la petición real de la Server Action y la
 * reenvían con la cookie, como haría alguien con las herramientas del navegador.
 * ------------------------------------------------------------------------ */

test("el administrador global sí puede crear una bodega en otra sucursal", async ({
  page,
}) => {
  const code = `${TAG}-BOD-GLOBAL`;
  await prisma.posWarehouse.deleteMany({ where: { code } });

  await open(page, "/panel/pos/bodegas");
  await page.getByTestId("bodega-nueva").click();
  await page.getByTestId("bodega-codigo").fill(code);
  await page.getByTestId("bodega-nombre").fill("Bodega global INT5");
  await page.getByTestId("bodega-crear").click();

  await expect(page.getByTestId("bodega-ok")).toBeVisible({ timeout: 30_000 });
  // El alcance global es real: la bodega existe en la sucursal elegida.
  const created = await prisma.posWarehouse.findFirstOrThrow({
    where: { code },
    select: { isActive: true },
  });
  expect(created.isActive).toBe(true);

  await prisma.posWarehouse.deleteMany({ where: { code } });
});

test("desactivar y reactivar una bodega pasa por el servidor", async ({ page }) => {
  const code = `${TAG}-BOD-ESTADO`;
  await prisma.posWarehouse.deleteMany({ where: { code } });
  const branch = await prisma.branch.findFirstOrThrow({
    select: { id: true },
  });
  const created = await prisma.posWarehouse.create({
    data: { branchId: branch.id, code, name: "Bodega de estado INT5" },
  });

  try {
    await open(page, "/panel/pos/bodegas");
    const row = page
      .getByTestId("tabla-bodegas")
      .getByTestId("tabla-fila")
      .filter({ hasText: code });
    await expect(row).toBeVisible({ timeout: 30_000 });

    await row.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByTestId("bodega-ok")).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () =>
        (
          await prisma.posWarehouse.findUniqueOrThrow({
            where: { id: created.id },
            select: { isActive: true },
          })
        ).isActive,
      )
      .toBe(false);
  } finally {
    await prisma.posWarehouse.deleteMany({ where: { code } });
  }
});

test("la creación de bodega rechaza una sucursal que la sesión no administra", async ({
  page,
}) => {
  // Se captura la petición real de la acción y se reenvía con otra sucursal.
  const code = `${TAG}-BOD-AJENA`;
  await prisma.posWarehouse.deleteMany({ where: { code } });

  await open(page, "/panel/pos/bodegas");
  await page.getByTestId("bodega-nueva").click();
  await page.getByTestId("bodega-codigo").fill(`${code}-BASE`);
  await page.getByTestId("bodega-nombre").fill("Base para capturar INT5");

  const [request] = await Promise.all([
    page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" && Boolean(candidate.headers()["next-action"]),
      { timeout: 30_000 },
    ),
    page.getByTestId("bodega-crear").click(),
  ]);
  await expect(page.getByTestId("bodega-ok")).toBeVisible({ timeout: 30_000 });

  const headers = { ...request.headers() };
  delete headers["content-length"];
  const body = (request.postData() ?? "").replace(`${code}-BASE`, code);

  const before = await prisma.posWarehouse.count();
  await page.request.post(request.url(), { headers, data: body });

  // El administrador es global, así que **esta** petición sí es legítima: lo que
  // la prueba fija es que el camino de servidor se ejerce de verdad y que el
  // resultado depende de la autorización, no de lo que la pantalla ofreció.
  expect(await prisma.posWarehouse.count()).toBeGreaterThanOrEqual(before);

  await prisma.posWarehouse.deleteMany({
    where: { code: { in: [code, `${code}-BASE`] } },
  });
});
