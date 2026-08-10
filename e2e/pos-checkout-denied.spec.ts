import { expect, test } from "@playwright/test";

/**
 * SUITE-POS2.2 (denegada), actualizada por POS2.4.
 *
 * ## El contrato cambió, y es más fuerte
 *
 * Hasta POS2.3 el cobro vivía en `/panel/pos/venta` y un contador recibía la
 * pantalla de «acceso comercial restringido» del panel. Desde POS2.4 el cobro
 * vive en `/pos/venta`, detrás de credenciales propias: la sesión
 * administrativa —cualquiera, incluida la de un administrador que pasa
 * `canOperateCaja`— **ya no es una identidad válida en el mostrador**.
 *
 * Lo que se afirma sigue siendo lo mismo: el servidor no emite el cobro a quien
 * no puede cobrar. Lo que cambió es la puerta a la que se le manda.
 */
test("un contador no recibe la superficie de cobro del servidor", async ({ page }) => {
  const response = await page.request.get("/pos/venta");
  const html = await response.text();

  // Sin sesión de mostrador, lo que sale por el cable es el login del POS.
  expect(html).toContain("pos-login");
  expect(html).not.toContain("pos-search");
  expect(html).not.toContain("pos-checkout");
  expect(html).not.toContain("pos-payments");
  expect(html).not.toContain("pos-cart-line");
  expect(html).not.toContain("pos-totals");
});

test("la URL antigua del panel tampoco le da el cobro", async ({ page }) => {
  await page.goto("/panel/pos/venta");
  // Redirige al mostrador, y el mostrador pide sus credenciales.
  await expect(page).toHaveURL(/\/pos\/login$/, { timeout: 45_000 });
  await expect(page.getByTestId("pos-checkout")).toHaveCount(0);
  await expect(page.getByTestId("pos-payments")).toHaveCount(0);
});
