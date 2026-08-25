import { expect, test, type Page } from "@playwright/test";

import { MAPPED_BRANCH_CODE, TAG, UNMAPPED_BRANCH_CODE, openHarnessShift, prisma } from "./fixtures";

/**
 * SUITE-POS7.0 — los módulos que el mostrador estrena: catálogo operativo,
 * clientes, reportes y configuración del terminal.
 *
 * ## Lo que esta suite vigila de verdad
 *
 * Tres de las cuatro pantallas nuevas leen datos que **no son de quien
 * pregunta** si la autorización falla: la cartera de clientes de otra sucursal,
 * la ficha de un cliente ajeno y las ventas de otro mostrador. Un id de cliente
 * o de venta no es un secreto —viaja en URLs y en pantallas—, así que «no
 * aparece en la lista» no protege nada. Lo que se afirma aquí es lo fuerte: que
 * la URL directa tampoco abre.
 *
 * El catálogo y los reportes se comprueban contra la base, no contra sí mismos:
 * una pantalla que enseña lo que ella misma calculó no demuestra nada.
 */
test.describe.configure({ mode: "serial" });

const CATEGORIA = `${TAG} Categoría POS`;
const EN_CATEGORIA = {
  sku: `${TAG}-MOD-ENCAT`,
  name: "Artículo con categoría",
  price: 777,
};
const SIN_CATEGORIA = {
  sku: `${TAG}-MOD-SINCAT`,
  name: "Artículo sin categoría",
  price: 333,
};

/*
 * Marca propia y **deliberadamente distinta de la del arnés**.
 *
 * `fixtures.ts` siembra un cliente llamado exactamente `${TAG} Cliente` en la
 * sucursal del operador. Buscar «${TAG} Cliente» devolvía ese y el de esta
 * suite —los dos correctos, los dos de la sucursal propia— y la prueba lo leía
 * como si el alcance hubiera fallado. Un término que solo puede referirse a los
 * clientes de esta suite es lo que hace que contar filas signifique algo.
 */
const MARCA_CLIENTE = `${TAG}-CLI`;
const CLIENTE_PROPIO = `${MARCA_CLIENTE} Propio`;
const CLIENTE_AJENO = `${MARCA_CLIENTE} Ajeno`;
const VENTA_HOY = `${TAG}-MOD-VENTA-HOY`;

let ownCustomerId = "";
let foreignCustomerId = "";
let categoryId = "";

