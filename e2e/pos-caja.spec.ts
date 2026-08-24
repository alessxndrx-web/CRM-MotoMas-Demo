import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, UNMAPPED_BRANCH_CODE, prisma } from "./fixtures";

/**
 * SUITE-CB4-B — el cajón del mostrador de punta a punta.
 *
 * ## Qué vigila que el smoke no puede
 *
 * `prisma/smoke/cb4b-pos-cash-shift.ts` prueba la aritmética y las carreras
 * atacando la base directamente. Lo que **no** puede es construir la cookie
 * firmada de mostrador, así que la autorización se comprueba aquí — incluida la
 * denegación cruzada **saltándose la interfaz**, reenviando la acción de
 * servidor con el id de un turno de otra sucursal.
 *
 * ## Contra la base, no contra la pantalla
 *
 * Cada cifra que la pantalla afirma se contrasta con lo persistido. Una pantalla
 * que enseña lo que ella misma calculó no demuestra nada de un sistema de
 * dinero.
 */
test.describe.configure({ mode: "serial" });

const CAJA = "/pos/caja";
const VENTA = "/pos/venta";

const ART = { sku: `${TAG}-CAJA-ART`, name: "Artículo de caja", price: 500 };

type CapturedAction = {
  url: string;
  headers: Record<string, string>;
  body: string;
};

let foreignShiftId = "";

test.beforeAll(async () => {
  test.setTimeout(300_000);

  const warehouse = await prisma.posWarehouse.findFirstOrThrow({
    where: { code: { startsWith: TAG } },
  });
  const product = await prisma.posProduct.upsert({
    where: { sku: ART.sku },
    update: { name: ART.name, unitPrice: ART.price, isActive: true },
    create: { sku: ART.sku, name: ART.name, unitPrice: ART.price },
  });
  const balance = await prisma.posInventory.upsert({
    where: {
      warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
    },
    update: {},
    create: { warehouseId: warehouse.id, productId: product.id },
  });
  await prisma.posInventory.update({
    where: { id: balance.id },
    data: { quantity: 500 },
  });

  // Un turno **de otra sucursal**, con su propio operador. Es lo que permite
  // distinguir «el servidor no lo encontró» de «el servidor no lo dejó».
  const foreign = await prisma.branch.findFirstOrThrow({
    where: { code: UNMAPPED_BRANCH_CODE },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  await cleanupCaja();
  const foreignOperator = await prisma.posOperator.create({
    data: {
      username: `${TAG.toLowerCase()}-caja-ajeno`,
      passwordHash: "x",
      userId: user.id,
      branchId: foreign.id,
    },
  });
  const shift = await prisma.posCashShift.create({
    data: {
      branchId: foreign.id,
      operatorId: foreignOperator.id,
      openedByUserId: user.id,
      openingFloat: 1000,
      notes: `${TAG}-AJENO`,
    },
  });
  foreignShiftId = shift.id;
});

async function cleanupCaja() {
  /*
   * Patch CB4-D3 — **las ventas antes que los turnos**.
   *
   * Desde D3, `PosSale.shiftId` apunta al turno con `RESTRICT`, así que borrar un
   * turno con ventas atribuidas falla. Se desprende la atribución en vez de
   * borrar las ventas: son de esta suite y el teardown global las retirará por
   * su producto, pero borrarlas aquí escondería un fallo de atribución bajo una
   * limpieza. Poner `shiftId` a `null` deja la venta intacta y libera el turno.
   */
  await prisma.posSale.updateMany({
    where: {
      shift: {
        OR: [
          { notes: { startsWith: TAG } },
          { operator: { username: { startsWith: TAG.toLowerCase() } } },
        ],
      },
    },
    data: { shiftId: null },
  });
  await prisma.posCashMovement.deleteMany({
    where: { shift: { notes: { startsWith: TAG } } },
  });
  await prisma.posCashShift.deleteMany({ where: { notes: { startsWith: TAG } } });
  await prisma.posCashMovement.deleteMany({
    where: { shift: { operator: { username: { startsWith: TAG.toLowerCase() } } } },
  });
  await prisma.posCashShift.deleteMany({
    where: { operator: { username: { startsWith: TAG.toLowerCase() } } },
  });
  await prisma.posOperator.deleteMany({
    where: { username: { startsWith: `${TAG.toLowerCase()}-caja` } },
  });
}

test.afterAll(async () => {
  await cleanupCaja();
});

async function openCaja(page: Page) {
  await page.goto(CAJA);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Caja" }),
  ).toBeVisible({ timeout: 45_000 });
}

/** El turno abierto del operador del arnés, leído de la base. */
async function currentShift() {
  return prisma.posCashShift.findFirst({
    where: {
      status: "ABIERTO",
      branch: { code: MAPPED_BRANCH_CODE },
      operator: { username: { not: { startsWith: `${TAG.toLowerCase()}-caja` } } },
    },
    include: { movements: true },
    orderBy: { openedAt: "desc" },
  });
}

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
  delete headers["content-length"];
  return { url: request.url(), headers, body: request.postData() ?? "" };
}

