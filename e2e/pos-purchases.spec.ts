import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-POS1.2-C — anulación de órdenes de compra.
 *
 * **La primera cobertura de navegador que tienen las compras.** POS1.2-A y
 * POS1.2-B fueron solo de servidor, así que su autorización —lo único que las
 * suites Prisma no pueden cubrir, porque las acciones autorizan contra cookie—
 * nunca se había ejercitado.
 *
 * Corre con la sesión de administrador, que pasa `canManageInventory`. La
 * denegación del contador vive en `pos-purchases-denied.spec.ts`, porque cada
 * proyecto de Playwright arranca con una sola sesión.
 */
test.describe.configure({ mode: "serial" });

const COMPRAS = "/panel/pos/compras";

async function openPurchases(page: Page) {
  await page.goto(COMPRAS);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Órdenes de compra" }),
  ).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("networkidle");
}

/** Crea una orden en el estado pedido, con lo recibido que se indique. */
async function makeOrder(
  status: "BORRADOR" | "APROBADA" | "RECIBIDA_PARCIAL" | "RECIBIDA" | "ANULADA",
  received = 0,
) {
  const branch = await prisma.branch.findFirstOrThrow({
    where: { code: MAPPED_BRANCH_CODE },
  });
  const supplier = await prisma.thirdParty.findFirstOrThrow({
    where: { name: { startsWith: TAG }, type: "PROVEEDOR" },
  });
  // Patch POS1.2-F. **Por SKU exacto, no por prefijo del TAG**: la suite de venta
  // crea sus propios artículos con el mismo prefijo, así que `findFirst` elegía
  // uno arbitrario. Nunca falló, pero estas pruebas leen el nombre del artículo y
  // su saldo, y con el artículo equivocado medirían otra cosa.
  const product = await prisma.posProduct.findUniqueOrThrow({
    where: { sku: `${TAG}-COMPRA-ARTICULO` },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  return prisma.posPurchaseOrder.create({
    data: {
      orderNumber: `OC-${TAG}-${suffix}`,
      branchId: branch.id,
      supplierId: supplier.id,
      status,
      createdByUserId: user.id,
      subtotal: 1000,
      total: 1000,
      items: {
        create: [
          {
            productId: product.id,
            quantity: 10,
            unitCost: 100,
            total: 1000,
            receivedQuantity: received,
          },
        ],
      },
    },
  });
}

function row(page: Page, orderNumber: string) {
  return page.getByTestId("compras-row").filter({ hasText: orderNumber });
}

/* ---------------------------------------------------------------------------
 * Patch POS1.2-F — ayudas del detalle.
 * ------------------------------------------------------------------------ */

async function fixtures() {
  const [branch, supplier, product, user, warehouse] = await Promise.all([
    prisma.branch.findFirstOrThrow({ where: { code: MAPPED_BRANCH_CODE } }),
    prisma.thirdParty.findFirstOrThrow({
      where: { name: { startsWith: TAG }, type: "PROVEEDOR" },
    }),
    prisma.posProduct.findUniqueOrThrow({ where: { sku: `${TAG}-COMPRA-ARTICULO` } }),
    prisma.user.findFirstOrThrow({ where: { email: { startsWith: TAG.toLowerCase() } } }),
    prisma.posWarehouse.findFirstOrThrow({ where: { code: { startsWith: TAG } } }),
  ]);
  return { branch, supplier, product, user, warehouse };
}

/**
 * Abre el saldo del artículo en la bodega de la suite.
 *
 * **No es un atajo de la prueba**: el motor de inventario exige un saldo abierto,
 * y abrirlo es exactamente lo que un usuario hace desde la pantalla de existencias
 * antes de recibir la primera vez. Devuelve el saldo vigente.
 */
async function openBalance() {
  const { product, warehouse } = await fixtures();
  const balance = await prisma.posInventory.upsert({
    where: {
      warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
    },
    create: { warehouseId: warehouse.id, productId: product.id },
    update: {},
  });
  return { balance, product, warehouse };
}

async function balanceNow() {
  const { product, warehouse } = await fixtures();
  const row = await prisma.posInventory.findUniqueOrThrow({
    where: {
      warehouseId_productId: { warehouseId: warehouse.id, productId: product.id },
    },
  });
  return row.quantity.toNumber();
}

async function openDetail(page: Page, orderId: string) {
  await page.goto(`${COMPRAS}/${orderId}`);
  // **Sin `networkidle`.** El servidor de pruebas es `next dev`, que mantiene el
  // canal de recarga en caliente abierto: la red nunca queda del todo quieta y
  // la espera colgó una vez con la pantalla ya pintada. No afirmaba nada —solo
  // esperaba—, y la señal real de que el detalle está listo es su tarjeta.
  await expect(page.getByTestId("compra-detalle")).toBeVisible({ timeout: 45_000 });
}

async function lineOf(orderId: string) {
  return prisma.posPurchaseOrderItem.findFirstOrThrow({ where: { orderId } });
}

/**
 * Patch POS1.2-F — compila las rutas nuevas antes de medir nada.
 *
 * El servidor de pruebas es `next dev`: una ruta que ningún test anterior ha
 * visitado se compila **la primera vez que se pide**, y aquí eso costó más que
 * el presupuesto de 60 s del primer test, que además ya había gastado parte
 * cargando la lista. El fallo era de arranque en frío, no de la pantalla: ya
 * compilada responde en menos de un segundo.
 *
 * Se paga una sola vez y fuera de cualquier test, para que ninguna aserción
 * mida latencia de compilación en lugar de comportamiento.
 */
test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const order = await makeOrder("BORRADOR");
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    for (const path of [`${COMPRAS}/nueva`, `${COMPRAS}/${order.id}`]) {
      await page.goto(path, { timeout: 180_000, waitUntil: "domcontentloaded" });
    }
  } finally {
    await context.close();
  }
});

