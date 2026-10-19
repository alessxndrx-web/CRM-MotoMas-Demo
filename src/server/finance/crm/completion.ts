import { Prisma, type CrmFinanceDocument } from "@prisma/client";
import type { FinancialTransactionContext } from "@/server/finance/transaction";
import { createCrmDraft, crmAudit, crmDate, crmMoney, crmWrite, usable } from "@/server/finance/crm/service";
import { randomUUID } from "node:crypto";
import type { CrmAllocation, CrmDocumentDetails } from "@/server/finance/crm/shared";

const zero = () => new Prisma.Decimal(0);
export type PostingLine = { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; position: number; concept: string };
export function documentDetails(doc: { details: unknown }): CrmDocumentDetails {
  return (doc.details && typeof doc.details === "object" && !Array.isArray(doc.details) ? doc.details : {}) as CrmDocumentDetails;
}
export function settlementTargets(doc: Pick<CrmFinanceDocument, "details" | "parentId" | "receivableId" | "amount" | "kind">): CrmAllocation[] {
  const details = documentDetails(doc);
  if (details.allocations?.length) return details.allocations;
  const id = doc.kind === "RECEIVABLE_COLLECTION" ? doc.receivableId : doc.kind === "PAYABLE_PAYMENT" ? doc.parentId : null;
  return id ? [{ targetId: id, amount: doc.amount.toFixed(2) }] : [];
}
function add(lines: PostingLine[], accountId: string, signed: Prisma.Decimal, concept: string) {
  if (!signed.isZero()) lines.push({ accountId, debit: signed.gt(0) ? signed : zero(), credit: signed.lt(0) ? signed.negated() : zero(), concept, position: lines.length });
}
async function fx(ctx: FinancialTransactionContext, doc: CrmFinanceDocument, lines: PostingLine[]) {
  const net = lines.reduce((s,l) => s.plus(l.debit).minus(l.credit), zero());
  if (!net.isZero()) {
    ctx.ensure(Boolean(doc.fxAccountId), "Indica la cuenta de diferencia cambiaria o de redondeo.");
    const account = await usable(ctx, doc.fxAccountId!, doc.date);
    ctx.ensure(net.gt(0) ? account.type === "INGRESO" : account.type === "GASTO", "La diferencia requiere una cuenta de ingreso para ganancia o gasto para pérdida.");
    add(lines, account.id, net.negated(), "Diferencia cambiaria realizada");
  }
}

export async function receivableBasis(ctx: FinancialTransactionContext, id: string, date: Date) {
  await ctx.tx.$queryRaw`SELECT id FROM receivable_documents WHERE id=${id} FOR UPDATE`;
  const debt = await ctx.tx.receivableDocument.findUniqueOrThrow({ where: { id }, include: { allocations: { where: { status: "APLICADA" } } } });
  const policy = await ctx.tx.crmFinancePolicy.findUniqueOrThrow({ where: { id: "main" } });
  const basis = await ctx.tx.crmReceivableBasis.findUnique({ where: { receivableId: id } });
  if (basis) {
    ctx.ensure(basis.asOf <= date && debt.currency === basis.currency, "La base histórica debe estar vigente y coincidir con la moneda de la obligación.");
    return { debt, accountId: basis.accountId, rate: basis.exchangeRate, carrying: basis.carryingAmount };
  }
  ctx.ensure(debt.currency === policy.functionalCurrency, "La cartera extranjera necesita una base histórica documentada en Configuración.");
  const source = debt.accountingDocumentId ? await ctx.tx.journalEntry.findFirst({ where: { accountingDocumentId: debt.accountingDocumentId, status: { in: ["CONTABILIZADO", "CONCILIADO"] }, reversal: null }, include: { lines: { include: { account: true } } } }) : null;
  const candidates = source?.lines.filter(l => l.account.type === "ACTIVO" && l.debit.gt(0) && l.credit.isZero()) ?? [];
  ctx.ensure(candidates.length === 1 && candidates[0].debit.equals(debt.originalAmount), "El origen no identifica un único principal de cartera; registra su base revisada.");
  return { debt, accountId: candidates[0].accountId, rate: new Prisma.Decimal(1), carrying: debt.originalAmount };
}

