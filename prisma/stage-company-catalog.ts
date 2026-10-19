import { readFile } from "node:fs/promises";
import { getPrisma } from "@/server/db/prisma";
import { runFinancialTransaction } from "@/server/finance/transaction";
import { stageCatalogWorkbook } from "@/server/finance/chart-of-accounts/staging";

// Local by default; the deployment operator must explicitly select production.
const url=new URL(process.env.DATABASE_URL??"");
if(!process.argv.includes("--production")&&(url.hostname!=="127.0.0.1"||!["15432","55438"].includes(url.port)||!["/motomas_db","/motomas_finance_local_review"].includes(url.pathname)))throw Error("Destino local no autorizado; un despliegue requiere --production explícito.");
const db=getPrisma();
try{
 const [actorId,file]=process.argv.slice(2);if(!actorId||!file)throw Error("Indica responsable administrativo y Excel de origen.");
 const actor=await db.user.findUniqueOrThrow({where:{id:actorId}});if(actor.role!=="ADMIN"&&actor.role!=="CONTADOR")throw Error("El responsable debe tener rol contable autorizado.");
 const bytes=await readFile(file);
 const result=await runFinancialTransaction({actor:{userId:actor.id,role:actor.role},timeoutMs:60000,run:ctx=>stageCatalogWorkbook(ctx,bytes)});
 if(!result.ok)throw Error(result.error);
 console.log(JSON.stringify({database:url.pathname.slice(1),...result.data,approvedAutomatically:0,postedTransactions:0}));
}finally{await db.$disconnect();}