function reasonField(page: Page) {
  return page
    .getByTestId("compras-cancel-form")
    .getByLabel(/Motivo de la anulación/);
}

test("la pantalla lista las órdenes de compra", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await openPurchases(page);
  await expect(row(page, order.orderNumber)).toBeVisible();
  await expect(row(page, order.orderNumber)).toContainText("Borrador");
});

test("anula un borrador y guarda el motivo", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await openPurchases(page);

  await row(page, order.orderNumber).getByRole("button", { name: "Anular" }).click();
  await reasonField(page).fill("El proveedor no puede surtir");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();

  await expect(page.getByTestId("compras-cancelled")).toBeVisible({ timeout: 30_000 });

  const stored = await prisma.posPurchaseOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(stored.status).toBe("ANULADA");
  expect(stored.cancelledReason).toBe("El proveedor no puede surtir");
  expect(stored.cancelledById).not.toBeNull();
  expect(stored.cancelledAt).not.toBeNull();
  // El motivo va en su columna, no mezclado con las notas del usuario.
  expect(stored.notes).toBeNull();
});

test("anula una aprobada sin mercancía recibida", async ({ page }) => {
  const order = await makeOrder("APROBADA");
  await openPurchases(page);

  await row(page, order.orderNumber).getByRole("button", { name: "Anular" }).click();
  await reasonField(page).fill("Se canceló la compra");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.getByTestId("compras-cancelled")).toBeVisible({ timeout: 30_000 });

  expect(
    (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("ANULADA");
});

test("sin motivo el servidor rechaza la anulación", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await openPurchases(page);

  await row(page, order.orderNumber).getByRole("button", { name: "Anular" }).click();
  // Se confirma sin escribir nada.
  await page.getByRole("button", { name: "Confirmar anulación" }).click();

  await expect(page.getByTestId("compras-error")).toContainText(/motivo/i, {
    timeout: 30_000,
  });
  expect(
    (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("BORRADOR");
});

test("una orden recibida no ofrece anular", async ({ page }) => {
  const order = await makeOrder("RECIBIDA", 10);
  await openPurchases(page);

  const target = row(page, order.orderNumber);
  await expect(target).toBeVisible();
  await expect(target).toContainText("Recibida");
  await expect(target.getByRole("button", { name: "Anular" })).toHaveCount(0);
});

test("una parcialmente recibida tampoco ofrece anular (P-27)", async ({ page }) => {
  const order = await makeOrder("RECIBIDA_PARCIAL", 4);
  await openPurchases(page);

  const target = row(page, order.orderNumber);
  await expect(target).toBeVisible();
  await expect(target.getByRole("button", { name: "Anular" })).toHaveCount(0);
});

test("una orden ya anulada no ofrece anular y muestra su motivo", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await prisma.posPurchaseOrder.update({
    where: { id: order.id },
    data: {
      status: "ANULADA",
      cancelledAt: new Date(),
      cancelledReason: "Anulada antes de la prueba",
    },
  });
  await openPurchases(page);

  const target = row(page, order.orderNumber);
  await expect(target).toContainText("Anulada");
  await expect(target.getByRole("button", { name: "Anular" })).toHaveCount(0);
  await expect(target.getByTestId("compras-reason")).toContainText(
    "Anulada antes de la prueba",
  );
});

test("anular no crea inventario, contabilidad ni caja", async ({ page }) => {
  const order = await makeOrder("APROBADA");
  const before = {
    posMovements: await prisma.posInventoryMovement.count(),
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    serialized: await prisma.inventoryMovement.count(),
  };

  await openPurchases(page);
  await row(page, order.orderNumber).getByRole("button", { name: "Anular" }).click();
  await reasonField(page).fill("Comprobación de efectos");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.getByTestId("compras-cancelled")).toBeVisible({ timeout: 30_000 });

  expect(await prisma.posInventoryMovement.count()).toBe(before.posMovements);
  expect(await prisma.journalEntry.count()).toBe(before.entries);
  expect(await prisma.postingRecord.count()).toBe(before.postings);
  expect(await prisma.cashDocument.count()).toBe(before.cash);
  expect(await prisma.inventoryMovement.count()).toBe(before.serialized);
});

