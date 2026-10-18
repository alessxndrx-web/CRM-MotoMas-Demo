import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { inspectCatalogWorkbook } from "@/server/finance/chart-of-accounts/workbook";
import { previewChartWorkbookAction, importChartWorkbookAction } from "@/server/finance/chart-of-accounts/import-actions";
import { getLedgerReport, ledgerDates } from "@/server/finance/ledger-reports";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { getPrisma } from "@/server/db/prisma";
import { roleEnumToSpanish, type UserRoleEnum } from "@/server/auth/roles";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55438");
assert.equal(url.pathname, "/motomas_finance_test", "Solo se ejecuta en la base aislada de esta tarea.");
const db = new PrismaClient();
const code = (suffix: string) => `${tag.replace(/\D/g, "")}${suffix}`;
let checks = 0;
function check(value: unknown, label: string) { assert.ok(value, label); checks++; console.log(`OK ${label}`); }
async function workbook(rows: Array<[string, string]>) {
  const w = new ExcelJS.Workbook(); const s = w.addWorksheet("CATALOGO");
  s.addRow(["Cuenta Contable", "Descripción de la Cuenta"]);
  rows.forEach(([c, name]) => s.addRow([code(c), name]));
  return Buffer.from(await w.xlsx.writeBuffer());
}
function form(bytes: Buffer) { const f = new FormData(); f.set("file", new File([new Uint8Array(bytes)], "catalogo.xlsx")); return f; }
async function signIn(id: string, role: UserRoleEnum) {
  const token = await createSessionToken({ uid: id, email: `${id}@test.invalid`, name: "Prueba", role: roleEnumToSpanish[role], roleEnum: role, branchId: "global" as never, branchName: "Global" });
  (globalThis as Record<string, unknown>).__motomasSmokeCookies = { [SESSION_COOKIE_NAME]: token };
}
const tag = `FWL-${Date.now()}`;
try {
  const admin = await db.user.create({ data: { email: `${tag}@test.invalid`, name: tag, passwordHash: "not-a-login-hash", role: "ADMIN" } });
  await signIn(admin.id, "ADMIN");
  const bytes = await workbook([["91", "Agrupación"], ["91-01", "Auxiliar"]]);
  const p = await previewChartWorkbookAction(form(bytes));
  check(p.ok && p.data.rows.length === 2, "Vista previa autenticada");
  if (!p.ok) throw new Error(p.error);
  check(p.data.rows[1].parentCode === code("91"), "Jerarquía detectada");
  const importForm = () => {
    const f = form(bytes); f.set("fileHash", p.data.fileHash); f.set("catalogHash", p.data.catalogHash); f.set("confirmed", "yes");
    f.set("selection", JSON.stringify(p.data.rows.map((r) => ({ row: r.row, type: "ACTIVO", nature: "DEUDORA" })))); return f;
  };
  const missingConfirmation = importForm(); missingConfirmation.delete("confirmed");
  check(!(await importChartWorkbookAction(missingConfirmation)).ok, "Confirmación obligatoria");
  const result = await importChartWorkbookAction(importForm());
  check(result.ok, "Importación real transaccional");
  const imported = await db.chartAccount.findMany({ where: { code: { in: [code("91"), code("91-01")] } }, orderBy: { code: "asc" } });
  check(imported.length === 2 && imported.every((r) => !r.isActive), "Cuentas nuevas inactivas");
  check(!imported[0].allowsPosting && imported[1].parentId === imported[0].id && imported[1].level === 2, "Agrupación y padre persistidos");
  check(await db.financialAuditEvent.count({ where: { entityId: { in: imported.map((r) => r.id) }, action: "CHART_ACCOUNT_CREATED" } }) === 2, "Auditoría atómica por cuenta");
  check(!(await importChartWorkbookAction(importForm())).ok, "Reintento con catálogo obsoleto rechazado");
  const duplicates = await inspectCatalogWorkbook(await workbook([["92", "Uno"], ["92", "Otro"]]), []);
  check(duplicates.rows.every((r) => r.status === "CONFLICTO"), "Duplicados distintos no se fusionan");
  const changed = await inspectCatalogWorkbook(bytes, [{ code: code("91"), name: "Otro nombre", updatedAt: new Date() }]);
  check(changed.rows[0].status === "CONFLICTO", "Diferencia con cuenta existente bloqueada");
  const failing = await workbook([["93", "Primera"], ["94-01", "Sin padre"], ["94", "Padre omitido"]]);
  const fp = await previewChartWorkbookAction(form(failing));
  if (!fp.ok) throw new Error(fp.error);
  const ff = form(failing); ff.set("catalogHash", fp.data.catalogHash); ff.set("fileHash", fp.data.fileHash); ff.set("confirmed", "yes"); ff.set("selection", JSON.stringify([{ row: 2, type: "ACTIVO", nature: "DEUDORA" }, { row: 3, type: "ACTIVO", nature: "DEUDORA" }]));
  check(!(await importChartWorkbookAction(ff)).ok, "Padre omitido rechaza lote");
  check(await db.chartAccount.count({ where: { code: code("93") } }) === 0, "Error posterior revierte primera cuenta");
  const seller = await db.user.create({ data: { email: `${tag}-seller@test.invalid`, name: tag, passwordHash: "not-a-login-hash", role: "VENDEDOR" } });
  await signIn(seller.id, "VENDEDOR");
  check(!(await previewChartWorkbookAction(form(bytes))).ok, "Vendedor no puede previsualizar catálogo");
  check(!(await importChartWorkbookAction(importForm())).ok, "Vendedor no puede importar");
  check(!(await getLedgerReport({ from: "2026-01-01", to: "2026-12-31" })).ok, "Vendedor no puede leer libro");
  await signIn(admin.id, "ADMIN");
  const branch = await db.branch.create({ data: { code: tag, name: tag } });
  const asset = imported[1];
  const revenue = await db.chartAccount.create({ data: { code: code("95"), name: "Ingreso prueba", type: "INGRESO", nature: "ACREEDORA" } });
  async function entry(number: string, date: string, amount: string, status: "BORRADOR" | "CONTABILIZADO" | "CONCILIADO", reverse = false, reversalOfId?: string, branchId: string | null = branch.id) {
    return db.journalEntry.create({ data: { entryNumber: `${tag}-${number}`, entryDate: new Date(date), createdByUserId: admin.id, status, branchId, reversalOfId,
      lines: { create: [{ accountId: asset.id, debit: reverse ? "0" : amount, credit: reverse ? amount : "0", position: 0 }, { accountId: revenue.id, credit: reverse ? "0" : amount, debit: reverse ? amount : "0", position: 1 }] } } });
  }
  await entry("open", "2025-12-31", "100.00", "CONTABILIZADO");
  const original = await entry("sale", "2026-01-01", "0.10", "CONTABILIZADO");
  await entry("sale2", "2026-01-31T23:59:59.999Z", "0.20", "CONCILIADO");
  await entry("draft", "2026-01-15", "999.00", "BORRADOR");
  await entry("outside", "2026-02-01", "888.00", "CONTABILIZADO");
  await entry("corporate", "2026-01-15", "777.00", "CONTABILIZADO", false, undefined, null);
  await entry("reversal", "2026-01-20", "0.10", "CONTABILIZADO", true, original.id);
  const report = await getLedgerReport({ from: "2026-01-01", to: "2026-01-31", branchId: branch.id, accountId: asset.id });
  if (!report.ok) throw new Error(report.error);
  check(report.data.opening === "100.00", "Saldo inicial fuera del período");
  check(report.data.count === 3, "Excluye borradores, otra sucursal y fecha siguiente");
  check(report.data.totals.debit === "0.40" && report.data.totals.credit === "0.40", "Decimal exacto y reversión incluidos");
  check(report.data.income === "0.20", "Resultado derivado del libro");
  check(report.data.statements.revenue === "0.20" && report.data.statements.equationDifference === "0.00", "Estado de resultado y ecuación patrimonial reconciliados");
  check(report.data.lines.at(-1)?.balance === "100.20", "Saldo corrido deudor");
  check(report.data.trial.find((r) => r.accountId === revenue.id)?.normalClosing === "100.20", "Naturaleza acreedora");
  check(report.data.lines.some((r) => r.reversalOfId === original.id), "Reversión trazable");
  for (let i = 0; i < 102; i++) await entry(`bulk-${String(i).padStart(3, "0")}`, "2026-01-10", "1.00", "CONTABILIZADO");
  const page2 = await getLedgerReport({ from: "2026-01-01", to: "2026-01-31", branchId: branch.id, accountId: asset.id, page: 2 });
  if (!page2.ok) throw new Error(page2.error);
  check(page2.data.count === 105 && page2.data.lines.length === 5, "Paginación sin truncar totales");
  check(page2.data.lines.at(-1)?.balance === "202.20", "Saldo corrido incluye primera página");
  check(page2.data.totals.debit === "102.40", "Totales completos con segunda página");
  let invalid = false; try { ledgerDates("2026-02-30", "2026-03-01"); } catch { invalid = true; }
  check(invalid, "Fecha imposible rechazada");
  const source = process.argv[2];
  if (source) {
    const actual = await inspectCatalogWorkbook(await readFile(source), []);
    for (const code of ["111-01-02", "111-01-04", "113-02-02"]) check(actual.rows.filter((r) => r.code === code).length === 2 && actual.rows.filter((r) => r.code === code).every((r) => r.status === "CONFLICTO"), `Duplicado real ${code}`);
    console.log(JSON.stringify({ sourceSheets: actual.sheets.length, sourceRows: actual.rows.length, conflicts: actual.rows.filter((r) => r.status === "CONFLICTO").map((r) => ({ row: r.row, code: r.code, issues: r.issues })) }));
  }
  console.log(`${checks} verificaciones correctas`);
} finally { await db.$disconnect(); await getPrisma().$disconnect(); }
