import { expect, test, type Page } from "@playwright/test";

import {
  MKT_AD_ACCOUNT_ID,
  MKT_AD_ACCOUNT_LABEL,
  MKT_CAMPAIGN_LINKED,
  MKT_LINKED_CHANNEL_LABEL,
  MKT_SNAPSHOT_CURRENCY,
  TAG,
  prisma,
} from "./fixtures";

/**
 * SUITE-Marketing-E2E (acceso completo) — la sesión de administrador.
 *
 * ## Qué prueba esto que un smoke no puede
 *
 * `smoke:meta3`, `smoke:meta4` y `smoke:attr1` llaman a las acciones
 * **directamente**, inyectando una cookie firmada en `globalThis`. Eso ejercita
 * la lógica y no ejercita nada de lo que hay entre la lógica y la persona: el
 * formulario, el `startTransition` que llama a la Server Action, el
 * `router.refresh()` que vuelve a pedir la página, y el servidor decidiendo qué
 * incluir en el HTML según el rol de la sesión.
 *
 * Por eso esta suite **no repite la aritmética**: ni la división entre cero, ni
 * las ventanas de fechas, ni los estados vacíos. Todo eso está probado y
 * repetirlo aquí sería la misma cobertura, más lenta y más frágil.
 *
 * Lo que sí prueba: que el viaje de ida y vuelta existe, y que con esta sesión
 * **están** los controles que la sesión de Gerente no tiene.
 *
 * ## Lo que esta suite NO puede probar, y por qué
 *
 * Conectar una cuenta publicitaria y refrescar métricas exigen el Graph API:
 * `connectMetaAdAccount` consulta a Meta **antes** de escribir la fila, y
 * `GRAPH_API_HOST` es una constante del módulo, sin variable de entorno que la
 * redirija a un doble. El arnés no tiene token y no debe salir a la red.
 *
 * `page.route()` tampoco sirve: esa llamada la hace el proceso de Node del
 * servidor, no el navegador, así que no pasa por el interceptor de Playwright.
 *
 * Se prueba entonces lo que sí es demostrable sin red, que es justo lo que a
 * esta suite le corresponde: que el formulario **llega al servidor**, que el
 * servidor **deja pasar a este rol** —si no, el mensaje sería el de permiso— y
 * que responde con su propio error de configuración. La cuenta y su foto se
 * siembran con Prisma, como el resto de los fixtures.
 */
test.describe.configure({ mode: "serial" });

const MARKETING = "/panel/marketing";

/** Nombre de la campaña que esta suite crea **por la pantalla**. */
const CREATED_CAMPAIGN = `${TAG} Campana Creada E2E`;

async function open(page: Page) {
  await page.goto(MARKETING);
  await expect(
    page.getByRole("heading", { name: "Campañas", exact: true }),
  ).toBeVisible({ timeout: 120_000 });
}

