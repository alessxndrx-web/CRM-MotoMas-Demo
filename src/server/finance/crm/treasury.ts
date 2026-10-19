import { Prisma } from "@prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { crmWrite, crmAudit, crmMoney, crmDate } from "@/server/finance/crm/service";
import { describeChartAccountPostingBlock } from "@/server/finance/chart-of-accounts/shared";
import { assertAccountingDateIsOpen } from "@/server/finance/periods";
import { settlementTargets,documentDetails } from "@/server/finance/crm/completion";

export async function configureCrmFinance(input: { companyName: string; taxId: string; functionalCurrency: string; requireSeparation: boolean; taxRegime?: string }) {
  return crmWrite(async (ctx) => {
    ctx.ensure(Boolean(input.companyName?.trim() && input.taxId?.trim()) && ["NIO", "USD"].includes(input.functionalCurrency), "Entidad, identificación y moneda funcional son obligatorias.");
    const current = await ctx.tx.crmFinancePolicy.findUnique({ where: { id: "main" } });
    const posted = await ctx.tx.journalEntry.count({ where: { status: { in: ["CONTABILIZADO", "CONCILIADO"] } } });
    ctx.ensure(!posted || current?.functionalCurrency === input.functionalCurrency, "La moneda funcional no puede cambiar tras contabilizar documentos.");
    ctx.ensure(!posted || (current?.companyName === input.companyName.trim() && current.taxId === input.taxId.trim()), "La entidad con historia contabilizada no se sustituye; requiere un proceso de migración revisado.");
    const row = await ctx.tx.crmFinancePolicy.upsert({ where: { id: "main" }, create: { ...input, companyName: input.companyName.trim().slice(0, 200), taxId: input.taxId.trim().slice(0, 60) }, update: { ...input, companyName: input.companyName.trim().slice(0, 200), taxId: input.taxId.trim().slice(0, 60) } });
    await crmAudit(ctx, row.id, "CRM_FINANCE_CONFIGURED", { currency: row.functionalCurrency, description: row.companyName, taxId:row.taxId,taxRegime:row.taxRegime,requireSeparation:row.requireSeparation, detailsChanged: true },undefined,current?{currency:current.functionalCurrency,description:current.companyName,taxId:current.taxId,taxRegime:current.taxRegime,requireSeparation:current.requireSeparation}:undefined);
    return { id: row.id };
  });
}
export async function mapCrmBank(bankId: string, accountId: string) {
  return crmWrite(async (ctx) => {
    const bank = await ctx.tx.bankAccount.findUniqueOrThrow({ where: { id: bankId } });
    const account = await ctx.tx.chartAccount.findUniqueOrThrow({ where: { id: accountId } });
    ctx.ensure(account.type === "ACTIVO" && !describeChartAccountPostingBlock(account), "El banco requiere una cuenta de activo utilizable.");
    ctx.ensure(!bank.ledgerAccountId || bank.ledgerAccountId === accountId, "La vinculación existente requiere una migración revisada; no se reemplaza con historia activa.");
    ctx.ensure(!await ctx.tx.bankAccount.findFirst({ where: { ledgerAccountId: accountId, id: { not: bankId } } }), "La cuenta contable ya está vinculada a otro banco.");
    ctx.ensure(!await ctx.tx.crmCashRegister.findUnique({ where: { accountId } }), "La cuenta contable ya pertenece a una caja administrativa.");
    await ctx.tx.bankAccount.update({ where: { id: bankId }, data: { ledgerAccountId: accountId } });
    await crmAudit(ctx, bankId, "CRM_FINANCE_CONFIGURED", { description: `Banco vinculado a ${account.code}`, detailsChanged: true });
    return { id: bankId };
  });
}
export async function createCrmRegister(branchId: string, name: string, accountId: string, currency: string) {
  return crmWrite(async (ctx) => {
    const account = await ctx.tx.chartAccount.findUniqueOrThrow({ where: { id: accountId } });
    ctx.ensure(account.type === "ACTIVO" && !describeChartAccountPostingBlock(account) && name.trim().length > 0 && ["NIO", "USD"].includes(currency), "Indica nombre, moneda y una cuenta de activo utilizable.");
    const policy = await ctx.tx.crmFinancePolicy.findUniqueOrThrow({ where: { id: "main" } });
    ctx.ensure(currency === policy.functionalCurrency, "La caja administrativa requiere moneda funcional; las cuentas en moneda extranjera se gestionan en bancos.");
    ctx.ensure(!await ctx.tx.bankAccount.findFirst({ where: { ledgerAccountId: accountId } }), "La cuenta ya pertenece a un banco.");
    const row = await ctx.tx.crmCashRegister.create({ data: { branchId, name: name.trim().slice(0, 120), accountId, currency } });
    await crmAudit(ctx, row.id, "CRM_FINANCE_CONFIGURED", { description: row.name, currency, detailsChanged: true });
    return { id: row.id };
  });
}
export async function openCrmShift(registerId: string) {
  return crmWrite(async (ctx) => {
    const register = await ctx.tx.crmCashRegister.findUniqueOrThrow({ where: { id: registerId } });
    ctx.ensure(register.isActive, "La caja está inactiva.");
    const shift = await ctx.tx.cashSession.create({ data: { branchId: register.branchId, cashierId: ctx.actor.userId, crmRegisterId: register.id, notes: "Tesorería administrativa CRM" } });
    await crmAudit(ctx, shift.id, "CRM_FINANCE_CHANGED", { status: shift.status, description: `Apertura ${register.name}` });
    return { id: shift.id };
  });
}
export async function closeCrmShift(shiftId: string, denominations: Array<{ value: string; count: number }>, reason: string) {
  return crmWrite(async (ctx) => {
    const shift = await ctx.tx.cashSession.findUniqueOrThrow({ where: { id: shiftId }, include: { crmRegister: true } });
    ctx.ensure(shift.status === "ABIERTO" && Boolean(shift.crmRegister), "El turno administrativo no está abierto.");
    ctx.ensure(denominations.length > 0 && denominations.length <= 20 && new Set(denominations.map((d) => d.value)).size === denominations.length, "Indica denominaciones distintas y sus cantidades.");
    let counted = new Prisma.Decimal(0);
    for (const d of denominations) {
      ctx.ensure(Number.isInteger(d.count) && d.count >= 0 && d.count <= 1000000, "Conteo de denominaciones inválido.");
      counted = counted.plus(crmMoney(d.value).times(d.count));
    }
    ctx.ensure(counted.lte("9999999999.99"), "El conteo supera el límite.");
    ctx.ensure(await ctx.tx.crmFinanceDocument.count({ where: { cashSessionId: shiftId, status: { in: ["DRAFT", "IN_REVIEW", "APPROVED"] } } }) === 0, "Hay movimientos del turno sin contabilizar.");
    // Account dedicated to the register: its whole posted balance is the cash
    // held, including funds carried from earlier closed shifts.
    const lines = await ctx.tx.journalEntryLine.aggregate({ where: { accountId: shift.crmRegister!.accountId, entry: { branchId: shift.branchId, status: { in: ["CONTABILIZADO", "CONCILIADO"] } } }, _sum: { debit: true, credit: true } });
    const policy = await ctx.tx.crmFinancePolicy.findUniqueOrThrow({ where: { id: "main" } });
    ctx.ensure(shift.crmRegister!.currency === policy.functionalCurrency, "El arqueo requiere caja en moneda funcional; usa banco para operaciones en otra moneda.");
    const expected = (lines._sum.debit ?? new Prisma.Decimal(0)).minus(lines._sum.credit ?? 0);
    ctx.ensure(counted.equals(expected) || Boolean(reason.trim()), "Documenta el motivo de la diferencia antes de cerrar.");
    await ctx.tx.cashSession.update({ where: { id: shiftId }, data: { status: "CERRADO", closedAt: new Date(), crmExpectedAmount: expected, crmCountedAmount: counted, crmDenominations: denominations, notes: reason.trim().slice(0, 500) || "Arqueo sin diferencia" } });
    await crmAudit(ctx, shiftId, "CRM_FINANCE_CHANGED", { status: "CERRADO", amount: counted, difference: counted.minus(expected) }, reason);
    return { id: shiftId, expected: expected.toFixed(2), counted: counted.toFixed(2), difference: counted.minus(expected).toFixed(2) };
  });
}

