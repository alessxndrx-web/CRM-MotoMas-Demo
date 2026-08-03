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
    {
      // Contabilidad: gastos y documentos, con la sesión de Contador.
      name: "contabilidad",
      dependencies: ["setup-contador"],
      testMatch: /(expense-tax|document-tax|vat-settlement)\.spec\.ts/,
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
      testMatch: /(cash-tax|pos-products)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
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
