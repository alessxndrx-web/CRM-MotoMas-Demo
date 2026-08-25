import { expect, test, type Page } from "@playwright/test";

import {
  MKT_AD_ACCOUNT_ID,
  MKT_AD_ACCOUNT_LABEL,
  MKT_CAMPAIGN_GLOBAL,
  MKT_CAMPAIGN_OTHER,
  MKT_CAMPAIGN_OWN,
  MKT_LINKED_CHANNEL_LABEL,
  MKT_SNAPSHOT_SPEND,
  prisma,
} from "./fixtures";

/** El gasto sembrado, tal como lo escribiría la pantalla en es-NI. */
const MKT_SNAPSHOT_SPEND_LABEL = "1,234.56";

/**
 * SUITE-Marketing-E2E (gerente) — **la razón de ser de este arnés.**
 *
 * La cabecera de `playwright.config.ts` lo dice: los smokes reproducen el cuerpo
 * de las acciones precisamente porque las acciones autorizan contra una cookie,
 * «so authorization was the one thing 434 assertions never covered». Marketing
 * es el módulo donde eso más pesa, porque tiene **tres puertas distintas** y un
 * alcance por sucursal, y ninguna de las cuatro se puede observar con la sesión
 * de administrador: Admin las abre todas.
 *
 * Lo que se afirma aquí:
 *
 *   canViewMarketing      -> el Gerente ENTRA.
 *   getMarketingScopeForUser -> ve su sucursal y las campañas sin sucursal;
 *                            **no** ve la de otra sucursal, y no la ve porque
 *                            el servidor no se la manda.
 *   canManageMarketing    -> no recibe ninguna superficie de gestión.
 *   canViewLeadAttribution -> no recibe la tabla a nivel de lead, pero SÍ el
 *                            agregado por canal, y ése sin columnas de dinero
 *                            (Patch Marketing-P1).
 */
test.describe.configure({ mode: "serial" });

const MARKETING = "/panel/marketing";