/* ---------------------------------------------------------------------------
 * Apertura
 * ------------------------------------------------------------------------ */

test("sin turno abierto, la caja pide el fondo inicial", async ({ page }) => {
  await openCaja(page);
  await expect(page.getByTestId("pos-caja-sin-turno")).toBeVisible();
  await expect(page.getByTestId("pos-caja-fondo")).toBeVisible();
});

test("abrir el turno persiste el fondo declarado", async ({ page }) => {
  await openCaja(page);
  await page.getByTestId("pos-caja-fondo").fill("2000");
  await page.getByTestId("pos-caja-abrir").click();

  await expect(page.getByTestId("pos-caja-turno")).toBeVisible({ timeout: 30_000 });

  // **Contra la base.** La pantalla podría decir cualquier cosa.
  const shift = await currentShift();
  expect(shift, "el turno debe existir en la base").not.toBeNull();
  expect(Number(shift!.openingFloat)).toBe(2000);
  expect(shift!.status).toBe("ABIERTO");
});

test("con el turno recién abierto, lo esperado es el fondo", async ({ page }) => {
  await openCaja(page);
  await expect(page.getByTestId("pos-caja-fondo-inicial")).toContainText("2,000.00");
  await expect(page.getByTestId("pos-caja-esperado")).toContainText("2,000.00");
});

test("no se puede abrir un segundo turno", async ({ page }) => {
  await openCaja(page);
  // La pantalla ya no ofrece el formulario: hay turno.
  await expect(page.getByTestId("pos-caja-sin-turno")).toHaveCount(0);

  const open = await prisma.posCashShift.count({
    where: { status: "ABIERTO", branch: { code: MAPPED_BRANCH_CODE } },
  });
  expect(open).toBe(1);
});

/* ---------------------------------------------------------------------------
 * Movimientos manuales
 * ------------------------------------------------------------------------ */

test("una entrada suma al efectivo esperado", async ({ page }) => {
  await openCaja(page);
  await page.getByTestId("pos-caja-nueva-entrada").click();
  await page.getByTestId("pos-caja-monto").fill("500");
  await page.getByTestId("pos-caja-motivo").fill("Cambio adicional");
  await page.getByTestId("pos-caja-guardar-movimiento").click();

  // **La base primero.** Si la pantalla y la base discrepan, hay que saber cuál
  // de las dos falló; afirmar antes sobre la pantalla oculta esa diferencia.
  await expect(async () => {
    const shift = await currentShift();
    const entrada = shift!.movements.find((m) => m.type === "ENTRADA");
    expect(entrada, "el movimiento debe existir en la base").toBeTruthy();
    expect(Number(entrada!.amount)).toBe(500);
    expect(entrada!.reason).toBe("Cambio adicional");
  }).toPass({ timeout: 30_000 });

  await expect(page.getByTestId("pos-caja-entradas")).toContainText("500.00", {
    timeout: 30_000,
  });
  await expect(page.getByTestId("pos-caja-esperado")).toContainText("2,500.00");
});

test("una salida resta del efectivo esperado", async ({ page }) => {
  await openCaja(page);
  await page.getByTestId("pos-caja-nueva-salida").click();
  await page.getByTestId("pos-caja-monto").fill("1200");
  await page.getByTestId("pos-caja-motivo").fill("Depósito al banco");
  await page.getByTestId("pos-caja-guardar-movimiento").click();

  await expect(page.getByTestId("pos-caja-salidas")).toContainText("1,200.00", {
    timeout: 30_000,
  });
  // 2000 + 500 − 1200
  await expect(page.getByTestId("pos-caja-esperado")).toContainText("1,300.00");
});

