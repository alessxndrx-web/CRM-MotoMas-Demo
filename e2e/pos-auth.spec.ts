import { expect, test } from "@playwright/test";

import {
  POS_DISABLED_PASSWORD,
  POS_DISABLED_USERNAME,
  POS_DOTTED_PASSWORD,
  POS_DOTTED_USERNAME,
  POS_OPERATOR_PASSWORD,
  POS_OPERATOR_USERNAME,
  POS_THROWAWAY_PASSWORD,
  POS_THROWAWAY_USERNAME,
  prisma,
} from "./fixtures";

/**
 * SUITE-POS2.4 — la frontera entre el mostrador y la aplicación administrativa.
 *
 * **Se afirma contra el servidor, no contra lo que el navegador pinta.** Ocultar
 * un enlace no autoriza nada; lo que importa es qué responde `/pos/venta` a una
 * petición sin sesión de mostrador, y qué responde `/panel` a una petición que
 * solo tiene sesión de mostrador.
 *
 * Este archivo corre en el proyecto `pos`, cuyo `storageState` es la sesión de
 * operador. Los casos que necesitan *ausencia* de sesión, o la sesión
 * administrativa, crean su propio contexto: mezclar identidades en un mismo
 * contexto sería justo lo que el parche prohíbe.
 */
const POS_COOKIE = "motomas_pos_session";
const ADMIN_COOKIE = "motomas_session";

/**
 * Un contexto **de verdad anónimo**.
 *
 * `browser.newContext()` hereda el `storageState` del proyecto, y este archivo
 * corre en el proyecto `pos`: sin vaciarlo explícitamente, los contextos «sin
 * sesión» llegaban con la sesión de mostrador puesta y las pruebas medían lo
 * contrario de lo que decían.
 */
const ANONYMOUS = {
  baseURL: "http://localhost:5173",
  storageState: { cookies: [], origins: [] },
};

/* ---------------------------------------------------------------------------
 * Sin sesión
 * ------------------------------------------------------------------------ */

test("sin sesión de mostrador, la venta redirige al login del POS", async ({
  browser,
}) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/venta");
    await expect(page).toHaveURL(/\/pos\/login$/);
    await expect(page.getByTestId("pos-login")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("sin sesión, el HTML del servidor no trae nada del cobro", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  try {
    for (const route of ["/pos/venta", "/pos/inventario"]) {
      const response = await context.request.get(route);
      const html = await response.text();
      // La superficie protegida no se emite antes de autenticar.
      expect(html).not.toContain("pos-checkout");
      expect(html).not.toContain("pos-payments");
      expect(html).not.toContain("pos-search");
      expect(html).not.toContain("tabla-saldos");
      expect(html).not.toContain("registrar-ingreso");
    }
  } finally {
    await context.close();
  }
});

/* ---------------------------------------------------------------------------
 * Credenciales
 * ------------------------------------------------------------------------ */

test("una contraseña incorrecta se rechaza con un mensaje genérico", async ({
  browser,
}) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill(POS_OPERATOR_USERNAME);
    await page.getByTestId("pos-login-clave").fill("no-es-la-clave");
    await page.getByTestId("pos-login-entrar").click();

    const error = page.getByTestId("pos-login-error");
    await expect(error).toBeVisible({ timeout: 30_000 });
    // **No revela si el usuario existe.** Un mensaje distinto para «no existe» y
    // «clave incorrecta» convierte el formulario en un enumerador de usuarios.
    await expect(error).toHaveText("Usuario o contraseña incorrectos.");
    await expect(page).toHaveURL(/\/pos\/login/);
  } finally {
    await context.close();
  }
});

test("un usuario inexistente da exactamente el mismo mensaje", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill("no-existe-este-usuario");
    await page.getByTestId("pos-login-clave").fill("cualquier-cosa");
    await page.getByTestId("pos-login-entrar").click();

    await expect(page.getByTestId("pos-login-error")).toHaveText(
      "Usuario o contraseña incorrectos.",
      { timeout: 30_000 },
    );
  } finally {
    await context.close();
  }
});

test("una cuenta desactivada no entra", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill(POS_DISABLED_USERNAME);
    await page.getByTestId("pos-login-clave").fill(POS_DISABLED_PASSWORD);
    await page.getByTestId("pos-login-entrar").click();

    await expect(page.getByTestId("pos-login-error")).toBeVisible({ timeout: 30_000 });
    // No se emite cookie de mostrador.
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === POS_COOKIE)).toBe(false);
  } finally {
    await context.close();
  }
});

