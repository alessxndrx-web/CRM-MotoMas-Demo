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
 *     campañas           -> globales   (getMarketingScopeForUser -> global)
 *     informe atribución -> su sucursal (la página le pasaba el branchCode)
 *
 * **Marketing-P1 deshizo esa asimetría**, y por eso esta suite hoy afirma lo
 * contrario de lo que afirmaba: las dos mitades son globales. La identidad sigue
 * pagando su coste, porque es la única que puede demostrar que el alcance lo
 * decide el ROL y no el código de sucursal que la sesión sí lleva.
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

/*
 * Patch Marketing-P1 — **esta prueba afirmaba lo contrario, y el cambio es el
 * arreglo de un segundo defecto.**
 *
 * Attribution-1 pasaba al informe el `branchId` de la sesión en crudo. Como
 * `isGlobalRole` no admite a MARKETING, esa sesión llevaba el código de su
 * sucursal y el informe salía acotado — mientras su lista de campañas era
 * global. Marketing-P1 le pasa el `MarketingScope` ya resuelto, como
 * `listMarketingCampaigns`, y entonces las dos mitades coinciden.
 *
 * No es una preferencia: `getMarketingScopeForUser` lo dice en su propio
 * comentario — «MARKETING has cross-branch campaign/attribution scope inside
 * this module». **Atribución** aparece ahí por su nombre.
 *
 * El mismo cambio cierra un fallo-abierto en la otra punta: un Gerente sin
 * sucursal resolvía a la cadena vacía, que es falsy, y el filtro desaparecía
 * dejándole las cifras de toda la empresa. Con el alcance por delante, resuelve
 * a `none` y el informe sale vacío.
 */
test("su informe de atribución es GLOBAL, igual que su lista de campañas", async ({
  page,
}) => {
  await open(page);

  // Sin aviso de sucursal: no hay ninguna acotación que advertir.
  await expect(
    page.getByText(/Leads y ventas están acotados a tu sucursal/),
  ).toHaveCount(0);
  await expect(page.getByText("Leads y ventas de tu sucursal.")).toHaveCount(0);

  const row = page.getByRole("row").filter({ hasText: MKT_LINKED_CHANNEL_LABEL });
  await expect(row).toBeVisible();

  // Ve el gasto —`canViewLeadAttribution` la admite— y cuenta el lead de
  // Granada, que es de otra sucursal que la suya. Eso es el alcance global.
  await expect(row).toContainText("1,234.56");
  await expect(row).toContainText(MKT_SNAPSHOT_CURRENCY);
  await expect(row).not.toContainText("—");
});
