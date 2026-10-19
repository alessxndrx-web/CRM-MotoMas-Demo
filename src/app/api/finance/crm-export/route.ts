import ExcelJS from "exceljs";
import { getPrisma } from "@/server/db/prisma";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { crmFinanceKinds } from "@/server/finance/crm/shared";
export async function GET(request: Request) {
  const auth = await authorizeFinancialFoundation("view"); if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
  const q = new URL(request.url).searchParams;
  const data = await getPrisma().crmFinanceDocument.findMany({ where: { ...(q.get("branchId") ? { branchId: q.get("branchId")! } : {}), ...(q.get("currency") ? { currency: q.get("currency")! } : {}) }, orderBy: { date: "asc" }, include: { branch: true, thirdParty: true, createdBy: true, reviewedBy: true, debitAccount: true, creditAccount: true } });
  const w = new ExcelJS.Workbook(); const s = w.addWorksheet("Documentos CRM");
  s.addRow(["Número", "Referencia", "Tipo", "Estado", "Sucursal", "Tercero", "Fecha", "Vencimiento", "Moneda", "Cambio histórico", "Importe original", "Importe funcional", "Debe", "Haber", "Base tributaria", "Tasa %", "Constancia", "Concepto", "Elaboró", "Revisó", "Respaldo"]);
  for (const d of data) s.addRow([d.number, d.reference, crmFinanceKinds[d.kind], d.status, d.branch.name, d.thirdParty?.name ?? "", d.date, d.dueDate, d.currency, d.exchangeRate.toNumber(), d.amount.toNumber(), d.baseAmount.toNumber(), d.debitAccount.code, d.creditAccount.code, d.taxBase?.toNumber(), d.taxRate?.toNumber(), d.certificate, d.description, d.createdBy.name, d.reviewedBy?.name, d.attachmentUrl]);
  s.columns.forEach((c) => { c.width = 24; }); s.getRow(1).font = { bold: true };
  s.getColumn(7).numFmt = "yyyy-mm-dd"; s.getColumn(8).numFmt = "yyyy-mm-dd";
  [10, 11, 12, 15, 16].forEach((i) => { s.getColumn(i).numFmt = i === 10 ? "0.000000" : "#,##0.00"; });
  s.views = [{ state: "frozen", ySplit: 1 }]; s.autoFilter = `A1:U${Math.max(1, s.rowCount)}`;
  const tax=w.addWorksheet("Auxiliar tributario");tax.addRow(["Comprobante","Fecha","Tipo","Estado","Regla","Moneda de la base","Base","Tasa %","Impuesto","Constancia","Respaldo"]);
  const policy=await getPrisma().crmFinancePolicy.findUnique({where:{id:"main"}});
  for(const d of data.filter(d=>d.kind==="TAX"||d.kind==="ASSET_SALE"&&d.taxBase)){
    const details=(d.details??{}) as Record<string,unknown>;
    tax.addRow([d.number,d.date,crmFinanceKinds[d.kind],d.status,String(details.taxRuleId??details.saleTaxRuleId??"Parámetro manual"),d.kind==="ASSET_SALE"?policy?.functionalCurrency:d.currency,d.taxBase?.toNumber(),d.taxRate?.toNumber(),d.taxBase&&d.taxRate?d.taxBase.times(d.taxRate).div(100).toDecimalPlaces(2).toNumber():null,d.certificate,d.attachmentUrl]);
  }
  tax.getRow(1).font={bold:true};tax.getColumn(2).numFmt="yyyy-mm-dd";for(const i of [7,8,9])tax.getColumn(i).numFmt="#,##0.00";tax.columns.forEach(c=>{c.width=24;});tax.views=[{state:"frozen",ySplit:1}];
  const b = await w.xlsx.writeBuffer();
  return new Response(new Uint8Array(b), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": "attachment; filename=documentos-contables-crm.xlsx", "Cache-Control": "private, no-store" } });
}
