import { expect, test, type Page } from "@playwright/test";

import {
  MKT_CAMPAIGN_OTHER,
  MKT_CAMPAIGN_OWN,
  MKT_LINKED_CHANNEL_LABEL,
  MKT_SNAPSHOT_CURRENCY,
} from "./fixtures";

/**
 * SUITE-Marketing-E2E (alcance de MARKETING) — **la asimetría que sólo este rol
 * produce.**
 *
 * ## Por qué existe esta suite y no basta con la de Admin
 *
 * En las tres puertas del panel, Admin y MARKETING son el mismo usuario:
 * `canViewMarketing`, `canManageMarketing` y `canViewLeadAttribution` admiten a
 * los dos. Si eso fuera todo, esta suite sería cobertura duplicada y más lenta.
 *
 * Lo que los separa está una capa por debajo de Marketing, en
 * `server/auth/roles.ts`: **`isGlobalRole` admite sólo a `ADMIN` y `CONTADOR`.**
 * Un usuario MARKETING con sucursal asignada recibe por tanto el código de su
 * sucursal en la sesión, mientras `getMarketingScopeForUser` le sigue dando
 * alcance **global** para campañas. La página de Marketing usa las dos cosas, y
 * de ahí sale un estado que la sesión de administrador no puede producir:
 *
 *     campañas           -> globales      (getMarketingScopeForUser -> global)
 *     informe atribución -> su sucursal   (la página le pasa el branchCode)
 *
 * Las dos mitades se comprueban aquí, y el contraste con la suite de Admin —que
 * ve el mismo gasto **con** los leads de Granada— es lo que lo demuestra.
 */
test.describe.configure({ mode: "serial" });

const MARKETING = "/panel/marketing";

async function open(page: Page) {
  await page.goto(MARKETING);
  await expect(
    page.getByRole("heading", { name: "Campañas", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
}

test("MARKETING gestiona el panel igual que Admin", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);

  // `canManageMarketing` lo admite: recibe lo que al Gerente se le niega.
  await expect(page.getByRole("button", { name: "Conectar cuenta" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nueva campaña", exact: true }),
  ).toBeVisible();
  // Y `canViewLeadAttribution` también.
  await expect(
    page.getByRole("heading", { name: "Atribución de leads", exact: true }),
  ).toBeVisible();
});

test("su lista de campañas es GLOBAL pese a tener sucursal asignada", async ({
  page,
}) => {
  await open(page);

  /*
   * Su sucursal es `rosita`. Ver también la campaña de `granada` es la prueba de
   * que `getMarketingScopeForUser` resuelve a `global` por el ROL, sin mirar el
   * código de sucursal que sí lleva la sesión. Es justo lo contrario de lo que
   * le pasa al Gerente con las mismas dos campañas.
   */
  await expect(page.getByText(MKT_CAMPAIGN_OTHER)).toBeVisible();
  await expect(page.getByText(MKT_CAMPAIGN_OWN)).toBeVisible();
});

test("su informe de atribución SÍ queda acotado a su sucursal", async ({ page }) => {
  await open(page);

  // El aviso sólo se dibuja cuando el informe recibió un `branchCode`, así que
  // su presencia es la señal de que la acotación ocurrió.
  await expect(
    page.getByText(/Leads y ventas están acotados a tu sucursal/),
  ).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: MKT_LINKED_CHANNEL_LABEL });
  await expect(row).toBeVisible();

  /*
   * **El mismo gasto, distintos leads.** El gasto no se acota por sucursal —una
   * cuenta publicitaria no pertenece a ninguna— así que la cifra es idéntica a
   * la que ve el administrador. El lead del arnés está en Granada, y esta sesión
   * cuenta los de Rosita: cero. Sin leads no hay coste por lead, y la celda
   * muestra un guion en vez de un número inventado.
   *
   * Ese par —gasto igual, leads distintos— es exactamente la asimetría, y no se
   * puede observar con ninguna otra identidad.
   */
  await expect(row).toContainText("1,234.56");
  await expect(row).toContainText(MKT_SNAPSHOT_CURRENCY);
  await expect(row).toContainText("—");
});
