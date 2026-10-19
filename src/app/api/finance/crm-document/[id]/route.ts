import { getPrisma } from "@/server/db/prisma";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { crmFinanceKinds } from "@/server/finance/crm/shared";
import { previewCrmPosting } from "@/server/finance/crm/service";

function escape(value: unknown) { return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeFinancialFoundation("view"); if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
  const { id } = await params;
  const db = getPrisma();
  const doc = await db.crmFinanceDocument.findUnique({ where: { id }, include: { branch: true, debitAccount: true, creditAccount: true, createdBy: true, reviewedBy: true, journalEntry: { include: { lines: { include: { account: true }, orderBy: { position: "asc" } } } } } });
  if (!doc) return new Response("Documento no encontrado", { status: 404 });
  const policy = await db.crmFinancePolicy.findUnique({ where: { id: "main" } });
  const preview=doc.journalEntry?null:await previewCrmPosting(doc.id);
  const draftAccounts=preview?.ok?await db.chartAccount.findMany({where:{id:{in:preview.data.map(l=>l.accountId)}}}):[];
  const draftLines=preview?.ok?preview.data.map(l=>{const a=draftAccounts.find(a=>a.id===l.accountId);return `<tr><td>${escape(a?.code)}</td><td>${escape(a?.name)} · ${escape(l.concept)}</td><td class="money">${l.debit}</td><td class="money">${l.credit}</td></tr>`;}).join(""):`<tr><td colspan="4">Vista previa pendiente: ${escape(preview&&!preview.ok?preview.error:"El documento todavía no genera un asiento.")}</td></tr>`;
  const lines = doc.journalEntry?.lines.map((l) => `<tr><td>${escape(l.account.code)}</td><td>${escape(l.account.name)}</td><td class="money">${l.debit.toFixed(2)}</td><td class="money">${l.credit.toFixed(2)}</td></tr>`).join("") ?? draftLines;
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Comprobante ${escape(doc.reference)}</title><style>body{font:13px Arial;margin:35px;color:#152239}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:24px 0}td,th{padding:9px;border:1px solid #b9c2ce;text-align:left}.money{text-align:right}footer{display:flex;justify-content:space-between;margin-top:50px}small{color:#475569}@media print{button{display:none}@page{size:A4;margin:18mm}body{margin:0}tr{break-inside:avoid}}</style><body><button onclick="window.print()">Imprimir / guardar PDF</button><h1>${escape(policy?.companyName)}</h1><p>Identificación: ${escape(policy?.taxId)}</p><h2>${escape(crmFinanceKinds[doc.kind])} · ${escape(doc.reference)}</h2><p>${escape(doc.number)} · ${escape(doc.status)}</p><p>Sucursal: ${escape(doc.branch.name)} · Fecha: ${doc.date.toISOString().slice(0, 10)} · Vencimiento: ${doc.dueDate?.toISOString().slice(0, 10) ?? "No aplica"}</p><p>${escape(doc.description)}</p><p>Importe original: ${doc.amount.toFixed(2)} ${escape(doc.currency)} · Cambio histórico: ${doc.exchangeRate.toFixed(6)} · Moneda del libro: ${escape(policy?.functionalCurrency)}</p><table><thead><tr><th>Código</th><th>Cuenta</th><th>Debe</th><th>Haber</th></tr></thead><tbody>${lines}</tbody></table><p>Constancia: ${escape(doc.certificate ?? "No aplica")}</p><p>Respaldo: ${escape(doc.attachmentUrl ?? "No adjuntado")}</p><footer><div>Elaborado: ${escape(doc.createdBy.name)}</div><div>Revisado: ${escape(doc.reviewedBy?.name ?? "Pendiente")}</div></footer><p><small>La aprobación interna identifica al usuario; no representa una firma digital certificada. Plantilla CRM v1.</small></p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'" } });
}