async function settlement(ctx: FinancialTransactionContext, doc: CrmFinanceDocument, persist: boolean): Promise<PostingLine[]> {
  const isReceivable = ["RECEIVABLE_COLLECTION", "RECEIVABLE_APPLY"].includes(doc.kind);
  const applying = ["PAYABLE_APPLY", "RECEIVABLE_APPLY"].includes(doc.kind);
  const targets = settlementTargets(doc);
  ctx.ensure(targets.length > 0 && targets.length <= 100 && new Set(targets.map(t => t.targetId)).size === targets.length, "Selecciona de 1 a 100 obligaciones distintas.");
  ctx.ensure(targets.reduce((s,t) => s.plus(crmMoney(t.amount)), zero()).equals(doc.amount), "Las aplicaciones deben sumar el importe del documento.");
  const history = await ctx.tx.crmFinanceDocument.findMany({ where: { branchId: doc.branchId, status: {in:["POSTED","REVERSED"]}, kind: { in: isReceivable ? ["RECEIVABLE_COLLECTION", "RECEIVABLE_APPLY"] : ["PAYABLE_PAYMENT", "PAYABLE_APPLY"] } },include:{journalEntry:{select:{reversal:{select:{entryDate:true}},lines:{select:{accountId:true,debit:true,credit:true}}}}} });
  const posted=history.filter(p=>p.status==="POSTED");
  const lines: PostingLine[] = [];
  const principalSnapshots:Array<{targetId:string;amount:string;baseAmount:string}>=[];
  let partyId: string | null | undefined; let customerId: string | null | undefined; let partyName = "";
  const debts: Array<{ id: string; amount: Prisma.Decimal; total: Prisma.Decimal; allocated: Prisma.Decimal }> = [];
  for (const target of targets) {
    ctx.ensure(!history.some(p=>p.status==="REVERSED"&&settlementTargets(p).some(t=>t.targetId===target.targetId)&&p.journalEntry?.reversal&&p.journalEntry.reversal.entryDate>doc.date),"La nueva aplicación no puede preceder a una reversión que restauró su saldo.");
    const amount = crmMoney(target.amount);
    let rate: Prisma.Decimal; let carrying: Prisma.Decimal; let original: Prisma.Decimal; let accountId: string; let used: Prisma.Decimal;
    if (isReceivable) {
      const basis = await receivableBasis(ctx, target.targetId, doc.date); const debt = basis.debt;
      ctx.ensure(!debt.cancelledAt && debt.branchId === doc.branchId && debt.currency === doc.currency && debt.issuedAt <= doc.date, "Las obligaciones deben estar vigentes en la misma sucursal y moneda y preceder al cobro.");
      const key = debt.thirdPartyId ?? debt.customerId;
      ctx.ensure(targets.length === 1 || Boolean(key), "El cobro múltiple requiere un tercero o cliente identificado.");
      ctx.ensure(partyId === undefined || (partyId === debt.thirdPartyId && customerId === debt.customerId), "Todas las obligaciones deben pertenecer al mismo tercero.");
      partyId = debt.thirdPartyId; customerId = debt.customerId; partyName = debt.partyName;
      used = debt.allocations.reduce((s,a) => s.plus(a.amount), zero()); original = debt.originalAmount;
      rate = basis.rate; carrying = basis.carrying; accountId = basis.accountId;
      debts.push({ id: debt.id, amount, total: original, allocated: used });
    } else {
      const invoice = await ctx.tx.crmFinanceDocument.findUniqueOrThrow({ where: { id: target.targetId } });
      ctx.ensure(invoice.kind === "PAYABLE_INVOICE" && invoice.status === "POSTED" && invoice.branchId === doc.branchId && invoice.currency === doc.currency && invoice.date <= doc.date, "Selecciona facturas vigentes de la misma sucursal y moneda.");
      ctx.ensure(invoice.thirdPartyId === doc.thirdPartyId, "Las facturas deben pertenecer al proveedor del pago.");
      used = posted.reduce((s,p) => s.plus(settlementTargets(p).filter(t => t.targetId === invoice.id).reduce((v,t) => v.plus(t.amount), zero())), zero());
      rate = invoice.exchangeRate; carrying = invoice.baseAmount; original = invoice.amount; accountId = invoice.creditAccountId;
    }
    ctx.ensure(used.plus(amount).lte(original), "Una aplicación supera el saldo de su obligación.");
    // Allocate the last cent to the final settlement, consistently across partial payments.
    const previousApplications=posted.filter(p=>settlementTargets(p).some(t=>t.targetId===target.targetId));
    let previousPrincipal=zero();let previousAmount=zero();
    for(const p of previousApplications){
      const targetAmount=settlementTargets(p).find(t=>t.targetId===target.targetId)!;previousAmount=previousAmount.plus(targetAmount.amount);
      const snapshot=documentDetails(p).settlementPrincipal?.find(s=>s.targetId===target.targetId);
      if(snapshot)previousPrincipal=previousPrincipal.plus(snapshot.baseAmount);
      else{ctx.ensure(settlementTargets(p).length===1,"La aplicación histórica múltiple requiere revisión de su principal funcional.");previousPrincipal=previousPrincipal.plus(p.journalEntry?.lines.filter(l=>l.accountId===accountId).reduce((s,l)=>s.plus(isReceivable?l.credit.minus(l.debit):l.debit.minus(l.credit)),zero())??0);}
    }
    // Non-CRM allocations can only be carried automatically in functional currency.
    if(used.gt(previousAmount)){ctx.ensure(rate.equals(1),"La cartera extranjera con aplicaciones históricas necesita conciliación documentada.");previousPrincipal=previousPrincipal.plus(used.minus(previousAmount));}
    const released = (used.plus(amount).equals(original) ? carrying : used.plus(amount).times(rate).toDecimalPlaces(2)).minus(previousPrincipal);
    ctx.ensure(released.gte(0),"El principal aplicado previamente necesita un ajuste de redondeo revisado.");
    principalSnapshots.push({targetId:target.targetId,amount:amount.toFixed(2),baseAmount:released.toFixed(2)});
    if(target===targets[0])ctx.ensure((isReceivable?doc.creditAccountId:doc.debitAccountId)===accountId,"La cuenta de control principal debe coincidir con la primera obligación.");
    await usable(ctx, accountId, doc.date);
    add(lines, accountId, isReceivable ? released.negated() : released, `Aplicación ${target.targetId}`);
  }
  let cashValue = doc.baseAmount;
  if (applying) {
    const advance = doc.parentId ? await ctx.tx.crmFinanceDocument.findUnique({ where: { id: doc.parentId }, include: { children: { where: { status: "POSTED" } } } }) : null;
    ctx.ensure(Boolean(advance && advance.status === "POSTED" && advance.kind === (isReceivable ? "RECEIVABLE_ADVANCE" : "PAYABLE_ADVANCE") && advance.branchId === doc.branchId && advance.currency === doc.currency && advance.date <= doc.date), "Selecciona un anticipo vigente de la misma sucursal, moneda y tercero.");
    const applied = advance!.children.reduce((s,c) => s.plus(c.amount), zero());
    ctx.ensure(applied.plus(doc.amount).lte(advance!.amount), "El anticipo no dispone de ese saldo.");
    ctx.ensure(advance!.thirdPartyId === (isReceivable ? partyId : doc.thirdPartyId), "El anticipo pertenece a otro tercero.");
    ctx.ensure(doc.exchangeRate.equals(advance!.exchangeRate), "La aplicación conserva el cambio histórico del anticipo.");
    cashValue = applied.plus(doc.amount).equals(advance!.amount) ? advance!.baseAmount.minus(applied.times(advance!.exchangeRate).toDecimalPlaces(2)) : applied.plus(doc.amount).times(advance!.exchangeRate).toDecimalPlaces(2).minus(applied.times(advance!.exchangeRate).toDecimalPlaces(2));
    ctx.ensure((isReceivable ? doc.debitAccountId : doc.creditAccountId) === (isReceivable ? advance!.creditAccountId : advance!.debitAccountId), "La aplicación debe descargar la cuenta de control del anticipo.");
  }
  add(lines, isReceivable ? doc.debitAccountId : doc.creditAccountId, isReceivable ? cashValue : cashValue.negated(), applying ? "Compensación de anticipo" : "Liquidación");
  await fx(ctx, doc, lines);
  if(persist)await ctx.tx.crmFinanceDocument.update({where:{id:doc.id},data:{details:{...documentDetails(doc),settlementPrincipal:principalSnapshots} as Prisma.InputJsonObject}});
  if(isReceivable)ctx.ensure(!doc.thirdPartyId || doc.thirdPartyId === partyId, "El tercero del documento no coincide con la cartera.");
  if (isReceivable && persist) {
    const advance=applying?await ctx.tx.crmFinanceDocument.findUniqueOrThrow({where:{id:doc.parentId!}}):null;
    const payment = advance?await ctx.tx.receivablePayment.findUniqueOrThrow({where:{paymentNumber:advance.number}}):await ctx.tx.receivablePayment.create({ data: { branchId: doc.branchId, customerId, thirdPartyId: partyId, partyName, paymentNumber: doc.number, method: doc.cashSessionId ? "EFECTIVO" : "TRANSFERENCIA", amount: doc.amount, currency: doc.currency, reference: doc.reference, receivedAt: doc.date, recordedByUserId: ctx.actor.userId } });
    ctx.ensure(payment.status==="REGISTRADO","El anticipo de cartera debe estar vigente.");
    for (const debt of debts) {
      await ctx.tx.receivableAllocation.create({ data: { paymentId: payment.id, receivableDocumentId: debt.id, amount: debt.amount, allocatedByUserId: ctx.actor.userId,notes:applying?`CRM-APPLY:${doc.id}`:null } });
      if (debt.allocated.plus(debt.amount).equals(debt.total)) await ctx.tx.receivableDocument.update({ where: { id: debt.id }, data: { settledAt: doc.date } });
    }
  }
  return lines;
}

