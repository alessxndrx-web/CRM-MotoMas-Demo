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
  const product = await prisma.posProduct.findFirstOrThrow({
    where: { sku: { startsWith: TAG } },
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
  // Y nada de internos: ni ids de movimiento, ni tipos de Prisma.
  await expect(history).not.toContainText("PosInventoryMovement");
  await expect(history).not.toContainText("COMPRA");
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
