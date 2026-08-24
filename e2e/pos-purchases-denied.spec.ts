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
  // Patch POS1.2-F — corrección de una prueba que pasaba por casualidad: afirmaba
  // `compras-denied` en el navegador, pero el envoltorio de operaciones sustituía
  // esa pantalla al hidratar. Dependía de llegar antes que React.
  //
  // Patch POS2.0-B — **y la negación se adelantó al servidor.** El chasis recibe
  // ahora la sesión ya resuelta del `layout`, así que evalúa la restricción
  // durante el renderizado del servidor: el HTML que sale por el cable ya es la
  // pantalla restringida. Antes salía la página de compras y el cliente la tapaba
  // después — una fuga que esta misma prueba tomaba por contrato.
  //
  // Se afirma lo que importa y no depende del momento: **el servidor no emite
  // ningún dato de compras**. `compras-denied` sigue vivo para un rol que falla
  // `canManageInventory` sin estar restringido por área —un Vendedor, por
  // ejemplo—; esta sesión no puede ejercitarlo.
  const html = await (await page.request.get("/panel/pos/compras")).text();
  expect(html).toContain("Acceso comercial restringido");
  expect(html).not.toContain("compras-row");
  expect(html).not.toContain("Nueva orden");

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
