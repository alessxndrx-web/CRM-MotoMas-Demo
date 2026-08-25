import { expect, test as setup } from "@playwright/test";

import { MARKETING_EMAIL, MARKETING_PASSWORD } from "./fixtures";

const AUTH_FILE = "e2e/.auth/marketing.json";

/**
 * Patch Marketing-E2E — la quinta identidad, y **no es un duplicado de Admin**.
 *
 * ## Qué hace MARKETING que Admin no puede hacer
 *
 * En las tres puertas del panel, Admin y MARKETING son idénticos: las dos abren
 * `canViewMarketing`, `canManageMarketing` y `canViewLeadAttribution`. Si eso
 * fuera todo, esta identidad no pagaría su coste.
 *
 * Lo que las separa está una capa más abajo, en `server/auth/roles.ts`:
 * **`isGlobalRole` admite sólo a `ADMIN` y `CONTADOR`**. Un usuario MARKETING
 * asignado a una sucursal recibe por tanto **el código de esa sucursal** en su
 * sesión, mientras que `getMarketingScopeForUser` le sigue dando alcance global
 * para las campañas. De ahí sale un estado que Admin no puede producir:
 *
 *     campañas          -> alcance global   (lo decide getMarketingScopeForUser)
 *     informe atribución -> acotado a su sucursal (la página le pasa branchCode)
 *
 * Esa asimetría es real y sólo esta sesión la ejercita. El usuario del arnés
 * está en `rosita`, distinta de la del Gerente, para que las dos acotaciones no
 * se confundan entre sí.
 */
setup("autenticar como marketing", async ({ page }) => {
  setup.setTimeout(300_000);

  await page.goto("/login");
  await page.locator('input[type="email"]').fill(MARKETING_EMAIL);
  await page.locator('input[type="password"]').fill(MARKETING_PASSWORD);
  await page.getByRole("button", { name: /ingresar|entrar|acceder/i }).click();

  await page.waitForURL(/\/panel/, { timeout: 120_000 });
  await expect(page).toHaveURL(/\/panel/);

  await page.goto("/panel/marketing");
  await expect(
    page.getByRole("heading", { name: "Campañas", exact: true }),
  ).toBeVisible({ timeout: 120_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