export async function importCrmStatement(bankId: string, rows: Array<{ externalId: string; date: string; reference: string; amount: string }>) {
  return crmWrite(async (ctx) => {
    ctx.ensure(Array.isArray(rows) && rows.length > 0 && rows.length <= 1000, "El extracto debe tener entre 1 y 1000 movimientos.");
    const bank = await ctx.tx.bankAccount.findUniqueOrThrow({ where: { id: bankId } });
    ctx.ensure(Boolean(bank.ledgerAccountId && bank.isActive), "Vincula primero una cuenta contable al banco.");
    let imported = 0; let unchanged = 0;
    for (const row of rows) {
      ctx.ensure(typeof row.amount === "string", "Importe inválido.");
      const amount = crmMoney(row.amount.replace(/^-/, "")).times(row.amount.startsWith("-") ? -1 : 1);
      const date = crmDate(row.date);
      ctx.ensure(Boolean(row.externalId?.trim() && row.reference?.trim()) && row.externalId.length <= 120 && row.reference.length <= 200, "Identificador de banco y referencia obligatorios.");
      const prior = await ctx.tx.crmBankStatementLine.findUnique({ where: { bankAccountId_externalId: { bankAccountId: bankId, externalId: row.externalId.trim() } } });
      if (prior) { ctx.ensure(prior.amount.equals(amount) && prior.date.getTime() === date.getTime() && prior.reference === row.reference.trim(), "El banco reutilizó un identificador con otros datos; revisa el extracto."); unchanged++; continue; }
      await ctx.tx.crmBankStatementLine.create({ data: { bankAccountId: bankId, externalId: row.externalId.trim(), date, reference: row.reference.trim(), amount } }); imported++;
    }
    await crmAudit(ctx, bankId, "CRM_FINANCE_CHANGED", { description: `Extracto: ${imported} nuevos, ${unchanged} existentes`, detailsChanged: true });
    return { id: bankId, imported, unchanged };
  });
}
export async function matchCrmStatement(statementId: string, lineId: string, reason?: string) {
  return matchCrmStatementGroup(statementId, lineId ? [lineId] : [], reason);
}
export async function matchCrmStatementGroup(statementId: string, lineIds: string[], reason?: string) {
  return crmWrite(async (ctx) => {
    const row = await ctx.tx.crmBankStatementLine.findUniqueOrThrow({ where: { id: statementId }, include: { bankAccount: true } });
    const period = await assertAccountingDateIsOpen(ctx.tx, row.date, row.bankAccount.branchId); if (!period.ok) return ctx.fail(period.error);
    ctx.ensure(lineIds.length <= 100 && new Set(lineIds).size === lineIds.length, "Selecciona hasta 100 movimientos distintos.");
    if (!lineIds.length) {
      ctx.ensure(Boolean(reason?.trim()), "Indica motivo de desvinculación.");
      await ctx.tx.crmBankStatementLine.update({ where: { id: statementId }, data: { matchedLineId: null, matchedAt: null, matchedById: null } });
      await ctx.tx.crmBankMatch.deleteMany({where:{statementId}});
    } else {
      ctx.ensure(!row.matchedLineId, "El movimiento ya está conciliado.");
      const policy = await ctx.tx.crmFinancePolicy.findUniqueOrThrow({ where: { id: "main" } });
      let total = new Prisma.Decimal(0);
      for (const lineId of lineIds) {
      ctx.ensure(!await ctx.tx.crmBankMatch.findUnique({where:{lineId}}) && !await ctx.tx.crmBankStatementLine.findUnique({where:{matchedLineId:lineId}}),"Un movimiento ya está conciliado en otro extracto.");
      const line = await ctx.tx.journalEntryLine.findUniqueOrThrow({ where: { id: lineId }, include: { entry: { include: { crmFinanceDocument: true, reversal: true } } } });
      const doc = line.entry.crmFinanceDocument;
      ctx.ensure(line.accountId === row.bankAccount.ledgerAccountId && line.entry.branchId === row.bankAccount.branchId && ["CONTABILIZADO", "CONCILIADO"].includes(line.entry.status) && !line.entry.reversal, "Selecciona un movimiento vigente de la cuenta bancaria.");
      const functionalRecovery=doc?.kind==="ASSET_SALE"&&documentDetails(doc).proceedsAccountId===line.accountId;
      ctx.ensure(doc&&!functionalRecovery ? doc.currency === row.bankAccount.currency : row.bankAccount.currency === policy.functionalCurrency, "La moneda no puede verificarse contra este asiento histórico.");
      const signed = line.debit.minus(line.credit).div(functionalRecovery?1:doc?.exchangeRate ?? 1).toDecimalPlaces(2);
      ctx.ensure(signed.gt(0) === row.amount.gt(0), "Los movimientos agrupados deben tener el signo del extracto.");
      total = total.plus(signed);
      ctx.ensure(line.entry.entryDate <= row.date, "El movimiento contable no puede ser posterior al extracto.");
      await ctx.tx.crmBankMatch.create({data:{statementId,lineId,amount:signed}});
      }
      ctx.ensure(total.equals(row.amount), "La suma de los movimientos no coincide con el extracto.");
      await ctx.tx.crmBankStatementLine.update({ where: { id: statementId }, data: { matchedLineId: lineIds[0], matchedAt: new Date(), matchedById: ctx.actor.userId } });
    }
    await crmAudit(ctx, statementId, "CRM_BANK_MATCHED", { status: lineIds.length ? "CONCILIADO" : "PENDIENTE", amount: row.amount, reference: row.reference, lineCount:lineIds.length }, reason);
    return { id: statementId };
  });
}