test("la anulación persiste tras recargar", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await openPurchases(page);

  await row(page, order.orderNumber).getByRole("button", { name: "Anular" }).click();
  await reasonField(page).fill("Persistencia");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.getByTestId("compras-cancelled")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(row(page, order.orderNumber)).toContainText("Anulada");
});

test("el historial muestra los hechos del ciclo de vida", async ({ page }) => {
  // Patch POS1.2-E. La bitácora se escribe en la transacción de cada operación,
  // así que aquí se siembra directamente para comprobar **el cableado hasta la
  // pantalla**: que el DTO llega, que se ordena y que se lee sin saber que
  // existen movimientos de inventario.
  const order = await makeOrder("APROBADA");
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  const product = await prisma.posProduct.findFirstOrThrow({
    where: { sku: { startsWith: TAG } },
  });

  await prisma.posPurchaseOrderEvent.create({
    data: { orderId: order.id, type: "CREADA", actorId: user.id },
  });
  await prisma.posPurchaseOrderEvent.create({
    data: { orderId: order.id, type: "APROBADA", actorId: user.id },
  });
  await prisma.posPurchaseOrderEvent.create({
    data: {
      orderId: order.id,
      type: "RECEPCION_PARCIAL",
      actorId: user.id,
      productId: product.id,
      quantity: 40,
    },
  });

  await openPurchases(page);
  const target = row(page, order.orderNumber);
  await target.getByRole("button", { name: "Historial" }).click();

  const history = target.getByTestId("compras-historial");
  await expect(history).toBeVisible();
  await expect(history.getByTestId("compras-evento")).toHaveCount(3);
  await expect(history).toContainText("Orden creada");
  await expect(history).toContainText("Orden aprobada");
  await expect(history).toContainText("Recepción parcial");
  // La cantidad se lee como número, no como fila de un ledger.
  await expect(history).toContainText("40");
  await expect(history).toContainText(user.name);
  // Y nada de internos: ni nombres de modelo, ni columnas del ledger.
  //
  // **No se afirma la ausencia de la cadena "COMPRA"**: el SKU del fixture es
  // `E2E-FF21A-COMPRA-ARTICULO`, así que buscarla encuentra el dato legítimo del
  // artículo, no un tipo de movimiento filtrado. Una aserción que casa con datos
  // de prueba no comprueba lo que dice comprobar.
  await expect(history).not.toContainText("PosInventoryMovement");
  await expect(history).not.toContainText("quantityBefore");
  await expect(history).not.toContainText("quantityAfter");
  // El tipo se muestra traducido, nunca el valor del enum.
  await expect(history).not.toContainText("RECEPCION_PARCIAL");
});

