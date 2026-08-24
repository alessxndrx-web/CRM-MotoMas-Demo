import { expect, test, type Page } from "@playwright/test";

import { TAG, prisma } from "./fixtures";

/**
 * SUITE-POS1.0-B — catálogo del punto de venta, a través de la interfaz real.
 *
 * Corre con la sesión de **administrador**: el POS reutiliza `canOperateCaja`,
 * que no admite a Contador.
 *
 * Un producto no tiene estados, así que no hay transiciones que probar; lo que
 * sí hay es unicidad de SKU y de código de barras, y una búsqueda que **resuelve
 * en el servidor**, no filtrando lo ya cargado.
 *
 * ## Contrato tras la migración al sistema de diseño
 *
 * La pantalla se llama «Productos»; su contexto —«Catálogo»— lo da el eyebrow del
 * `PageHeader`, no el título. Y la fila dejó de ser un `div` propio: es la fila de
 * `DataTable`, `tabla-fila`, acotada a la tabla que la contiene, igual que en
 * SUITE-POS2.3. **Lo que se afirma no cambió** —qué ve y qué puede hacer el
 * mostrador— porque el comportamiento tampoco.
 */
test.describe.configure({ mode: "serial" });

const CATALOGO = "/panel/pos/productos";

let counter = 0;
/** SKU único por prueba, con el tag que usa la limpieza. */
function skuFor(name: string) {
  counter += 1;
  return `${TAG}-${name}-${counter}`;
}

/** Todo el estado de la lista vive en la URL, así que la prueba lo maneja igual. */
type Params = { q?: string; estado?: string; pagina?: string; tam?: string };

async function openCatalogue(page: Page, params: Params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value),
  ).toString();
  await page.goto(query ? `${CATALOGO}?${query}` : CATALOGO);
  // El chasis repite el rótulo de navegación en su propia cabecera, así que el
  // anclaje va acotado al contenido principal, donde vive el `PageHeader`.
  await expect(
    page.getByRole("main").getByRole("heading", { name: "Productos" }),
  ).toBeVisible({ timeout: 45_000 });
  // **Sin `networkidle`.** Misma conclusión que POS1.2-F: el servidor de pruebas
  // es `next dev`, que además de la recarga en caliente compila cada ruta que la
  // barra lateral prefetcha, así que la red no queda quieta y la espera colgó
  // con la pantalla ya pintada. No afirmaba nada. Lo que sí afirma algo es que
  // el alta acepte lo tecleado, y eso se comprueba donde se teclea.
}

async function createProduct(
  page: Page,
  input: {
    sku: string;
    name: string;
    price: string;
    barcode?: string;
    /** Rótulo de la unidad, tal como se lee en el selector. */
    unit?: string;
  },
) {
  await openCatalogue(page);
  const form = page.getByTestId("pos-product-create-form");
  await form.getByLabel("SKU").fill(input.sku);
  await form.getByLabel("Nombre").fill(input.name);
  if (input.barcode) await form.getByLabel("Código de barras").fill(input.barcode);
  await form.getByLabel("Precio").fill(input.price);
  if (input.unit) {
    await form.getByLabel("Unidad de medida").selectOption({ label: input.unit });
  }

  // Los campos son controlados: si el valor sigue ahí, React lo recibió, y eso
  // **prueba que la pantalla enganchó**. Sin hidratar, React los habría vaciado
  // al reconciliar. `networkidle` solo probaba que la red estuvo callada medio
  // segundo, y ni siquiera eso de forma fiable bajo `next dev`.
  await expect(form.getByLabel("SKU")).toHaveValue(input.sku);
  await form.getByRole("button", { name: "Registrar producto" }).click();
}

/** La tabla del catálogo: `DataTable` emite `tabla-fila` en toda tabla. */
const productsTable = (page: Page) => page.getByTestId("tabla-productos");

const productRows = (page: Page) => productsTable(page).getByTestId("tabla-fila");

function productRow(page: Page, sku: string) {
  return productRows(page).filter({ hasText: sku });
}

async function stored(sku: string) {
  return prisma.posProduct.findUniqueOrThrow({ where: { sku } });
}

