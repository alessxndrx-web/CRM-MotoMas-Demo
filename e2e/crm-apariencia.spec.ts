import { expect, test, type Page } from "@playwright/test";

import {
  APARIENCIA_ADMIN_EMAIL,
  APARIENCIA_ADMIN_PASSWORD,
  APARIENCIA_EMAIL,
  APARIENCIA_PASSWORD,
  prisma,
} from "./fixtures";

/**
 * Patch CRM-INT4 — el tema del panel: Claro, Oscuro y Automático.
 *
 * Esta suite inicia sesión ella misma y no usa `storageState`: lo que prueba
 * es justo lo que una sesión capturada esconde —que la preferencia sobrevive a
 * cerrar sesión y volver a entrar—, y lo prueba con identidades propias para no
 * dejar a ninguna otra suite en oscuro.
 *
 * Los colores se leen **resueltos** del navegador, no de las clases: el CSS
 * compilado no contiene `light-dark()` (Lightning CSS lo reescribe con
 * variables), así que la única prueba honesta de qué ve la persona es el valor
 * calculado.
 */
test.describe.configure({ mode: "serial" });

/** Fondo del lienzo del panel (`--background`) y superficie de tarjeta. */
const CLARO = { canvas: "rgb(233, 237, 244)", surface: "rgb(255, 255, 255)" };
const OSCURO = { canvas: "rgb(11, 17, 32)", surface: "rgb(18, 26, 43)" };

/**
 * Los módulos que recorre el barrido en oscuro: el CRM completo, más los que
 * comparten componentes con él (POS del panel, Caja, Contabilidad) y el
 * escaparate de componentes, que abre diálogos y menús.
 */
const MODULOS = [
  // `/panel` no está: sólo redirige a la ruta por defecto del rol (para Admin,
  // `/panel/dashboard`), y medir mientras redirige mide una página que se va.
  "/panel/dashboard",
  "/panel/leads",
  "/panel/clientes",
  "/panel/expedientes",
  "/panel/creditos",
  "/panel/catalogo-motos",
  "/panel/reservas",
  "/panel/pagos",
  "/panel/marketing",
  "/panel/marketing/vision",
  "/panel/reportes",
  "/panel/actividades",
  "/panel/ventas",
  "/panel/vendedores",
  "/panel/configuracion",
  "/panel/configuracion/apariencia",
  "/panel/inventario",
  "/panel/traslados",
  "/panel/caja",
  "/panel/contabilidad",
  // `/panel/pos/venta` y `/panel/pos/inventario` no están: redirigen al
  // mostrador (`/pos/*`), que no tiene tema. Estas sí se quedan en el panel.
  "/panel/pos/productos",
  "/panel/pos/compras",
  "/panel/pos/caja",
  "/panel/soporte/tickets",
  "/panel/ayuda",
  "/panel/dev/componentes",
];

/** Errores de consola que delatan una hidratación rota. */
const HIDRATACION = /hydrat|did not match|server rendered html|text content does not match/i;

function vigilarConsola(page: Page) {
  const errores: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errores.push(message.text());
  });
  page.on("pageerror", (error) => errores.push(error.message));
  return errores;
}

async function entrar(page: Page, email: string, password: string) {
  await page.goto("/login", { timeout: 180_000 });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /ingresar|entrar|acceder/i }).click();
  // Basta con que la URL cambie: `abrir` espera la página. Con `next dev`, la
  // primera carga del panel paga el compilado y puede pasar de dos minutos.
  await page.waitForURL(/\/panel/, { timeout: 300_000, waitUntil: "commit" });
}

async function abrir(page: Page, path: string) {
  await page.goto(path, { timeout: 180_000 });
  await expect(page.getByRole("main").first()).toBeVisible({ timeout: 120_000 });
}

/**
 * Lee cómo se pinta el tema **en este momento**: el esquema del documento, el
 * lienzo y una sonda con la superficie de tarjeta. La sonda se crea dentro del
 * contenedor del tema cuando existe, así mide lo mismo que ve un módulo.
 */
async function lectura(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-mm-theme]") ?? document.body;
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--sb-surface)";
    host.appendChild(probe);
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const canvas = document.querySelector(".app-canvas");
    return {
      attr: document.querySelector("[data-mm-theme]")?.getAttribute("data-mm-theme") ?? null,
      scheme: getComputedStyle(document.documentElement).colorScheme,
      canvas: canvas ? getComputedStyle(canvas).backgroundColor : null,
      surface,
    };
  });
}

/**
 * Contraste WCAG de cada texto visible de la página contra su fondo efectivo
 * (los fondos semitransparentes se componen hacia arriba). Devuelve lo que no
 * llega a AA: 4.5:1, o 3:1 para texto grande. Deja fuera lo oculto a lectores
 * de pantalla, lo deshabilitado y lo atenuado con `opacity`.
 */
