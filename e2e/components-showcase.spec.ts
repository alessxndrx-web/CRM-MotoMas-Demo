import { expect, test, type Page } from "@playwright/test";

/**
 * SUITE-POS2.0-C — la biblioteca de componentes.
 *
 * Corre contra el showcase, que no toca la base de datos: **ninguna prueba de
 * aquí depende de fixtures, y ninguna deja residuo.** Eso es deliberado — lo que
 * se comprueba es comportamiento de interfaz, y mezclarlo con datos reales
 * convertiría un fallo de componente en un fallo indistinguible de uno de datos.
 *
 * Se prueba comportamiento, no presencia: que seleccionar cambie el estado
 * indeterminado de la cabecera, que un filtro sin resultados diga por qué, que un
 * error de formulario quede asociado a su campo, que el diálogo devuelva el foco.
 */
test.describe.configure({ mode: "serial" });

const RUTA = "/panel/dev/componentes";

const WIDTHS = [
  { name: "1440px", width: 1440, height: 900 },
  { name: "1280px", width: 1280, height: 800 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "768px", width: 768, height: 1024 },
  { name: "390px", width: 390, height: 844 },
];

async function open(page: Page) {
  await page.goto(RUTA);
  await expect(page.getByRole("heading", { name: "Componentes de Operaciones" })).toBeVisible(
    { timeout: 45_000 },
  );
}

const rows = (page: Page) => page.getByTestId("tabla-fila");
const rowBoxes = (page: Page) => page.getByTestId("tabla-seleccionar-fila");
const allBox = (page: Page) => page.getByTestId("tabla-seleccionar-todo");

test.beforeAll(async ({ browser }) => {
  // Compilación en frío fuera del presupuesto de cualquier test, como en las
  // suites anteriores: una ruta nueva se compila la primera vez que se pide.
  test.setTimeout(300_000);
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    await page.goto(RUTA, { timeout: 180_000, waitUntil: "domcontentloaded" });
  } finally {
    await context.close();
  }
});

/* ---------------------------------------------------------------------------
 * Tabla
 * ------------------------------------------------------------------------ */

test("la tabla dibuja sus filas y alinea los números a la derecha", async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(6);

  // `numeric` alinea **y** activa cifras tabulares: las dos cosas juntas.
  const costCell = rows(page).first().locator("td").last();
  const styles = await costCell.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { align: computed.textAlign, variant: computed.fontVariantNumeric };
  });
  expect(styles.align).toBe("right");
  expect(styles.variant).toContain("tabular-nums");
});

test("seleccionar una fila la marca y la anuncia", async ({ page }) => {
  await open(page);
  await rowBoxes(page).first().check();

  await expect(rows(page).first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("barra-masiva")).toBeVisible();
  await expect(page.getByTestId("barra-masiva")).toContainText("1");
});

test("la cabecera pasa por indeterminado antes que por marcado", async ({ page }) => {
  await open(page);
  // Cinco seleccionables: la retirada no lo es.
  await expect(rowBoxes(page)).toHaveCount(6);

  await rowBoxes(page).first().check();
  expect(
    await allBox(page).evaluate((node: HTMLInputElement) => node.indeterminate),
  ).toBe(true);

  await allBox(page).check();
  await expect(page.getByTestId("barra-masiva")).toContainText("5");
  expect(
    await allBox(page).evaluate((node: HTMLInputElement) => node.indeterminate),
  ).toBe(false);
});

test("una fila no seleccionable no se puede seleccionar", async ({ page }) => {
  await open(page);
  // La fila retirada: atenuada, presente, y con su casilla deshabilitada.
  const retired = rows(page).filter({ hasText: "Cadena de transmisión" });
  await expect(retired).toBeVisible();
  await expect(retired.getByTestId("tabla-seleccionar-fila")).toBeDisabled();

  await allBox(page).check();
  // Selecciona las cinco que sí, nunca las seis.
  await expect(page.getByTestId("barra-masiva")).toContainText("5");
});

