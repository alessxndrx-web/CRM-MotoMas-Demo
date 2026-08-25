import { expect, test as setup } from "@playwright/test";

import { GERENTE_EMAIL, GERENTE_PASSWORD } from "./fixtures";

const AUTH_FILE = "e2e/.auth/gerente.json";

/**
 * Patch Marketing-E2E — la cuarta identidad.
 *
 * ## Por qué hace falta una sesión propia y no basta con Admin
 *
 * Marketing tiene tres puertas y un alcance, y **Admin las abre todas**. Con la
 * sesión de administrador no se puede demostrar ninguna de las tres cosas que
 * este arnés existe para demostrar:
 *
 * - `canManageMarketing` deja fuera al Gerente; Admin no lo nota.
 * - `canViewLeadAttribution` deja fuera al Gerente; Admin tampoco.
 * - `getMarketingScopeForUser` devuelve `{ level: "global" }` para Admin, así
 *   que **con Admin no queda fuera ninguna campaña** y el acotamiento por
 *   sucursal es indemostrable.
 *
 * El usuario del arnés está asignado a `granada`, y `isGlobalRole` no admite a
 * GERENTE, así que su sesión lleva el código de esa sucursal. Ése es el dato del
 * que cuelga todo el acotamiento.
 */
setup("autenticar como gerente", async ({ page }) => {
  // Por encima del tiempo global: este paso paga el compilado bajo demanda de
  // la ruta de Marketing, no sólo el login.
  setup.setTimeout(300_000);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(GERENTE_EMAIL);
  await page.locator('input[type="password"]').fill(GERENTE_PASSWORD);
  await page.getByRole("button", { name: /ingresar|entrar|acceder/i }).click();

  await page.waitForURL(/\/panel/, { timeout: 120_000 });
  await expect(page).toHaveURL(/\/panel/);

  // Precalienta Marketing. `canViewMarketing` admite al Gerente, así que llegar
  // al encabezado de campañas es además la primera prueba de que la puerta de
  // lectura le deja pasar.
  await page.goto("/panel/marketing");
  await expect(
    page.getByRole("heading", { name: "Campañas", exact: true }),
  ).toBeVisible({ timeout: 120_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