async function contrasteInsuficiente(page: Page) {
  return page.evaluate(() => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgba = (color: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top: number[], bottom: number[]) =>
      [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3]));
    const lum = (c: number[]) => {
      const [r, g, b] = c.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const background = (el: Element) => {
      const layers: Array<[number, number, number, number]> = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const layer = rgba(getComputedStyle(node).backgroundColor);
        if (layer[3] > 0) layers.push(layer);
        if (layer[3] >= 1) break;
      }
      let color = [255, 255, 255];
      for (const layer of layers.reverse()) color = over(layer, color);
      return color;
    };
    const failures: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const own = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim().length > 1,
      );
      if (!own || el.closest("[aria-hidden='true'], svg, [disabled], [aria-disabled='true']")) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1 || style.visibility === "hidden") continue;
      let faded = false;
      for (let node: Element | null = el; node; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 1) faded = true;
      }
      if (faded) continue;
      const fg = rgba(style.color);
      // Texto transparente = relleno con degradado (`bg-clip-text`): no hay un
      // color sólido que medir.
      if (fg[3] === 0) continue;
      const bg = background(el);
      const text = over(fg, bg);
      const [hi, lo] = [lum(text), lum(bg)].sort((a, b) => b - a);
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) {
        failures.push(
          `${ratio.toFixed(2)}:1 «${el.textContent!.trim().slice(0, 40)}» ` +
            `<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 120)}">`,
        );
      }
    }
    return failures;
  });
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("un usuario nuevo empieza en Claro y el panel se ve como siempre", async ({ page }) => {
  test.setTimeout(420_000);
  const errores = vigilarConsola(page);
  await entrar(page, APARIENCIA_EMAIL, APARIENCIA_PASSWORD);
  // Contador está confinado a Contabilidad; Apariencia es la excepción.
  await abrir(page, "/panel/configuracion/apariencia");
  await expect(page.getByRole("heading", { name: "Apariencia" }).first()).toBeVisible();

  const inicial = await lectura(page);
  expect(inicial).toEqual({ attr: "claro", scheme: "light", ...CLARO });

  // El tema claro es la paleta de Tailwind sin tocar: la reasignación oscura no
  // puede mover ni un color del claro. Se compara el píxel que se pinta (sRGB de
  // 8 bits, ±1 por redondeo) y no el texto del valor: Lightning CSS entrega
  // estos colores como `lab(...)` y el literal se resuelve como `oklch(...)`.
  const distintos = await page.evaluate(() => {
    const host = document.querySelector("[data-mm-theme]")!;
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const pixel = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    };
    const pares: Array<[string, string]> = [
      ["var(--color-slate-100)", "oklch(96.8% 0.007 247.896)"],
      ["var(--color-slate-900)", "oklch(20.8% 0.042 265.755)"],
      ["var(--color-blue-600)", "oklch(54.6% 0.245 262.881)"],
      ["var(--color-emerald-50)", "oklch(97.9% 0.021 166.113)"],
      ["var(--color-red-700)", "oklch(50.5% 0.213 27.518)"],
      ["var(--color-amber-500)", "oklch(76.9% 0.188 70.08)"],
      ["var(--sb-action)", "oklch(54.6% 0.245 262.881)"],
    ];
    return pares.flatMap(([token, literal]) => {
      const a = document.createElement("div");
      const b = document.createElement("div");
      a.style.color = token;
      b.style.color = literal;
      host.append(a, b);
      const [pa, pb] = [pixel(getComputedStyle(a).color), pixel(getComputedStyle(b).color)];
      a.remove();
      b.remove();
      const same = pa.every((channel, i) => Math.abs(channel - pb[i]) <= 1);
      return same ? [] : [`${token}: ${pa.join(",")} ≠ ${pb.join(",")}`];
    });
  });
  expect(distintos).toEqual([]);
  expect(errores.filter((e) => HIDRATACION.test(e))).toEqual([]);
});

test("Claro → Oscuro → Automático cambia al instante, sin recargar, y se guarda", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errores = vigilarConsola(page);
  await entrar(page, APARIENCIA_EMAIL, APARIENCIA_PASSWORD);
  await abrir(page, "/panel/configuracion/apariencia");
  await page.evaluate(() => {
    (window as unknown as { __sinRecarga: boolean }).__sinRecarga = true;
  });
  const sinRecarga = () =>
    page.evaluate(() => (window as unknown as { __sinRecarga?: boolean }).__sinRecarga === true);
  const guardado = page.getByText("Guardado. Se aplicará cada vez que entres.");

  // Oscuro, desde la sección de Configuración.
  await page.getByText("Oscuro", { exact: true }).click();
  await expect.poll(() => lectura(page)).toEqual({ attr: "oscuro", scheme: "dark", ...OSCURO });
  await expect(guardado).toBeVisible();
  expect(await sinRecarga()).toBe(true);
  await expect
    .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: APARIENCIA_EMAIL } })).themePreference)
    .toBe("OSCURO");
  // El acceso rápido de la barra lateral refleja el mismo estado.
  await expect(page.getByRole("button", { name: "Tema: Oscuro" })).toHaveAttribute("aria-pressed", "true");

  // Automático sigue al sistema operativo, en vivo.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByText("Automático (sistema)", { exact: true }).click();
  await expect.poll(() => lectura(page)).toEqual({ attr: "sistema", scheme: "light dark", ...OSCURO });
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => lectura(page)).toEqual({ attr: "sistema", scheme: "light dark", ...CLARO });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => lectura(page)).toEqual({ attr: "sistema", scheme: "light dark", ...OSCURO });
  await expect
    .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: APARIENCIA_EMAIL } })).themePreference)
    .toBe("SISTEMA");

  // Claro, desde el acceso rápido de la barra lateral.
  await page.getByRole("button", { name: "Tema: Claro" }).click();
  await expect.poll(() => lectura(page)).toEqual({ attr: "claro", scheme: "light", ...CLARO });
  await expect
    .poll(async () => (await prisma.user.findUniqueOrThrow({ where: { email: APARIENCIA_EMAIL } })).themePreference)
    .toBe("CLARO");
  expect(await sinRecarga()).toBe(true);
  expect(errores.filter((e) => HIDRATACION.test(e))).toEqual([]);
});