export async function extendedPosting(ctx: FinancialTransactionContext, doc: CrmFinanceDocument, persist=true): Promise<PostingLine[] | null> {
  const details = documentDetails(doc);
  if(doc.kind==="ASSET_DISPOSAL"){
    const asset=await ctx.tx.crmFinanceDocument.findUniqueOrThrow({where:{id:doc.parentId!},include:{children:{where:{kind:"DEPRECIATION",status:"POSTED"}}}});
    const lines:PostingLine[]=[];const depreciation=asset.children.reduce((s,d)=>s.plus(d.baseAmount),zero());
    add(lines,doc.debitAccountId,asset.baseAmount.minus(depreciation),"Pérdida por baja de activo");add(lines,doc.creditAccountId,asset.baseAmount.negated(),"Baja de costo histórico");
    for(const d of asset.children)add(lines,d.creditAccountId,d.baseAmount,"Baja de depreciación acumulada");return lines;
  }
  if (["PAYABLE_PAYMENT", "RECEIVABLE_COLLECTION", "PAYABLE_APPLY", "RECEIVABLE_APPLY"].includes(doc.kind)) return settlement(ctx, doc, persist);
  if (["PAYABLE_ADVANCE", "RECEIVABLE_ADVANCE"].includes(doc.kind)) {
    ctx.ensure(Boolean(doc.thirdPartyId), "Identifica al tercero del anticipo.");
    const control = await usable(ctx, doc.kind === "PAYABLE_ADVANCE" ? doc.debitAccountId : doc.creditAccountId, doc.date);
    ctx.ensure(control.type === (doc.kind === "PAYABLE_ADVANCE" ? "ACTIVO" : "PASIVO"), "Usa activo para anticipo a proveedor o pasivo para anticipo de cliente.");
    if(doc.kind==="RECEIVABLE_ADVANCE"&&persist){
      const party=await ctx.tx.thirdParty.findUniqueOrThrow({where:{id:doc.thirdPartyId!}});
      await ctx.tx.receivablePayment.create({data:{branchId:doc.branchId,thirdPartyId:party.id,customerId:party.customerId,partyName:party.name,paymentNumber:doc.number,method:doc.cashSessionId?"EFECTIVO":"TRANSFERENCIA",cashSessionId:doc.cashSessionId,amount:doc.amount,currency:doc.currency,reference:doc.reference,receivedAt:doc.date,recordedByUserId:ctx.actor.userId,notes:"Anticipo CRM contabilizado contra pasivo"}});
    }
  }
  if (["OPENING", "YEAR_END"].includes(doc.kind)) {
    ctx.ensure(Boolean(details.evidence?.trim()) && Boolean(details.lines?.length && details.lines.length <= 1000), "La apertura o cierre requiere evidencia y detalle de cuentas.");
    const lines: PostingLine[] = [];
    for (const l of details.lines!) {
      const debit = crmMoney(l.debit, false); const credit = crmMoney(l.credit, false);
      ctx.ensure(debit.gt(0) !== credit.gt(0), "Cada línea requiere debe o haber positivo, exclusivamente.");
      await usable(ctx, l.accountId, doc.date);
      lines.push({ accountId: l.accountId, debit, credit, concept: l.concept?.slice(0,500) || doc.description, position: lines.length });
    }
    ctx.ensure(lines.reduce((s,l) => s.plus(l.debit), zero()).equals(doc.baseAmount) && doc.exchangeRate.equals(1), "El total del documento debe coincidir con las líneas en moneda funcional.");
    if (doc.kind === "OPENING") ctx.ensure(await ctx.tx.journalEntry.count({ where: { branchId: doc.branchId, status: { in: ["CONTABILIZADO", "CONCILIADO"] } } }) === 0, "La apertura requiere una sucursal sin historia contabilizada; usa ajustes revisados para migraciones con historia.");
    if (doc.kind === "YEAR_END") {
      const expected = await annualClosingLines(ctx, doc.branchId, details.fiscalYear!, doc.creditAccountId);
      const summary = (ls: Array<{accountId:string;debit:string|Prisma.Decimal;credit:string|Prisma.Decimal}>) => JSON.stringify(ls.map(l => [l.accountId,new Prisma.Decimal(l.debit).toFixed(2),new Prisma.Decimal(l.credit).toFixed(2)]).sort());
      ctx.ensure(summary(lines) === summary(expected), "El resultado cambió desde la preparación del cierre. Genera un nuevo borrador.");
    }
    return lines;
  }
  if (doc.kind === "ASSET_SALE") {
    const asset = doc.parentId ? await ctx.tx.crmFinanceDocument.findUnique({ where: { id: doc.parentId }, include: { children: { where: { status: "POSTED" } } } }) : null;
    ctx.ensure(Boolean(asset && asset.kind === "ASSET_ACQUISITION" && asset.status === "POSTED" && asset.branchId === doc.branchId && asset.currency === doc.currency && asset.date <= doc.date && !asset.children.some(c => ["ASSET_DISPOSAL", "ASSET_SALE"].includes(c.kind))), "Selecciona un activo vigente en la misma sucursal y moneda.");
    ctx.ensure(doc.amount.equals(asset!.amount) && doc.exchangeRate.equals(asset!.exchangeRate) && doc.creditAccountId === asset!.debitAccountId, "La venta descarga costo y cambio histórico del activo.");
    const proceeds = crmMoney(details.proceeds ?? "0", false);
    ctx.ensure(Boolean(details.proceedsAccountId) && proceeds.gt(0), "Indica importe funcional recuperado y cuenta de banco o deudor.");
    ctx.ensure((await usable(ctx, details.proceedsAccountId!, doc.date)).type === "ACTIVO", "La recuperación requiere una cuenta de activo.");
    const lines: PostingLine[] = [];
    add(lines, details.proceedsAccountId!, proceeds, "Recuperación por venta de activo");
    add(lines, asset!.debitAccountId, asset!.baseAmount.negated(), "Baja de costo histórico");
    for (const dep of asset!.children.filter(c => c.kind === "DEPRECIATION")) add(lines, dep.creditAccountId, dep.baseAmount, "Baja de depreciación acumulada");
    if(details.saleTaxRuleId){
      const rule=await ctx.tx.crmTaxRule.findUniqueOrThrow({where:{id:details.saleTaxRuleId}});
      const policy=await ctx.tx.crmFinancePolicy.findUniqueOrThrow({where:{id:"main"}});
      ctx.ensure(rule.effectiveFrom<=doc.date&&(!rule.effectiveTo||rule.effectiveTo>=doc.date)&&(!policy.taxRegime||rule.regime===policy.taxRegime),"La regla de venta debe estar vigente y corresponder al régimen configurado.");
      const base=crmMoney(details.saleTaxBase??"");const tax=base.times(rule.rate).div(100).toDecimalPlaces(2);
      ctx.ensure(base.plus(tax).equals(proceeds),"La recuperación bruta debe coincidir con base más impuesto de la venta.");
      const taxAccount=await usable(ctx,rule.creditAccountId,doc.date);ctx.ensure(taxAccount.type==="PASIVO","La venta requiere una cuenta de impuesto por pagar.");
      add(lines,taxAccount.id,tax.negated(),`Impuesto de venta según ${rule.code}; base ${base}; tasa ${rule.rate}%`);
    }else ctx.ensure(!details.saleTaxBase,"Selecciona la regla de la base tributaria de venta.");
    await fx(ctx, { ...doc, fxAccountId: doc.fxAccountId ?? doc.debitAccountId }, lines);
    return lines;
  }
  return null;
}