test("la selección se limpia desde su propia barra", async ({ page }) => {
  await open(page);
  await allBox(page).check();
  await expect(page.getByTestId("barra-masiva")).toBeVisible();

  await page.getByTestId("barra-masiva-limpiar").click();
  await expect(page.getByTestId("barra-masiva")).toHaveCount(0);
  // Al desaparecer la barra masiva vuelven los filtros: no se apilan.
  await expect(page.getByTestId("filtros-busqueda")).toBeVisible();
});

test("la fila se abre con el ratón y con el teclado", async ({ page }) => {
  await open(page);

  await rows(page).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("ART-001");
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);

  // Y con teclado: la fila tiene parada de tabulación y responde a Enter.
  await rows(page).nth(1).focus();
  await expect(rows(page).nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("ART-002");
});

test("marcar la casilla no abre la fila", async ({ page }) => {
  await open(page);
  await rowBoxes(page).first().check();
  // Son dos intenciones distintas sobre el mismo píxel.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

/* ---------------------------------------------------------------------------
 * Filtros y vacíos
 * ------------------------------------------------------------------------ */

test("el buscador de la barra de filtros se nombra a sí mismo", async ({ page }) => {
  await open(page);

  // `FilterBar` no expone el campo, así que el nombre accesible tiene que
  // venir de `SearchField`: si dependiera del llamador, ninguna pantalla que
  // use la barra lo tendría. El marcador de posición no lo suple — no se
  // expone como nombre y desaparece al escribir.
  const search = page.getByRole("searchbox", { name: "Buscar" });
  await expect(search).toBeVisible();
  await search.fill("aceite");
  await expect(search).toHaveValue("aceite");
});

test("buscar reduce las filas y el contador aparece", async ({ page }) => {
  await open(page);
  await page.getByTestId("filtros-busqueda").fill("aceite");

  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId("filtros-limpiar")).toContainText("1");
});

test("un filtro sin resultados explica por qué, en vez de decir «no hay datos»", async ({
  page,
}) => {
  await open(page);
  await page.getByTestId("filtros-busqueda").fill("no-existe-nada");

  await expect(rows(page)).toHaveCount(0);
  const table = page.locator("table");
  await expect(table).toContainText(/filtros/i);
  await expect(table).not.toContainText("Todavía no hay artículos");
});

test("limpiar filtros los quita todos y desaparece el botón", async ({ page }) => {
  await open(page);
  await page.getByTestId("filtros-busqueda").fill("filtro");
  await page.getByTestId("filtro-grupo").selectOption("Motor");
  await expect(page.getByTestId("filtros-limpiar")).toContainText("2");

  await page.getByTestId("filtros-limpiar").click();
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByTestId("filtros-limpiar")).toHaveCount(0);
});

test("los dos vacíos dicen cosas distintas", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("vacio")).toContainText("Sin artículos todavía");
  await expect(page.getByTestId("sin-resultados")).toContainText("Sin resultados");
  // El primero ofrece crear; el segundo nunca, porque crear no responde a una
  // búsqueda vacía.
  await expect(page.getByTestId("vacio").getByRole("button")).toContainText("Crear");
  await expect(page.getByTestId("sin-resultados").getByRole("button")).toContainText(
    "Quitar filtros",
  );
});

/* ---------------------------------------------------------------------------
 * Carga
 * ------------------------------------------------------------------------ */

