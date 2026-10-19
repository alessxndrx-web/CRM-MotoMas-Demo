import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { GLOBAL_BRANCH_ID, roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { crmFinanceSections } from "@/server/finance/crm/shared";
const url = new URL(process.env.DATABASE_URL ?? ""); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55438"); assert.equal(url.pathname, "/motomas_finance_test");
const db = new PrismaClient(); const browser = await chromium.launch({ headless: true });
const directory = process.env.FINANCE_SCREENSHOT_DIR;
try {
  const creator = await db.user.findFirstOrThrow({ where: { name: "Creador prueba" }, orderBy: { createdAt: "desc" } });
  const reviewer = await db.user.findFirstOrThrow({ where: { name: "Revisor prueba" }, orderBy: { createdAt: "desc" } });
  const branch = await db.branch.findFirstOrThrow({ where: { code: { startsWith: "CRMFIN-", not: { endsWith: "-close" } } }, orderBy: { createdAt: "desc" } });
  const supplier = await db.thirdParty.findFirstOrThrow({ where: { branchId: branch.id, type: "PROVEEDOR" } });
  const invoice = await db.crmFinanceDocument.findFirstOrThrow({ where: { branchId: branch.id, kind: "PAYABLE_INVOICE" } });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  async function login(user: { id: string; role: UserRoleEnum; name: string; email: string }) {
    const token = await createSessionToken({ uid: user.id, role: roleEnumToSpanish[user.role], roleEnum: user.role, email: user.email, name: user.name, branchId: GLOBAL_BRANCH_ID, branchName: "Global" });
    await context.addCookies([{ name: SESSION_COOKIE_NAME, value: token, domain: "127.0.0.1", path: "/" }]);
  }
  await login(creator); const page = await context.newPage(); page.setDefaultTimeout(60000);
  const errors: string[] = []; const posRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => { if (/\/(pos|panel\/pos)(\/|\?)/.test(new URL(r.url()).pathname)) posRequests.push(r.url()); });
  await page.goto("http://127.0.0.1:5187/panel/contabilidad/gestion/obligaciones", { timeout: 180000 });
  await page.getByRole("heading", { name: "Cuentas por pagar", exact: true }).waitFor();
  await page.getByText("Nuevo documento contable", { exact: true }).click();
  await page.locator('details select[name="branchId"]').selectOption(branch.id);
  await page.locator('details select[name="thirdPartyId"]').selectOption(supplier.id);
  await page.getByLabel("Fecha contable", { exact: true }).fill("2031-01-01");
  await page.getByLabel("Vencimiento", { exact: true }).fill("2031-01-31");
  const reference = `BROWSER-CRM-${Date.now()}`;
  await page.getByLabel("Referencia / factura", { exact: true }).fill(reference);
  await page.getByLabel("Concepto", { exact: true }).fill("Prueba de proveedor desde navegador");
  await page.getByLabel("Importe original", { exact: true }).fill("125.50");
  await page.locator('details select[name="debitAccountId"]').first().selectOption(invoice.debitAccountId);
  await page.locator('details select[name="creditAccountId"]').first().selectOption(invoice.creditAccountId);
  await page.getByRole("button", { name: "Guardar borrador", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Operación guardada." }).waitFor();
  const row = page.getByRole("row").filter({ hasText: reference });
  await row.getByRole("button", { name: "Enviar a revisión", exact: true }).click();
  await row.getByRole("button", { name: "Aprobar", exact: true }).waitFor();
  await login(reviewer); await page.reload({ timeout: 180000 });
  await row.getByRole("button", { name: "Aprobar", exact: true }).click();
  await row.getByRole("button", { name: "Contabilizar", exact: true }).click();
  await row.getByText("Solicitar reversión", { exact: true }).waitFor();
  const document = await db.crmFinanceDocument.findFirstOrThrow({ where: { reference } });
  assert.equal(document.status, "POSTED"); assert.ok(document.journalEntryId);
  console.log("OK Navegador → borrador → revisión por otra persona → contabilización → libro persistido");
  if (directory) { await mkdir(directory, { recursive: true }); await page.screenshot({ path: path.join(directory, "crm-cuentas-pagar.png"), fullPage: false }); }
  const printable = await context.newPage();
  await printable.goto(`http://127.0.0.1:5187/api/finance/crm-document/${document.id}`, { timeout: 180000 });
  await printable.getByRole("heading", { name: new RegExp(reference) }).waitFor();
  assert.ok((await printable.pdf({ format: "A4" })).length > 2000);
  console.log("OK Comprobante con datos reales del documento y PDF imprimible"); await printable.close();
  for (const [section, label] of Object.entries(crmFinanceSections)) {
    await page.goto(`http://127.0.0.1:5187/panel/contabilidad/gestion/${section}`, { timeout: 180000 });
    await page.getByRole("heading", { name: label, exact: true }).waitFor();
  }
  console.log("OK Once módulos contables navegables y conectados a PostgreSQL");
  const exported = await context.request.get("http://127.0.0.1:5187/api/finance/crm-export");
  assert.equal(exported.status(), 200); assert.ok((await exported.body()).length > 2000);
  console.log("OK Exportación Excel de documentos y auxiliar tributario");
  assert.deepEqual(errors, []); assert.deepEqual(posRequests, []);
  console.log("OK Sin errores de ejecución del navegador ni solicitudes al POS");
} finally { await browser.close(); await db.$disconnect(); }
