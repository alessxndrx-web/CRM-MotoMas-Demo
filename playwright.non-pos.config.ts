import { defineConfig, devices } from "@playwright/test";
import { loadEnvFile } from "node:process";
import base from "./playwright.config";

loadEnvFile(".env");
if (process.env.AUDIT_NON_POS !== "true" || !/^\/motomas_audit_\d+$/.test(new URL(process.env.DATABASE_URL!).pathname)) throw new Error("Ejecuta node tools/audit-non-pos.mjs browser con la base aislada.");
const projects = base.projects!.filter(project => !["pos", "setup-pos", "apariencia"].includes(project.name!)).map(project => {
  if (project.name === "contabilidad") return { ...project, testMatch: /(expense-tax|document-tax|vat-settlement|marketing-denied)\.spec\.ts/ };
  if (project.name === "caja") return { ...project, testMatch: /cash-tax\.spec\.ts/ };
  return project;
});
export default defineConfig({
  ...base,
  outputDir: "test-results/non-pos-browser",
  reporter: [["list"], ["json", { outputFile: ".audit/non-pos/browser-results.json" }]],
  timeout: 120_000,
  use: { ...base.use, baseURL: "http://localhost:5174" },
  projects: [...projects,
    { name: "crm", testMatch: /crm-call-center\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "nueve-roles", testMatch: /non-pos-roles\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next start --port 5174 --hostname 127.0.0.1",
    url: "http://localhost:5174/login",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
