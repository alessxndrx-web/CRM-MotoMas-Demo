import { expect, test } from "@playwright/test";

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
  await page.goto("/panel/pos/compras");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Órdenes de compra" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("compras-denied")).toBeVisible();
  await expect(page.getByTestId("compras-row")).toHaveCount(0);
});