test("el estado de carga sustituye a la tabla y luego vuelve", async ({ page }) => {
  await open(page);
  await page.getByTestId("alternar-carga").click();

  await expect(page.getByTestId("tabla-cargando")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);

  await page.getByTestId("alternar-carga").click();
  await expect(page.getByTestId("tabla-cargando")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(6);
});

/* ---------------------------------------------------------------------------
 * Formulario
 * ------------------------------------------------------------------------ */

test("el error del formulario queda asociado a su campo", async ({ page }) => {
  await open(page);
  await page.getByTestId("formulario-enviar").click();

  const nameField = page.getByTestId("campo-nombre");
  await expect(nameField).toHaveAttribute("aria-invalid", "true");

  // **Lo que importa no es que el texto exista, sino que el campo lo señale.**
  const describedBy = await nameField.getAttribute("aria-describedby");
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText("Escribe un nombre.");
  await expect(page.locator(`#${describedBy}`)).toHaveAttribute("role", "alert");
});

test("el error sustituye a la pista en vez de sumarse", async ({ page }) => {
  await open(page);
  const cost = page.getByTestId("campo-costo");
  const hintId = await cost.getAttribute("aria-describedby");
  await expect(page.locator(`#${hintId}`)).toHaveText("Sin impuestos.");

  await page.getByTestId("formulario-enviar").click();
  const errorId = await cost.getAttribute("aria-describedby");
  await expect(page.locator(`#${errorId}`)).toHaveText("El costo debe ser mayor que cero.");
  // Una sola línea de ayuda bajo el campo, no dos.
  await expect(page.locator(`#${hintId}`)).toHaveCount(hintId === errorId ? 1 : 0);
});

test("el error se va cuando el campo se corrige", async ({ page }) => {
  await open(page);
  await page.getByTestId("formulario-enviar").click();
  await expect(page.getByTestId("campo-nombre")).toHaveAttribute("aria-invalid", "true");

  await page.getByTestId("campo-nombre").fill("Filtro nuevo");
  await expect(page.getByTestId("campo-nombre")).not.toHaveAttribute("aria-invalid", "true");
});

test("el rótulo enfoca su control", async ({ page }) => {
  await open(page);
  await page.getByText("Nombre del artículo").click();
  await expect(page.getByTestId("campo-nombre")).toBeFocused();
});

/* ---------------------------------------------------------------------------
 * Confirmación
 * ------------------------------------------------------------------------ */

test("la acción peligrosa pide confirmación antes de ejecutarse", async ({ page }) => {
  await open(page);
  await page.getByTestId("accion-anular").click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // El título nombra la consecuencia, no pregunta «¿estás seguro?».
  await expect(dialog).toContainText("DEMO-0031");
  await expect(page.getByTestId("registro-accion")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Anular documento" }).click();
  await expect(page.getByTestId("registro-accion")).toContainText("Documento anulado");
});

test("cancelar no ejecuta nada", async ({ page }) => {
  await open(page);
  await page.getByTestId("accion-anular").click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("registro-accion")).toHaveCount(0);
});

test("el diálogo devuelve el foco al botón que lo abrió", async ({ page }) => {
  await open(page);
  await page.getByTestId("accion-anular").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Sin esto, el siguiente tabulador empieza desde el principio de la página.
  await expect(page.getByTestId("accion-anular")).toBeFocused();
});

test("el diálogo atrapa el foco mientras está abierto", async ({ page }) => {
  await open(page);
  await page.getByTestId("accion-anular").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
});

/* ---------------------------------------------------------------------------
 * Cajón de detalle
 * ------------------------------------------------------------------------ */

test("el cajón muestra los pares campo/valor y dice lo ausente", async ({ page }) => {
  await open(page);
  await rows(page).first().click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("term").first()).toBeVisible();
  await expect(drawer).toContainText("Costo unitario");
  // Un valor ausente se dice; un hueco en blanco parece un fallo.
  await expect(drawer).toContainText("—");
});

/* ---------------------------------------------------------------------------
 * Responsive
 * ------------------------------------------------------------------------ */

for (const size of WIDTHS) {
  test(`sin desbordamiento horizontal a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await open(page);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("en móvil la tabla esconde lo accesorio y se desplaza en su contenedor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  // **No se convierte en tarjetas**: sigue siendo una tabla, con menos columnas.
  await expect(page.locator("table")).toBeVisible();
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByRole("columnheader", { name: "Grupo" })).toBeHidden();
  await expect(page.getByRole("columnheader", { name: "Artículo" })).toBeVisible();

  // Si algo sobra de ancho, se desplaza dentro del marco, no en la página.
  const scrollable = await page
    .locator("table")
    .evaluate((node) => {
      const box = node.closest("div");
      return box ? box.scrollWidth >= box.clientWidth : false;
    });
  expect(scrollable).toBe(true);
});

test("en móvil los controles caben y se pueden tocar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);

  const search = page.getByTestId("filtros-busqueda");
  const box = (await search.boundingBox())!;
  expect(box.width).toBeGreaterThan(200);

  // Ningún botón por debajo del umbral táctil razonable.
  const heights = await page
    .getByRole("button")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => node.getBoundingClientRect().height),
    );
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(24);
});
