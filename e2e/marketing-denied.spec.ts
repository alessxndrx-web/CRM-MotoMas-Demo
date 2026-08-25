import { expect, test } from "@playwright/test";

import { MKT_AD_ACCOUNT_ID, MKT_CAMPAIGN_GLOBAL, MKT_CAMPAIGN_OWN } from "./fixtures";

/**
 * SUITE-Marketing-E2E (denegada) — el rol bloqueado.
 *
 * ## Por qué el Contador y no otro
 *
 * `canViewMarketing` admite `ADMIN`, `GERENTE` y `MARKETING`. De las identidades
 * que este arnés ya mantiene, la de Contabilidad es la única que queda fuera, y
 * ya tiene sesión, proyecto y las otras cuatro suites `*-denied` corriendo con
 * ella. Añadir una sexta identidad para repetir lo mismo habría costado otro
 * login sin afirmar nada nuevo.
 *
 * ## El borde no basta
 *
 * `src/proxy.ts` sólo comprueba que **exista** sesión; no mira el rol. Un
 * Contador autenticado llega a `/panel/marketing` con un 200 legítimo, y quien
 * lo rechaza es la propia página con `canViewMarketing`. Por eso lo que se
 * afirma es lo mismo que en `pos-checkout-denied.spec.ts`: **qué salió por el
 * cable.** Un rechazo que sólo escondiera la pantalla en el cliente dejaría los
 * datos dentro del HTML.
 */
const MARKETING = "/panel/marketing";

test("un contador no recibe el panel de Marketing del servidor", async ({ page }) => {
  test.setTimeout(300_000);

  const response = await page.request.get(MARKETING);
  const html = await response.text();

  expect(html).toContain("Marketing restringido");

  // Ninguna de las tres capas del panel viaja: ni campañas, ni la integración de
  // Meta, ni el informe de atribución.
  expect(html).not.toContain(MKT_CAMPAIGN_OWN);
  expect(html).not.toContain(MKT_CAMPAIGN_GLOBAL);
  expect(html).not.toContain(MKT_AD_ACCOUNT_ID);
  expect(html).not.toContain("Cuentas publicitarias conectadas");
  expect(html).not.toContain("Atribución por canal");
  expect(html).not.toContain("Atribución de leads");
});

/**
 * **Son dos capas, y la prueba de arriba y ésta miran una cada una.**
 *
 * El chasis (`operations-shell.tsx`) aparta al Contador de todo lo que no sea
 * `/panel/contabilidad` y le enseña «Acceso comercial restringido» — es lo que
 * ve una persona, y llega antes que cualquier pantalla concreta.
 *
 * Debajo, y con independencia de él, la página de Marketing comprueba
 * `canViewMarketing` y devuelve su propia tarjeta sin ejecutar ninguna consulta.
 * Ésa es la capa que importa, porque un chasis es presentación: la prueba
 * anterior la observa en el HTML crudo, donde se ve que salió «Marketing
 * restringido» y **ningún dato**.
 *
 * Que las dos existan es correcto y la suite lo deja escrito. Si algún día el
 * chasis dejara de apartarlo, la puerta del servidor seguiría cerrada.
 */
test("y en el navegador el chasis lo aparta antes de dibujar nada de Marketing", async ({
  page,
}) => {
  await page.goto(MARKETING);

  await expect(
    page.getByRole("heading", { name: "Acceso comercial restringido" }),
  ).toBeVisible({ timeout: 45_000 });

  // «Restringido» y «vacío» son cosas distintas y no pueden verse igual: sin
  // esto, un panel que fallara al cargar pasaría por un panel que niega.
  await expect(
    page.getByRole("heading", { name: "Campañas", exact: true }),
  ).toHaveCount(0);
});