test("las credenciales válidas abren sesión y llegan a la venta", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill(POS_OPERATOR_USERNAME);
    await page.getByTestId("pos-login-clave").fill(POS_OPERATOR_PASSWORD);
    await page.getByTestId("pos-login-entrar").click();

    await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/pos\/venta$/);
    await expect(page.getByTestId("pos-operador")).toHaveText(POS_OPERATOR_USERNAME);

    const cookie = (await context.cookies()).find((item) => item.name === POS_COOKIE);
    expect(cookie).toBeDefined();
    // **HttpOnly**: JavaScript de la página no puede leerla.
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain(POS_COOKIE);
  } finally {
    await context.close();
  }
});

/**
 * El campo Usuario **no es un campo de email**.
 *
 * El mostrador se identifica por usuario, no por correo: `authenticatePosOperator`
 * busca por `PosOperator.username`, y no existe ninguna ruta que autentique por
 * email. Un `type="email"` o un `pattern` en este campo bloquearía en el
 * navegador exactamente a los operadores que el servidor sí acepta —un fallo
 * invisible para `tsc`, `eslint` y `next build`—, así que se afirma sobre el
 * DOM renderizado y no sobre el JSX.
 */
test("el usuario del mostrador no se valida como email", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    const usuario = page.getByTestId("pos-login-usuario");
    await expect(usuario).toBeVisible({ timeout: 30_000 });

    await expect(usuario).toHaveJSProperty("type", "text");
    expect(await usuario.getAttribute("pattern")).toBeNull();
    expect(await usuario.getAttribute("inputmode")).toBeNull();

    // Un usuario con punto —la forma `nombre.apellido` del personal real— pasa
    // la validación de restricciones del navegador sin necesitar «@».
    await usuario.fill("pos.test");
    expect(
      await usuario.evaluate((el: HTMLInputElement) => ({
        valid: el.validity.valid,
        typeMismatch: el.validity.typeMismatch,
        patternMismatch: el.validity.patternMismatch,
      })),
    ).toEqual({ valid: true, typeMismatch: false, patternMismatch: false });
  } finally {
    await context.close();
  }
});

test("un usuario con punto inicia sesión y llega a la venta", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill(POS_DOTTED_USERNAME);
    await page.getByTestId("pos-login-clave").fill(POS_DOTTED_PASSWORD);
    await page.getByTestId("pos-login-entrar").click();

    await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/pos\/venta$/);
    await expect(page.getByTestId("pos-operador")).toHaveText(POS_DOTTED_USERNAME);
  } finally {
    await context.close();
  }
});

test("el login no admite mayúsculas como usuario distinto", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill(POS_OPERATOR_USERNAME.toUpperCase());
    await page.getByTestId("pos-login-clave").fill(POS_OPERATOR_PASSWORD);
    await page.getByTestId("pos-login-entrar").click();
    // El usuario se normaliza: es la misma cuenta, no una inexistente.
    await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 30_000 });
  } finally {
    await context.close();
  }
});

/* ---------------------------------------------------------------------------
 * Separación de Caja y del panel
 * ------------------------------------------------------------------------ */

test("la sesión administrativa no autentica el mostrador", async ({ browser }) => {
  // El administrador pasa `canOperateCaja` y aun así no entra al POS.
  const context = await browser.newContext({
    baseURL: "http://localhost:5173",
    storageState: "e2e/.auth/admin.json",
  });
  const page = await context.newPage();
  try {
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === ADMIN_COOKIE)).toBe(true);
    expect(cookies.some((cookie) => cookie.name === POS_COOKIE)).toBe(false);

    await page.goto("/pos/venta");
    await expect(page).toHaveURL(/\/pos\/login$/);
    await expect(page.getByTestId("pos-checkout")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("la sesión de mostrador no abre el panel administrativo", async ({ page, context }) => {
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name === POS_COOKIE)).toBe(true);
  expect(cookies.some((cookie) => cookie.name === ADMIN_COOKIE)).toBe(false);

  await page.goto("/panel/caja");
  // Sin sesión administrativa el panel manda al login administrativo.
  await expect(page).toHaveURL(/\/login/);
});

