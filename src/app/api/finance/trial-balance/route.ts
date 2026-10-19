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
  const financial=result.data.financial;
  const comparison=workbook.addWorksheet("Estados comparativos");comparison.addRow(["Concepto","Actual","Anterior","Variación"]);
  const labels:Record<string,string>={revenue:"Ingresos",cost:"Costos",expenses:"Gastos",income:"Resultado",assets:"Activos",liabilities:"Pasivos",equity:"Patrimonio",unclosed:"Resultados sin cierre"};
  for(const r of financial.comparative)comparison.addRow([labels[r.key],Number(r.current),Number(r.previous),Number(r.difference)]);
  comparison.addRow(["Anterior desde",financial.previousFrom,"Hasta",financial.previousTo]);
  const hierarchy=workbook.addWorksheet("Cuentas agrupadas");hierarchy.addRow(["Código","Descripción","Nivel","Actual","Anterior","Variación"]);for(const r of financial.hierarchy)hierarchy.addRow([r.code,r.name,r.level,Number(r.current),Number(r.previous),Number(r.difference)]);
  const flow=workbook.addWorksheet("Flujo de efectivo");flow.addRow(["Concepto","Importe funcional"]);flow.addRow(["Efectivo inicial",Number(financial.cashFlow.opening)]);flow.addRow(["Saldos incorporados por apertura",Number(financial.cashFlow.openingAdjustments)]);for(const r of financial.cashFlow.categories)flow.addRow([r.category,Number(r.amount)]);flow.addRow(["Variación neta",Number(financial.cashFlow.change)]);flow.addRow(["Efectivo final",Number(financial.cashFlow.closing)]);flow.addRow(["Diferencia",Number(financial.cashFlow.difference)]);flow.addRow(["Movimientos sin clasificar",financial.cashFlow.unclassified]);
  const detail=workbook.addWorksheet("Detalle de efectivo");detail.addRow(["Fecha","Asiento","Clasificación","Importe funcional"]);for(const r of financial.cashFlow.rows)detail.addRow([r.date,r.number,r.category,Number(r.amount)]);
  for(const ws of [comparison,hierarchy,flow,detail]){ws.getRow(1).font={bold:true};ws.views=[{state:"frozen",ySplit:1}];ws.columns.forEach(c=>{c.width=28;});}
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=balanza.xlsx", "Cache-Control": "private, no-store" } });
}
