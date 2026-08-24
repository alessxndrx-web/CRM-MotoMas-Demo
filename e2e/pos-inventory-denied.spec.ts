import { expect, test } from "@playwright/test";

/**
 * SUITE-POS2.3 (denegada), actualizada por POS2.4.
 *
 * Mismo cambio de contrato que el cobro: las existencias del mostrador salieron
 * del panel y viven detrás de la sesión de POS. La sesión administrativa del
 * contador no abre esa puerta, y tampoco la de un administrador.
 */
test("un contador no recibe las existencias del servidor", async ({ page }) => {
  const html = await (await page.request.get("/pos/inventario")).text();

  expect(html).toContain("pos-login");
  expect(html).not.toContain("registrar-ingreso");
  expect(html).not.toContain("registrar-ajuste");
  expect(html).not.toContain("operacion-formulario");
  expect(html).not.toContain("tabla-saldos");
});

test("la URL antigua del panel tampoco se las da", async ({ page }) => {
  await page.goto("/panel/pos/inventario");
  await expect(page).toHaveURL(/\/pos\/login$/, { timeout: 45_000 });
  await expect(page.getByTestId("registrar-ingreso")).toHaveCount(0);
});
