"use server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createCrmDraft, transitionCrmDocument } from "@/server/finance/crm/service";
import { configureCrmFinance, mapCrmBank, createCrmRegister, openCrmShift, closeCrmShift, importCrmStatement, matchCrmStatementGroup, closeCrmPeriod } from "@/server/finance/crm/treasury";
import { getPrisma } from "@/server/db/prisma";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { parseCrmStatementCsv, parseCrmCsv } from "@/server/finance/crm/csv";
import { registerReceivableFromDocument } from "@/server/finance/receivables/service";
import { configureReceivableBasis, configureTaxRule, documentDetails, prepareAnnualClosing, closeTaxRule } from "@/server/finance/crm/completion";
import { tagCashFlow } from "@/server/finance/crm/statements";
import type { CrmDocumentDetails } from "@/server/finance/crm/shared";

export async function crmFinanceAction(form: FormData) {
  const auth = await authorizeFinancialFoundation("configure"); if (!auth.ok) return auth;
  const s = (key: string) => String(form.get(key) ?? "");
  try {
    const details: CrmDocumentDetails = {};
    const allocations = form.getAll("allocationTarget").map(id => ({ targetId: String(id), amount: s("allocationAmount:" + id) }));
    if (allocations.length) details.allocations = allocations;
    if (s("proceeds")) { details.proceeds = s("proceeds"); details.proceedsAccountId = s("proceedsAccountId"); }
    if (s("taxRuleId")) details.taxRuleId = s("taxRuleId");
    if(s("saleTaxRuleId")){details.saleTaxRuleId=s("saleTaxRuleId");details.saleTaxBase=s("saleTaxBase");}
    switch (s("action")) {
      case "tax-rule-end": return await closeTaxRule(s("id"),s("to"),s("evidence"));
      case "basis": return await configureReceivableBasis({ receivableId:s("receivableId"),accountId:s("accountId"),currency:s("currency"),rate:s("rate"),carrying:s("carrying"),asOf:s("asOf"),evidence:s("evidence") });
      case "tax-rule": return await configureTaxRule({ code:s("code"),name:s("name"),regime:s("regime"),rate:s("rate"),debitAccountId:s("debitAccountId"),creditAccountId:s("creditAccountId"),from:s("from"),to:s("to"),evidence:s("evidence") });
      case "flow": return await tagCashFlow(s("entryId"),s("category"),s("evidence"));
      case "annual": return await prepareAnnualClosing(s("branchId"),Number(s("year")),s("equityId"),s("evidence"));
      case "opening": {
        const file=form.get("openingFile");
        if (!(file instanceof File) || file.size>2*1024*1024) return {ok:false as const,error:"Selecciona el CSV de apertura, hasta 2 MiB."};
        const rows=parseCrmCsv(await file.text());
        if (rows.shift()?.map(x=>x.toLowerCase()).join(",")!=="cuenta,debe,haber,concepto") return {ok:false as const,error:"Columnas requeridas: cuenta,debe,haber,concepto."};
        const accounts=await getPrisma().chartAccount.findMany({select:{id:true,code:true}});
        const lines=rows.map(r=>{const a=accounts.find(a=>a.code===r[0]);if(!a||r.length!==4)throw new Error();return {accountId:a.id,debit:r[1],credit:r[2],concept:r[3]};});
        const policy=await getPrisma().crmFinancePolicy.findUniqueOrThrow({where:{id:"main"}});
        return await createCrmDraft({requestKey:s("requestKey")||randomUUID(),kind:"OPENING",branchId:s("branchId"),date:s("date"),debitAccountId:lines[0]?.accountId??"",creditAccountId:lines.find(l=>l.accountId!==lines[0]?.accountId)?.accountId??"",amount:lines.reduce((v,l)=>v.plus(l.debit),new Prisma.Decimal(0)).toFixed(2),currency:policy.functionalCurrency,exchangeRate:"1",reference:s("reference"),description:s("description"),details:{lines,evidence:s("evidence")}});
      }
      case "receivable": return await registerReceivableFromDocument({accountingDocumentId:s("accountingDocumentId"),dueDate:s("dueDate")});
      case "revise": {
        const d=await getPrisma().crmFinanceDocument.findUniqueOrThrow({where:{id:s("id")}});
        return await createCrmDraft({requestKey:d.requestKey,kind:d.kind,branchId:d.branchId,thirdPartyId:d.thirdPartyId??undefined,parentId:d.parentId??undefined,receivableId:d.receivableId??undefined,bankAccountId:d.bankAccountId??undefined,cashSessionId:d.cashSessionId??undefined,debitAccountId:s("debitAccountId"),creditAccountId:s("creditAccountId"),date:s("date"),dueDate:d.dueDate?.toISOString().slice(0,10),currency:d.currency,exchangeRate:d.exchangeRate.toString(),amount:s("amount"),reference:s("reference"),description:s("description"),usefulLifeMonths:d.usefulLifeMonths??undefined,residualAmount:d.residualAmount?.toString(),taxBase:d.taxBase?.toString(),taxRate:d.taxRate?.toString(),certificate:d.certificate??undefined,attachmentUrl:d.attachmentUrl??undefined,fxAccountId:d.fxAccountId??undefined,cashFlowClass:d.cashFlowClass??undefined,details:documentDetails(d)},d.id);
      }
      case "create": return await createCrmDraft({requestKey:s("requestKey"),kind:s("kind"),branchId:s("branchId"),thirdPartyId:s("thirdPartyId"),parentId:s("parentId"),receivableId:s("receivableId"),bankAccountId:s("bankAccountId"),cashSessionId:s("cashSessionId"),debitAccountId:s("debitAccountId"),creditAccountId:s("creditAccountId"),date:s("date"),dueDate:s("dueDate"),currency:s("currency"),exchangeRate:s("exchangeRate"),amount:s("amount"),reference:s("reference"),description:s("description"),usefulLifeMonths:s("usefulLifeMonths")?Number(s("usefulLifeMonths")):undefined,residualAmount:s("residualAmount"),taxBase:s("taxBase"),taxRate:s("taxRate"),certificate:s("certificate"),attachmentUrl:s("attachmentUrl"),fxAccountId:s("fxAccountId"),cashFlowClass:s("cashFlowClass"),details});
      case "transition": return await transitionCrmDocument(s("id"),s("transition"),s("reason"),s("reversalDate"));
      case "policy": return await configureCrmFinance({companyName:s("companyName"),taxId:s("taxId"),functionalCurrency:s("functionalCurrency"),requireSeparation:s("requireSeparation")==="on",taxRegime:s("taxRegime")});
      case "bank": return await mapCrmBank(s("bankId"),s("accountId"));
      case "register": return await createCrmRegister(s("branchId"),s("name"),s("accountId"),s("currency"));
      case "open": return await openCrmShift(s("registerId"));
      case "close": return await closeCrmShift(s("shiftId"),JSON.parse(s("denominations")),s("reason"));
      case "statement": {
        const file=form.get("statementFile");
        if (!(file instanceof File)||file.size>2*1024*1024||!file.name.toLowerCase().endsWith(".csv")) return {ok:false as const,error:"Selecciona un CSV de hasta 2 MiB."};
        return await importCrmStatement(s("bankId"),parseCrmStatementCsv(await file.text()));
      }
      case "match": return await matchCrmStatementGroup(s("statementId"),form.getAll("lineIds").map(String).filter(Boolean).concat(s("lineId")?[s("lineId")]:[]),s("reason"));
      case "period": return await closeCrmPeriod(s("branchId"),s("period"),s("reason"),s("reopen")==="on");
      default: return {ok:false as const,error:"Acción inválida."};
    }
  } catch {return {ok:false as const,error:"Datos inválidos. Revisa fechas, importes y formato de las filas."};}
}