/** Espera a que la base refleje el cambio, o falla con el motivo del servidor. */
async function expectStored(
  page: Page,
  sku: string,
  read: (row: Record<string, unknown>) => unknown,
  expected: unknown,
) {
  await expect
    .poll(
      async () => {
        const notice = page.getByTestId("pos-error");
        if (await notice.count()) return `RECHAZADO: ${await notice.innerText()}`;
        const row = await prisma.posProduct.findUnique({ where: { sku } });
        if (!row) return "SIN FILA";
        return read(row as unknown as Record<string, unknown>);
      },
      { timeout: 45_000 },
    )
    .toBe(expected);
}

test.beforeAll(async ({ browser }) => {
  // Compilación en frío fuera del presupuesto de cualquier test, igual que en
  // SUITE-POS2.2/2.3/2.4. Esta suite era la única del POS sin este bloque: nació
  // antes del patrón y sobrevivía porque la ruta era barata de compilar. Al
  // componerse desde el sistema de diseño ya no lo es, y el primer test pagaba
  // el minuto de compilación con su propio reloj de 60 s.
  test.setTimeout(300_000);
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    await page.goto(CATALOGO, { timeout: 180_000, waitUntil: "domcontentloaded" });
  } finally {
    await context.close();
  }
});

test("la cabecera sitúa la pantalla dentro del catálogo", async ({ page }) => {
  await openCatalogue(page);
  const main = page.getByRole("main");

  // El título nombra la pantalla; el contexto —el catálogo— es el eyebrow. No
  // son el mismo texto, y colapsarlos en uno es lo que la migración deshizo.
  await expect(main.getByRole("heading", { name: "Productos" })).toBeVisible();
  await expect(main.getByText("Catálogo", { exact: true })).toBeVisible();
  // Y la descripción declara la frontera: los datos maestros se editan aquí, las
  // existencias no. Es la frase que impide que esta pantalla crezca hacia
  // inventario la próxima vez que alguien eche de menos el saldo.
  await expect(main).toContainText("viven en las bodegas");
});

test("crea un producto", async ({ page }) => {
  const sku = skuFor("CASCO");
  await createProduct(page, {
    sku,
    name: "Casco integral",
    price: "1250.50",
    barcode: `${TAG}-BC-1`,
  });

  await expectStored(page, sku, (row) => row.name, "Casco integral");
  const row = await stored(sku);
  expect(Number(row.unitPrice)).toBe(1250.5);
  expect(row.barcode).toBe(`${TAG}-BC-1`);
  expect(row.isActive).toBe(true);

  await expect(productRow(page, sku)).toBeVisible();
  await expect(productRow(page, sku).getByTestId("pos-product-price")).toContainText(
    "1,250.50",
  );
  // El éxito se anuncia. Antes un alta correcta y una rechazada se veían igual:
  // el formulario se vaciaba y no pasaba nada más.
  await expect(page.getByTestId("pos-ok")).toContainText("Casco integral");
});

test("crea un producto sin código de barras", async ({ page }) => {
  const sku = skuFor("ACEITE");
  await createProduct(page, { sku, name: "Aceite 20W50", price: "250" });

  await expectStored(page, sku, (row) => row.name, "Aceite 20W50");
  expect((await stored(sku)).barcode).toBeNull();
});

test("edita nombre y precio", async ({ page }) => {
  const sku = skuFor("EDIT");
  await createProduct(page, { sku, name: "Nombre viejo", price: "100" });
  await expectStored(page, sku, (row) => row.name, "Nombre viejo");

  await openCatalogue(page);
  await productRow(page, sku).getByRole("button", { name: "Editar" }).click();
  const editor = page.getByTestId("pos-product-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Nombre").fill("Nombre nuevo");
  await editor.getByLabel("Precio").fill("175.25");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  await expectStored(page, sku, (row) => row.name, "Nombre nuevo");
  expect(Number((await stored(sku)).unitPrice)).toBe(175.25);
});

