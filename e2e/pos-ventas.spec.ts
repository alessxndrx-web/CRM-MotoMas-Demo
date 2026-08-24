import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, UNMAPPED_BRANCH_CODE, prisma } from "./fixtures";

/**
 * SUITE-POS6.0-C — el historial de ventas del mostrador.
 *
 * Lo que de verdad hay que probar aquí no es que la lista pinte filas, sino
 * **hasta dónde llega el operador**. `getPosSaleDetail` recibe un id y no filtra
 * por sucursal: es la página la que compara con la sesión. Una prueba que solo
 * abriera la venta propia pasaría igual si esa comparación no existiera, así que
 * la suite siembra deliberadamente una venta **de otra sucursal** y exige que no
 * se pueda ni listar ni abrir.
 *
 * El id de una venta no es un secreto —viaja en URLs y en recibos—, de modo que
 * «no aparece en la lista» no es protección. La afirmación fuerte es la de la
 * URL directa.
 */
test.describe.configure({ mode: "serial" });

const VENTAS = "/pos/ventas";

const PROPIA = `${TAG}-VENTAS-PROPIA`;
const AJENA = `${TAG}-VENTAS-AJENA`;
const ARTICLE = { sku: `${TAG}-VENTAS-ART`, name: "Artículo de historial", price: 400 };

let ownSaleId = "";
let foreignSaleId = "";

test.beforeAll(async () => {
  test.setTimeout(300_000);

  const [own, foreign] = await Promise.all([
    prisma.branch.findFirstOrThrow({ where: { code: MAPPED_BRANCH_CODE } }),
    prisma.branch.findFirstOrThrow({ where: { code: UNMAPPED_BRANCH_CODE } }),
  ]);
  const cashier = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  const product = await prisma.posProduct.upsert({
    where: { sku: ARTICLE.sku },
    update: { name: ARTICLE.name, unitPrice: ARTICLE.price, isActive: true },
    create: { sku: ARTICLE.sku, name: ARTICLE.name, unitPrice: ARTICLE.price },
  });

  // Se siembran completas y por Prisma: esta suite mide la lectura, no el cobro
  // —que ya prueba SUITE-POS1.0-D—, y hacerlas por la interfaz ataría el
  // historial al flujo de venta sin ganar nada.
  await prisma.posSale.deleteMany({
    where: { saleNumber: { in: [PROPIA, AJENA] } },
  });

  for (const [saleNumber, branchId] of [
    [PROPIA, own.id],
    [AJENA, foreign.id],
  ] as const) {
    const sale = await prisma.posSale.create({
      data: {
        saleNumber,
        branchId,
        cashierId: cashier.id,
        status: "COMPLETADA",
        subtotal: 800,
        discount: 0,
        tax: 0,
        total: 800,
        completedAt: new Date(),
        notes: saleNumber === PROPIA ? "Nota de historial" : null,
        items: {
          create: [
            {
              productId: product.id,
              // La instantánea es el contrato de POS3.0: lo que se vendió, no lo
              // que el catálogo diga hoy.
              productName: "Nombre vendido",
              productSku: "SKU-VENDIDO",
              quantity: 2,
              unitPrice: 400,
              discount: 0,
              tax: 0,
              total: 800,
              position: 0,
            },
          ],
        },
        payments: {
          create: [{ method: "EFECTIVO", amount: 800 }],
        },
      },
    });
    if (saleNumber === PROPIA) ownSaleId = sale.id;
    else foreignSaleId = sale.id;
  }
});

test.afterAll(async () => {
  await prisma.posSale.deleteMany({
    where: { saleNumber: { in: [PROPIA, AJENA] } },
  });
});

async function openVentas(page: Page) {
  await page.goto(VENTAS);
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Ventas" }),
  ).toBeVisible({ timeout: 45_000 });
}

test("la lista muestra las ventas de la sucursal del operador", async ({ page }) => {
  await openVentas(page);
  await expect(page.getByText(PROPIA)).toBeVisible({ timeout: 20_000 });
});

test("la lista no alcanza las ventas de otra sucursal", async ({ page }) => {
  await openVentas(page);
  await expect(page.getByText(AJENA)).toHaveCount(0);
});

test("el buscador filtra sobre lo listado", async ({ page }) => {
  await openVentas(page);
  await page.getByLabel("Buscar venta").fill(PROPIA);
  await expect(page.getByText(PROPIA)).toBeVisible();

  await page.getByLabel("Buscar venta").fill(`${TAG}-NO-EXISTE`);
  await expect(page.getByText(PROPIA)).toHaveCount(0);
});

test("el detalle muestra la identidad que se vendió, no la del catálogo", async ({
  page,
}) => {
  await page.goto(`${VENTAS}/${ownSaleId}`);
  const detail = page.getByTestId("pos-venta-detalle");
  await expect(detail).toBeVisible({ timeout: 45_000 });

  // **La instantánea manda.** El catálogo dice «Artículo de historial»; la venta
  // guardó otro nombre y otro SKU, y es el que tiene que salir.
  await expect(detail).toContainText("Nombre vendido");
  await expect(detail).toContainText("SKU-VENDIDO");
  await expect(detail).not.toContainText(ARTICLE.name);
  await expect(detail).toContainText("800.00");
});

test("el detalle enumera los pagos de la venta", async ({ page }) => {
  await page.goto(`${VENTAS}/${ownSaleId}`);
  await expect(page.getByTestId("pos-venta-detalle")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("main")).toContainText("Efectivo");
});

test("la venta de otra sucursal no se abre ni por su URL", async ({ page }) => {
  // La afirmación fuerte de la suite: el id existe y es válido, y aun así el
  // mostrador no puede leerla. Sin la comprobación de sucursal en la página,
  // esta prueba falla.
  const response = await page.goto(`${VENTAS}/${foreignSaleId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("pos-venta-detalle")).toHaveCount(0);
});

test("anular y devolver se declaran no disponibles, en vez de fingirse", async ({
  page,
}) => {
  await openVentas(page);
  await expect(page.getByTestId("pos-ventas-limites")).toContainText(
    /no están disponibles/i,
  );
  // Ningún botón promete una operación que el repositorio no tiene.
  await expect(page.getByRole("button", { name: /Anular/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Devoluci/i })).toHaveCount(0);
});
