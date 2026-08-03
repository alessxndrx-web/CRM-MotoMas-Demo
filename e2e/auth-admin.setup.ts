import { expect, test as setup } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./fixtures";

const AUTH_FILE = "e2e/.auth/admin.json";

/**
 * Patch FF2.1-C — the second identity.
 *
 * `canOperateCaja` admits only `ADMIN` and `CAJERO`, so the Contabilidad
 * session cannot reach the cash workflow at all. Signing in as an administrator
 * is what makes the Caja specs possible, and it puts a **second role** through
 * the real authorization layer.
 */
setup("autenticar como administrador", async ({ page }) => {
  setup.setTimeout(300_000);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /ingresar|entrar|acceder/i }).click();

  await page.waitForURL(/\/panel/, { timeout: 120_000 });
  await expect(page).toHaveURL(/\/panel/);

  // Precalienta la ruta de facturación: el servidor de desarrollo la compila
  // bajo demanda y ese costo no es lo que las pruebas quieren medir.
  await page.goto("/panel/caja/facturacion");
  // El panel de caja no tiene encabezado: `FormSection` usa `<legend>`, que no
  // expone rol de heading. El título del formulario es el anclaje estable, y
  // además prueba que hay un turno abierto en el alcance del administrador.
  await expect(page.getByText("Nueva factura").first()).toBeVisible({
    timeout: 120_000,
  });

  await page.context().storageState({ path: AUTH_FILE });
});
