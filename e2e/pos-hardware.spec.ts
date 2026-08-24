import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-POS2.6 — impresora térmica, cajón y recibo.
 *
 * ## Sin hardware
 *
 * **Ninguna prueba necesita una impresora.** El puente local se sustituye
 * interceptando las peticiones que el terminal le hace: así se ejercita el
 * camino completo —recibo del servidor, bytes ESC/POS, envío— y se puede decidir
 * si el falso responde bien, mal o no responde.
 *
 * ## Lo que de verdad importa probar
 *
 * Que **un fallo de impresora no toque la venta**. Ese es el modo de fallo caro
 * de un mostrador: si imprimir mal invitara a repetir el cobro, se duplicarían
 * ventas. Aquí se prueba con la venta ya persistida y el inventario ya movido.
 */
test.describe.configure({ mode: "serial" });

const VENTA = "/pos/venta";
const BRIDGE = "http://127.0.0.1:7777";
const ART = { sku: `${TAG}-HW`, name: "Articulo de hardware", price: 250 };

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
  const delta = 500 - balance.quantity.toNumber();
  if (delta !== 0) {
    await prisma.posInventoryMovement.create({
      data: {
        warehouseId: warehouse.id,
        productId: product.id,
        type: "AJUSTE",
        quantity: delta,
        quantityBefore: balance.quantity,
        quantityAfter: 500,
        reason: `${TAG} carga para la suite de hardware`,
        createdByUserId: cashier.id,
      },
    });
    await prisma.posInventory.update({ where: { id: balance.id }, data: { quantity: 500 } });
  }
  return { warehouse, product };
}

/** Trabajos que el terminal envió al puente durante la prueba. */
type Job = { path: string; bytes: number[] };

/**
 * Sustituye al puente local.
 *
 * `mode` decide qué contesta: `ok` imprime, `printer` devuelve un fallo del
 * dispositivo, y `down` corta la conexión como si el servicio no corriera.
 */
