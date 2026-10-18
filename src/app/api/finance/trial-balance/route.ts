import ExcelJS from "exceljs";
import { getLedgerReport } from "@/server/finance/ledger-reports";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const result = await getLedgerReport({ from: params.get("from") ?? "", to: params.get("to") ?? "", branchId: params.get("branchId") ?? undefined });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Balanza");
  sheet.addRow(["Balanza de comprobación", params.get("from"), params.get("to")]);
  sheet.addRow(["Solo asientos contabilizados y conciliados. Moneda según registros del libro."]);
  sheet.addRow(["Código", "Cuenta", "Inicial D-C", "Debe", "Haber", "Final deudor", "Final acreedor"]);
  for (const r of result.data.trial) sheet.addRow([r.code, r.name, ...[r.opening, r.debit, r.credit, r.closingDebit, r.closingCredit].map(Number)]);
  const t = result.data.totals;
  sheet.addRow(["TOTAL", "", "", Number(t.debit), Number(t.credit), Number(t.closingDebit), Number(t.closingCredit)]);
  sheet.columns.forEach((column, i) => { column.width = i === 1 ? 48 : 21; if (i > 1) column.numFmt = "#,##0.00"; });
  sheet.getRow(3).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.autoFilter = { from: "A3", to: `G${3 + result.data.trial.length}` };
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=balanza.xlsx", "Cache-Control": "private, no-store" } });
}
