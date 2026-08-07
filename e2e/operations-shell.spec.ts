import { expect, test, type Page } from "@playwright/test";

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