async function fakeBridge(page: Page, mode: "ok" | "printer" | "down") {
  const jobs: Job[] = [];
  await page.route(`${BRIDGE}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (mode === "down") {
      await route.abort("connectionrefused");
      return;
    }
    if (url.pathname === "/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, configured: true }),
      });
      return;
    }
    const body = route.request().postDataJSON() as { bytes?: number[] };
    jobs.push({ path: url.pathname, bytes: body?.bytes ?? [] });
    await route.fulfill({
      status: mode === "printer" ? 502 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        mode === "printer"
          ? { ok: false, error: "La impresora no respondió." }
          : { ok: true },
      ),
    });
  });
  return jobs;
}

/** Enciende la impresora en este terminal, como haría el cajero. */
async function enablePrinter(page: Page) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key as string, value as string),
    [
      "motomas_pos_printer",
      JSON.stringify({ enabled: true, bridgeUrl: BRIDGE, paperWidth: 42, token: "" }),
    ],
  );
}

async function openTerminal(page: Page) {
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

async function sell(page: Page) {
  await page.getByLabel("Buscar artículo").fill(ART.sku);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const row = page.getByTestId("pos-result-row").filter({ hasText: ART.sku });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole("button", { name: "Agregar" }).click();
  await page.getByRole("button", { name: "Agregar pago" }).click();
  await page.getByTestId("pos-payments").getByLabel("Forma 1").selectOption("EFECTIVO");
  await page.getByTestId("pos-payments").getByLabel("Monto 1").fill("250");
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 30_000 });
}

const decode = (bytes: number[]) => String.fromCharCode(...bytes);

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await seed();
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
 * Estado y configuración
 * ------------------------------------------------------------------------ */

test("sin configurar, la impresora no se declara conectada", async ({ page }) => {
  await openTerminal(page);
  // **No se presume nada.** El estado inicial es «sin comprobar», no «conectada».
  await expect(page.getByTestId("pos-impresora-estado")).toHaveText("Sin comprobar");

  await page.getByTestId("pos-impresora-comprobar").click();
  await expect(page.getByTestId("pos-impresora-estado")).toHaveText("Desactivada");
});

test("con el puente vivo, se declara conectada tras comprobarlo", async ({ page }) => {
  await enablePrinter(page);
  await fakeBridge(page, "ok");
  await openTerminal(page);

  await page.getByTestId("pos-impresora-comprobar").click();
  await expect(page.getByTestId("pos-impresora-estado")).toHaveText("Conectada", {
    timeout: 15_000,
  });
});

test("si el puente no corre, lo dice y no miente", async ({ page }) => {
  await enablePrinter(page);
  await fakeBridge(page, "down");
  await openTerminal(page);

  await page.getByTestId("pos-impresora-comprobar").click();
  await expect(page.getByTestId("pos-impresora-estado")).toHaveText("No disponible", {
    timeout: 15_000,
  });
});

test("la configuración es local y no toca el negocio", async ({ page }) => {
  await enablePrinter(page);
  await openTerminal(page);
  await page.getByTestId("pos-impresora-config").click();

  await expect(page.getByTestId("pos-impresora-form")).toBeVisible();
  await page.getByTestId("pos-impresora-ancho").selectOption("32");

  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("motomas_pos_printer") ?? "{}"),
  );
  expect(stored.paperWidth).toBe(32);
  // No hay ningún control de sucursal ni de permisos en esta tarjeta.
  await expect(page.getByTestId("pos-impresora").getByText(/sucursal/i)).toHaveCount(0);
});

/* ---------------------------------------------------------------------------
 * Prueba de impresión y cajón
 * ------------------------------------------------------------------------ */

test("la prueba de impresión llega al puente con bytes ESC/POS", async ({ page }) => {
  await enablePrinter(page);
  const jobs = await fakeBridge(page, "ok");
  await openTerminal(page);

  await page.getByTestId("pos-impresora-prueba").click();
  await expect(page.getByTestId("pos-impresora-mensaje")).toContainText("prueba", {
    timeout: 15_000,
  });

  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.path).toBe("/test");
  // `ESC @` inicializa, y `GS V` corta: el trabajo es ESC/POS de verdad.
  expect(jobs[0]!.bytes.slice(0, 2)).toEqual([0x1b, 0x40]);
  expect(decode(jobs[0]!.bytes)).toContain("MotoMas");
});

test("el cajón se abre con un pulso, y no imprime nada", async ({ page }) => {
  await enablePrinter(page);
  const jobs = await fakeBridge(page, "ok");
  await openTerminal(page);

  await page.getByTestId("pos-cajon-abrir").click();
  await expect(page.getByTestId("pos-impresora-mensaje")).toContainText("Cajón", {
    timeout: 15_000,
  });

  expect(jobs).toHaveLength(1);
  expect(jobs[0]!.path).toBe("/drawer");
  // `ESC p 0` es el pulso al conector del cajón.
  expect(jobs[0]!.bytes).toEqual([0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, 0xfa]);
});

test("abrir el cajón no toca ninguna venta", async ({ page }) => {
  const before = await prisma.posSale.count();
  await enablePrinter(page);
  await fakeBridge(page, "ok");
  await openTerminal(page);

  await page.getByTestId("pos-cajon-abrir").click();
  await expect(page.getByTestId("pos-impresora-mensaje")).toBeVisible({ timeout: 15_000 });
  expect(await prisma.posSale.count()).toBe(before);
});

test("un fallo del cajón se dice, sin exponer internos", async ({ page }) => {
  await enablePrinter(page);
  await fakeBridge(page, "printer");
  await openTerminal(page);

  await page.getByTestId("pos-cajon-abrir").click();
  const message = page.getByTestId("pos-impresora-mensaje");
  await expect(message).toBeVisible({ timeout: 15_000 });
  for (const leak of ["prisma", "Error:", "at ", "C:\\", "ENOENT", "cmd"]) {
    await expect(message).not.toContainText(leak);
  }
});

/* ---------------------------------------------------------------------------
 * El recibo, tras cobrar
 * ------------------------------------------------------------------------ */

test("cobrar imprime el recibo con los datos de la venta persistida", async ({ page }) => {
  await enablePrinter(page);
  const jobs = await fakeBridge(page, "ok");
  await openTerminal(page);
  await sell(page);

  await expect(page.getByTestId("pos-recibo-estado")).toContainText("impreso", {
    timeout: 30_000,
  });

  const print = jobs.find((job) => job.path === "/print");
  expect(print).toBeDefined();
  const text = decode(print!.bytes);

  const sale = await prisma.posSale.findFirstOrThrow({
    where: { branch: { code: MAPPED_BRANCH_CODE }, status: "COMPLETADA" },
    orderBy: { completedAt: "desc" },
  });
  // Lo impreso sale de la venta guardada, no del carrito del navegador.
  expect(text).toContain(sale.saleNumber);
  expect(text).toContain("250.00");
  expect(text).toContain("Efectivo");
  // **Y dice que no es una factura.**
  expect(text).toContain("Documento no fiscal");
  // Nada fiscal inventado.
  for (const invented of ["RUC", "CAI", "DGI", "Serie"]) {
    expect(text).not.toContain(invented);
  }
});

test("si la impresora falla, la venta queda igualmente registrada", async ({ page }) => {
  await enablePrinter(page);
  await fakeBridge(page, "printer");
  await openTerminal(page);

  const salesBefore = await prisma.posSale.count({ where: { status: "COMPLETADA" } });
  const movesBefore = await prisma.posInventoryMovement.count();
  await sell(page);

  // La venta se anunció como correcta…
  await expect(page.getByTestId("pos-sale-created")).toBeVisible();
  // …y el fallo de impresión se dice **aparte**.
  await expect(page.getByTestId("pos-recibo-estado")).toContainText(/impresora|imprimir/i, {
    timeout: 30_000,
  });

  // **Exactamente una venta y exactamente un movimiento.** Ni cero, ni dos.
  expect(await prisma.posSale.count({ where: { status: "COMPLETADA" } })).toBe(
    salesBefore + 1,
  );
  expect(await prisma.posInventoryMovement.count()).toBe(movesBefore + 1);

  const sale = await prisma.posSale.findFirstOrThrow({
    where: { branch: { code: MAPPED_BRANCH_CODE }, status: "COMPLETADA" },
    orderBy: { completedAt: "desc" },
    include: { payments: true },
  });
  expect(sale.payments).toHaveLength(1);
});

test("reintentar la impresión no crea otra venta ni otro pago", async ({ page }) => {
  await enablePrinter(page);
  await fakeBridge(page, "printer");
  await openTerminal(page);
  await sell(page);
  await expect(page.getByTestId("pos-recibo-estado")).toBeVisible({ timeout: 30_000 });

  const sales = await prisma.posSale.count({ where: { status: "COMPLETADA" } });
  const payments = await prisma.posPayment.count();
  const moves = await prisma.posInventoryMovement.count();

  await page.getByTestId("pos-recibo-reimprimir").click();
  await expect(page.getByTestId("pos-recibo-estado")).toBeVisible({ timeout: 30_000 });

  // Reimprimir es imprimir, no vender.
  expect(await prisma.posSale.count({ where: { status: "COMPLETADA" } })).toBe(sales);
  expect(await prisma.posPayment.count()).toBe(payments);
  expect(await prisma.posInventoryMovement.count()).toBe(moves);
});

test("con la impresora apagada, cobrar no intenta imprimir", async ({ page }) => {
  const jobs = await fakeBridge(page, "ok");
  await openTerminal(page);
  await sell(page);

  await expect(page.getByTestId("pos-sale-created")).toBeVisible();
  // Ni trabajo enviado, ni aviso de recibo: apagada es apagada.
  expect(jobs.filter((job) => job.path === "/print")).toHaveLength(0);
});

/* ---------------------------------------------------------------------------
 * Terminal bancario: independiente
 * ------------------------------------------------------------------------ */

test("TARJETA sigue siendo un método, y el POS no afirma autorización", async ({
  page,
}) => {
  await enablePrinter(page);
  await fakeBridge(page, "ok");
  await openTerminal(page);

  await page.getByRole("button", { name: "Agregar pago" }).click();
  const method = page.getByTestId("pos-payments").getByLabel("Forma 1");
  await method.selectOption("TARJETA");
  await expect(method).toHaveValue("TARJETA");

  // **El POS no dice haber verificado nada con el banco**, porque no lo hizo:
  // el datáfono es independiente.
  const body = await page.getByRole("main").innerText();
  for (const claim of ["autorizado por el banco", "aprobado por el banco", "Autorización"]) {
    expect(body).not.toContain(claim);
  }
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
  test(`el terminal con impresora cabe a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await enablePrinter(page);
    await openTerminal(page);
    await page.getByTestId("pos-impresora-config").click();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