test("el motivo es obligatorio y el servidor lo exige", async ({ page }) => {
  await openCaja(page);
  const before = (await currentShift())!.movements.length;

  await page.getByTestId("pos-caja-nueva-entrada").click();
  await page.getByTestId("pos-caja-monto").fill("100");
  // Sin motivo, a propósito.
  await page.getByTestId("pos-caja-guardar-movimiento").click();

  await expect(page.getByTestId("pos-caja-error")).toContainText(/motivo/i, {
    timeout: 30_000,
  });
  const after = (await currentShift())!.movements.length;
  expect(after, "no se registró nada").toBe(before);
});

test("un monto de cero o negativo se rechaza", async ({ page }) => {
  await openCaja(page);
  const before = (await currentShift())!.movements.length;

  await page.getByTestId("pos-caja-nueva-entrada").click();
  await page.getByTestId("pos-caja-monto").fill("-50");
  await page.getByTestId("pos-caja-motivo").fill("Intento inválido");
  await page.getByTestId("pos-caja-guardar-movimiento").click();

  await expect(page.getByTestId("pos-caja-error")).toContainText(/mayor que cero/i, {
    timeout: 30_000,
  });
  expect((await currentShift())!.movements.length).toBe(before);
});

/* ---------------------------------------------------------------------------
 * Ventas: solo el efectivo llega al cajón
 * ------------------------------------------------------------------------ */

/** Cobra una venta con los pagos indicados desde el terminal. */
async function sell(
  page: Page,
  payments: Array<{ method: string; amount: string }>,
  /**
   * Patch CB4-D3 — qué se espera del cobro.
   *
   * Por omisión, éxito: es lo que quieren todos los llamadores anteriores y no
   * se les cambia el contrato. `"rechazo"` existe porque desde D3 un cobro en
   * efectivo sin turno **debe** fallar, y afirmar el éxito allí sería afirmar lo
   * contrario de lo que la prueba mide.
   */
  outcome: "exito" | "rechazo" = "exito",
) {
  /*
   * Presupuesto, no laxitud: una venta completa desde esta suite navega al
   * terminal, escanea, abre el cajón del carrito, pasa al cobro, registra los
   * pagos y espera la transacción del checkout. Con los 60 s por omisión el
   * reloj se agota **antes** de que la aserción llegue a medir nada. Ninguna
   * comprobación se relaja: solo se le da tiempo a ocurrir.
   */
  test.setTimeout(120_000);
  await page.goto(VENTA);
  await expect(page.getByLabel("Buscar artículo")).toBeFocused({ timeout: 45_000 });
  await page.getByLabel("Buscar artículo").fill(ART.sku);
  await page.getByLabel("Buscar artículo").press("Enter");

  await page.getByTestId("pos-abrir-carrito").click();
  await expect(page.getByTestId("pos-cart-line")).toHaveCount(1, { timeout: 30_000 });
  await page.getByTestId("pos-ir-a-cobro").click();
  await expect(page.getByTestId("pos-payments")).toBeVisible({ timeout: 20_000 });

  for (const [index, payment] of payments.entries()) {
    await page.getByRole("button", { name: "Agregar pago" }).click();
    const panel = page.getByTestId("pos-payments");
    await panel.getByLabel(`Forma ${index + 1}`).selectOption(payment.method);
    await panel.getByLabel(`Monto ${index + 1}`).fill(payment.amount);
  }
  await page.getByRole("button", { name: "Cobrar y registrar venta" }).click();
  if (outcome === "exito") {
    await expect(page.getByTestId("pos-sale-created")).toBeVisible({
      timeout: 45_000,
    });
  }
}

test("una venta en efectivo alimenta el cajón", async ({ page }) => {
  await sell(page, [{ method: "EFECTIVO", amount: "500" }]);

  await openCaja(page);
  await expect(page.getByTestId("pos-caja-ventas")).toContainText("500.00", {
    timeout: 30_000,
  });
  // 2000 + 500 − 1200 + 500
  await expect(page.getByTestId("pos-caja-esperado")).toContainText("1,800.00");
});

