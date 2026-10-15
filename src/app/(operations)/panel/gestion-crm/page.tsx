import Link from "next/link";
import { requireAuth } from "@/server/auth/context";
import { getPrisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { CrmRecordEditor, type EditableCrmRecord } from "@/features/operations/modules/customer-files-db/crm-record-editor";

export const dynamic="force-dynamic";

export default async function CrmManagementPage({searchParams}:{searchParams:Promise<{kind?:string;q?:string;archived?:string;page?:string}>}) {
  const session=await requireAuth();
  if(!["ADMIN","GERENTE"].includes(session.roleEnum)) return <p>No tienes permiso para gestionar estos registros.</p>;
  const params=await searchParams;
  const kind=params.kind === "customer" || params.kind === "credit" ? params.kind : "lead";
  const archived=params.archived === "1";
  const page=Math.max(1,Math.min(100000,Math.floor(Number(params.page)||1)));
  const db=getPrisma();
  const branchWhere=session.roleEnum === "ADMIN" ? {} : {branch:{code:session.branchId}};
  const archiveWhere={archivedAt:archived ? {not:null} : null};
  const q=(params.q ?? "").trim().slice(0,100);
  const common={...branchWhere,...archiveWhere};
  const textWhere=q ? {name:{contains:q,mode:"insensitive" as const}} : {};
  let records:EditableCrmRecord[]=[];
  let total=0;
  const base={phone:"",email:"",cedula:"",notes:"",financialInstitution:"",pendingItems:""};
  if(kind === "lead") {
    const where={...common,...textWhere};
    const [rows,count]=await Promise.all([db.lead.findMany({where,include:{branch:{select:{name:true}}},orderBy:{createdAt:"desc"},take:25,skip:(page-1)*25}),db.lead.count({where})]);total=count;
    records=rows.map(row=>({...base,id:row.id,kind,updatedAt:row.updatedAt.toISOString(),archived:!!row.archivedAt,name:row.name,phone:row.phone,email:row.email??"",cedula:row.cedula??"",notes:row.notes??"",branchName:row.branch.name}));
  } else if(kind === "customer") {
    const where={...common,...textWhere};
    const [rows,count]=await Promise.all([db.customer.findMany({where,include:{branch:{select:{name:true}}},orderBy:{createdAt:"desc"},take:25,skip:(page-1)*25}),db.customer.count({where})]);total=count;
    records=rows.map(row=>({...base,id:row.id,kind,updatedAt:row.updatedAt.toISOString(),archived:!!row.archivedAt,name:row.name,phone:row.phone,email:row.email??"",cedula:row.cedula??"",branchName:row.branch.name}));
  } else {
    const where={...common,...(q ? {customer:{name:{contains:q,mode:"insensitive" as const}}} : {})};
    const [rows,count]=await Promise.all([db.creditApplication.findMany({where,include:{branch:{select:{name:true}},customer:{select:{name:true}}},orderBy:{createdAt:"desc"},take:25,skip:(page-1)*25}),db.creditApplication.count({where})]);total=count;
    records=rows.map(row=>({...base,id:row.id,kind,updatedAt:row.updatedAt.toISOString(),archived:!!row.archivedAt,name:row.customer?.name??"Crédito",notes:row.observations??"",financialInstitution:row.financialInstitution??"",pendingItems:row.pendingItems??"",branchName:row.branch.name}));
  }
  const href=(target:number)=>`/panel/gestion-crm?${new URLSearchParams({kind,archived:archived?"1":"0",q,page:String(target)})}`;
  return <section className="space-y-6"><PageHeader title="Gestión del CRM" description="Edita clientes, leads y créditos de tu alcance. La eliminación del listado es reversible y conserva el historial."/>
    <nav className="flex flex-wrap gap-4" aria-label="Tipo de registro">{[["lead","Leads"],["customer","Clientes"],["credit","Créditos"]].map(([value,label])=><Link key={value} aria-current={value===kind?"page":undefined} className="underline" href={`/panel/gestion-crm?kind=${value}`}>{label}</Link>)}</nav>
    <form className="flex flex-wrap items-center gap-3"><input type="hidden" name="kind" value={kind}/><label>Nombre <input className="rounded border bg-sb-surface p-2" name="q" defaultValue={q}/></label><label><input type="checkbox" name="archived" value="1" defaultChecked={archived}/> Ver eliminados del listado</label><button className="rounded border px-4 py-2" type="submit">Buscar</button></form>
    <p>{total} registros · Página {page} de {Math.max(1,Math.ceil(total/25))}</p>
    {records.map(record=><CrmRecordEditor key={`${record.id}-${record.updatedAt}`} record={record}/>)}
    {!records.length ? <p>No hay registros con estos filtros.</p> : null}
    <nav className="flex gap-4" aria-label="Páginas">{page>1?<Link href={href(page-1)}>Anterior</Link>:null}{page*25<total?<Link href={href(page+1)}>Siguiente</Link>:null}</nav>
  </section>;
}