test("una orden sin historial lo dice, en vez de fingir una lista vacía", async ({
  page,
}) => {
  // Patch POS1.2-E, §10 del encargo: las órdenes anteriores a la bitácora no
  // reciben historia fabricada, y la pantalla lo enuncia.
  const order = await makeOrder("APROBADA");
  await openPurchases(page);

  const target = row(page, order.orderNumber);
  await target.getByRole("button", { name: "Historial" }).click();
  await expect(target.getByTestId("compras-sin-historial")).toBeVisible();
  await expect(target.getByTestId("compras-evento")).toHaveCount(0);
});

test("el formulario es alcanzable con teclado y está etiquetado", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await openPurchases(page);

  await row(page, order.orderNumber).getByRole("button", { name: "Anular" }).click();
  const field = reasonField(page);
  await field.focus();
  await expect(field).toBeFocused();
  await page.keyboard.type("Con teclado");
  await expect(field).toHaveValue("Con teclado");
});

/* ===========================================================================
 * SUITE-POS1.2-F — los flujos que hasta ahora no tenían forma de alcanzarse.
 *
 * POS1.2-A a POS1.2-E dejaron seis acciones de servidor y **una** puerta en la
 * aplicación: anular. Crear, aprobar, recibir y devolver solo se habían probado
 * reproduciendo su cuerpo transaccional en smokes Prisma. Aquí se ejercitan por
 * donde los ejecuta un usuario: navegador, sesión, cookie y todo.
 * ======================================================================== */

test("la lista lleva al detalle", async ({ page }) => {
  const order = await makeOrder("APROBADA");
  await openPurchases(page);

  await row(page, order.orderNumber).getByRole("link", { name: order.orderNumber }).click();
  await expect(page.getByTestId("compra-detalle")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("compra-detalle")).toContainText(order.orderNumber);
  await expect(page.getByTestId("compra-linea")).toHaveCount(1);
});