test.beforeAll(async () => {
  test.setTimeout(300_000);
  /*
   * Patch E2E-Harness-Fix — **el turno lo abre esta suite, no otra.**
   *
   * Cobra en efectivo, y desde D3 eso exige turno abierto. Lo heredaba de
   * `pos-caja.spec.ts` por orden alfabético, que no es una garantía: esa suite
   * termina cerrando y borrando todos los turnos, porque su último test necesita
   * exactamente eso.
   */
  await openHarnessShift();

  const [own, foreign] = await Promise.all([
    prisma.branch.findFirstOrThrow({ where: { code: MAPPED_BRANCH_CODE } }),
    prisma.branch.findFirstOrThrow({ where: { code: UNMAPPED_BRANCH_CODE } }),
  ]);
  const cashier = await prisma.user.findFirstOrThrow({
    where: { email: { startsWith: TAG.toLowerCase() } },
  });

  const category = await prisma.posCategory.upsert({
    where: { name: CATEGORIA },
    update: { isActive: true },
    create: { name: CATEGORIA },
  });
  categoryId = category.id;

  const inCategory = await prisma.posProduct.upsert({
    where: { sku: EN_CATEGORIA.sku },
    update: {
      name: EN_CATEGORIA.name,
      unitPrice: EN_CATEGORIA.price,
      isActive: true,
      categoryId: category.id,
    },
    create: {
      sku: EN_CATEGORIA.sku,
      name: EN_CATEGORIA.name,
      unitPrice: EN_CATEGORIA.price,
      categoryId: category.id,
    },
  });
  await prisma.posProduct.upsert({
    where: { sku: SIN_CATEGORIA.sku },
    update: {
      name: SIN_CATEGORIA.name,
      unitPrice: SIN_CATEGORIA.price,
      isActive: true,
      categoryId: null,
    },
    create: {
      sku: SIN_CATEGORIA.sku,
      name: SIN_CATEGORIA.name,
      unitPrice: SIN_CATEGORIA.price,
    },
  });

  // Dos clientes con el mismo prefijo y distinta sucursal: es lo que permite
  // distinguir «la búsqueda no encontró» de «la búsqueda no puede alcanzar».
  await prisma.customer.deleteMany({
    where: { name: { in: [CLIENTE_PROPIO, CLIENTE_AJENO] } },
  });
  const [ownCustomer, foreignCustomer] = await Promise.all([
    prisma.customer.create({
      data: {
        branchId: own.id,
        name: CLIENTE_PROPIO,
        phone: "50590001",
        phoneNormalized: "50590001",
      },
    }),
    prisma.customer.create({
      data: {
        branchId: foreign.id,
        name: CLIENTE_AJENO,
        phone: "50590002",
        phoneNormalized: "50590002",
      },
    }),
  ]);
  ownCustomerId = ownCustomer.id;
  foreignCustomerId = foreignCustomer.id;

  // Una venta de hoy, del cliente propio: alimenta a la vez el historial del
  // cliente y el informe del turno.
  await prisma.posSale.deleteMany({ where: { saleNumber: VENTA_HOY } });
  await prisma.posSale.create({
    data: {
      saleNumber: VENTA_HOY,
      branchId: own.id,
      cashierId: cashier.id,
      customerId: ownCustomer.id,
      status: "COMPLETADA",
      subtotal: 1554,
      discount: 0,
      tax: 0,
      total: 1554,
      completedAt: new Date(),
      items: {
        create: [
          {
            productId: inCategory.id,
            productName: EN_CATEGORIA.name,
            productSku: EN_CATEGORIA.sku,
            quantity: 2,
            unitPrice: EN_CATEGORIA.price,
            discount: 0,
            tax: 0,
            total: 1554,
            position: 0,
          },
        ],
      },
      payments: { create: [{ method: "EFECTIVO", amount: 1554 }] },
    },
  });
});

test.afterAll(async () => {
  await prisma.posSale.deleteMany({ where: { saleNumber: VENTA_HOY } });
  await prisma.customer.deleteMany({
    where: { name: { in: [CLIENTE_PROPIO, CLIENTE_AJENO] } },
  });
});

async function open(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(
    page.getByRole("main").getByRole("heading", { name: heading }),
  ).toBeVisible({ timeout: 45_000 });
}

/**
 * La pantalla de venta, **lista para que la toquen**.
 *
 * El encabezado y la rejilla vienen del servidor, así que verlos no significa
 * que React haya hidratado: una pulsación en una ficha de categoría antes de
 * hidratar no la registra nadie y la prueba mediría el pintado del servidor.
 *
 * La señal es el foco en el buscador, que es **comportamiento declarado del
 * terminal** desde POS4.0 —«abre listo para escanear»— y solo ocurre en el
 * cliente. Esperarla no es una espera arbitraria: es esperar a lo que la
 * pantalla promete hacer al abrirse.
 */
async function openVenta(page: Page) {
  await open(page, "/pos/venta", "Punto de venta");
  await expect(page.getByLabel("Buscar artículo")).toBeFocused({ timeout: 30_000 });
}

/* ---------------------------------------------------------------------------
 * Catálogo operativo
 * ------------------------------------------------------------------------ */

test("el catálogo abre con artículos ya pintados por el servidor", async ({
  page,
}) => {
  await open(page, "/pos/catalogo", "Catálogo");
  // Sin tocar nada: el servidor ya trajo el catálogo, no hay viaje al montar.
  await expect(page.getByTestId("pos-catalogo-articulo").first()).toBeVisible();
  await expect(page.getByTestId("pos-catalogo-lista")).toContainText(
    EN_CATEGORIA.sku,
  );
});