test("el administrador llega al panel y ve las tres tablas del módulo", async ({
  page,
}) => {
  // El servidor de desarrollo compila la ruta bajo demanda; ese coste no es lo
  // que esta prueba quiere medir.
  test.setTimeout(300_000);
  await open(page);

  await expect(
    page.getByRole("heading", { name: "Cuentas publicitarias conectadas" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Métricas por cuenta" })).toBeVisible();
  // Desde Marketing-P1 la atribución por canal ya no cuelga del panel de Meta
  // sino de la página; para esta sesión se ve igual, que es el punto.
  await expect(
    page.getByRole("heading", { name: "Atribución por canal" }),
  ).toBeVisible();
});

test("la cuenta publicitaria del registro se muestra con su identificador", async ({
  page,
}) => {
  await open(page);

  /*
   * Meta-3, camino de lectura. Se ancla en la FILA del registro, no en el texto
   * suelto: la etiqueta de la cuenta aparece también en la tarjeta de la campaña
   * enlazada y en el desplegable del formulario, así que buscarla por texto
   * casaría con cuatro sitios y no probaría que el registro la muestra.
   *
   * La tabla se identifica por su columna «Estado en Meta», que es suya y de
   * ninguna otra: el `act_…` aparece también en el tablero de métricas, así que
   * por sí solo tampoco distingue una tabla de la otra.
   */
  const registry = page.getByRole("table").filter({ hasText: "Estado en Meta" });
  const row = registry.getByRole("row").filter({ hasText: MKT_AD_ACCOUNT_ID });
  await expect(row).toBeVisible();
  await expect(row).toContainText(MKT_AD_ACCOUNT_LABEL);
});

test("la foto de métricas se muestra con su edad, no como un número sin fecha", async ({
  page,
}) => {
  await open(page);

  // Meta-4 muestra «hace X» junto a cada cifra a propósito: un número sin fecha
  // invita a creer que es de ahora mismo. La foto del arnés tiene dos horas.
  await expect(page.getByText(/hace \d+ horas?/).first()).toBeVisible();
});

test("el administrador alcanza la acción de conectar; el servidor responde por falta de token, no por permiso", async ({
  page,
}) => {
  await open(page);

  await page.getByRole("button", { name: "Conectar cuenta" }).click();
  await page.getByPlaceholder("act_1234567890").fill("act_9000000999");
  await page.getByRole("button", { name: "Conectar", exact: true }).click();

  /*
   * **Ésta es la aserción de autorización, no la de integración.**
   *
   * `connectMetaAdAccount` comprueba `canManageMarketing` ANTES de mirar el
   * token. Si esta sesión no pasara esa puerta, el mensaje sería «No tienes
   * permiso para gestionar las cuentas publicitarias de Meta». Que lo que
   * aparezca sea el error del token demuestra que la petición **atravesó la
   * autorización** y murió más adelante, en la configuración.
   */
  await expect(page.getByText(/META_MARKETING_ACCESS_TOKEN no configurado/)).toBeVisible();
  await expect(page.getByText(/No tienes permiso/)).toHaveCount(0);

  // Y no se escribió ninguna fila: el registro sólo aceptaría la cuenta después
  // de que Meta confirmara que el token puede leerla.
  expect(
    await prisma.metaAdAccount.count({ where: { adAccountId: "act_9000000999" } }),
  ).toBe(0);
});

test("refrescar métricas alcanza el servidor con esta sesión", async ({ page }) => {
  await open(page);

  await page.getByRole("button", { name: "Actualizar todo" }).click();

  // Mismo razonamiento: el fallo que se ve es el de configuración, no el de
  // permiso, así que la puerta dejó pasar a este rol.
  await expect(page.getByText(/META_MARKETING_ACCESS_TOKEN no configurado/)).toBeVisible();
  await expect(page.getByText(/No tienes permiso/)).toHaveCount(0);
});

test("crear una campaña por la pantalla y enlazarla a la cuenta publicitaria", async ({
  page,
}) => {
  await open(page);

  const form = page.locator("form").filter({ has: page.getByPlaceholder("Nombre de campaña") });
  await form.getByPlaceholder("Nombre de campaña").fill(CREATED_CAMPAIGN);

  // El desplegable de Attribution-1. Se elige por la etiqueta visible, que es lo
  // que ve quien usa la pantalla; su valor es el cuid, que nadie teclea.
  await form.getByRole("combobox").filter({ hasText: MKT_AD_ACCOUNT_LABEL }).selectOption({
    label: MKT_AD_ACCOUNT_LABEL,
  });

  await form.getByRole("button", { name: "Crear campaña" }).click();
  await expect(page.getByText("Campaña creada.")).toBeVisible();

  /*
   * El enlace tiene que sobrevivir al viaje entero —formulario, Server Action,
   * base, y la consulta que vuelve a leerla— y aparecer en la tarjeta. La
   * tarjeta lo etiqueta «Gasto real» para distinguirlo del presupuesto
   * planificado, que es otra cifra y está justo encima.
   */
  // El padre del encabezado es el bloque de la tarjeta: dentro están el canal,
  // el presupuesto planificado y esta línea. Anclar ahí prueba que el enlace
  // salió en LA campaña creada, no en cualquier otra de la lista.
  const card = page.getByRole("heading", { name: CREATED_CAMPAIGN }).locator("..");
  await expect(card.getByText(`Gasto real: ${MKT_AD_ACCOUNT_LABEL}`)).toBeVisible();

  // Y en la base, que es donde de verdad quedó.
  const saved = await prisma.marketingCampaign.findFirst({
    where: { name: CREATED_CAMPAIGN },
    select: { metaAdAccount: { select: { adAccountId: true } } },
  });
  expect(saved?.metaAdAccount?.adAccountId).toBe(MKT_AD_ACCOUNT_ID);
});

test("el informe de atribución muestra el gasto de la cuenta enlazada", async ({
  page,
}) => {
  await open(page);

  /*
   * **No se comprueba la aritmética**: `smoke:attr1` ya prueba el coste por lead,
   * la ventana de fechas y los estados vacíos con 40 aserciones. Lo que se
   * comprueba aquí es que la cadena entera —campaña enlazada → cuenta → foto →
   * consulta → tabla— llega hasta el HTML que ve una persona.
   */
  const row = page.getByRole("row").filter({ hasText: MKT_LINKED_CHANNEL_LABEL });
  await expect(row).toBeVisible();
  await expect(row).toContainText("1,234.56");
  await expect(row).toContainText(MKT_SNAPSHOT_CURRENCY);

  // El administrador es global, así que el lead sembrado en Granada cuenta.
  await expect(row).not.toContainText("Sin datos");
});

test("el administrador ve la atribución a nivel de lead", async ({ page }) => {
  await open(page);

  // `canViewLeadAttribution` admite a Admin y MARKETING. Es la tabla que el
  // Gerente **no** debe recibir, y aquí se prueba el lado que sí la recibe.
  await expect(
    page.getByRole("heading", { name: "Atribución de leads", exact: true }),
  ).toBeVisible();
});

test("la campaña de otra sucursal también se ve: el alcance de Admin es global", async ({
  page,
}) => {
  await open(page);

  // Es el contraste de la prueba de acotamiento del Gerente: la misma campaña
  // que a él se le oculta, aquí está. Sin esto, «el Gerente no la ve» podría
  // significar simplemente que la campaña no existe.
  await expect(page.getByText(MKT_CAMPAIGN_LINKED)).toBeVisible();
  await expect(page.getByText(`${TAG} Campana Rosita`)).toBeVisible();
  await expect(page.getByText(`${TAG} Campana Granada`)).toBeVisible();
});
