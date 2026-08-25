import { defineConfig, devices } from "@playwright/test";

/**
 * Patch FF2.1-A — the repository's first browser-level suite.
 *
 * It drives the real application against the real database: the dev server is
 * started here, the fixtures are written with Prisma in `global-setup`, and the
 * session is a genuine login rather than a forged cookie. That is the whole
 * reason this suite exists — every previous suite reproduces the transactional
 * body of an action because actions authorize against a session cookie, so
 * **authorization was the one thing 434 assertions never covered.** Here it is.
 *
 * Serial by design: the specs share one branch and one mapping set, and the
 * accounting period lock is global to the month. Parallel workers would race on
 * state the application deliberately makes exclusive.
 */
const PORT = 5173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup-contador", testMatch: /auth\.setup\.ts/ },
    { name: "setup-admin", testMatch: /auth-admin\.setup\.ts/ },
    // Patch POS2.4. Tercera identidad: el mostrador tiene su propia sesión.
    { name: "setup-pos", testMatch: /auth-pos\.setup\.ts/ },
    /*
     * Patch Marketing-E2E — cuarta y quinta identidad.
     *
     * Marketing es el primer módulo cuyas puertas **no se pueden demostrar con
     * una sola sesión**: Admin las abre todas y su alcance es global, así que
     * con él ninguna campaña queda fuera y ningún control queda oculto.
     */
    { name: "setup-gerente", testMatch: /auth-gerente\.setup\.ts/ },
    { name: "setup-marketing", testMatch: /auth-marketing\.setup\.ts/ },
    {
      // Contabilidad: gastos y documentos, con la sesión de Contador.
      name: "contabilidad",
      dependencies: ["setup-contador"],
      testMatch: /(expense-tax|document-tax|vat-settlement|pos-purchases-denied|pos-dashboard-denied|pos-checkout-denied|pos-inventory-denied|marketing-denied)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/contador.json",
      },
    },
    {
      // Caja y POS exigen ADMIN o CAJERO: `canOperateCaja` no admite a
      // Contador, así que estas suites corren con la segunda identidad.
      name: "caja",
      dependencies: ["setup-admin"],
      testMatch:
        /(cash-tax|pos-products|pos-purchases|pos-arqueo|operations-shell|components-showcase|pos-dashboard)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
    },
    {
      // Patch POS2.4. El mostrador: sesión de POS, nunca la administrativa.
      name: "pos",
      dependencies: ["setup-pos"],
      testMatch:
        /(pos-checkout|pos-cart|pos-sale|pos-ventas|pos-modulos|pos-caja|pos-d3|pos-p13|pos-devoluciones|pos-inventory|pos-auth|pos-payments|pos-hardware)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/pos.json",
      },
    },
    /*
     * Patch Marketing-E2E — **un proyecto por identidad, no un fichero que
     * cambia de sesión a mitad.**
     *
     * Es la forma que este repositorio ya usa y la única que hay: ningún spec
     * existente usa dos identidades. Los cuatro `*-denied.spec.ts` son ficheros
     * aparte asignados al proyecto `contabilidad`, no bloques con `test.use`
     * dentro de la suite que niegan. Marketing necesita tres sesiones, así que
     * son tres ficheros y tres proyectos.
     */
    {
      // Acceso completo: Admin abre las tres puertas del panel.
      name: "marketing-admin",
      dependencies: ["setup-admin"],
      testMatch: /marketing\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
    },
    {
      // Lectura acotada: el Gerente entra, ve su sucursal y nada más, y no
      // recibe del servidor ninguna superficie de gestión.
      name: "marketing-gerente",
      dependencies: ["setup-gerente"],
      testMatch: /marketing-gerente\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/gerente.json",
      },
    },
    {
      // La asimetría de MARKETING: campañas globales, informe acotado a su
      // sucursal. Ninguna otra identidad produce ese estado.
      name: "marketing-alcance",
      dependencies: ["setup-marketing"],
      testMatch: /marketing-alcance\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/marketing.json",
      },
    },
  ],
  webServer: {
    command: `npm run dev`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