export async function crmClosingChecks(tx: Prisma.TransactionClient, branchId: string, period: string) {
  const start = crmDate(`${period}-01`); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const date = { gte: start, lt: end };
  const [drafts, operations, statements, shifts, ledger] = await Promise.all([
    tx.journalEntry.count({ where: { branchId, entryDate: date, status: "BORRADOR" } }),
    tx.crmFinanceDocument.count({ where: { branchId, date, status: { in: ["DRAFT", "IN_REVIEW", "APPROVED"] } } }),
    tx.crmBankStatementLine.count({ where: { bankAccount: { branchId }, date, matchedLineId: null } }),
    tx.cashSession.count({ where: { branchId, crmRegisterId: { not: null }, status: "ABIERTO", openedAt: { lt: end } } }),
    tx.journalEntryLine.aggregate({where:{entry:{branchId,entryDate:{lt:end},status:{in:["CONTABILIZADO","CONCILIADO"]}}},_sum:{debit:true,credit:true}}),
  ]);
  return { drafts, operations, statements, shifts,imbalanced:(ledger._sum.debit??new Prisma.Decimal(0)).equals(ledger._sum.credit??0)?0:1 };
}
export async function closeCrmPeriod(branchId: string, period: string, reason: string, reopen = false) {
  return crmWrite(async (ctx) => {
    ctx.ensure(/^\d{4}-\d{2}$/.test(period) && Boolean(reason.trim()), "Período y justificación son obligatorios.");
    if(reopen)ctx.ensure(!await ctx.tx.crmFinanceDocument.findFirst({where:{branchId,kind:"YEAR_END",period:period.slice(0,4),status:"POSTED"}}),"Revierte primero el cierre anual para reabrir un mes del ejercicio.");
    const checks = await crmClosingChecks(ctx.tx, branchId, period);
    ctx.ensure(reopen || Object.values(checks).every((n) => n === 0), `Pendientes: ${checks.drafts} borradores, ${checks.operations} operaciones, ${checks.statements} movimientos bancarios, ${checks.shifts} turnos abiertos. ${checks.imbalanced?"El libro presenta una diferencia de debe y haber.":""}`);
    const current = await ctx.tx.accountingClosing.findUnique({ where: { branchId_period: { branchId, period } } });
    ctx.ensure(reopen ? current?.status === "CERRADO" : current?.status !== "CERRADO", "El estado del período no permite esta operación.");
    const row = await ctx.tx.accountingClosing.upsert({ where: { branchId_period: { branchId, period } }, create: { branchId, period, status: "CERRADO", notes: reason.trim(), closedByUserId: ctx.actor.userId, closedAt: new Date() }, update: { status: reopen ? "REABIERTO" : "CERRADO", notes: reason.trim(), closedByUserId: ctx.actor.userId, closedAt: reopen ? null : new Date() } });
    await crmAudit(ctx, row.id, "CRM_FINANCE_CHANGED", { status: row.status, period }, reason);
    return { id: row.id };
  });
}