export async function annualClosingLines(ctx: FinancialTransactionContext, branchId: string, year: number, equityId: string) {
  ctx.ensure(Number.isInteger(year) && year >= 2000 && year <= 2200, "Año fiscal inválido.");
  const equity = await usable(ctx, equityId, crmDate(`${year}-12-31`));
  ctx.ensure(equity.type === "PATRIMONIO", "Selecciona la cuenta patrimonial de resultados acumulados.");
  const groups = await ctx.tx.journalEntryLine.groupBy({ by: ["accountId"], where: { account: { type: { in: ["INGRESO", "COSTO", "GASTO"] } }, entry: { branchId, entryDate: { lte: crmDate(`${year}-12-31`) }, status: { in: ["CONTABILIZADO", "CONCILIADO"] } } }, _sum: { debit: true, credit: true } });
  const lines = groups.map(g => { const balance = (g._sum.debit ?? zero()).minus(g._sum.credit ?? 0); return { accountId:g.accountId, debit:Prisma.Decimal.max(balance.negated(),0).toFixed(2), credit:Prisma.Decimal.max(balance,0).toFixed(2) }; }).filter(l => l.debit !== "0.00" || l.credit !== "0.00");
  const net = lines.reduce((s,l) => s.plus(l.debit).minus(l.credit), zero());
  if (!net.isZero()) lines.push({ accountId:equityId,debit:Prisma.Decimal.max(net.negated(),0).toFixed(2),credit:Prisma.Decimal.max(net,0).toFixed(2) });
  ctx.ensure(lines.length >= 2, "No hay resultados pendientes de cierre.");
  return lines;
}

