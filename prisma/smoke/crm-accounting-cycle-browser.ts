import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, type Locator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { GLOBAL_BRANCH_ID, roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";
import { getLedgerReport } from "@/server/finance/ledger-reports";
import { getPrisma } from "@/server/db/prisma";

const target = new URL(process.env.DATABASE_URL ?? "");
assert.equal(target.hostname, "127.0.0.1"); assert.equal(target.port, "55438"); assert.equal(target.pathname, "/motomas_finance_test");
const db = new PrismaClient(); const browser = await chromium.launch({ headless: true });
const tag = `CYCLE-${Date.now()}`; const base = "http://127.0.0.1:5187";
const expected = { bank: "850.00", payable: "50.00", expense: "200.00", result: "-200.00", equityAfterClose: "800.00" };
let passed = 0;
function check(value: unknown, label: string) { assert.ok(value, label); passed++; console.log(`OK ${label}`); }
try {
  const admin = await db.user.create({ data: { name: tag, email: `${tag}@test.invalid`, passwordHash: "not-a-login", role: "ADMIN" } });
  const accountant = await db.user.create({ data: { name: tag, email: `${tag}-accountant@test.invalid`, passwordHash: "not-a-login", role: "CONTADOR" } });
  const branch = await db.branch.create({ data: { code: tag, name: tag } });
  const party = await db.thirdParty.create({ data: { name: tag, type: "PROVEEDOR", branchId: branch.id } });
  async function account(suffix: string, type: "ACTIVO" | "PASIVO" | "GASTO" | "PATRIMONIO", nature: "DEUDORA" | "ACREEDORA") {
    return db.chartAccount.create({ data: { code: `${Date.now()}-${suffix}`, name: tag + suffix, type, nature, effectiveFrom: new Date("2020-01-01") } });
  }
  const bankLedger = await account("01", "ACTIVO", "DEUDORA"), payable = await account("02", "PASIVO", "ACREEDORA"), expense = await account("03", "GASTO", "DEUDORA"), equity = await account("04", "PATRIMONIO", "ACREEDORA");
  const bank = await db.bankAccount.create({ data: { branchId: branch.id, bankName: tag, accountNumber: tag, currency: "NIO", ledgerAccountId: bankLedger.id } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(60000);
  const errors: string[] = [], pos: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (/\/(pos|panel\/pos)(\/|\?)/.test(new URL(request.url()).pathname)) pos.push(request.url()); });
  async function login(user: { id: string; name: string; email: string; role: UserRoleEnum }) {
    const token = await createSessionToken({ uid: user.id, name: user.name, email: user.email, role: roleEnumToSpanish[user.role], roleEnum: user.role, branchId: GLOBAL_BRANCH_ID, branchName: "Global" });
    (globalThis as Record<string, unknown>).__motomasSmokeCookies = { [SESSION_COOKIE_NAME]: token };
    await context.addCookies([{ name: SESSION_COOKIE_NAME, value: token, domain: "127.0.0.1", path: "/" }]);
  }
  async function visit(section: string) { await page.goto(`${base}/panel/contabilidad/gestion/${section}`, { timeout: 180000 }); }
  function form(action: string) { return page.locator("form").filter({ has: page.locator(`input[name="action"][value="${action}"]`) }); }
  async function save(formElement: Locator, button: string, persisted: () => Promise<boolean>) {
    await formElement.getByRole("button", { name: button, exact: true }).click();
    // Consecutive actions share a status message; verify this write's own commit.
    await expect.poll(persisted, { timeout: 60000 }).toBeTruthy();
    await page.getByRole("status").filter({ hasText: "Operación guardada." }).waitFor();
  }
  async function post(reference: string, creator: typeof admin, reviewer: typeof admin) {
    await login(creator); await visit("documentos");
    const row = page.getByRole("row").filter({ hasText: reference });
    await row.getByRole("button", { name: "Enviar a revisión", exact: true }).click();
    await row.getByRole("button", { name: "Aprobar", exact: true }).waitFor();
    await login(reviewer); await page.reload({ timeout: 180000 });
    await row.getByRole("button", { name: "Aprobar", exact: true }).click();
    await row.getByRole("button", { name: "Contabilizar", exact: true }).click();
    await row.getByText("Solicitar reversión", { exact: true }).waitFor();
    const document = await db.crmFinanceDocument.findFirstOrThrow({ where: { branchId: branch.id, reference } });
    assert.equal(document.status, "POSTED"); assert.ok(document.journalEntryId); return document;
  }
  await login(admin); await visit("configuracion");
  check(await page.getByRole("button", { name: "Guardar política", exact: true }).isVisible(), "Administrador dispone de la configuración empresarial");
  await page.getByText("Importar saldos iniciales respaldados", { exact: true }).click();
  const opening = form("opening"); await opening.locator('[name="branchId"]').selectOption(branch.id);
  for (const [key, value] of Object.entries({ date: "2033-01-01", reference: tag + "-OPEN", description: "Apertura sintética", evidence: "Caso esperado: banco y capital iniciales de 1000" })) await opening.locator(`[name="${key}"]`).fill(value);
  await opening.locator('[name="openingFile"]').setInputFiles({ name: "apertura-sintetica.csv", mimeType: "text/csv", buffer: Buffer.from(`cuenta,debe,haber,concepto\n${bankLedger.code},1000,0,Banco inicial\n${equity.code},0,1000,Capital inicial`) });
  await save(opening, "Preparar apertura para revisión", async () => Boolean(await db.crmFinanceDocument.findFirst({where:{branchId:branch.id,reference:tag+"-OPEN"}})));
  const openingDocument = await post(tag + "-OPEN", admin, accountant);
  check(true, "Administrador carga apertura por CSV y contador la revisa y contabiliza desde navegador");
  await login(accountant); await visit("configuracion");
  check(await page.getByRole("button", { name: "Guardar política", exact: true }).count() === 0, "Contador consulta los datos empresariales sin poder modificarlos");
  await page.getByText("Importar saldos iniciales respaldados", { exact: true }).click();
  check(await page.getByRole("button", { name: "Preparar apertura para revisión", exact: true }).isVisible(), "Contador conserva la importación de saldos respaldados");
  await visit("obligaciones"); await page.getByText("Nuevo documento contable", { exact: true }).click();
  const invoice = form("create"); await invoice.locator('[name="kind"]').selectOption("PAYABLE_INVOICE");
  await invoice.locator('[name="branchId"]').selectOption(branch.id); await invoice.locator('[name="thirdPartyId"]').selectOption(party.id);
  for (const [key, value] of Object.entries({ date: "2033-01-02", dueDate: "2033-01-31", reference: tag + "-INV", description: "Factura sintética por 200", amount: "200" })) await invoice.locator(`[name="${key}"]`).fill(value);
  await invoice.locator('[name="debitAccountId"]').selectOption(expense.id); await invoice.locator('[name="creditAccountId"]').selectOption(payable.id);
  await save(invoice, "Guardar borrador", async () => Boolean(await db.crmFinanceDocument.findFirst({where:{branchId:branch.id,reference:tag+"-INV"}}))); const invoiceDocument = await post(tag + "-INV", accountant, admin);
  check(true, "Contador registra factura y administrador realiza revisión independiente");
  await login(admin); await visit("obligaciones"); await page.getByText("Nuevo documento contable", { exact: true }).click();
  const payment = form("create"); await payment.locator('[name="kind"]').selectOption("PAYABLE_PAYMENT");
  await payment.locator('[name="branchId"]').selectOption(branch.id); await payment.locator('[name="thirdPartyId"]').selectOption(party.id);
  for (const [key, value] of Object.entries({ date: "2033-01-03", reference: tag + "-PAY", description: "Pago parcial sintético de 150", amount: "150" })) await payment.locator(`[name="${key}"]`).fill(value);
  await payment.locator('[name="debitAccountId"]').selectOption(payable.id); await payment.locator('[name="creditAccountId"]').selectOption(bankLedger.id); await payment.locator('[name="bankAccountId"]').selectOption(bank.id);
  await payment.locator(`input[name="allocationTarget"][value="${invoiceDocument.id}"]`).check(); await payment.locator(`[name="allocationAmount:${invoiceDocument.id}"]`).fill("150");
  await save(payment, "Guardar borrador", async () => Boolean(await db.crmFinanceDocument.findFirst({where:{branchId:branch.id,reference:tag+"-PAY"}}))); const paid = await post(tag + "-PAY", admin, accountant);
  check(true, "Pago parcial por formulario conserva una obligación pendiente de 50");
  await visit("tesoreria");
  const statement = form("statement"); await statement.locator('[name="bankId"]').selectOption(bank.id);
  await statement.locator('[name="statementFile"]').setInputFiles({ name: "extracto-sintetico.csv", mimeType: "text/csv", buffer: Buffer.from(`id,fecha,referencia,importe\n${randomUUID()},2033-01-01,Apertura,1000\n${randomUUID()},2033-01-03,Pago,-150`) });
  await save(statement, "Importar movimientos de extracto", async () => await db.crmBankStatementLine.count({where:{bankAccountId:bank.id}})===2);
  const statements = await db.crmBankStatementLine.findMany({ where: { bankAccountId: bank.id } });
  for (const item of statements) {
    const entryId = item.amount.gt(0) ? openingDocument.journalEntryId! : paid.journalEntryId!;
    const line = await db.journalEntryLine.findFirstOrThrow({ where: { entryId, accountId: bankLedger.id } });
    const match = form("match"); await match.locator('[name="statementId"]').selectOption(item.id); await match.locator('[name="lineIds"]').selectOption(line.id);
    await match.locator('[name="reason"]').fill("Cotejo sintético con extracto y libro"); await save(match, "Conciliar / desvincular", async () => (await db.crmBankStatementLine.findUnique({where:{id:item.id}}))?.matchedLineId===line.id);
  }
  check(await db.crmBankStatementLine.count({ where: { bankAccountId: bank.id, matchedLineId: null } }) === 0, "Extracto importado y conciliado completamente por navegador");
  async function balance(accountId: string) {
    const values = await db.journalEntryLine.aggregate({ where: { accountId, entry: { branchId: branch.id, status: { in: ["CONTABILIZADO", "CONCILIADO"] } } }, _sum: { debit: true, credit: true } });
    return values._sum.debit!.minus(values._sum.credit!).toFixed(2);
  }
  assert.equal(await balance(bankLedger.id), expected.bank); assert.equal(await balance(payable.id), "-" + expected.payable); assert.equal(await balance(expense.id), expected.expense);
  const report = await getLedgerReport({ from: "2033-01-01", to: "2033-12-31", branchId: branch.id }); if (!report.ok) throw Error(report.error);
  check(report.data.statements.accumulatedResult === expected.result, "Mayor y resultado coinciden con cifras independientes: banco 850, deuda 50, pérdida 200");
  await visit("cierres");
  for (let month = 1; month <= 12; month++) {
    const monthKey=`2033-${String(month).padStart(2, "0")}`;
    const period = form("period"); await period.locator('[name="branchId"]').selectOption(branch.id); await period.locator('[name="period"]').fill(monthKey); await period.locator('[name="reason"]').fill("Cierre del caso sintético conciliado"); await save(period, "Validar y guardar período", async () => (await db.accountingClosing.findUnique({where:{branchId_period:{branchId:branch.id,period:monthKey}}}))?.status==="CERRADO");
  }
  check(await db.accountingClosing.count({ where: { branchId: branch.id, status: "CERRADO" } }) === 12, "Doce períodos cerrados desde navegador después de conciliar");
  await page.getByText("Preparar cierre anual de resultados", { exact: true }).click();
  const annual = form("annual"); await annual.locator('[name="branchId"]').selectOption(branch.id); await annual.locator('[name="year"]').fill("2033"); await annual.locator('[name="equityId"]').selectOption(equity.id); await annual.locator('[name="evidence"]').fill("Resultado esperado: pérdida 200; capital final 800"); await save(annual, "Generar borrador de cierre anual", async () => Boolean(await db.crmFinanceDocument.findFirst({where:{branchId:branch.id,kind:"YEAR_END"}})));
  const closing = await db.crmFinanceDocument.findFirstOrThrow({ where: { branchId: branch.id, kind: "YEAR_END" } }); await post(closing.reference, accountant, admin);
  assert.equal(await balance(equity.id), "-" + expected.equityAfterClose); assert.equal(await balance(expense.id), "0.00");
  check(true, "Cierre anual revisado descarga gastos y deja capital 800, banco 850 y deuda 50");
  await page.goto(`${base}/panel/contabilidad/reportes?from=2033-01-01&to=2033-12-31&branchId=${branch.id}`, { timeout: 180000 });
  await page.getByRole("heading", { name: "Estados financieros comparativos y agrupados", exact: true }).waitFor();
  check((await page.locator("body").innerText()).includes("850"), "Estados finales visibles con el saldo bancario del caso revisado");
  assert.deepEqual(errors, []); assert.deepEqual(pos, []);
  if (process.env.FINANCE_SCREENSHOT_DIR) { await mkdir(process.env.FINANCE_SCREENSHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.FINANCE_SCREENSHOT_DIR, "crm-ciclo-contable-completo.png"), fullPage: true }); }
  await writeFile(path.join(".audit", "crm-cycle-result.json"), JSON.stringify({ tag, expected, passed, branchId: branch.id, noPosRequests: true, checkedAt: new Date().toISOString() }, null, 2));
  console.log("OK Ciclo completo sin errores del navegador ni solicitudes al POS");
} catch (error) { console.error(error); process.exitCode = 1; }
finally { console.log(`${passed} verificaciones del ciclo contable correctas`); await browser.close(); await db.$disconnect(); await getPrisma().$disconnect(); }
