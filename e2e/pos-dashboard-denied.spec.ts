import { expect, test } from "@playwright/test";

/**
 * SUITE-POS2.1 (denegada) — la mitad negativa del tablero.
 *
 * Corre con la sesión de contador, que no pasa `canAccessCaja` ni
 * `canManageInventory`.
 *
 * **Se afirma sobre el HTML que emite el servidor**, no sobre lo que el
 * navegador acaba pintando: ocultar con CSS no es autorizar, y una cifra de
 * ventas presente en el marcado ya se ha filtrado aunque nadie la vea.
 */
test("un contador no recibe cifras de mostrador en el HTML", async ({ page }) => {
  const html = await (await page.request.get("/panel/dashboard?periodo=30d")).text();

  // Ninguna marca del tablero de mostrador.
  expect(html).not.toContain("pos-dashboard");
  expect(html).not.toContain("Operación de mostrador");
  expect(html).not.toContain("Ticket promedio");
  expect(html).not.toContain("Compras por recibir");
  expect(html).not.toContain("Últimos movimientos de inventario");
});

test("y tampoco lo ve en pantalla", async ({ page }) => {
  await page.goto("/panel/dashboard");
  // El envoltorio de operaciones restringe al contador a su área.
  await expect(
    page.getByRole("heading", { name: "Acceso comercial restringido" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("pos-dashboard")).toHaveCount(0);
});