export async function prepareAnnualClosing(branchId:string,year:number,equityId:string,evidence:string){
  const prepared=await crmWrite(async ctx=>{
    ctx.ensure(Boolean(evidence.trim()),"Indica la evidencia de revisión anual.");
    const lines=await annualClosingLines(ctx,branchId,year,equityId);
    ctx.ensure(await ctx.tx.accountingClosing.count({where:{branchId,status:"CERRADO",period:{in:Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`)}}})===12,"Cierra los doce meses antes de preparar el cierre anual.");
    const policy=await ctx.tx.crmFinancePolicy.findUniqueOrThrow({where:{id:"main"}});
    return{lines,currency:policy.functionalCurrency,total:lines.reduce((s,l)=>s.plus(l.debit),zero()).toFixed(2)};
  });
  if(!prepared.ok)return prepared;
  return createCrmDraft({requestKey:randomUUID(),kind:"YEAR_END",branchId,date:`${year}-12-31`,currency:prepared.data.currency,exchangeRate:"1",amount:prepared.data.total,reference:`CIERRE-${year}`,description:`Cierre anual de resultados ${year}`,debitAccountId:prepared.data.lines[0].accountId,creditAccountId:equityId,details:{lines:prepared.data.lines,fiscalYear:year,evidence}});
}

export async function configureReceivableBasis(input: { receivableId: string; accountId: string; currency: string; rate: string; carrying: string; asOf: string; evidence: string }) {
  return crmWrite(async ctx => {
    const debt = await ctx.tx.receivableDocument.findUniqueOrThrow({ where: { id: input.receivableId }, include: { allocations: true } });
    ctx.ensure(!debt.cancelledAt && debt.allocations.length === 0, "La base se confirma antes de aplicar cobros; conserva la historia existente.");
    ctx.ensure(!await ctx.tx.crmReceivableBasis.findUnique({ where: { receivableId: debt.id } }), "La base histórica ya fue confirmada y no se reescribe.");
    const account = await usable(ctx,input.accountId,crmDate(input.asOf));
    const policy=await ctx.tx.crmFinancePolicy.findUniqueOrThrow({where:{id:"main"}});
    const rate = new Prisma.Decimal(input.rate); const carrying = crmMoney(input.carrying);
    ctx.ensure(account.type === "ACTIVO" && ["NIO","USD"].includes(input.currency) && rate.gt(0) && rate.decimalPlaces()<=6 && Boolean(input.evidence.trim()), "Indica cuenta de activo, moneda, cambio y evidencia histórica.");
    ctx.ensure(input.currency!==policy.functionalCurrency||rate.equals(1),"La moneda funcional requiere cambio histórico 1.");
    ctx.ensure(debt.issuedAt<=crmDate(input.asOf),"La confirmación no puede preceder al documento original.");
    ctx.ensure(debt.originalAmount.times(rate).toDecimalPlaces(2).equals(carrying), "El principal funcional no coincide con importe original por cambio histórico.");
    const balance = await ctx.tx.journalEntryLine.aggregate({ where: { accountId:account.id, entry:{branchId:debt.branchId,entryDate:{lte:crmDate(input.asOf)},status:{in:["CONTABILIZADO","CONCILIADO"]}} },_sum:{debit:true,credit:true} });
    ctx.ensure((balance._sum.debit??zero()).minus(balance._sum.credit??0).gte(carrying), "El mayor no respalda el principal declarado; registra primero la apertura revisada.");
    await ctx.tx.crmReceivableBasis.create({data:{receivableId:debt.id,accountId:account.id,currency:input.currency,exchangeRate:rate,carryingAmount:carrying,asOf:crmDate(input.asOf),evidence:input.evidence.trim().slice(0,1000),approvedById:ctx.actor.userId}});
    await ctx.tx.receivableDocument.update({where:{id:debt.id},data:{currency:input.currency}});
    await crmAudit(ctx,debt.id,"CRM_FINANCE_CONFIGURED",{currency:input.currency,amount:carrying,description:input.evidence,detailsChanged:true},"Base histórica confirmada explícitamente");
    return {id:debt.id};
  });
}

export async function configureTaxRule(input: { code:string; name:string; regime:string; rate:string; debitAccountId:string; creditAccountId:string; from:string; to?:string; evidence:string }) {
  return crmWrite(async ctx => {
    const from=crmDate(input.from); const to=input.to?crmDate(input.to):null; const rate=new Prisma.Decimal(input.rate);
    ctx.ensure(Boolean(input.code.trim()&&input.name.trim()&&input.regime.trim()&&input.evidence.trim()) && rate.gte(0)&&rate.lte(100)&&rate.decimalPlaces()<=4 && (!to||to>=from),"Completa código, régimen, tasa, vigencia y evidencia de la regla.");
    await usable(ctx,input.debitAccountId,from);await usable(ctx,input.creditAccountId,from);
    ctx.ensure(input.debitAccountId!==input.creditAccountId,"Selecciona cuentas distintas.");
    const overlap=await ctx.tx.crmTaxRule.findFirst({where:{code:input.code.trim().toUpperCase(),effectiveFrom:{lte:to??new Date('9999-12-31')},OR:[{effectiveTo:null},{effectiveTo:{gte:from}}]}});
    ctx.ensure(!overlap,"La vigencia se cruza con otra versión del mismo código.");
    const row=await ctx.tx.crmTaxRule.create({data:{code:input.code.trim().toUpperCase().slice(0,60),name:input.name.trim().slice(0,200),regime:input.regime.trim().slice(0,200),rate,debitAccountId:input.debitAccountId,creditAccountId:input.creditAccountId,effectiveFrom:from,effectiveTo:to,evidence:input.evidence.trim().slice(0,1000),createdById:ctx.actor.userId}});
    await crmAudit(ctx,row.id,"CRM_FINANCE_CONFIGURED",{description:`${row.code}: ${row.regime}; tasa ${rate}; ${row.evidence}`,effectiveFrom:from,effectiveTo:to,detailsChanged:true});return{id:row.id};
  });
}

export async function closeTaxRule(id:string,to:string,evidence:string){
  return crmWrite(async ctx=>{
    const rule=await ctx.tx.crmTaxRule.findUniqueOrThrow({where:{id}});const end=crmDate(to);
    ctx.ensure(end>=rule.effectiveFrom&&Boolean(evidence.trim()),"Indica una fecha final válida y su justificación.");
    const used=await ctx.tx.crmFinanceDocument.count({where:{status:{in:["POSTED","REVERSED"]},date:{gt:end},OR:[{details:{path:["taxRuleId"],equals:id}},{details:{path:["saleTaxRuleId"],equals:id}}]}});
    ctx.ensure(used===0,"La vigencia propuesta excluye documentos ya contabilizados.");
    ctx.ensure(!await ctx.tx.crmTaxRule.findFirst({where:{id:{not:id},code:rule.code,effectiveFrom:{lte:end},OR:[{effectiveTo:null},{effectiveTo:{gte:rule.effectiveFrom}}]}}),"La vigencia se cruza con otra versión.");
    await ctx.tx.crmTaxRule.update({where:{id},data:{effectiveTo:end}});
    await crmAudit(ctx,id,"CRM_FINANCE_CONFIGURED",{effectiveTo:end,description:`Vigencia ${rule.code}: ${evidence}`},evidence,{effectiveTo:rule.effectiveTo});return{id};
  });
}