async function open(page: Page) {
  await page.goto(MARKETING);
  await expect(
    page.getByRole("heading", { name: "Campañas", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
}

test("el gerente entra al panel: canViewMarketing lo admite", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);

  // No es la tarjeta de restricción, que es lo que recibe un rol bloqueado.
  await expect(page.getByText("Marketing restringido")).toHaveCount(0);
});

test("ve la campaña de su sucursal y la de toda la empresa", async ({ page }) => {
  await open(page);

  await expect(page.getByText(MKT_CAMPAIGN_OWN)).toBeVisible();
  // La rama `targetBranchId: null` de `campaignWhere`: una campaña sin sucursal
  // es de toda la empresa y el Gerente la ve. Sin esta aserción, «el alcance
  // funciona» podría significar «el alcance no deja ver nada».
  await expect(page.getByText(MKT_CAMPAIGN_GLOBAL)).toBeVisible();
});

test("NO ve la campaña de otra sucursal, y el servidor no se la manda", async ({
  page,
}) => {
  await open(page);

  // Ausente del DOM, no meramente oculta.
  await expect(page.getByText(MKT_CAMPAIGN_OTHER)).toHaveCount(0);

  /*
   * **Y ausente de lo que salió por el cable.**
   *
   * Esta segunda mitad es la que convierte la prueba en una prueba de la capa de
   * consulta. `MarketingDbPanel` filtra también en el cliente, así que una
   * campaña ausente del DOM podría estarlo por ese filtro y no por el `where`
   * del servidor. Si el nombre no aparece en el HTML crudo, el acotamiento
   * ocurrió en `campaignWhere`, que es donde tiene que ocurrir.
   */
  const html = await (await page.request.get(MARKETING)).text();
  expect(html).toContain(MKT_CAMPAIGN_OWN);
  expect(html).not.toContain(MKT_CAMPAIGN_OTHER);

  // Y la campaña existe de verdad: si no, esto no probaría nada.
  expect(
    await prisma.marketingCampaign.count({ where: { name: MKT_CAMPAIGN_OTHER } }),
  ).toBe(1);
});

test("no recibe ninguna superficie de gestión: canManageMarketing lo excluye", async ({
  page,
}) => {
  await open(page);

  // Ausentes del DOM. Un control ausente es una afirmación más fuerte que un
  // control oculto: no hay CSS que revertir ni atributo que quitar.
  await expect(page.getByRole("button", { name: "Conectar cuenta" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Nueva campaña", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finalizar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Actualizar todo" })).toHaveCount(0);
});

test("el servidor tampoco le manda los datos de la integración de Meta", async ({
  page,
}) => {
  /*
   * **Que un botón no se dibuje no es una frontera de seguridad.** La frontera
   * es `canManageMarketing` en el servidor, y esto la observa donde sí se puede
   * observar desde un navegador: en lo que el servidor decidió incluir.
   *
   * Si el identificador de la cuenta publicitaria no viaja en la respuesta, el
   * servidor no ejecutó `listMetaAdAccounts` para esta sesión — no es que el
   * cliente lo escondiera después de recibirlo.
   */
  const html = await (await page.request.get(MARKETING)).text();

  // El identificador `act_…` es la identidad de la cuenta ante el Graph API y
  // sólo lo publica el registro. No viaja.
  expect(html).not.toContain(MKT_AD_ACCOUNT_ID);
  // Ni el registro ni el tablero de métricas. El informe por canal SÍ le llega
  // desde Marketing-P1, y tiene su propia prueba más abajo.
  expect(html).not.toContain("Cuentas publicitarias conectadas");
  expect(html).not.toContain("Métricas por cuenta");

  // La cuenta existe: la ausencia es una decisión del servidor, no un vacío.
  expect(
    await prisma.metaAdAccount.count({ where: { adAccountId: MKT_AD_ACCOUNT_ID } }),
  ).toBe(1);

  /*
   * ---------------------------------------------------------------------
   * SEGUNDO HALLAZGO, dejado a la vista y NO afirmado como correcto.
   * ---------------------------------------------------------------------
   *
   * La **etiqueta** de la cuenta sí llega, y no por el registro: viene dentro de
   * `MarketingCampaignDTO.metaAdAccountLabel`, que Attribution-1 añadió a un DTO
   * que el Gerente ya recibía. La tarjeta de la campaña enlazada la imprime como
   * «Gasto real: …».
   *
   * No es lo mismo que el registro —no lleva el `act_…`, ni gasto, ni métricas,
   * ni permite tocar nada— y se refiere a una campaña que esta sesión ya puede
   * ver. Pero `page.tsx` dice que la integración de Meta «sólo la ve quien
   * administra Marketing», y este dato la contradice a medias.
   *
   * Se comprueba tal como está **para que el hallazgo quede escrito**, no porque
   * se dé por bueno. Si se decide que un Gerente no debe saber de qué cuenta sale
   * el gasto de su campaña, hay que anular ese campo en `mapCampaign` para quien
   * no gestiona, y esta aserción se invierte.
   */
  expect(html).toContain(MKT_AD_ACCOUNT_LABEL);
});

test("no recibe la atribución a nivel de lead: canViewLeadAttribution lo excluye", async ({
  page,
}) => {
  await open(page);

  await expect(
    page.getByRole("heading", { name: "Atribución de leads", exact: true }),
  ).toHaveCount(0);
});

/*
 * ===========================================================================
 * Patch Marketing-P1 — lo que antes era un fallo esperado.
 * ===========================================================================
 *
 * `canViewLeadAttribution` dice, en su propio comentario, qué se le quita al
 * Gerente y qué se le deja:
 *
 *     "Managers keep aggregate campaign metrics but do not receive
 *      lead-level rows."
 *
 * Lo que se le quita —la tabla a nivel de lead— siempre estuvo bien hecho, y la
 * prueba de arriba lo demuestra. Lo que se le deja son las métricas
 * **agregadas**, y ahí Attribution-1 se equivocó: colgó
 * `getMarketingAttributionReport` —una tabla por CANAL, sin ninguna identidad de
 * lead— dentro del bloque `canManage`, así que el Gerente no la recibía. Los
 * otros dos agregados del panel sí le llegaban.
 *
 * Estas tres pruebas estuvieron marcadas con `test.fail()` mientras el defecto
 * existió, para que la suite no convirtiera en contrato un comportamiento
 * equivocado. **La anotación se retiró con el arreglo**, que es lo que la hacía
 * honesta: dejarla puesta habría escondido pruebas que pasan.
 */
test("el gerente SÍ recibe el informe de atribución por canal", async ({ page }) => {
  await open(page);

  await expect(
    page.getByRole("heading", { name: "Atribución por canal", exact: true }),
  ).toBeVisible();

  // Con sus cifras de verdad: el lead sembrado en su sucursal, en su canal.
  const row = page.getByRole("row").filter({ hasText: MKT_LINKED_CHANNEL_LABEL });
  await expect(row).toBeVisible();
  await expect(row).toContainText("1");
});

test("pero SIN las columnas de dinero: no vienen vacías, no vienen", async ({
  page,
}) => {
  await open(page);

  const table = page
    .getByRole("table")
    .filter({ hasText: MKT_LINKED_CHANNEL_LABEL });

  // Lo que sí le corresponde.
  await expect(
    table.getByRole("columnheader", { name: "Leads", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Ventas", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Importe vendido", exact: true }),
  ).toBeVisible();

  /*
   * Y lo que no. **Ausentes del DOM, no en blanco ni con un guion.** Un guion
   * habría dicho «sin datos», que es una frase que esta tabla usa para otra cosa
   * —una cuenta publicitaria sin foto del periodo— y colapsar las dos habría
   * hecho creer a un Gerente que el gasto no se ha consultado.
   */
  await expect(
    table.getByRole("columnheader", { name: "Gasto", exact: true }),
  ).toHaveCount(0);
  await expect(
    table.getByRole("columnheader", { name: "Coste por lead", exact: true }),
  ).toHaveCount(0);

  // Y el aviso que sí le toca: qué está contando, sin hablar de escalas mezcladas.
  await expect(page.getByText("Leads y ventas de tu sucursal.")).toBeVisible();
  await expect(page.getByText(/el gasto es de toda la empresa/)).toHaveCount(0);
});

test("y la cifra de gasto no sale del servidor, no es que la pantalla la esconda", async ({
  page,
}) => {
  /*
   * **La prueba que de verdad importa de este parche.**
   *
   * Ocultar columnas en el cliente no es ocultar nada: el número habría viajado
   * igual dentro de la carga de la página y cualquiera podría leerlo. El
   * servidor no lo incluye porque `getMarketingAttributionReport` recibe
   * `includeCost: false` y entonces **ni siquiera consulta** las fotos de gasto.
   */
  const html = await (await page.request.get(MARKETING)).text();

  expect(html).toContain("Atribución por canal");
  expect(html).not.toContain(MKT_SNAPSHOT_SPEND_LABEL);
  expect(html).not.toContain("costPerLead");

  // La foto existe y tiene ese importe: la ausencia es una decisión, no un vacío.
  expect(
    await prisma.metaAdMetricSnapshot.count({
      where: { adAccountId: MKT_AD_ACCOUNT_ID, spend: MKT_SNAPSHOT_SPEND },
    }),
  ).toBe(1);
});
