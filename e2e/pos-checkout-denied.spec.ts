import { expect, test } from "@playwright/test";

/**
 * SUITE-POS2.2 (denegada) — la mitad que faltaba por completo.
 *
 * POS1.0-D probó el cobro con la identidad que puede cobrar y **nunca probó la
 * que no**.
 *
 * ## Hay dos denegaciones, y no son la misma
 *
 * 1. **Por área**: el chasis restringe al Contador a contabilidad, y lo hace
 *    durante el renderizado del servidor desde POS2.0-B. Es la que se ejercita
 *    aquí, porque el contador es la única sesión no autorizada que la suite
 *    tiene.
 * 2. **Por capacidad**: `canOperateCaja` no admite a GERENTE, que sí alcanza el
 *    área. Ese rol ve la ruta y el motivo (`pos-denied`) en vez del cobro.
 *    **[I] Sin sesión de gerente en el arnés, esa rama no se ejercita en
 *    navegador**; queda anotada como límite, no como cobertura.
 *
 * Lo que ambas comparten y esta suite afirma: **el servidor no emite la
 * superficie de cobro**. Ocultar con CSS no es autorizar.
 */
test("un contador no recibe la superficie de cobro del servidor", async ({ page }) => {
  const html = await (await page.request.get("/panel/pos/venta")).text();

  // Lo que el servidor sí emite: la pantalla restringida.
  expect(html).toContain("Acceso comercial restringido");

  // Y nada del cobro: ni buscador, ni carrito, ni pagos, ni totales.
  expect(html).not.toContain("pos-search");
  expect(html).not.toContain("pos-checkout");
  expect(html).not.toContain("pos-payments");
  expect(html).not.toContain("pos-cart-line");
  expect(html).not.toContain("pos-totals");
  expect(html).not.toContain("pos-result-row");
});

test("y en pantalla ve la restricción, no el cobro", async ({ page }) => {
  await page.goto("/panel/pos/venta");
  await expect(
    page.getByRole("heading", { name: "Acceso comercial restringido" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("pos-checkout")).toHaveCount(0);
  await expect(page.getByTestId("pos-payments")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cobrar y registrar venta" })).toHaveCount(0);
});