test("crea una orden y la deja en borrador", async ({ page }) => {
  const { supplier, product } = await fixtures();

  await page.goto(`${COMPRAS}/nueva`);
  await expect(page.getByTestId("compra-nueva")).toBeVisible({ timeout: 45_000 });

  await page.getByLabel("Proveedor").selectOption(supplier.id);
  await page.getByLabel("Sucursal").selectOption(MAPPED_BRANCH_CODE);
  await page.getByLabel("Artículo 1").selectOption(product.id);
  await page.getByLabel("Cantidad 1").fill("7");
  await page.getByLabel("Costo 1").fill("125.50");
  await page.getByRole("button", { name: "Crear orden" }).click();

  // Aterriza en el detalle de lo que acaba de crear.
  await expect(page.getByTestId("compra-detalle")).toBeVisible({ timeout: 45_000 });

  const created = await prisma.posPurchaseOrder.findFirstOrThrow({
    where: { supplierId: supplier.id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  expect(created.status).toBe("BORRADOR");
  expect(created.items).toHaveLength(1);
  expect(created.items[0]!.quantity.toNumber()).toBe(7);
  expect(created.items[0]!.unitCost.toNumber()).toBe(125.5);
  // El servidor deriva los totales; la pantalla no los envía.
  expect(created.total.toNumber()).toBe(878.5);
  // Crear no mueve existencias.
  expect(created.approvedAt).toBeNull();

  const events = await prisma.posPurchaseOrderEvent.findMany({
    where: { orderId: created.id },
  });
  expect(events.map((event) => event.type)).toEqual(["CREADA"]);
});

test("el servidor rechaza una orden sin líneas", async ({ page }) => {
  const { supplier } = await fixtures();
  await page.goto(`${COMPRAS}/nueva`);
  await expect(page.getByTestId("compra-nueva")).toBeVisible({ timeout: 45_000 });

  await page.getByLabel("Proveedor").selectOption(supplier.id);
  await page.getByLabel("Sucursal").selectOption(MAPPED_BRANCH_CODE);
  // Se envía sin elegir artículo ni costo: la única fila queda descartada.
  await page.getByRole("button", { name: "Crear orden" }).click();

  await expect(page.getByTestId("compra-nueva-error")).toContainText(/línea/i, {
    timeout: 30_000,
  });
});

test("aprueba un borrador desde el detalle", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await openDetail(page, order.id);

  await page.getByTestId("compra-acciones").getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  const stored = await prisma.posPurchaseOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(stored.status).toBe("APROBADA");
  expect(stored.approvedById).not.toBeNull();
  expect(stored.approvedAt).not.toBeNull();
  expect(
    (await prisma.posPurchaseOrderEvent.findMany({ where: { orderId: order.id } })).map(
      (event) => event.type,
    ),
  ).toEqual(["APROBADA"]);
});

test("recibe parte de una orden y mueve el inventario", async ({ page }) => {
  const { warehouse, product } = await openBalance();
  const before = await balanceNow();
  const order = await makeOrder("APROBADA");

  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Recibir" }).click();
  await expect(page.getByTestId("compra-bodega")).toBeVisible();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Recibir ${product.name}`).fill("4");
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  const stored = await prisma.posPurchaseOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });
  expect(stored.status).toBe("RECIBIDA_PARCIAL");
  expect(stored.items[0]!.receivedQuantity.toNumber()).toBe(4);
  expect(await balanceNow()).toBe(before + 4);

  const movement = await prisma.posInventoryMovement.findFirstOrThrow({
    where: { warehouseId: warehouse.id, productId: product.id },
    orderBy: { createdAt: "desc" },
  });
  expect(movement.type).toBe("COMPRA");
  expect(movement.quantity.toNumber()).toBe(4);
  expect(movement.quantityBefore.add(movement.quantity).equals(movement.quantityAfter)).toBe(
    true,
  );
  expect(movement.reason).toContain(order.orderNumber);

  // La pantalla vuelve a leer del servidor: lo pendiente baja a 6.
  await expect(page.getByTestId("compra-linea").first()).toContainText("6");
});

test("completa la recepción y cierra la orden", async ({ page }) => {
  const { warehouse, product } = await openBalance();
  const before = await balanceNow();
  const order = await makeOrder("APROBADA");

  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Recibir" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Recibir ${product.name}`).fill("10");
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  expect(
    (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("RECIBIDA");
  expect(await balanceNow()).toBe(before + 10);
  // Recibida entera de una vez: el hecho registrado es total, no parcial.
  expect(
    (await prisma.posPurchaseOrderEvent.findMany({ where: { orderId: order.id } })).map(
      (event) => event.type,
    ),
  ).toEqual(["RECEPCION_TOTAL"]);
});

test("el servidor rechaza recibir más de lo pendiente", async ({ page }) => {
  const { warehouse, product } = await openBalance();
  const before = await balanceNow();
  const order = await makeOrder("APROBADA");

  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Recibir" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Recibir ${product.name}`).fill("11");
  await page.getByRole("button", { name: "Confirmar recepción" }).click();

  await expect(page.getByTestId("compra-error")).toContainText(/más de lo pendiente/i, {
    timeout: 30_000,
  });
  expect(await balanceNow()).toBe(before);
  expect(
    (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("APROBADA");
});

test("devuelve mercancía sin alterar el estado ni lo pendiente", async ({ page }) => {
  const { warehouse, product } = await openBalance();
  const order = await makeOrder("APROBADA");

  // **La mercancía entra por la pantalla, no por un `update` directo al saldo.**
  // Cargarlo a mano dejaría existencias sin movimiento que las respalde y
  // rompería la invariante que este mismo archivo comprueba al final.
  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Recibir" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Recibir ${product.name}`).fill("10");
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });
  const before = await balanceNow();

  await page.getByTestId("compra-acciones").getByRole("button", { name: "Devolver" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel("Motivo de la devolución").fill("Llegaron con el empaque roto");
  await page.getByLabel(`Devolver ${product.name}`).fill("3");
  await page.getByRole("button", { name: "Confirmar devolución" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  const stored = await prisma.posPurchaseOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });
  expect(stored.items[0]!.returnedQuantity.toNumber()).toBe(3);
  // P-28 y P-29 siguen sin decidirse: devolver no reabre lo pendiente ni cambia
  // el estado. La prueba **fija la conducta actual**, no la aprueba.
  expect(stored.items[0]!.receivedQuantity.toNumber()).toBe(10);
  expect(stored.status).toBe("RECIBIDA");
  expect(await balanceNow()).toBe(before - 3);

  const movement = await prisma.posInventoryMovement.findFirstOrThrow({
    where: { warehouseId: warehouse.id, productId: product.id },
    orderBy: { createdAt: "desc" },
  });
  expect(movement.type).toBe("DEVOLUCION");
  expect(movement.quantity.toNumber()).toBe(-3);
  expect(movement.reason).toContain("Llegaron con el empaque roto");
});

test("el servidor exige motivo para devolver", async ({ page }) => {
  // Aquí sí sirve la orden sembrada: el motivo se exige **antes** de mirar el
  // inventario, así que la operación se rechaza sin llegar a tocarlo.
  const { warehouse, product } = await openBalance();
  const before = await balanceNow();
  const movements = await prisma.posInventoryMovement.count();
  const order = await makeOrder("RECIBIDA", 10);

  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Devolver" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Devolver ${product.name}`).fill("2");
  await page.getByRole("button", { name: "Confirmar devolución" }).click();

  await expect(page.getByTestId("compra-error")).toContainText(/motivo/i, {
    timeout: 30_000,
  });
  expect(await balanceNow()).toBe(before);
  expect(await prisma.posInventoryMovement.count()).toBe(movements);
  expect((await lineOf(order.id)).returnedQuantity.toNumber()).toBe(0);
});

test("anula desde el detalle", async ({ page }) => {
  const order = await makeOrder("BORRADOR");
  await openDetail(page, order.id);

  await page.getByTestId("compra-acciones").getByRole("button", { name: "Anular" }).click();
  await page
    .getByTestId("compra-anular")
    .getByLabel("Motivo de la anulación")
    .fill("Anulada desde el detalle");
  await page.getByRole("button", { name: "Confirmar anulación" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  const stored = await prisma.posPurchaseOrder.findUniqueOrThrow({
    where: { id: order.id },
  });
  expect(stored.status).toBe("ANULADA");
  expect(stored.cancelledReason).toBe("Anulada desde el detalle");
});

test("el detalle solo ofrece lo que el estado permite", async ({ page }) => {
  const draft = await makeOrder("BORRADOR");
  await openDetail(page, draft.id);
  const actions = page.getByTestId("compra-acciones");
  await expect(actions.getByRole("button", { name: "Aprobar" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Anular" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Recibir" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Devolver" })).toHaveCount(0);

  const received = await makeOrder("RECIBIDA", 10);
  await openDetail(page, received.id);
  await expect(actions.getByRole("button", { name: "Devolver" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Aprobar" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Recibir" })).toHaveCount(0);
  // P-27: una orden con mercancía recibida no se anula.
  await expect(actions.getByRole("button", { name: "Anular" })).toHaveCount(0);

  const cancelled = await makeOrder("ANULADA");
  await openDetail(page, cancelled.id);
  await expect(actions.getByRole("button")).toHaveCount(0);
});

test("una orden parcialmente recibida ofrece recibir y devolver a la vez", async ({
  page,
}) => {
  const order = await makeOrder("RECIBIDA_PARCIAL", 4);
  await openDetail(page, order.id);

  const actions = page.getByTestId("compra-acciones");
  await expect(actions.getByRole("button", { name: "Recibir" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Devolver" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Anular" })).toHaveCount(0);
});

test("el detalle muestra el historial que escribieron las operaciones reales", async ({
  page,
}) => {
  // A diferencia de la prueba de POS1.2-E, aquí **no se siembra ningún evento**:
  // los escribe el ciclo ejecutado desde el navegador.
  const { warehouse, product } = await openBalance();
  const order = await makeOrder("BORRADOR");

  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("compra-acciones").getByRole("button", { name: "Recibir" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Recibir ${product.name}`).fill("6");
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  const history = page.getByTestId("compras-historial");
  await expect(history).toBeVisible();
  await expect(history.getByTestId("compras-evento")).toHaveCount(2);
  await expect(history).toContainText("Orden aprobada");
  await expect(history).toContainText("Recepción parcial");
  await expect(history).not.toContainText("RECEPCION_PARCIAL");

  // La bitácora coincide con lo que de verdad ocurrió.
  const events = await prisma.posPurchaseOrderEvent.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "asc" },
  });
  expect(events.map((event) => event.type)).toEqual([
    "APROBADA",
    "RECEPCION_PARCIAL",
  ]);
  expect(events[1]!.quantity?.toNumber()).toBe(6);
  expect(events[1]!.productId).toBe(product.id);
});

test("recibir no toca contabilidad, caja ni inventario serializado", async ({ page }) => {
  const { warehouse, product } = await openBalance();
  const order = await makeOrder("APROBADA");
  const before = {
    entries: await prisma.journalEntry.count(),
    postings: await prisma.postingRecord.count(),
    cash: await prisma.cashDocument.count(),
    receivables: await prisma.receivableDocument.count(),
    serialized: await prisma.inventoryMovement.count(),
    units: await prisma.motorcycleUnit.count(),
  };

  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Recibir" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Recibir ${product.name}`).fill("5");
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  expect(await prisma.journalEntry.count()).toBe(before.entries);
  expect(await prisma.postingRecord.count()).toBe(before.postings);
  expect(await prisma.cashDocument.count()).toBe(before.cash);
  expect(await prisma.receivableDocument.count()).toBe(before.receivables);
  expect(await prisma.inventoryMovement.count()).toBe(before.serialized);
  expect(await prisma.motorcycleUnit.count()).toBe(before.units);
});

test("el saldo sigue siendo la suma de su bitácora tras operar por pantalla", async ({
  page,
}) => {
  const { warehouse, product } = await openBalance();
  const order = await makeOrder("APROBADA");

  await openDetail(page, order.id);
  await page.getByTestId("compra-acciones").getByRole("button", { name: "Recibir" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel(`Recibir ${product.name}`).fill("10");
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  await page.getByTestId("compra-acciones").getByRole("button", { name: "Devolver" }).click();
  await page.getByLabel("Bodega").selectOption(warehouse.id);
  await page.getByLabel("Motivo de la devolución").fill("Sobró mercancía");
  await page.getByLabel(`Devolver ${product.name}`).fill("2.5");
  await page.getByRole("button", { name: "Confirmar devolución" }).click();
  await expect(page.getByTestId("compra-ok")).toBeVisible({ timeout: 30_000 });

  const movements = await prisma.posInventoryMovement.findMany({
    where: { warehouseId: warehouse.id, productId: product.id },
  });
  const sum = movements.reduce((total, movement) => total + movement.quantity.toNumber(), 0);
  expect(await balanceNow()).toBeCloseTo(sum, 3);
  expect(movements.every((m) => m.quantityBefore.add(m.quantity).equals(m.quantityAfter))).toBe(
    true,
  );
});

test("el detalle es usable en móvil", async ({ page }) => {
  const order = await makeOrder("APROBADA");
  await page.setViewportSize({ width: 390, height: 844 });
  await openDetail(page, order.id);

  await expect(page.getByTestId("compra-linea").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("la pantalla es usable en móvil", async ({ page }) => {
  await makeOrder("BORRADOR");
  await page.setViewportSize({ width: 390, height: 844 });
  await openPurchases(page);

  await expect(page.getByTestId("compras-row").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
