import { Prisma } from "@prisma/client";
import { crmWrite, crmAudit } from "@/server/finance/crm/service";
import { assertAccountingDateIsOpen } from "@/server/finance/periods";

export async function tagCashFlow(entryId:string,category:string,evidence:string){
  return crmWrite(async ctx=>{
    const entry=await ctx.tx.journalEntry.findUniqueOrThrow({where:{id:entryId}});
    ctx.ensure(["OPERATING","INVESTING","FINANCING","INTERNAL"].includes(category)&&Boolean(evidence.trim()),"Selecciona clasificación y justificación.");
    const open=await assertAccountingDateIsOpen(ctx.tx,entry.entryDate,entry.branchId);if(!open.ok)return ctx.fail(open.error);
    const old=await ctx.tx.crmCashFlowTag.findUnique({where:{entryId}});
    const row=await ctx.tx.crmCashFlowTag.upsert({where:{entryId},create:{entryId,category,evidence:evidence.trim().slice(0,1000),updatedById:ctx.actor.userId},update:{category,evidence:evidence.trim().slice(0,1000),updatedById:ctx.actor.userId}});
    await crmAudit(ctx,row.id,"CRM_FINANCE_CHANGED",{description:`${category}: ${evidence}`,detailsChanged:true},evidence,old?{description:`${old.category}: ${old.evidence}`} : undefined);
    return{id:row.id};
  });
}

