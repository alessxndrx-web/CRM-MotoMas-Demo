import { expect, test } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, prisma } from "./fixtures";

/**
 * SUITE-POS1.2-C — la mitad negativa de la autorización de compras.
 *
 * Vive en un archivo aparte porque cada proyecto de Playwright arranca con una
 * sola sesión: este corre con la del contador, que **no** pasa
 * `canManageInventory`. Es la prueba que ninguna suite Prisma puede hacer, porque
 * las acciones autorizan contra la cookie de sesión y los smokes reproducen el
 * cuerpo transaccional sin ella.
 */
test("un contador no puede administrar órdenes de compra", async ({ page }) => {
  // Patch POS1.2-F — **corrección de una prueba que pasaba por casualidad.**
  //
  // Afirmaba `compras-denied` en el navegador. Pero el envoltorio de operaciones
  // es un componente de cliente que, en cuanto hidrata la sesión, sustituye toda
  // la pantalla por "Acceso comercial restringido": el testid solo existía en la
  // ventana anterior a la hidratación. La aserción dependía de llegar antes que
  // React, y un día no llegó.
  //
  // Se afirma ahora lo que no depende del momento: **el HTML que emite el
  // servidor** —donde vive la negación de verdad— y el estado final de la
  // pantalla. `compras-denied` sigue vivo para roles que fallan
  // `canManageInventory` sin ser Contador; esta sesión no puede ejercitarlo.
  const html = await (await page.request.get("/panel/pos/compras")).text();
  expect(html).toContain("compras-denied");
  expect(html).not.toContain("compras-row");

  await page.goto("/panel/pos/compras");
  await expect(
    page.getByRole("heading", { name: "Acceso comercial restringido" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("compras-row")).toHaveCount(0);
});

/**
 * Patch POS1.2-F. Las rutas nuevas —crear y detalle— son puertas propias: no
 * basta con que la lista niegue.
 *
 * **No se afirma el código de estado.** Ambas páginas son `force-dynamic`, así
 * que la respuesta ya empezó a emitirse cuando `notFound()` se lanza y el estado
 * sale 200 aunque el cuerpo sea el de "no existe". Afirmar 404 describiría un
 * contrato que este repositorio no tiene.
 *
 * Lo que sí se afirma es lo que importa, y en el sitio donde no puede fingirse:
 * **el HTML que el servidor emite no contiene el documento.** Si la página se
 * hubiera renderizado, sus marcas estarían ahí aunque el envoltorio de cliente
 * las tapara después.
 */
test("un contador no alcanza el formulario de creación", async ({ page }) => {
  await page.goto("/panel/pos/compras/nueva");
  await expect(page.getByTestId("compra-nueva")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear orden" })).toHaveCount(0);

  const html = await (await page.request.get("/panel/pos/compras/nueva")).text();
  expect(html).not.toContain("compra-nueva");
  expect(html).not.toContain("Nueva orden de compra");
});

test("un contador no alcanza el detalle de una orden", async ({ page }) => {
  const branch = await prisma.branch.findFirstOrThrow({
    where: { code: MAPPED_BRANCH_CODE },
  });
  const supplier = await prisma.thirdParty.findFirstOrThrow({
    where: { name: { startsWith: TAG }, type: "PROVEEDOR" },
  });
  const product = await prisma.posProduct.findUniqueOrThrow({
    where: { sku: `${TAG}-COMPRA-ARTICULO` },
  });
  const user = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  const order = await prisma.posPurchaseOrder.create({
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

  await page.goto(`/panel/pos/compras/${order.id}`);
  await expect(page.getByTestId("compra-detalle")).toHaveCount(0);
  await expect(page.getByTestId("compra-acciones")).toHaveCount(0);

  // El servidor no emitió el documento: ni sus marcas ni su número.
  const html = await (await page.request.get(`/panel/pos/compras/${order.id}`)).text();
  expect(html).not.toContain("compra-detalle");
  expect(html).not.toContain(order.orderNumber);

  // Y la orden sigue intacta: negar no es tocar.
  expect(
    (await prisma.posPurchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
  ).toBe("APROBADA");
});