test("el catálogo dice el precio de venta y no el costo", async ({ page }) => {
  await open(page, "/pos/catalogo", "Catálogo");
  const row = page
    .getByTestId("pos-catalogo-articulo")
    .filter({ hasText: EN_CATEGORIA.sku });
  await expect(row).toContainText("777.00");
  // El costo es del panel administrativo: frente al cliente no se enseña.
  await expect(page.getByRole("main")).not.toContainText(/costo/i);
});

test("filtrar por categoría estrecha el catálogo de verdad", async ({ page }) => {
  await open(page, "/pos/catalogo", "Catálogo");
  await expect(
    page.getByTestId("pos-catalogo-lista").filter({ hasText: SIN_CATEGORIA.sku }),
  ).toHaveCount(1);

  await page.getByTestId("pos-catalogo-categoria").selectOption(categoryId);

  // El de la categoría sigue; el que no es de ella desaparece. Si el filtro no
  // llegara al servidor, ambos seguirían en pantalla.
  await expect(
    page.getByTestId("pos-catalogo-articulo").filter({ hasText: EN_CATEGORIA.sku }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("pos-catalogo-articulo").filter({ hasText: SIN_CATEGORIA.sku }),
  ).toHaveCount(0);
});

test("el catálogo encuentra por SKU exacto y no agrega nada al carrito", async ({
  page,
}) => {
  await open(page, "/pos/catalogo", "Catálogo");
  await page.getByTestId("pos-catalogo-buscar").fill(EN_CATEGORIA.sku);
  await page.getByTestId("pos-catalogo-buscar").press("Enter");
  await expect(page.getByTestId("pos-catalogo-articulo")).toHaveCount(1, {
    timeout: 20_000,
  });
  // **Consultar no es vender.** Esta pantalla no tiene carrito y no finge tenerlo.
  await expect(page.getByTestId("pos-abrir-carrito")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Agregar" })).toHaveCount(0);
});

/* ---------------------------------------------------------------------------
 * La pantalla de venta abre con catálogo
 * ------------------------------------------------------------------------ */

test("la venta abre con categorías y catálogo, no en blanco", async ({ page }) => {
  await openVenta(page);
  await expect(page.getByTestId("pos-categorias")).toBeVisible();
  await expect(page.getByTestId("pos-catalogo-item").first()).toBeVisible({
    timeout: 20_000,
  });
});

test("elegir una categoría en la venta estrecha la rejilla", async ({ page }) => {
  await openVenta(page);
  await expect(
    page.getByTestId("pos-catalogo-item").filter({ hasText: SIN_CATEGORIA.sku }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("pos-categoria").filter({ hasText: CATEGORIA }).click();

  await expect(
    page.getByTestId("pos-catalogo-item").filter({ hasText: EN_CATEGORIA.sku }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("pos-catalogo-item").filter({ hasText: SIN_CATEGORIA.sku }),
  ).toHaveCount(0);
});

test("agregar desde la rejilla del catálogo llena el carrito", async ({ page }) => {
  await openVenta(page);
  const tile = page
    .getByTestId("pos-catalogo-item")
    .filter({ hasText: EN_CATEGORIA.sku });
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.getByRole("button", { name: "Agregar" }).click();

  await page.getByTestId("pos-abrir-carrito").click();
  await expect(
    page.getByTestId("pos-cart-line").filter({ hasText: EN_CATEGORIA.sku }),
  ).toBeVisible({ timeout: 20_000 });
});

test("escanear no borra el catálogo de la pantalla", async ({ page }) => {
  await openVenta(page);
  await expect(page.getByTestId("pos-catalogo-item").first()).toBeVisible({
    timeout: 20_000,
  });

  await page.getByLabel("Buscar artículo").fill(EN_CATEGORIA.sku);
  await page.getByLabel("Buscar artículo").press("Enter");

  // El SKU exacto entra solo y **la rejilla sigue ahí**: el mostrador no se
  // queda en blanco después de cada artículo.
  await expect(page.getByLabel("Buscar artículo")).toHaveValue("", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("pos-catalogo-item").first()).toBeVisible();
});

/* ---------------------------------------------------------------------------
 * Clientes
 * ------------------------------------------------------------------------ */

test("el buscador de clientes encuentra a los de esta sucursal", async ({
  page,
}) => {
  await open(page, "/pos/clientes", "Clientes");
  await page.getByTestId("pos-clientes-termino").fill(MARCA_CLIENTE);
  await page.getByTestId("pos-clientes-termino").press("Enter");
  await expect(page.getByTestId("pos-cliente-fila")).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect(page.getByTestId("pos-clientes-resultados")).toContainText(
    CLIENTE_PROPIO,
  );
});

test("el buscador de clientes no alcanza la cartera de otra sucursal", async ({
  page,
}) => {
  await open(page, "/pos/clientes", "Clientes");
  // El término coincide con los dos; solo puede volver el propio.
  await page.getByTestId("pos-clientes-termino").fill(MARCA_CLIENTE);
  await page.getByTestId("pos-clientes-termino").press("Enter");
  await expect(page.getByTestId("pos-cliente-fila").first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole("main")).not.toContainText(CLIENTE_AJENO);
});

test("la ficha del cliente enseña lo que compró en este mostrador", async ({
  page,
}) => {
  await page.goto(`/pos/clientes/${ownCustomerId}`);
  await expect(page.getByTestId("pos-cliente-detalle")).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByTestId("pos-cliente-ventas")).toContainText(VENTA_HOY);
  await expect(page.getByTestId("pos-cliente-total")).toContainText("1,554.00");
});

test("la ficha de un cliente de otra sucursal no se abre ni por su URL", async ({
  page,
}) => {
  // La afirmación fuerte: el id existe y es válido, y aun así no abre. Sin la
  // comprobación de sucursal en `getPosCustomer`, esta prueba falla.
  const response = await page.goto(`/pos/clientes/${foreignCustomerId}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByTestId("pos-cliente-detalle")).toHaveCount(0);
});

test("crear clientes se declara no disponible, en vez de fingirse", async ({
  page,
}) => {
  await open(page, "/pos/clientes", "Clientes");
  await expect(page.getByTestId("pos-clientes-limites")).toContainText(
    /no está disponible/i,
  );
  await expect(page.getByRole("button", { name: /Nuevo cliente/i })).toHaveCount(0);
});

/* ---------------------------------------------------------------------------
 * Reportes
 * ------------------------------------------------------------------------ */

test("el informe del día cuadra con lo que hay en la base", async ({ page }) => {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const expected = await prisma.posSale.aggregate({
    where: {
      status: "COMPLETADA",
      branch: { code: MAPPED_BRANCH_CODE },
      completedAt: { gte: from },
    },
    _count: { _all: true },
    _sum: { total: true },
  });

  await open(page, "/pos/reportes", "Reportes");
  await expect(page.getByTestId("pos-reporte-conteo")).toContainText(
    String(expected._count._all),
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("pos-reporte-total")).toContainText(
    money(Number(expected._sum.total ?? 0)),
  );
});

test("el informe desglosa por forma de pago", async ({ page }) => {
  await open(page, "/pos/reportes", "Reportes");
  await expect(page.getByTestId("pos-reporte-metodos")).toContainText("Efectivo");
});

test("el informe lista los artículos vendidos con su instantánea", async ({
  page,
}) => {
  await open(page, "/pos/reportes", "Reportes");
  const items = page.getByTestId("pos-reporte-articulos");
  await expect(items).toContainText(EN_CATEGORIA.sku);
  await expect(items).toContainText(EN_CATEGORIA.name);
});

test("el informe no se hace pasar por un arqueo de caja", async ({ page }) => {
  await open(page, "/pos/reportes", "Reportes");
  await expect(page.getByTestId("pos-reporte-aviso-caja")).toContainText(
    /no.*lo que hay en el cajón/i,
  );
  /*
   * Lo que no puede haber es una **cifra** de caja, no la palabra.
   *
   * El aviso de arriba nombra el fondo y el arqueo precisamente para decir que
   * no existen; prohibir la palabra en toda la pantalla habría prohibido la
   * explicación. Lo que se vigila es que ninguna métrica ni ningún encabezado
   * los ofrezca como dato, que es lo que confundiría un total de ventas con un
   * saldo de cajón.
   */
  await expect(page.getByTestId("pos-reportes-resumen")).not.toContainText(
    /arqueo|fondo|diferencia|caja/i,
  );
  await expect(
    page.getByRole("heading", { name: /arqueo|caja|turno/i }),
  ).toHaveCount(0);
});

test("cambiar de periodo recarga el informe con su propio alcance", async ({
  page,
}) => {
  await open(page, "/pos/reportes", "Reportes");
  await page.getByTestId("pos-reportes-periodo-30d").click();
  await expect(page).toHaveURL(/periodo=30d/, { timeout: 20_000 });
  await expect(page.getByTestId("pos-reportes-resumen")).toBeVisible();
});

/* ---------------------------------------------------------------------------
 * Configuración del terminal
 * ------------------------------------------------------------------------ */

test("la configuración dice la identidad del terminal sin ofrecer cambiarla", async ({
  page,
}) => {
  await open(page, "/pos/configuracion", "Configuración del terminal");
  const card = page.getByTestId("pos-config-terminal");
  await expect(card).toBeVisible();
  // La sucursal se informa; no hay control para cambiarla, porque la impone la
  // sesión y un selector aquí sería un botón que no gobierna nada.
  await expect(card.getByRole("combobox")).toHaveCount(0);
  await expect(card.getByRole("textbox")).toHaveCount(0);
});

test("la configuración explica que el lector no se configura", async ({ page }) => {
  await open(page, "/pos/configuracion", "Configuración del terminal");
  await expect(page.getByTestId("pos-config-escaner")).toContainText(
    /no necesita configuración/i,
  );
});

/* ---------------------------------------------------------------------------
 * Navegación
 * ------------------------------------------------------------------------ */

test("la navegación no ofrece módulos que no existen", async ({ page }) => {
  await openVenta(page);
  const nav = page.getByRole("navigation", { name: "Punto de venta" });
  for (const label of [
    "Venta",
    "Catálogo",
    "Ventas",
    "Clientes",
    // Patch CB4-B — **Caja existe desde CB4-B** y por eso entra en la lista.
    // Esta prueba nunca dijo «Caja no debe estar»: dice que el menú solo ofrece
    // módulos que existen. Cuando el módulo nació, cambió de lado.
    "Caja",
    "Existencias",
    "Reportes",
    "Configuración",
  ]) {
    // `exact`: sin él «Venta» casa por subcadena con «Ventas» y la prueba
    // aprobaría un menú al que le faltara una de las dos.
    await expect(
      nav.getByRole("link", { exact: true, name: label }),
    ).toBeVisible();
  }
  /*
   * Lo que **sigue sin estar**, y por la misma razón de siempre: una entrada de
   * menú que lleva a una pantalla vacía es una promesa que el sistema no cumple.
   *
   * Devoluciones y anulaciones no existen —ninguna acción escribe `ANULADA`
   * sobre una venta, no hay documento de devolución ni reverso de pago—, así que
   * el menú no las nombra. Ver `docs/decisions/pos-sale-return.md`.
   */
  for (const missing of ["Devoluciones", "Anulaciones"]) {
    await expect(
      nav.getByRole("link", { exact: true, name: missing }),
    ).toHaveCount(0);
  }
});

test("todos los enlaces del menú llevan a una pantalla real", async ({ page }) => {
  await openVenta(page);
  const nav = page.getByRole("navigation", { name: "Punto de venta" });
  const hrefs = await nav.getByRole("link").evaluateAll((links) =>
    links.map((link) => (link as HTMLAnchorElement).getAttribute("href") ?? ""),
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const response = await page.goto(href);
    // Ni 404 ni redirección al login: el operador llega a todas.
    expect(response?.status(), `${href} respondió ${response?.status()}`).toBe(200);
    await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 45_000 });
  }
});

function money(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
