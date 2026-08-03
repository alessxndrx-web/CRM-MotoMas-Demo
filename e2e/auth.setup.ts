import { expect, test as setup } from "@playwright/test";

import { TEST_EMAIL, TEST_PASSWORD } from "./fixtures";

const AUTH_FILE = "e2e/.auth/contador.json";

/**
 * A real login, not a forged cookie.
 *
 * This is what makes the suite worth its cost: every Prisma smoke reproduces the
 * transactional body of an action precisely because actions authorize against a
 * session cookie, so authorization itself was never exercised. Signing in here
 * puts it under test for the first time.
 */
setup("autenticar como contador", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /ingresar|entrar|acceder/i }).click();

  // Landing anywhere inside /panel proves the session cookie was issued and the
  // proxy accepted it.
  await page.waitForURL(/\/panel/, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/panel/);

  // El servidor de desarrollo compila cada ruta bajo demanda, y la de gastos es
  // pesada. Precalentarla aquí evita que la primera prueba pague ese costo y
  // falle por un tiempo de compilación que no es lo que se quiere medir.
  await page.goto("/panel/contabilidad/gastos");
  await expect(page.getByRole("heading", { name: "Gastos" }).first()).toBeVisible({
    timeout: 120_000,
  });

  await page.context().storageState({ path: AUTH_FILE });
});
