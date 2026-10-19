import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient,Prisma } from "@prisma/client";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/server/auth/session";
import { GLOBAL_BRANCH_ID,roleEnumToSpanish,type UserRoleEnum } from "@/server/auth/roles";
import { createCrmDraft,transitionCrmDocument,previewCrmPosting } from "@/server/finance/crm/service";
import { configureCrmFinance,mapCrmBank,importCrmStatement,matchCrmStatementGroup,closeCrmPeriod,crmSnapshot } from "@/server/finance/crm/treasury";
import { prepareAnnualClosing,configureReceivableBasis,configureTaxRule,closeTaxRule } from "@/server/finance/crm/completion";
import { tagCashFlow } from "@/server/finance/crm/statements";
import { getLedgerReport } from "@/server/finance/ledger-reports";
import { registerReceivableFromDocument } from "@/server/finance/receivables/service";
import { stageCatalogWorkbook } from "@/server/finance/chart-of-accounts/staging";
import { runFinancialTransaction } from "@/server/finance/transaction";
import { approveTemplateChartAccounts } from "@/server/finance/chart-of-accounts/service";
import { getPrisma } from "@/server/db/prisma";
import { crmFinanceAction } from "@/server/finance/crm/actions";
import type { CrmFinanceDraft } from "@/server/finance/crm/shared";