test("Oscuro sobrevive a cerrar sesión y volver a entrar, desde el primer HTML", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errores = vigilarConsola(page);
  await entrar(page, APARIENCIA_EMAIL, APARIENCIA_PASSWORD);
  await abrir(page, "/panel/configuracion/apariencia");
  await page.getByRole("button", { name: "Tema: Oscuro" }).click();
  await expect(page.getByText("Guardado. Se aplicará cada vez que entres.")).toBeVisible();

  // Cerrar sesión: la pantalla de inicio no es del panel y queda en claro.
  await page.getByRole("button", { name: "Salir" }).click();
  await page.waitForURL(/\/login/, { timeout: 60_000 });
  await expect.poll(() => lectura(page)).toMatchObject({ attr: null, scheme: "light", surface: CLARO.surface });

  await entrar(page, APARIENCIA_EMAIL, APARIENCIA_PASSWORD);
  await abrir(page, "/panel/configuracion/apariencia");
  expect(await lectura(page)).toEqual({ attr: "oscuro", scheme: "dark", ...OSCURO });

  // Sin parpadeo: el HTML que manda el servidor ya lleva el tema, antes de que
  // se ejecute una sola línea de JavaScript.
  const html = await (await page.request.get("/panel/configuracion/apariencia")).text();
  expect(html).toContain('data-mm-theme="oscuro"');

  // Y con JavaScript desactivado —el primer pintado real— ya es oscuro.
  const sinJs = await page.context().browser()!.newContext({
    baseURL: "http://localhost:5173",
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const cruda = await sinJs.newPage();
    await cruda.goto("/panel/configuracion/apariencia", { timeout: 180_000 });
    expect(await lectura(cruda)).toMatchObject({ attr: "oscuro", scheme: "dark", canvas: OSCURO.canvas });
  } finally {
    await sinJs.close();
  }
  expect(errores.filter((e) => HIDRATACION.test(e))).toEqual([]);
});

test("el POS, el portal y el inicio de sesión no heredan el oscuro del panel", async ({
  page,
}) => {
  test.setTimeout(420_000);
  // La preferencia guardada sigue en OSCURO desde la prueba anterior.
  await entrar(page, APARIENCIA_EMAIL, APARIENCIA_PASSWORD);
  await abrir(page, "/panel/configuracion/apariencia");
  expect((await lectura(page)).attr).toBe("oscuro");

  const fueraDelPanel = async (path: string) => {
    await page.goto(path, { timeout: 180_000 });
    // Que la página medida sea la pedida y no una redirección al panel.
    expect(new URL(page.url()).pathname.startsWith("/panel"), `${path} → ${page.url()}`).toBe(false);
    // Sin el atributo, el documento declara `light` y la paleta resuelve sus
    // valores claros. Una superficie transparente aquí delataría que la
    // reescritura de `light-dark()` se quedó sin esquema por defecto.
    expect(await lectura(page), path).toMatchObject({
      attr: null,
      scheme: "light",
      surface: CLARO.surface,
    });
  };

  // Con la sesión del panel abierta y su preferencia en oscuro.
  for (const path of ["/", "/catalogo", "/pos/login"]) await fueraDelPanel(path);

  // `/login` con sesión abierta redirige al panel, así que se mide sin sesión.
  await page.context().clearCookies();
  await fueraDelPanel("/login");
});

test.describe("barrido de módulos en oscuro", () => {
  for (const path of MODULOS) {
    test(`${path} se pinta en oscuro, sin errores de hidratación y con contraste AA`, async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errores = vigilarConsola(page);
      await entrar(page, APARIENCIA_ADMIN_EMAIL, APARIENCIA_ADMIN_PASSWORD);
      await abrir(page, path);
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
      // Se mide la página pedida, no una a la que haya redirigido.
      expect(new URL(page.url()).pathname).toBe(path);

      expect(await lectura(page)).toMatchObject({ attr: "oscuro", scheme: "dark", surface: OSCURO.surface });
      const fallos = await contrasteInsuficiente(page);
      expect(fallos, `Textos bajo AA en ${path}`).toEqual([]);
      expect(errores.filter((e) => HIDRATACION.test(e)), `Hidratación en ${path}`).toEqual([]);
    });
  }
});