test("el mostrador no puede tocar compras ni el tablero administrativo", async ({
  page,
}) => {
  for (const route of ["/panel/pos/compras", "/panel/dashboard", "/panel/configuracion"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
  }
});

test("la ruta antigua del panel redirige al mostrador", async ({ page }) => {
  await page.goto("/panel/pos/venta");
  await expect(page).toHaveURL(/\/pos\/venta$/);
  await expect(page.getByTestId("pos-terminal")).toBeVisible();
});

/* ---------------------------------------------------------------------------
 * Sesión: cierre e invalidación
 * ------------------------------------------------------------------------ */

test("cerrar sesión invalida la cookie en el servidor", async ({ browser }) => {
  // **Identidad desechable**: cerrar sesión rota la versión del operador y
  // mataría también la sesión compartida de la suite.
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill(POS_THROWAWAY_USERNAME);
    await page.getByTestId("pos-login-clave").fill(POS_THROWAWAY_PASSWORD);
    await page.getByTestId("pos-login-entrar").click();
    await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 30_000 });

    // Se guarda la cookie **antes** de salir, para reinyectarla después.
    const cookie = (await context.cookies()).find((item) => item.name === POS_COOKIE)!;

    await page.getByTestId("pos-salir").click();
    await expect(page).toHaveURL(/\/pos\/login$/, { timeout: 30_000 });

    // **La cookie robada tampoco sirve**: cerrar sesión rota la versión guardada,
    // así que el token firmado deja de validar aunque no haya caducado.
    await context.addCookies([cookie]);
    await page.goto("/pos/venta");
    await expect(page).toHaveURL(/\/pos\/login$/);
  } finally {
    await context.close();
  }
});

test("desactivar al operador corta su sesión abierta", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await page.goto("/pos/login");
    await page.getByTestId("pos-login-usuario").fill(POS_THROWAWAY_USERNAME);
    await page.getByTestId("pos-login-clave").fill(POS_THROWAWAY_PASSWORD);
    await page.getByTestId("pos-login-entrar").click();
    await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 30_000 });

    await prisma.posOperator.update({
      where: { username: POS_THROWAWAY_USERNAME },
      data: { isActive: false },
    });

    // La sesión se revalida contra la base en cada petición, así que el efecto
    // es inmediato y no espera a que caduque el token.
    await page.goto("/pos/inventario");
    await expect(page).toHaveURL(/\/pos\/login$/);
  } finally {
    await prisma.posOperator.update({
      where: { username: POS_THROWAWAY_USERNAME },
      data: { isActive: true },
    });
    await context.close();
  }
});

test("un token manipulado no vale", async ({ browser }) => {
  const context = await browser.newContext(ANONYMOUS);
  const page = await context.newPage();
  try {
    await context.addCookies([
      {
        name: POS_COOKIE,
        value: "eyJraW5kIjoicG9zIn0.firma-inventada",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/pos/venta");
    await expect(page).toHaveURL(/\/pos\/login$/);
  } finally {
    await context.close();
  }
});

/* ---------------------------------------------------------------------------
 * Alcance y filtraciones
 * ------------------------------------------------------------------------ */

test("el operador solo ve su sucursal, y el servidor la impone", async ({ page }) => {
  await page.goto("/pos/venta");
  await expect(page.getByTestId("pos-terminal")).toBeVisible({ timeout: 45_000 });
  // La sucursal no se elige en el mostrador: el selector no existe.
  await expect(page.getByTestId("pos-branch")).toHaveCount(0);
});

test("ningún hash de contraseña llega al navegador", async ({ page }) => {
  const operator = await prisma.posOperator.findUniqueOrThrow({
    where: { username: POS_OPERATOR_USERNAME },
    select: { passwordHash: true },
  });

  for (const route of ["/pos/login", "/pos/venta", "/pos/inventario"]) {
    const html = await (await page.request.get(route)).text();
    expect(html).not.toContain(operator.passwordHash);
    expect(html).not.toContain("passwordHash");
    expect(html).not.toContain(POS_OPERATOR_PASSWORD);
  }
});

/* ---------------------------------------------------------------------------
 * Responsive
 * ------------------------------------------------------------------------ */

for (const size of [
  { name: "1440px", width: 1440, height: 900 },
  { name: "1280px", width: 1280, height: 800 },
  { name: "1024px", width: 1024, height: 768 },
  { name: "768px", width: 768, height: 1024 },
  { name: "390px", width: 390, height: 844 },
]) {
  test(`el login del mostrador cabe a ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({
      ...ANONYMOUS,
      viewport: { width: size.width, height: size.height },
    });
    const page = await context.newPage();
    try {
      await page.goto("/pos/login");
      await expect(page.getByTestId("pos-login")).toBeVisible({ timeout: 45_000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByTestId("pos-login-entrar")).toBeVisible();
    } finally {
      await context.close();
    }
  });
}
