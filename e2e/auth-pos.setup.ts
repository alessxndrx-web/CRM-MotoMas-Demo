import { expect, test as setup } from "@playwright/test";

import { POS_OPERATOR_PASSWORD, POS_OPERATOR_USERNAME } from "./fixtures";

/**
 * Patch POS2.4 — sesión de mostrador para el arnés.
 *
 * **Es una tercera identidad, no una variante de las otras dos.** Contador y
 * Administrador entran por `/login` y reciben `motomas_session`; el operador
 * entra por `/pos/login` y recibe `motomas_pos_session`. Que hagan falta tres
 * arranques distintos es la prueba más simple de que las fronteras existen.
 */
setup("autenticar como operador de mostrador", async ({ page }) => {
  await page.goto("/pos/login");
  await expect(page.getByTestId("pos-login")).toBeVisible({ timeout: 120_000 });

  await page.getByTestId("pos-login-usuario").fill(POS_OPERATOR_USERNAME);
  await page.getByTestId("pos-login-clave").fill(POS_OPERATOR_PASSWORD);
  await page.getByTestId("pos-login-entrar").click();

  await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 120_000 });
  await page.context().storageState({ path: "e2e/.auth/pos.json" });
});