test("desactiva y vuelve a activar", async ({ page }) => {
  const sku = skuFor("BAJA");
  await createProduct(page, { sku, name: "Retirable", price: "90" });
  await expectStored(page, sku, (row) => row.isActive, true);

  await openCatalogue(page);
  // El alta y las acciones por fila solo existen para quien pasa
  // `canOperateCaja`, que el servidor resuelve desde la sesión firmada. Esta
  // suite corre como administrador; sin ese permiso la pantalla es de consulta.
  await expect(page.getByTestId("pos-product-create-form")).toBeVisible();
  await expect(
    productRow(page, sku).getByRole("button", { name: "Editar" }),
  ).toBeVisible();

  await productRow(page, sku).getByRole("button", { name: "Desactivar" }).click();
  await expectStored(page, sku, (row) => row.isActive, false);
  // Un inactivo sigue en la lista: desactivar retira, no borra.
  await expect(productRow(page, sku)).toContainText("Inactivo");

  await productRow(page, sku).getByRole("button", { name: "Activar" }).click();
  await expectStored(page, sku, (row) => row.isActive, true);
});

test("el SKU duplicado se rechaza con el mensaje del servidor", async ({ page }) => {
  const sku = skuFor("DUP");
  await createProduct(page, { sku, name: "Original", price: "10" });
  await expectStored(page, sku, (row) => row.name, "Original");

  await createProduct(page, { sku, name: "Copia", price: "20" });
  await expect(page.getByTestId("pos-error")).toContainText(/SKU o código/i, {
    timeout: 20_000,
  });
  // El original no cambió.
  expect((await stored(sku)).name).toBe("Original");
});

test("el código de barras duplicado se rechaza", async ({ page }) => {
  const barcode = `${TAG}-BC-UNICO`;
  const first = skuFor("BC1");
  await createProduct(page, { sku: first, name: "Primero", price: "10", barcode });
  await expectStored(page, first, (row) => row.barcode, barcode);

  const second = skuFor("BC2");
  await createProduct(page, { sku: second, name: "Segundo", price: "20", barcode });
  await expect(page.getByTestId("pos-error")).toContainText(/SKU o código/i, {
    timeout: 20_000,
  });
  expect(await prisma.posProduct.count({ where: { sku: second } })).toBe(0);
});

test("busca por código de barras exacto", async ({ page }) => {
  const sku = skuFor("SCAN");
  const barcode = `${TAG}-BC-SCAN`;
  await createProduct(page, { sku, name: "Escaneable", price: "500", barcode });
  await expectStored(page, sku, (row) => row.barcode, barcode);

  // Lo que hace un lector: teclear el código y encontrar el artículo.
  await openCatalogue(page, { q: barcode });
  await expect(productRows(page)).toHaveCount(1);
  await expect(productRow(page, sku)).toBeVisible();
});

test("busca por SKU exacto", async ({ page }) => {
  const sku = skuFor("PORSKU");
  await createProduct(page, { sku, name: "Buscable", price: "300" });
  await expectStored(page, sku, (row) => row.name, "Buscable");

  await openCatalogue(page, { q: sku });
  await expect(productRows(page)).toHaveCount(1);
  await expect(productRow(page, sku)).toBeVisible();
});

test("busca por nombre parcial", async ({ page }) => {
  const sku = skuFor("PARCIAL");
  await createProduct(page, { sku, name: "Guantes de cuero reforzados", price: "400" });
  await expectStored(page, sku, (row) => row.name, "Guantes de cuero reforzados");

  await openCatalogue(page, { q: "cuero reforz" });
  await expect(productRow(page, sku)).toBeVisible();
});