export async function crmSnapshot() {
  const { authorizeFinancialFoundation } = await import("@/server/finance/context");
  const auth = await authorizeFinancialFoundation("view"); if (!auth.ok) return auth;
  const db = getPrisma();
  try {
  const sourceDocuments = await db.accountingDocument.findMany({ where: { origin: "CONTABILIDAD", status: { in: ["EMITIDO", "REVISADO", "CONTABILIZADO", "CONCILIADO"] }, receivableDocument: null }, select: { id: true, documentNumber: true, thirdPartyName: true } });
  const sourceAccounts=await db.chartAccount.findMany({where:{templateVersion:{startsWith:"XLSX-"}},select:{name:true,approvedAt:true,isActive:true}});
  const catalogReview={sourceAccounts:sourceAccounts.length,pendingNames:sourceAccounts.filter(a=>a.name.startsWith("[PENDIENTE DE DESCRIPCIÓN]")).length,pendingApproval:sourceAccounts.filter(a=>!a.approvedAt).length,active:sourceAccounts.filter(a=>a.isActive).length};
  const [policy, documents, branches, accounts, parties, banks, registers, shifts, statements, receivables, closings] = await Promise.all([
    db.crmFinancePolicy.findUnique({ where: { id: "main" } }),
    db.crmFinanceDocument.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } }, reviewedBy: { select: { name: true } }, children: { where: { status: "POSTED" }, select: { amount: true, kind: true } } } }),
    db.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
    db.chartAccount.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true, nature: true } }),
    db.thirdParty.findMany({ where: { isActive: true }, select: { id: true, name: true, branchId: true, type: true } }),
    db.bankAccount.findMany({ where: { isActive: true }, select: { id: true, bankName: true, accountNumber: true, currency: true, branchId: true, ledgerAccountId: true } }),
    db.crmCashRegister.findMany(), db.cashSession.findMany({ where: { crmRegisterId: { not: null } }, orderBy: { openedAt: "desc" } }),
    db.crmBankStatementLine.findMany({ orderBy: { date: "desc" } }),
    db.receivableDocument.findMany({ where: { cancelledAt: null }, include: { allocations: { where: { status: "APLICADA" }, select: { amount: true } } } }),
    db.accountingClosing.findMany({ orderBy: { period: "desc" } }),
  ]);
  const bankGroups = await db.journalEntryLine.groupBy({ by: ["accountId"], where: { accountId: { in: banks.flatMap((b) => b.ledgerAccountId ? [b.ledgerAccountId] : []) }, entry: { status: { in: ["CONTABILIZADO", "CONCILIADO"] } } }, _sum: { debit: true, credit: true } });
  const bankBalances = banks.map((b) => { const g = bankGroups.find((r) => r.accountId === b.ledgerAccountId); return { bankId: b.id, baseBalance: (g?._sum.debit ?? new Prisma.Decimal(0)).minus(g?._sum.credit ?? 0).toFixed(2) }; });
  const matched=await db.crmBankMatch.findMany({select:{lineId:true}});
  const bankMovements = await db.journalEntryLine.findMany({ where: {id:{notIn:matched.map(m=>m.lineId)}, accountId: { in: banks.flatMap((b) => b.ledgerAccountId ? [b.ledgerAccountId] : []) }, crmStatementMatch: null, entry: { status: { in: ["CONTABILIZADO", "CONCILIADO"] }, reversal: null } }, include: { entry: { include: { crmFinanceDocument: true } }, account: { select: { code: true } } }, orderBy: { entry: { entryDate: "desc" } } });
  const taxRules=await db.crmTaxRule.findMany({orderBy:{effectiveFrom:"desc"}});
  const historicalBases=await db.crmReceivableBasis.findMany();
  const flowTags=await db.crmCashFlowTag.findMany();
  const cashEntries=await db.journalEntry.findMany({where:{status:{in:["CONTABILIZADO","CONCILIADO"]},lines:{some:{accountId:{in:[...banks.flatMap(b=>b.ledgerAccountId?[b.ledgerAccountId]:[]),...registers.map(r=>r.accountId)]}}}},select:{id:true,entryNumber:true,entryDate:true},orderBy:{entryDate:"desc"}});
  const bankLines = bankMovements.map((l) => {const doc=l.entry.crmFinanceDocument;const recovery=doc?.kind==="ASSET_SALE"&&documentDetails(doc).proceedsAccountId===l.accountId;return { id: l.id, name: `${l.entry.entryDate.toISOString().slice(0, 10)} · ${l.entry.entryNumber} · ${l.account.code} · ${l.debit.minus(l.credit).div(recovery?1:doc?.exchangeRate ?? 1).toFixed(2)} ${recovery?policy?.functionalCurrency:doc?.currency ?? policy?.functionalCurrency ?? ""}` };});
  const cashFlow = ["OPERATING", "INVESTING", "FINANCING", "INTERNAL", "UNCLASSIFIED"].map((category) => ({ category, amount: documents.filter((d) => d.status === "POSTED" && (d.bankAccountId || d.cashSessionId) && (d.cashFlowClass ?? "UNCLASSIFIED") === category).reduce((v, d) => v.plus(["BANK_IN", "CASH_IN", "RECEIVABLE_COLLECTION", "RECEIVABLE_ADVANCE"].includes(d.kind) ? d.baseAmount : d.baseAmount.negated()), new Prisma.Decimal(0)).toFixed(2) }));
  // JSON boundary serializes decimals as strings; no financial arithmetic in UI.
  return { ok: true as const, data: JSON.parse(JSON.stringify({ catalogReview,taxRules,historicalBases,flowEntries:cashEntries.map(e=>({id:e.id,name:`${e.entryDate.toISOString().slice(0,10)} · ${e.entryNumber}`,category:flowTags.find(t=>t.entryId===e.id)?.category??null})),policy, documents: documents.map((d) => ({ ...d, remaining: ["PAYABLE_INVOICE"].includes(d.kind)?d.amount.minus(documents.filter(p=>p.status==="POSTED"&&["PAYABLE_PAYMENT","PAYABLE_APPLY"].includes(p.kind)).reduce((s,p)=>s.plus(settlementTargets(p).filter(t=>t.targetId===d.id).reduce((v,t)=>v.plus(t.amount),new Prisma.Decimal(0))),new Prisma.Decimal(0))).toFixed(2):d.children.some((c) => ["ASSET_DISPOSAL","ASSET_SALE"].includes(c.kind)) ? "0.00" : d.amount.minus(d.children.reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0))).toFixed(2) })), branches, accounts, parties, banks, bankBalances, bankLines, sourceDocuments: sourceDocuments.map((s) => ({ id: s.id, name: `${s.documentNumber} · ${s.thirdPartyName}` })), cashFlow, registers, shifts, statements, receivables: receivables.map((r) => ({ id: r.id, documentNumber: r.documentNumber, partyName: r.partyName, branchId: r.branchId, currency: r.currency, dueDate: r.dueDate, balance: r.originalAmount.minus(r.allocations.reduce((s, a) => s.plus(a.amount), new Prisma.Decimal(0))).toFixed(2) })), closings })) as CrmSnapshot };
  } catch (error) { console.error("CRM finance snapshot unavailable",error instanceof Error?error.name:"UnknownError");return { ok: false as const, error: "No se pudo consultar la gestión financiera. Comprueba la conexión y que las migraciones estén aplicadas." }; }
}
export type CrmSnapshot = {
  catalogReview:{sourceAccounts:number;pendingNames:number;pendingApproval:number;active:number};
  policy: { companyName: string; taxId: string; functionalCurrency: string; requireSeparation: boolean;taxRegime:string|null } | null;
  taxRules:Array<{id:string;code:string;name:string;regime:string;rate:string;effectiveFrom:string;effectiveTo:string|null}>;
  historicalBases:Array<{receivableId:string;currency:string;exchangeRate:string;carryingAmount:string;asOf:string}>;
  flowEntries:Array<{id:string;name:string;category:string|null}>;
  documents: Array<Omit<import("@prisma/client").CrmFinanceDocument, "amount" | "baseAmount" | "exchangeRate" | "date" | "dueDate" | "createdAt" | "updatedAt" | "residualAmount" | "taxBase" | "taxRate"> & { amount: string; baseAmount: string; exchangeRate: string; date: string; dueDate: string | null; residualAmount: string | null; taxBase: string | null; taxRate: string | null; remaining: string; createdBy: { name: string }; reviewedBy: { name: string } | null }>;
  branches: Array<{ id: string; name: string; code: string }>;
  accounts: Array<{ id: string; code: string; name: string; type: string; nature: string }>;
  parties: Array<{ id: string; name: string; branchId: string; type: string }>;
  banks: Array<{ id: string; bankName: string; accountNumber: string; currency: string; branchId: string; ledgerAccountId: string | null }>;
  bankBalances: Array<{ bankId: string; baseBalance: string }>;
  bankLines: Array<{ id: string; name: string }>;
  sourceDocuments: Array<{ id: string; name: string }>;
  cashFlow: Array<{ category: string; amount: string }>;
  registers: Array<{ id: string; name: string; branchId: string; currency: string; accountId: string; isActive: boolean }>;
  shifts: Array<{ id: string; crmRegisterId: string; status: string; branchId: string; crmExpectedAmount: string | null; crmCountedAmount: string | null }>;
  statements: Array<{ id: string; bankAccountId: string; date: string; reference: string; amount: string; matchedLineId: string | null }>;
  receivables: Array<{ id: string; documentNumber: string; partyName: string; branchId: string; currency: string | null; balance: string; dueDate: string | null }>;
  closings: Array<{ id: string; branchId: string; period: string; status: string }>;
};