test("un pago mixto aporta solo su parte en efectivo", async ({ page }) => {
  // Venta de 500: 200 en efectivo, 300 con tarjeta. Al cajón entran 200.
  await sell(page, [
    { method: "EFECTIVO", amount: "200" },
    { method: "TARJETA", amount: "300" },
  ]);

  await openCaja(page);
  await expect(page.getByTestId("pos-caja-ventas")).toContainText("700.00", {
    timeout: 30_000,
  });
  // 2000 + 700 − 1200 + 500 entrada = 2000 + 700 + 500 − 1200
  await expect(page.getByTestId("pos-caja-esperado")).toContainText("2,000.00");
});

/* ---------------------------------------------------------------------------
 * Autorización en el servidor, sin pasar por la interfaz
 * ------------------------------------------------------------------------ */

test("un turno de otra sucursal no se alcanza ni reenviando la acción", async ({
  page,
}) => {
  await openCaja(page);
  const own = await currentShift();

  // Se captura un movimiento legítimo y se reenvía con el id del turno ajeno.
  const action = await captureAction(page, async () => {
    await page.getByTestId("pos-caja-nueva-entrada").click();
    await page.getByTestId("pos-caja-monto").fill("1");
    await page.getByTestId("pos-caja-motivo").fill("Captura");
    await page.getByTestId("pos-caja-guardar-movimiento").click();
  });
  expect(action.body).toContain(own!.id);

  const before = await prisma.posCashMovement.count({
    where: { shiftId: foreignShiftId },
  });
  const response = await page.request.post(action.url, {
    headers: action.headers,
    data: action.body.replace(own!.id, foreignShiftId),
  });

  // El servidor responde, pero **no escribe**: el turno no es de esta sesión.
  expect(response.ok()).toBeTruthy();
  const after = await prisma.posCashMovement.count({
    where: { shiftId: foreignShiftId },
  });
  expect(after, "no se tocó el cajón de otra sucursal").toBe(before);
});

/* ---------------------------------------------------------------------------
 * Cierre
 * ------------------------------------------------------------------------ */

test("cerrar guarda esperado, contado y diferencia", async ({ page }) => {
  await openCaja(page);
  const shift = await currentShift();
  const expectedText = await page.getByTestId("pos-caja-esperado").innerText();

  await page.getByTestId("pos-caja-cerrar").click();
  // Faltante deliberado de 150.
  await page.getByTestId("pos-caja-contado").fill("1850");
  await expect(page.getByTestId("pos-caja-diferencia-previa")).toContainText(
    /faltante/i,
  );
  await page.getByTestId("pos-caja-confirmar-cierre").click();

  await expect(page.getByTestId("pos-caja-sin-turno")).toBeVisible({
    timeout: 30_000,
  });

  const closed = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: shift!.id },
  });
  expect(closed.status).toBe("CERRADO");
  expect(Number(closed.countedCash)).toBe(1850);
  /*
   * La cuenta completa del turno, explícita para que no haya cifras mágicas:
   *
   *   2 000  fondo inicial
   * +   700  efectivo de las ventas (500 en efectivo + 200 del pago mixto)
   * +   500  entrada «Cambio adicional»
   * +     1  entrada «Captura» — la prueba de autorización de arriba registra
   *          un movimiento legítimo **antes** de reenviarlo con un id ajeno, y
   *          ese sí se guarda: es lo que hace creíble que el reenvío no lo hizo.
   * − 1 200  salida «Depósito al banco»
   * = 2 001
   */
  expect(Number(closed.expectedCash)).toBe(2001);
  expect(Number(closed.difference)).toBe(-151);
  expect(closed.closedAt).not.toBeNull();
  // Lo congelado coincide con lo que la pantalla afirmaba antes de cerrar.
  expect(expectedText).toContain("2,001.00");
});