test("la búsqueda se resuelve en el servidor, no filtrando lo cargado", async ({
  page,
}) => {
  const sku = skuFor("SERVIDOR");
  await createProduct(page, { sku, name: "Solo por servidor", price: "77" });
  await expectStored(page, sku, (row) => row.name, "Solo por servidor");

  await openCatalogue(page);
  const total = await productRows(page).count();
  expect(total).toBeGreaterThan(1);

  // Escribir en el campo y pulsar Enter navega: el término viaja en la URL.
  await page.getByLabel("Buscar").fill(sku);
  await page.getByLabel("Buscar").press("Enter");
  await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(sku)}`));
  await expect(productRows(page)).toHaveCount(1);
});

test("el producto persiste tras recargar", async ({ page }) => {
  const sku = skuFor("PERSIST");
  await createProduct(page, { sku, name: "Persistente", price: "2500" });
  await expectStored(page, sku, (row) => row.name, "Persistente");

  await page.reload();
  const row = productRow(page, sku);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("pos-product-price")).toContainText("2,500.00");
});

test("un precio que no es un número se rechaza, y no da de alta nada", async ({
  page,
}) => {
  const sku = skuFor("PRECIO");
  await openCatalogue(page);
  const form = page.getByTestId("pos-product-create-form");
  await form.getByLabel("SKU").fill(sku);
  await form.getByLabel("Nombre").fill("Precio inválido");
  await form.getByLabel("Precio").fill("abc");
  await expect(form.getByLabel("SKU")).toHaveValue(sku);
  await form.getByRole("button", { name: "Registrar producto" }).click();

  // El error se señala en su campo y **no viaja nada al servidor**. Antes el
  // navegador convertía «abc» en 0 y el artículo nacía gratis: la validación del
  // servidor nunca llegaba a ver el dato malo porque ya lo habían sustituido.
  await expect(form).toContainText("Escribe un precio");
  await expect(form.getByLabel("Precio")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("pos-ok")).toHaveCount(0);
  expect(await prisma.posProduct.count({ where: { sku } })).toBe(0);

  // Y corregirlo lo da de alta: el formulario no queda atascado.
  await form.getByLabel("Precio").fill("45.50");
  await form.getByRole("button", { name: "Registrar producto" }).click();
  await expectStored(page, sku, (row) => Number(row.unitPrice), 45.5);
});

test("la unidad de medida se declara y llega a la base", async ({ page }) => {
  const sku = skuFor("LITRO");
  await createProduct(page, {
    sku,
    name: "Aceite a granel",
    price: "80",
    unit: "Litro",
  });

  // Sin poder declararla, todo el catálogo era UNIDAD y un artículo que se vende
  // en litros no tenía forma de decirlo — pese a que las existencias muestran la
  // unidad en cada saldo y en cada movimiento.
  await expectStored(page, sku, (row) => row.unit, "LITRO");
  await expect(productRow(page, sku)).toContainText("Litro");
});

test("los umbrales de existencia se declaran desde el catálogo", async ({ page }) => {
  const sku = skuFor("UMBRAL");
  await createProduct(page, { sku, name: "Con umbral", price: "60" });
  await expectStored(page, sku, (row) => row.name, "Con umbral");
  // Nacen sin declarar, que es distinto de declarados en cero.
  expect(Number((await stored(sku)).minimumStock)).toBe(0);

  await openCatalogue(page);
  await productRow(page, sku).getByRole("button", { name: "Editar" }).click();
  const editor = page.getByTestId("pos-product-editor");
  await editor.getByLabel("Existencia mínima").fill("4");
  await editor.getByLabel("Punto de reposición").fill("9.5");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();

  // Son los umbrales que `/pos/inventario` compara para decir «Bajo mínimo» y
  // «Reponer»: sin una pantalla que los escriba, esos dos estados no podían
  // ocurrir nunca.
  await expectStored(page, sku, (row) => Number(row.minimumStock), 4);
  expect(Number((await stored(sku)).reorderPoint)).toBe(9.5);

  // Y vuelven al formulario: lo guardado es lo que se ve al reabrirlo.
  await openCatalogue(page);
  await productRow(page, sku).getByRole("button", { name: "Editar" }).click();
  await expect(
    page.getByTestId("pos-product-editor").getByLabel("Existencia mínima"),
  ).toHaveValue("4");
});

test("el filtro de estado separa lo retirado de lo vendible", async ({ page }) => {
  const sku = skuFor("FILTRO");
  await createProduct(page, { sku, name: "Retirado por filtro", price: "30" });
  await expectStored(page, sku, (row) => row.isActive, true);

  await openCatalogue(page);
  await productRow(page, sku).getByRole("button", { name: "Desactivar" }).click();
  await expectStored(page, sku, (row) => row.isActive, false);

  // Con «Activo» desaparece; con «Inactivo» es el único que queda. Sin el filtro
  // el catálogo mezclaba lo vendible con lo retirado y no había forma de
  // separarlos: el servidor ya sabía hacerlo y nadie podía pedírselo.
  await openCatalogue(page, { q: sku, estado: "activo" });
  await expect(page.getByTestId("tabla-productos")).toHaveCount(0);

  await openCatalogue(page, { q: sku, estado: "inactivo" });
  await expect(productRows(page)).toHaveCount(1);
  await expect(productRow(page, sku)).toContainText("Inactivo");
});

test("la lista dice cuántos artículos hay y pagina sin perder ninguno", async ({
  page,
}) => {
  // Doce artículos con un nombre común, sembrados por la base porque darlos de
  // alta uno a uno por pantalla mediría el formulario, no la paginación.
  const marca = `${TAG}-PAG`;
  await prisma.posProduct.createMany({
    data: Array.from({ length: 12 }, (_, index) => ({
      sku: `${marca}-${String(index).padStart(2, "0")}`,
      name: `Paginado ${marca} ${String(index).padStart(2, "0")}`,
      unitPrice: 10 + index,
    })),
  });

  await openCatalogue(page, { q: marca, tam: "10" });
  const paginacion = page.getByTestId("paginacion-productos");
  // **El rango es lo que importa**, más que los botones: antes la consulta
  // cortaba en 200 filas sin decirlo y quien tuviera más no podía enterarse.
  await expect(paginacion).toContainText(/1\s*[-–—]\s*10/);
  await expect(paginacion).toContainText("de 12");
  await expect(productRows(page)).toHaveCount(10);

  await paginacion.getByRole("button", { name: "Página siguiente" }).click();
  await expect(page).toHaveURL(/pagina=2/);
  await expect(productRows(page)).toHaveCount(2);
  await expect(paginacion).toContainText(/11\s*[-–—]\s*12/);

  // Las dos páginas no se solapan: el orden es estable y nada se repite ni falta.
  await expect(productRows(page).first()).toContainText(`${marca}-10`);
  await expect(productRows(page).last()).toContainText(`${marca}-11`);

  // Pedir una página que ya no existe devuelve la última, no una lista vacía.
  await openCatalogue(page, { q: marca, tam: "10", pagina: "9" });
  await expect(productRows(page)).toHaveCount(2);
});

test("los campos son alcanzables con teclado y están etiquetados", async ({
  page,
}) => {
  await openCatalogue(page);
  const form = page.getByTestId("pos-product-create-form");

  const skuField = form.getByLabel("SKU");
  await expect(skuField).toBeVisible();
  await skuField.focus();
  await page.keyboard.press("Tab");
  await expect(form.getByLabel("Nombre")).toBeFocused();

  await expect(form.getByLabel("Precio")).toHaveAttribute("inputmode", "decimal");

  // Y el buscador también. Sin nombre accesible, un lector de pantalla anuncia
  // «cuadro de búsqueda» y nada más: el marcador de posición no es un nombre, y
  // además desaparece en cuanto se escribe.
  await expect(page.getByRole("searchbox", { name: "Buscar" })).toBeVisible();
});

test("el catálogo es usable en móvil", async ({ page }) => {
  const sku = skuFor("MOVIL");
  await createProduct(page, { sku, name: "Visible en móvil", price: "120" });
  await expectStored(page, sku, (row) => row.name, "Visible en móvil");

  await page.setViewportSize({ width: 390, height: 844 });
  // Acotado a su propio artículo: con la paginación en marcha, «lo que acabo de
  // crear está en la primera página» dejó de ser cierto y era una suposición,
  // no una afirmación sobre el móvil.
  await openCatalogue(page, { q: sku });

  await expect(page.getByTestId("pos-product-create-form")).toBeVisible();
  // **La tabla sigue siendo una tabla.** `DataTable` esconde lo accesorio y
  // desplaza el resto dentro de su contenedor; convertir la fila en tarjeta
  // destruiría la densidad con la que trabaja un mostrador.
  await expect(productRow(page, sku)).toBeVisible();
  await expect(productsTable(page).locator("th", { hasText: "Artículo" })).toBeVisible();
  await expect(
    productsTable(page).locator("th", { hasText: "Código de barras" }),
  ).toBeHidden();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