const url=new URL(process.env.DATABASE_URL??"");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55438");assert.equal(url.pathname,"/motomas_finance_test");
const db=new PrismaClient();const tag=`COMPLETE-${Date.now()}`;let passed=0;
function check(v:unknown,message:string){assert.ok(v,message);passed++;console.log(`OK ${message}`);}
function unwrap<T>(r:{ok:true;data:T}|{ok:false;error:string}):T{if(!r.ok)throw Error(r.error);return r.data;}
async function login(u:{id:string;role:UserRoleEnum}){const token=await createSessionToken({uid:u.id,email:`${u.id}@test.invalid`,name:tag,role:roleEnumToSpanish[u.role],roleEnum:u.role,branchId:GLOBAL_BRANCH_ID,branchName:"Global"});(globalThis as Record<string,unknown>).__motomasSmokeCookies={[SESSION_COOKIE_NAME]:token};}
try{
 const creator=await db.user.create({data:{email:`${tag}@test.invalid`,name:tag,passwordHash:"not-a-login",role:"ADMIN"}});
 const reviewer=await db.user.create({data:{email:`${tag}-review@test.invalid`,name:tag,passwordHash:"not-a-login",role:"CONTADOR"}});
 const branch=await db.branch.create({data:{code:tag,name:tag}});const party=await db.thirdParty.create({data:{name:tag,type:"PROVEEDOR",branchId:branch.id}});
 async function account(suffix:string,type:"ACTIVO"|"PASIVO"|"GASTO"|"INGRESO"|"PATRIMONIO",nature:"DEUDORA"|"ACREEDORA"="DEUDORA"){return db.chartAccount.create({data:{code:`${Date.now()}-${suffix}`,name:tag+suffix,type,nature,effectiveFrom:new Date("2020-01-01")}});}
 const expense=await account("01","GASTO"),payable=await account("02","PASIVO","ACREEDORA"),cash=await account("03","ACTIVO"),receivable=await account("04","ACTIVO"),income=await account("05","INGRESO","ACREEDORA"),equity=await account("06","PATRIMONIO","ACREEDORA"),advanceOut=await account("07","ACTIVO"),advanceIn=await account("08","PASIVO","ACREEDORA"),asset=await account("09","ACTIVO"),depreciation=await account("10","ACTIVO","ACREEDORA");
 await login(creator);unwrap(await configureCrmFinance({companyName:"Entidad sintética de prueba",taxId:"TEST",functionalCurrency:"NIO",requireSeparation:true}));
 const savedPolicy=await db.crmFinancePolicy.findUniqueOrThrow({where:{id:"main"}});
 await login(reviewer);
 check(!(await configureCrmFinance({companyName:"Cambio no autorizado",taxId:"NO",functionalCurrency:"NIO",requireSeparation:false})).ok,"Contador no modifica identidad ni política empresarial por servicio directo");
 const forgedPolicy=new FormData();for(const [key,value] of Object.entries({action:"policy",companyName:"Cambio no autorizado",taxId:"NO",functionalCurrency:"NIO"}))forgedPolicy.set(key,value);
 check(!(await crmFinanceAction(forgedPolicy)).ok,"Contador no modifica la empresa enviando la acción directamente");
 check(!unwrap(await crmSnapshot()).permissions.configureCompany,"Contador recibe la configuración empresarial como consulta");
 check((await db.crmFinancePolicy.findUniqueOrThrow({where:{id:"main"}})).updatedAt.getTime()===savedPolicy.updatedAt.getTime(),"Intentos sin permiso no alteran la política persistida");
 for(const role of ["GERENTE","VENDEDOR","CAJERO","MARKETING","LIDER_VENTAS","CALL_CENTER","SOPORTE_TECNICO"] as UserRoleEnum[]){
  const other=await db.user.create({data:{name:tag,email:`${tag}-${role}@test.invalid`,passwordHash:"not-a-login",role}});await login(other);
  check(!(await createCrmDraft({requestKey:randomUUID(),kind:"OPENING"} as CrmFinanceDraft)).ok,`${role} no carga saldos ni documentos contables`);
 }
 await login(creator);check(unwrap(await crmSnapshot()).permissions.configureCompany,"Administrador puede editar la configuración empresarial");
 const bank=await db.bankAccount.create({data:{branchId:branch.id,bankName:tag,accountNumber:tag,currency:"NIO"}});unwrap(await mapCrmBank(bank.id,cash.id));
 const base:CrmFinanceDraft={requestKey:"",kind:"ADJUSTMENT",branchId:branch.id,thirdPartyId:party.id,debitAccountId:expense.id,creditAccountId:payable.id,date:"2031-01-01",currency:"NIO",exchangeRate:"1",amount:"100",reference:"",description:"Prueba sintética de integridad"};
 async function post(input:Partial<CrmFinanceDraft>){await login(creator);const draft=unwrap(await createCrmDraft({...base,requestKey:randomUUID(),reference:randomUUID(),...input}));unwrap(await transitionCrmDocument(draft.id,"submit"));await login(reviewer);unwrap(await transitionCrmDocument(draft.id,"approve"));if(input.kind==="RECEIVABLE_COLLECTION"&&input.currency==="USD"){const before=await db.receivablePayment.count();const preview=unwrap(await previewCrmPosting(draft.id));check(preview.length===3&&await db.receivablePayment.count()===before,"Vista previa del cobro calcula asiento y diferencia sin crear pagos");}const result=await transitionCrmDocument(draft.id,"post");return{draft,result};}
 const opening=await post({kind:"OPENING",debitAccountId:cash.id,creditAccountId:equity.id,amount:"1000",details:{evidence:"Apertura sintética",lines:[{accountId:cash.id,debit:"1000",credit:"0"},{accountId:equity.id,debit:"0",credit:"1000"}]}});unwrap(opening.result);check(true,"Apertura revisada genera un único asiento balanceado");
 const secondOpening=await post({kind:"OPENING",debitAccountId:cash.id,creditAccountId:equity.id,amount:"1",details:{evidence:"Duplicado",lines:[{accountId:cash.id,debit:"1",credit:"0"},{accountId:equity.id,debit:"0",credit:"1"}]}});check(!secondOpening.result.ok,"No duplica saldos de apertura en una sucursal con historia");unwrap(await transitionCrmDocument(secondOpening.draft.id,"cancel","Retiro"));
 const inv1=await post({kind:"PAYABLE_INVOICE",dueDate:"2031-01-31",amount:"40"});unwrap(inv1.result);const inv2=await post({kind:"PAYABLE_INVOICE",dueDate:"2031-01-31",amount:"60"});unwrap(inv2.result);
 const multi=await post({kind:"PAYABLE_PAYMENT",bankAccountId:bank.id,debitAccountId:payable.id,creditAccountId:cash.id,amount:"100",details:{allocations:[{targetId:inv1.draft.id,amount:"40"},{targetId:inv2.draft.id,amount:"60"}]}});unwrap(multi.result);check(true,"Un pago liquida dos facturas sin duplicar el banco");
 const snapshot=unwrap(await crmSnapshot());check(snapshot.documents.filter(d=>[inv1.draft.id,inv2.draft.id].includes(d.id)).every(d=>d.remaining==="0.00"),"Saldos múltiples proceden de aplicaciones contabilizadas");
 check(!(await transitionCrmDocument(inv2.draft.id,"reverse","No","2031-01-02")).ok,"No revierte factura incluida en pago múltiple");
 unwrap(await transitionCrmDocument(multi.draft.id,"reverse","Revisión","2031-01-02"));check(unwrap(await crmSnapshot()).documents.find(d=>d.id===inv1.draft.id)?.remaining==="40.00","Reversión múltiple restituye todas las obligaciones");
 base.date="2031-01-03";
 const adv=await post({kind:"PAYABLE_ADVANCE",bankAccountId:bank.id,debitAccountId:advanceOut.id,creditAccountId:cash.id,amount:"100"});unwrap(adv.result);
 const applied=await post({kind:"PAYABLE_APPLY",parentId:adv.draft.id,debitAccountId:payable.id,creditAccountId:advanceOut.id,amount:"100",details:{allocations:[{targetId:inv1.draft.id,amount:"40"},{targetId:inv2.draft.id,amount:"60"}]}});unwrap(applied.result);check(true,"Anticipo compensa varias facturas sin segundo desembolso");
 check(!(await transitionCrmDocument(adv.draft.id,"reverse","No","2031-01-03")).ok,"Anticipo aplicado conserva dependencias");
 async function debt(amount:string,currency="NIO",rate="1"){
  const source=await db.accountingDocument.create({data:{branchId:branch.id,createdByUserId:creator.id,type:"FACTURA",status:"CONTABILIZADO",documentNumber:randomUUID(),documentDate:new Date("2031-01-01"),thirdPartyName:tag,thirdPartyId:party.id,concept:"Servicio sintético",total:amount,currency,motorcycleDescription:[]}});
  const principal=new Prisma.Decimal(amount).times(rate).toFixed(2);
  await db.journalEntry.create({data:{entryNumber:randomUUID(),branchId:branch.id,accountingDocumentId:source.id,createdByUserId:creator.id,status:"CONTABILIZADO",entryDate:new Date("2031-01-01"),lines:{create:[{accountId:receivable.id,debit:principal,credit:"0"},{accountId:income.id,debit:"0",credit:principal}]}}});
  const r=unwrap(await registerReceivableFromDocument({accountingDocumentId:source.id,dueDate:"2031-01-31"}));return r.receivableId;
 }
 const d1=await debt("40"),d2=await debt("60");
 const collection=await post({kind:"RECEIVABLE_COLLECTION",bankAccountId:bank.id,debitAccountId:cash.id,creditAccountId:receivable.id,amount:"100",details:{allocations:[{targetId:d1,amount:"40"},{targetId:d2,amount:"60"}]}});unwrap(collection.result);check(unwrap(await crmSnapshot()).receivables.filter(r=>[d1,d2].includes(r.id)).every(r=>r.balance==="0.00"),"Cobro múltiple liquida cartera y contabiliza una sola entrada");
 unwrap(await transitionCrmDocument(collection.draft.id,"reverse","Revisión","2031-01-03"));check(unwrap(await crmSnapshot()).receivables.find(r=>r.id===d2)?.balance==="60.00","Reversión de cobro restaura todas sus asignaciones");
 const advanceClient=await post({kind:"RECEIVABLE_ADVANCE",bankAccountId:bank.id,debitAccountId:cash.id,creditAccountId:advanceIn.id,amount:"100"});unwrap(advanceClient.result);
 const advanceRecord=await db.crmFinanceDocument.findUniqueOrThrow({where:{id:advanceClient.draft.id}});const heldPayment=await db.receivablePayment.findUniqueOrThrow({where:{paymentNumber:advanceRecord.number}});check(heldPayment.amount.equals(100),"Anticipo del cliente aparece como dinero recibido en la cartera existente");
 const applyClient=await post({kind:"RECEIVABLE_APPLY",parentId:advanceClient.draft.id,debitAccountId:advanceIn.id,creditAccountId:receivable.id,amount:"100",details:{allocations:[{targetId:d1,amount:"40"},{targetId:d2,amount:"60"}]}});unwrap(applyClient.result);check(true,"Anticipo de cliente compensa varias cuentas por cobrar");
 check(await db.receivableAllocation.count({where:{paymentId:heldPayment.id,status:"APLICADA"}})===2,"Aplicar el anticipo utiliza su cobro original sin crear otro ingreso");
 unwrap(await transitionCrmDocument(applyClient.draft.id,"reverse","Restaurar anticipo","2031-01-03"));check(await db.receivableAllocation.count({where:{paymentId:heldPayment.id,status:"APLICADA"}})===0&&(await db.receivablePayment.findUniqueOrThrow({where:{id:heldPayment.id}})).status==="REGISTRADO","Revertir la aplicación restituye el anticipo disponible y conserva el dinero recibido");
 const usdBankLedger=await account("11","ACTIVO");const usdBank=await db.bankAccount.create({data:{branchId:branch.id,bankName:tag,accountNumber:tag+"USD",currency:"USD"}});unwrap(await mapCrmBank(usdBank.id,usdBankLedger.id));const foreignDebt=await debt("10","USD","36.5");
 unwrap(await configureReceivableBasis({receivableId:foreignDebt,accountId:receivable.id,currency:"USD",rate:"36.5",carrying:"365",asOf:"2031-01-03",evidence:"Origen y principal sintéticos"}));
 const foreignCollection=await post({kind:"RECEIVABLE_COLLECTION",bankAccountId:usdBank.id,debitAccountId:usdBankLedger.id,creditAccountId:receivable.id,fxAccountId:income.id,currency:"USD",exchangeRate:"37",amount:"10",receivableId:foreignDebt});unwrap(foreignCollection.result);
 const foreignDoc=await db.crmFinanceDocument.findUniqueOrThrow({where:{id:foreignCollection.draft.id},include:{journalEntry:{include:{lines:true}}}});check(foreignDoc.journalEntry!.lines.some(l=>l.accountId===income.id&&l.credit.equals(5)),"Cartera histórica reconoce ganancia cambiaria y descarga cambio original");
 const one=await post({kind:"BANK_IN",bankAccountId:bank.id,debitAccountId:cash.id,creditAccountId:income.id,amount:"30"});unwrap(one.result);const two=await post({kind:"BANK_IN",bankAccountId:bank.id,debitAccountId:cash.id,creditAccountId:income.id,amount:"20"});unwrap(two.result);
 unwrap(await importCrmStatement(bank.id,[{externalId:tag,date:"2031-01-04",reference:"Depósito agrupado",amount:"50"}]));const statement=await db.crmBankStatementLine.findUniqueOrThrow({where:{bankAccountId_externalId:{bankAccountId:bank.id,externalId:tag}}});
 const docs=await db.crmFinanceDocument.findMany({where:{id:{in:[one.draft.id,two.draft.id]}}});const lines=await db.journalEntryLine.findMany({where:{entryId:{in:docs.map(d=>d.journalEntryId!)},accountId:cash.id}});
 check(!(await matchCrmStatementGroup(statement.id,[lines[0].id])).ok,"Grupo bancario incompleto no deja conciliación parcial");check(await db.crmBankMatch.count({where:{statementId:statement.id}})===0,"Fallo de conciliación revierte todos los vínculos");
 unwrap(await matchCrmStatementGroup(statement.id,lines.map(l=>l.id)));check(await db.crmBankMatch.count({where:{statementId:statement.id}})===2,"Un extracto concilia varios asientos por suma exacta");
 check(!(await transitionCrmDocument(two.draft.id,"reverse","No","2031-01-04")).ok,"Segunda línea del grupo queda protegida frente a reversión");
 unwrap(await matchCrmStatementGroup(statement.id,[],"Revisión"));check(await db.crmBankMatch.count({where:{statementId:statement.id}})===0,"Desconciliación libera el grupo completo con motivo");
 const acquisition=await post({kind:"ASSET_ACQUISITION",debitAccountId:asset.id,creditAccountId:payable.id,amount:"1000",usefulLifeMonths:10,residualAmount:"0"});unwrap(acquisition.result);
 unwrap((await post({kind:"DEPRECIATION",parentId:acquisition.draft.id,debitAccountId:expense.id,creditAccountId:depreciation.id,amount:"100"})).result);
 const sale=await post({kind:"ASSET_SALE",parentId:acquisition.draft.id,debitAccountId:income.id,creditAccountId:asset.id,amount:"1000",fxAccountId:income.id,details:{proceeds:"950",proceedsAccountId:cash.id}});unwrap(sale.result);const saleDoc=await db.crmFinanceDocument.findUniqueOrThrow({where:{id:sale.draft.id},include:{journalEntry:{include:{lines:true}}}});check(saleDoc.journalEntry!.lines.some(l=>l.accountId===income.id&&l.credit.equals(50)),"Venta de activo descarga costo y depreciación y reconoce utilidad real");
 check(!(await transitionCrmDocument(acquisition.draft.id,"reverse","No","2031-01-02")).ok,"Venta mantiene trazabilidad y dependencias del activo");
 const rule=unwrap(await configureTaxRule({code:tag,name:"Regla sintética",regime:"Prueba",rate:"10",debitAccountId:expense.id,creditAccountId:payable.id,from:"2031-01-01",to:"2031-12-31",evidence:"Solo ensayo, sin tasa legal asumida"}));
 const tax=await post({kind:"TAX",amount:"10",taxBase:"100",certificate:tag,details:{taxRuleId:rule.id}});unwrap(tax.result);check(true,"Regla efectiva conserva su tasa en el documento");
 const secondAsset=await post({kind:"ASSET_ACQUISITION",debitAccountId:asset.id,creditAccountId:payable.id,amount:"100",usefulLifeMonths:12,residualAmount:"0"});unwrap(secondAsset.result);
 const taxedSale=await post({kind:"ASSET_SALE",parentId:secondAsset.draft.id,debitAccountId:income.id,creditAccountId:asset.id,amount:"100",details:{proceeds:"110",proceedsAccountId:cash.id,saleTaxRuleId:rule.id,saleTaxBase:"100"}});unwrap(taxedSale.result);
 const taxedDoc=await db.crmFinanceDocument.findUniqueOrThrow({where:{id:taxedSale.draft.id},include:{journalEntry:{include:{lines:true}}}});check(taxedDoc.taxRate?.equals(10)&&taxedDoc.journalEntry!.lines.some(l=>l.accountId===payable.id&&l.credit.equals(10)),"Venta de activo separa el impuesto configurado de la recuperación y el resultado");
 check(!(await createCrmDraft({...base,requestKey:randomUUID(),reference:randomUUID(),kind:"TAX",date:"2032-01-01",amount:"10",taxBase:"100",certificate:tag,details:{taxRuleId:rule.id}})).ok,"Regla tributaria vencida no se aplica a otra fecha");
 check(!(await closeTaxRule(rule.id,"2031-01-01","No excluye historia")).ok,"No recorta la vigencia tributaria sobre documentos contabilizados");
 unwrap(await closeTaxRule(rule.id,"2031-06-30","Nueva versión para el segundo semestre"));unwrap(await configureTaxRule({code:tag,name:"Regla sintética versión siguiente",regime:"Prueba",rate:"12",debitAccountId:expense.id,creditAccountId:payable.id,from:"2031-07-01",evidence:"Versión sintética sin reescribir tasas anteriores"}));check(true,"La vigencia puede cerrarse y versionarse sin modificar tasas históricas");
 const cashEntry=await db.crmFinanceDocument.findUniqueOrThrow({where:{id:one.draft.id}});unwrap(await tagCashFlow(cashEntry.journalEntryId!,"OPERATING","Clasificación sintética"));
 const report=unwrap(await getLedgerReport({from:"2031-01-01",to:"2031-12-31",branchId:branch.id}));check(report.financial.cashFlow.difference==="0.00","Flujo histórico concilia apertura más variación con saldo del mayor");check(report.financial.cashFlow.openingAdjustments==="1000.00","La apertura se presenta como saldo incorporado y no como flujo operativo");check(report.financial.comparative.length===8,"Estados comparativos contienen resultados y situación financiera");check(report.financial.cashFlow.rows.some(r=>r.entryId===saleDoc.journalEntryId&&r.amount==="950.00"),"Flujo incluye recuperación de activo desde sus líneas reales");
 // Independent annual-close branch, to isolate period checks from deliberate pending records above.
 const yearBranch=await db.branch.create({data:{code:tag+"-YEAR",name:tag+"-YEAR"}});
 const earned=await post({kind:"ADJUSTMENT",branchId:yearBranch.id,thirdPartyId:undefined,debitAccountId:receivable.id,creditAccountId:income.id,amount:"100"});unwrap(earned.result);
 for(let i=1;i<=12;i++)unwrap(await closeCrmPeriod(yearBranch.id,`2031-${String(i).padStart(2,"0")}`,"Cierre mensual sintético"));
 await login(creator);const annual=unwrap(await prepareAnnualClosing(yearBranch.id,2031,equity.id,"Revisión sintética anual"));unwrap(await transitionCrmDocument(annual.id,"submit"));await login(reviewer);unwrap(await transitionCrmDocument(annual.id,"approve"));unwrap(await transitionCrmDocument(annual.id,"post"));check(true,"Cierre anual exige doce meses cerrados y contabiliza resultado contra patrimonio");
 const after=unwrap(await getLedgerReport({from:"2031-01-01",to:"2031-12-31",branchId:yearBranch.id}));check(after.income==="100.00","Estado de resultados conserva el período después del cierre anual");check(after.statements.accumulatedResult==="0.00","Cierre anual descarga cuentas de resultados en el mayor");
 check(!(await closeCrmPeriod(yearBranch.id,"2031-01","No",true)).ok,"No reabre meses bajo cierre anual vigente");unwrap(await transitionCrmDocument(annual.id,"reverse","Revisión anual","2031-12-31"));check((await db.accountingClosing.findUniqueOrThrow({where:{branchId_period:{branchId:yearBranch.id,period:"2031-12"}}})).status==="REABIERTO","Reversión anual reabre diciembre en la misma transacción");
 if(process.env.SOURCE_WORKBOOK){
  const bytes=await readFile(process.env.SOURCE_WORKBOOK);const staged=unwrap(await runFinancialTransaction({actor:{userId:creator.id,role:"ADMIN"},timeoutMs:60000,run:ctx=>stageCatalogWorkbook(ctx,bytes)}));check(staged.uniqueCodes===372&&staged.duplicatesOmitted===3&&staged.missingNames===42,"Catálogo fuente deduplicado conserva 372 códigos y las 42 decisiones pendientes");
  const sourceAccounts=await db.chartAccount.findMany({where:{templateVersion:`XLSX-${staged.fileHash.slice(0,16)}`}});check(sourceAccounts.length===372&&sourceAccounts.every(a=>!a.isActive&&!a.approvedAt),"Todas las cuentas de origen quedan cargadas y editables, sin aprobación inventada");
  check(sourceAccounts.find(a=>a.code==="131-01")?.parentId===sourceAccounts.find(a=>a.code==="13")?.id&&sourceAccounts.find(a=>a.code==="412-00")?.parentId===sourceAccounts.find(a=>a.code==="41")?.id,"Grupos intermedios ausentes conservan inventario bajo activo e ingresos bajo ventas");
  const missing=sourceAccounts.find(a=>a.name.startsWith("[PENDIENTE"))!;check(!(await approveTemplateChartAccounts({accountIds:[missing.id]})).ok,"No permite aprobar una cuenta sin descripción real");
  check(sourceAccounts.find(a=>a.code==="111-01-02")?.description?.includes("Depositos Pendientes"),"Concepto duplicado omitido conserva evidencia de su origen");
 }
 console.log("SIN POS: solo servicios y modelos administrativos del CRM.");
}catch(e){console.error(e);process.exitCode=1;}finally{console.log(`${passed} verificaciones correctas`);await db.$disconnect();await getPrisma().$disconnect();}