test("un turno cerrado no se recalcula tras una venta posterior", async ({
  page,
}) => {
  const closed = await prisma.posCashShift.findFirstOrThrow({
    where: { status: "CERRADO", branch: { code: MAPPED_BRANCH_CODE } },
    orderBy: { closedAt: "desc" },
  });
  const frozen = {
    expected: Number(closed.expectedCash),
    counted: Number(closed.countedCash),
    difference: Number(closed.difference),
  };

  /*
   * Patch CB4-D3 — la venta posterior necesita **su propio turno**.
   *
   * Antes de D3 bastaba con cobrar: no había turno que exigir. Ahora el efectivo
   * lo exige, así que se abre uno nuevo. La prueba no pierde fuerza — gana: la
   * venta cae en **otro** turno, y lo que se afirma es que el turno ya cerrado
   * no se entera. Es exactamente la propiedad que interesa.
   */
  await openCaja(page);
  await expect(page.getByTestId("pos-caja-sin-turno")).toBeVisible({
    timeout: 30_000,
  });
  await page.getByTestId("pos-caja-fondo").fill("0");
  await page.getByTestId("pos-caja-abrir").click();
  await expect(page.getByTestId("pos-caja-turno")).toBeVisible({ timeout: 30_000 });

  await sell(page, [{ method: "EFECTIVO", amount: "500" }]);
  await expect(page.getByTestId("pos-sale-created")).toBeVisible({ timeout: 45_000 });

  // La venta nueva pertenece al turno nuevo, no al cerrado.
  const sale = await prisma.posSale.findFirstOrThrow({
    orderBy: { completedAt: "desc" },
  });
  expect(sale.shiftId, "no se atribuye al turno ya cerrado").not.toBe(closed.id);

  const reread = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: closed.id },
  });
  expect(Number(reread.expectedCash)).toBe(frozen.expected);
  expect(Number(reread.countedCash)).toBe(frozen.counted);
  expect(Number(reread.difference)).toBe(frozen.difference);

  // Y la pantalla enseña lo congelado, no una cifra nueva.
  await openCaja(page);
  await expect(page.getByTestId("pos-caja-historial")).toContainText("-151.00");

  // Se devuelve el mostrador al estado que el siguiente test espera: sin turno.
  // Es fontanería de la suite serial, no una afirmación.
  await prisma.posCashShift.updateMany({
    where: { status: "ABIERTO", branch: { code: MAPPED_BRANCH_CODE } },
    data: { status: "CERRADO", closedAt: new Date() },
  });
});

test("tras cerrar, el operador puede abrir otro turno", async ({ page }) => {
  await openCaja(page);
  await expect(page.getByTestId("pos-caja-sin-turno")).toBeVisible();
  await page.getByTestId("pos-caja-fondo").fill("300");
  await page.getByTestId("pos-caja-abrir").click();
  await expect(page.getByTestId("pos-caja-turno")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pos-caja-fondo-inicial")).toContainText("300.00");
});

test("cerrar cuadrado deja diferencia cero", async ({ page }) => {
  await openCaja(page);
  const shift = await currentShift();

  await page.getByTestId("pos-caja-cerrar").click();
  await page.getByTestId("pos-caja-contado").fill("300");
  await expect(page.getByTestId("pos-caja-diferencia-previa")).toContainText(
    /cuadra/i,
  );
  await page.getByTestId("pos-caja-confirmar-cierre").click();
  await expect(page.getByTestId("pos-caja-sin-turno")).toBeVisible({
    timeout: 30_000,
  });

  const closed = await prisma.posCashShift.findUniqueOrThrow({
    where: { id: shift!.id },
  });
  expect(Number(closed.difference)).toBe(0);
});

test("sin turno abierto, el efectivo ya no se cobra (D3)", async ({ page }) => {
  /*
   * Este test decía lo contrario mientras D3 estaba diferida: que el cobro no
   * exigía turno. **La decisión se tomó** —el efectivo, y solo el efectivo, lo
   * exige— y con ella la afirmación cambia de signo. No se debilita nada: sigue
   * midiendo el mismo punto de contacto entre el cobro y la caja, ahora contra
   * la regla vigente. La cobertura completa de D3 vive en `pos-d3.spec.ts`.
   */
  const open = await prisma.posCashShift.count({
    where: { status: "ABIERTO", branch: { code: MAPPED_BRANCH_CODE } },
  });
  expect(open, "en este punto la suite dejó todos los turnos cerrados").toBe(0);

  const before = await prisma.posSale.count();
  await sell(page, [{ method: "EFECTIVO", amount: "500" }], "rechazo");

  await expect(page.getByTestId("pos-error")).toContainText(
    /turno de caja antes de cobrar en efectivo/i,
    { timeout: 45_000 },
  );
  expect(await prisma.posSale.count(), "no se registró ninguna venta").toBe(before);
});
