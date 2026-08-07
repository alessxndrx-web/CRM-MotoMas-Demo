import { expect, test } from "@playwright/test";

/**
 * SUITE-POS2.3 (denegada).
 *
 * `canOperateCaja` no admite a CONTADOR. Como en el resto del panel, el chasis lo
 * restringe por área durante el renderizado del servidor, así que lo que se
 * afirma es que **el servidor no emite ninguna superficie de existencias**.
 *
 * **[I]** La otra denegación —GERENTE, que alcanza el área pero no pasa
 * `canOperateCaja` y vería `inventario-denied`— no se ejercita: el arnés no tiene
 * sesión de gerente. Queda anotada como límite, no como cobertura.
 */
test("un contador no recibe las existencias del servidor", async ({ page }) => {
  const html = await (await page.request.get("/panel/pos/inventario")).text();

  expect(html).toContain("Acceso comercial restringido");
  expect(html).not.toContain("registrar-ingreso");
  expect(html).not.toContain("registrar-ajuste");
  expect(html).not.toContain("operacion-formulario");
  expect(html).not.toContain("tabla-fila");
});

test("y en pantalla ve la restricción", async ({ page }) => {
  await page.goto("/panel/pos/inventario");
  await expect(
    page.getByRole("heading", { name: "Acceso comercial restringido" }),
  ).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId("registrar-ingreso")).toHaveCount(0);
});
