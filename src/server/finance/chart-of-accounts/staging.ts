import type { AccountType } from "@prisma/client";
import type { FinancialTransactionContext } from "@/server/finance/transaction";
import { inspectCatalogWorkbook } from "@/server/finance/chart-of-accounts/workbook";
import { defaultNatureForType } from "@/server/finance/chart-of-accounts/shared";

/** User-authorized deduplication: first source row wins; all alternatives remain in evidence. */
export async function stageCatalogWorkbook(ctx: FinancialTransactionContext, bytes: Buffer) {
  await ctx.tx.$executeRaw`LOCK TABLE chart_accounts IN SHARE ROW EXCLUSIVE MODE`;
  const current = await ctx.tx.chartAccount.findMany({ include:{_count:{select:{lines:true}}} });
  const preview = await inspectCatalogWorkbook(bytes,current);
  const unique = [...new Map([...preview.rows].reverse().filter(r=>/^[0-9]+(?:[.-][0-9]+)*$/.test(r.code)).map(r=>[r.code,r])).values()].sort((a,b)=>a.code.length-b.code.length||a.code.localeCompare(b.code));
  const accounts = new Map(current.map(a=>[a.code,a]));
  const types:Record<string,AccountType>={"1":"ACTIVO","2":"PASIVO","3":"PATRIMONIO","4":"INGRESO","5":"COSTO","6":"GASTO"};
  let created=0;let reused=0;let missingNames=0;
  for(const row of unique){
    const type=types[row.code[0]];ctx.ensure(Boolean(type),`Clasificación de origen no reconocida: ${row.code}.`);
    const parent=row.parentCode?accounts.get(row.parentCode):null;
    ctx.ensure(!row.parentCode||Boolean(parent),`Falta el padre ${row.parentCode}.`);
    const alternatives=preview.rows.filter(r=>r.code===row.code&&r.row!==row.row);
    const name=row.name||`[PENDIENTE DE DESCRIPCIÓN] ${row.code}`;
    if(!row.name)missingNames++;
    const description=`Catálogo fuente ${preview.fileHash}; hoja ${preview.sheet}; fila ${row.row}. Clasificación provisional por grupo de origen; requiere revisión. ${alternatives.map(r=>`Duplicado omitido fila ${r.row}: ${r.name}.`).join(" ")}`;
    const existing=accounts.get(row.code);
    if(existing){
      // Never overwrite an approved decision or any historical meaning.
      if(existing.origin==="PLANTILLA"&&!existing.approvedAt&&existing._count.lines===0){
        const data={name,description,isActive:false,templateVersion:`XLSX-${preview.fileHash.slice(0,16)}`};
        await ctx.tx.chartAccount.update({where:{id:existing.id},data});
        await ctx.audit({domain:"CONTABILIDAD",action:"CHART_ACCOUNT_UPDATED",entityType:"CHART_ACCOUNT",entityId:existing.id,entityCode:existing.code,before:{name:existing.name,description:existing.description,isActive:existing.isActive},after:data,reason:"Catálogo del usuario preparado para revisión final; sin aprobación ni activación automática."});
      }
      reused++;continue;
    }
    const level=parent?parent.level+1:1;ctx.ensure(level<=8,"Jerarquía demasiado profunda.");
    const grouping=unique.some(r=>r.parentCode===row.code);
    const account=await ctx.tx.chartAccount.create({data:{code:row.code,name,type,nature:defaultNatureForType(type),parentId:parent?.id??null,level,allowsPosting:!grouping,origin:"PLANTILLA",templateVersion:`XLSX-${preview.fileHash.slice(0,16)}`,description,isActive:false}});
    await ctx.audit({domain:"CONTABILIDAD",action:"CHART_ACCOUNT_CREATED",entityType:"CHART_ACCOUNT",entityId:account.id,entityCode:account.code,after:{code:account.code,name,type,nature:account.nature,isActive:false,description},reason:"Catálogo fuente deduplicado por código; clasificación pendiente de revisión final."});
    accounts.set(account.code,{...account,_count:{lines:0}});created++;
  }
  return {created,reused,uniqueCodes:unique.length,duplicatesOmitted:preview.rows.filter(r=>r.code&&unique.some(u=>u.code===r.code)).length-unique.length,missingNames,fileHash:preview.fileHash};
}
