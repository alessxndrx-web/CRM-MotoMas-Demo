"use server";
import { createCrmDraft, transitionCrmDocument } from "@/server/finance/crm/service";
import { configureCrmFinance, mapCrmBank, createCrmRegister, openCrmShift, closeCrmShift, importCrmStatement, matchCrmStatement, closeCrmPeriod } from "@/server/finance/crm/treasury";
import { getPrisma } from "@/server/db/prisma";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { parseCrmStatementCsv } from "@/server/finance/crm/csv";
import { registerReceivableFromDocument } from "@/server/finance/receivables/service";

export async function crmFinanceAction(form: FormData) {
  const auth = await authorizeFinancialFoundation("configure"); if (!auth.ok) return auth;
  const s = (key: string) => String(form.get(key) ?? "");
  try {
    switch (s("action")) {
      case "receivable": return await registerReceivableFromDocument({ accountingDocumentId: s("accountingDocumentId"), dueDate: s("dueDate") });
      case "revise": {
        const d = await getPrisma().crmFinanceDocument.findUniqueOrThrow({ where: { id: s("id") } });
        return await createCrmDraft({ requestKey: d.requestKey, kind: d.kind, branchId: d.branchId, thirdPartyId: d.thirdPartyId ?? undefined, parentId: d.parentId ?? undefined, receivableId: d.receivableId ?? undefined, bankAccountId: d.bankAccountId ?? undefined, cashSessionId: d.cashSessionId ?? undefined, debitAccountId: s("debitAccountId"), creditAccountId: s("creditAccountId"), date: s("date"), dueDate: d.dueDate?.toISOString().slice(0, 10), currency: d.currency, exchangeRate: d.exchangeRate.toString(), amount: s("amount"), reference: s("reference"), description: s("description"), usefulLifeMonths: d.usefulLifeMonths ?? undefined, residualAmount: d.residualAmount?.toString(), taxBase: d.taxBase?.toString(), taxRate: d.taxRate?.toString(), certificate: d.certificate ?? undefined, attachmentUrl: d.attachmentUrl ?? undefined, fxAccountId: d.fxAccountId ?? undefined, cashFlowClass: d.cashFlowClass ?? undefined }, d.id);
      }
      case "create": return await createCrmDraft({
        requestKey: s("requestKey"), kind: s("kind"), branchId: s("branchId"), thirdPartyId: s("thirdPartyId"), parentId: s("parentId"), receivableId: s("receivableId"), bankAccountId: s("bankAccountId"), cashSessionId: s("cashSessionId"), debitAccountId: s("debitAccountId"), creditAccountId: s("creditAccountId"), date: s("date"), dueDate: s("dueDate"), currency: s("currency"), exchangeRate: s("exchangeRate"), amount: s("amount"), reference: s("reference"), description: s("description"), usefulLifeMonths: s("usefulLifeMonths") ? Number(s("usefulLifeMonths")) : undefined, residualAmount: s("residualAmount"), taxBase: s("taxBase"), taxRate: s("taxRate"), certificate: s("certificate"), attachmentUrl: s("attachmentUrl"), fxAccountId: s("fxAccountId"), cashFlowClass: s("cashFlowClass"),
      });
      case "transition": return await transitionCrmDocument(s("id"), s("transition"), s("reason"), s("reversalDate"));
      case "policy": return await configureCrmFinance({ companyName: s("companyName"), taxId: s("taxId"), functionalCurrency: s("functionalCurrency"), requireSeparation: s("requireSeparation") === "on" });
      case "bank": return await mapCrmBank(s("bankId"), s("accountId"));
      case "register": return await createCrmRegister(s("branchId"), s("name"), s("accountId"), s("currency"));
      case "open": return await openCrmShift(s("registerId"));
      case "close": return await closeCrmShift(s("shiftId"), JSON.parse(s("denominations")), s("reason"));
      case "statement": {
        const file = form.get("statementFile");
        if (!(file instanceof File) || file.size > 2 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".csv")) return { ok: false as const, error: "Selecciona un CSV de hasta 2 MiB." };
        return await importCrmStatement(s("bankId"), parseCrmStatementCsv(await file.text()));
      }
      case "match": return await matchCrmStatement(s("statementId"), s("lineId"), s("reason"));
      case "period": return await closeCrmPeriod(s("branchId"), s("period"), s("reason"), s("reopen") === "on");
      default: return { ok: false as const, error: "Acción inválida." };
    }
  } catch {
    return { ok: false as const, error: "Datos inválidos. Revisa fechas, importes y formato de las filas." };
  }
}