export async function financialStatements(tx:Prisma.TransactionClient,start:Date,end:Date,branchId?:string){
  const zero=()=>new Prisma.Decimal(0);
  const previousEnd=new Date(start);const previousStart=new Date(start.getTime()-(end.getTime()-start.getTime()));
  const posted:Prisma.JournalEntryWhereInput={status:{in:["CONTABILIZADO","CONCILIADO"]},...(branchId?{branchId}:{})};
  const operating:Prisma.JournalEntryWhereInput={...posted,NOT:{OR:[{crmFinanceDocument:{is:{kind:"YEAR_END"}}},{reversalOf:{is:{crmFinanceDocument:{is:{kind:"YEAR_END"}}}}}]}};
  const accounts=await tx.chartAccount.findMany({select:{id:true,code:true,name:true,type:true,nature:true,parentId:true,level:true}});
  const byId=new Map(accounts.map(a=>[a.id,a]));
  const groups=async(where:Prisma.JournalEntryWhereInput)=>tx.journalEntryLine.groupBy({by:["accountId"],where:{entry:where},_sum:{debit:true,credit:true}});
  const [current,previous,closing,previousClosing,banks,registers]=await Promise.all([
    groups({...operating,entryDate:{gte:start,lt:end}}),groups({...operating,entryDate:{gte:previousStart,lt:previousEnd}}),
    groups({...posted,entryDate:{lt:end}}),groups({...posted,entryDate:{lt:previousEnd}}),
    tx.bankAccount.findMany({where:{ledgerAccountId:{not:null}},select:{ledgerAccountId:true}}),tx.crmCashRegister.findMany({select:{accountId:true}}),
  ]);
  const amounts=(g:typeof current)=>new Map(g.map(r=>[r.accountId,(r._sum.debit??zero()).minus(r._sum.credit??0)]));
  const cur=amounts(current),prev=amounts(previous),close=amounts(closing),prevClose=amounts(previousClosing);
  const sum=(map:Map<string,Prisma.Decimal>,types:string[],creditNormal=false)=>accounts.filter(a=>types.includes(a.type)).reduce((s,a)=>s.plus((map.get(a.id)??zero()).times(creditNormal?-1:1)),zero());
  const metrics=(map:Map<string,Prisma.Decimal>,balances:Map<string,Prisma.Decimal>)=>({revenue:sum(map,["INGRESO"],true),cost:sum(map,["COSTO"]),expenses:sum(map,["GASTO"]),income:sum(map,["INGRESO","COSTO","GASTO"],true),assets:sum(balances,["ACTIVO"]),liabilities:sum(balances,["PASIVO"],true),equity:sum(balances,["PATRIMONIO"],true),unclosed:sum(balances,["INGRESO","COSTO","GASTO"],true)});
  const now=metrics(cur,close),before=metrics(prev,prevClose);
  const comparative=Object.entries(now).map(([key,value])=>({key,current:value.toFixed(2),previous:before[key as keyof typeof before].toFixed(2),difference:value.minus(before[key as keyof typeof before]).toFixed(2)}));
  const hierarchy=accounts.map(a=>{
    const descendants=accounts.filter(d=>{let cursor:typeof d|undefined=d;const seen=new Set<string>();while(cursor&&!seen.has(cursor.id)){if(cursor.id===a.id)return true;seen.add(cursor.id);cursor=cursor.parentId?byId.get(cursor.parentId):undefined;}return false;});
    const m=["INGRESO","COSTO","GASTO"].includes(a.type)?cur:close;
    const p=["INGRESO","COSTO","GASTO"].includes(a.type)?prev:prevClose;
    const normal=["PASIVO","PATRIMONIO","INGRESO"].includes(a.type)?-1:1;
    const value=descendants.reduce((s,d)=>s.plus(m.get(d.id)??0),zero()).times(normal);
    const prior=descendants.reduce((s,d)=>s.plus(p.get(d.id)??0),zero()).times(normal);
    return{...a,current:value.toFixed(2),previous:prior.toFixed(2),difference:value.minus(prior).toFixed(2)};
  }).filter(a=>a.current!=="0.00"||a.previous!=="0.00").sort((a,b)=>a.code.localeCompare(b.code));
  const cashIds=[...new Set([...banks.flatMap(b=>b.ledgerAccountId?[b.ledgerAccountId]:[]),...registers.map(r=>r.accountId)])];
  const [cashOpening,cashLines]=await Promise.all([
    tx.journalEntryLine.aggregate({where:{accountId:{in:cashIds},entry:{...posted,entryDate:{lt:start}}},_sum:{debit:true,credit:true}}),
    tx.journalEntryLine.findMany({where:{accountId:{in:cashIds},entry:{...posted,entryDate:{gte:start,lt:end}}},include:{entry:{include:{crmFinanceDocument:true,reversalOf:{include:{crmFinanceDocument:true}}}}}}),
  ]);
  const entryIds=[...new Set(cashLines.flatMap(l=>[l.entryId,...(l.entry.reversalOfId?[l.entry.reversalOfId]:[])]))];
  const tags=await tx.crmCashFlowTag.findMany({where:{entryId:{in:entryIds}}});
  const flows=new Map<string,{entryId:string;number:string;date:string;category:string;amount:Prisma.Decimal}>();
  for(const l of cashLines){
    const doc=l.entry.crmFinanceDocument??l.entry.reversalOf?.crmFinanceDocument;
    const category=doc?.kind==="OPENING"?"OPENING":tags.find(t=>t.entryId===l.entryId)?.category??tags.find(t=>t.entryId===l.entry.reversalOfId)?.category??doc?.cashFlowClass??"UNCLASSIFIED";
    const row=flows.get(l.entryId)??{entryId:l.entryId,number:l.entry.entryNumber,date:l.entry.entryDate.toISOString().slice(0,10),category,amount:zero()};
    row.amount=row.amount.plus(l.debit).minus(l.credit);flows.set(l.entryId,row);
  }
  const flowRows=[...flows.values()].map(r=>({...r,category:r.amount.isZero()?"INTERNAL":r.category==="INTERNAL"?"UNCLASSIFIED":r.category,amount:r.amount.toFixed(2)}));
  const categories=["OPERATING","INVESTING","FINANCING","INTERNAL","UNCLASSIFIED"].map(category=>({category,amount:flowRows.filter(r=>r.category===category).reduce((s,r)=>s.plus(r.amount),zero()).toFixed(2)}));
  const opening=(cashOpening._sum.debit??zero()).minus(cashOpening._sum.credit??0);
  const openingAdjustments=flowRows.filter(r=>r.category==="OPENING").reduce((s,r)=>s.plus(r.amount),zero());
  const change=flowRows.filter(r=>r.category!=="OPENING").reduce((s,r)=>s.plus(r.amount),zero());const cashClosing=cashIds.reduce((s,id)=>s.plus(close.get(id)??0),zero());
  return{comparative,hierarchy,previousFrom:previousStart.toISOString().slice(0,10),previousTo:new Date(previousEnd.getTime()-86400000).toISOString().slice(0,10),
    income:now.income.toFixed(2),revenue:now.revenue.toFixed(2),cost:now.cost.toFixed(2),expenses:now.expenses.toFixed(2),
    cashFlow:{categories,rows:flowRows,opening:opening.toFixed(2),openingAdjustments:openingAdjustments.toFixed(2),change:change.toFixed(2),closing:cashClosing.toFixed(2),difference:opening.plus(openingAdjustments).plus(change).minus(cashClosing).toFixed(2),unclassified:flowRows.filter(r=>r.category==="UNCLASSIFIED"&&!new Prisma.Decimal(r.amount).isZero()).length,configuredAccounts:cashIds.length},
    equityStatement:{opening:before.equity.toFixed(2),movement:now.equity.minus(before.equity).toFixed(2),closing:now.equity.toFixed(2)},
    equationDifference:now.assets.minus(now.liabilities).minus(now.equity).minus(now.unclosed).toFixed(2)};
}
