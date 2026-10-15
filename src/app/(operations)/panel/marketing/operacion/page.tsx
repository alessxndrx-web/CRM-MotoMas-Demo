import Link from "next/link";
import { requireAuth } from "@/server/auth/context";
import { getPrisma } from "@/server/db/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { leadStatusLabels, customerFileStatusLabels } from "@/server/crm/shared";
import { reservationStatusLabels, saleStatusLabels } from "@/server/operations/shared";
import { unitStatusLabels } from "@/server/inventory/shared";

export const dynamic="force-dynamic";
const modules={leads:"Leads",clientes:"Clientes",expedientes:"Expedientes",inventario:"Inventario",reservas:"Reservas",ventas:"Ventas"};
type Module=keyof typeof modules;
const isModule=(value:string):value is Module => Object.hasOwn(modules,value);

/** Marketing gets the requested global consultation, without inheriting mutation or cost permissions. */
export default async function MarketingOperationPage({searchParams}:{searchParams:Promise<{modulo?:string;sucursal?:string;page?:string}>}) {
  const session=await requireAuth();
  if(!["ADMIN","MARKETING"].includes(session.roleEnum)) return <p>No tienes permiso para consultar esta sección.</p>;
  const params=await searchParams;
  const operationModule=isModule(params.modulo??"") ? params.modulo as Module : "leads";
  const branchCode=params.sucursal??"";
  const rawPage=Number(params.page);
  const page=Number.isInteger(rawPage) && rawPage>0 ? Math.min(rawPage,100000) : 1;
  const db=getPrisma();
  const branches=await db.branch.findMany({select:{code:true,name:true},orderBy:{name:"asc"}});
  const scope=branchCode ? {branch:{code:branchCode}} : {};
  const paging={take:25,skip:(page-1)*25,orderBy:{createdAt:"desc" as const}};
  let columns:string[]=[];let rows:string[][]=[];let total=0;
  if(operationModule === "leads") {
    const where={...scope,archivedAt:null};
    const [data,count]=await Promise.all([db.lead.findMany({where,...paging,select:{trackingCode:true,name:true,phone:true,status:true,motorcycleInterest:true,branch:{select:{name:true}}}}),db.lead.count({where})]);total=count;
    columns=["Solicitud","Cliente","Teléfono","Sucursal","Motocicleta","Estado"];
    rows=data.map(row=>[row.trackingCode,row.name,row.phone,row.branch.name,row.motorcycleInterest??"Sin registrar",leadStatusLabels[row.status]]);
  } else if(operationModule === "clientes") {
    const where={...scope,archivedAt:null};
    const [data,count]=await Promise.all([db.customer.findMany({where,...paging,select:{name:true,phone:true,branch:{select:{name:true}},assignedSeller:{select:{name:true}}}}),db.customer.count({where})]);total=count;
    columns=["Cliente","Teléfono","Sucursal","Atiende"];
    rows=data.map(row=>[row.name,row.phone,row.branch.name,row.assignedSeller?.name??"Sin asignar"]);
  } else if(operationModule === "expedientes") {
    const [data,count]=await Promise.all([db.customerFile.findMany({where:scope,...paging,select:{fileNumber:true,status:true,motorcycleInterest:true,serviceRating:true,customer:{select:{name:true,phone:true}},branch:{select:{name:true}}}}),db.customerFile.count({where:scope})]);total=count;
    columns=["Expediente","Cliente","Teléfono","Sucursal","Motocicleta","Estado","Atención"];
    rows=data.map(row=>[row.fileNumber,row.customer.name,row.customer.phone,row.branch.name,row.motorcycleInterest??"Sin registrar",customerFileStatusLabels[row.status],row.serviceRating?`${row.serviceRating}/5`:"Sin calificación"]);
  } else if(operationModule === "inventario") {
    const [data,count]=await Promise.all([db.motorcycleUnit.findMany({where:scope,...paging,select:{name:true,chassisNumber:true,color:true,year:true,status:true,branch:{select:{name:true}}}}),db.motorcycleUnit.count({where:scope})]);total=count;
    columns=["Motocicleta","Chasis","Color","Año","Sucursal","Estado"];
    rows=data.map(row=>[row.name,row.chassisNumber,row.color??"Sin registrar",String(row.year),row.branch.name,unitStatusLabels[row.status]]);
  } else if(operationModule === "reservas") {
    const [data,count]=await Promise.all([db.reservation.findMany({where:scope,...paging,select:{reservationNumber:true,status:true,customer:{select:{name:true}},motorcycleUnit:{select:{name:true}},branch:{select:{name:true}}}}),db.reservation.count({where:scope})]);total=count;
    columns=["Reserva","Cliente","Motocicleta","Sucursal","Estado"];
    rows=data.map(row=>[row.reservationNumber,row.customer.name,row.motorcycleUnit.name,row.branch.name,reservationStatusLabels[row.status]]);
  } else {
    const [data,count]=await Promise.all([db.sale.findMany({where:scope,...paging,select:{saleNumber:true,status:true,customer:{select:{name:true}},motorcycleUnit:{select:{name:true}},branch:{select:{name:true}}}}),db.sale.count({where:scope})]);total=count;
    columns=["Venta","Cliente","Motocicleta","Sucursal","Estado"];
    rows=data.map(row=>[row.saleNumber,row.customer.name,row.motorcycleUnit.name,row.branch.name,saleStatusLabels[row.status]]);
  }
  const href=(target:number)=>`/panel/marketing/operacion?${new URLSearchParams({modulo:operationModule,sucursal:branchCode,page:String(target)})}`;
  return <section className="space-y-6"><PageHeader title="Consulta comercial" description="Leads, clientes, expedientes, inventario, reservas y ventas de todas las sucursales. Consulta de solo lectura; la gestión de campañas continúa en Marketing."/>
    <nav aria-label="Módulos comerciales" className="flex flex-wrap gap-4">{Object.entries(modules).map(([value,label])=><Link key={value} aria-current={value===operationModule?"page":undefined} className="underline" href={`/panel/marketing/operacion?${new URLSearchParams({modulo:value,sucursal:branchCode})}`}>{label}</Link>)}</nav>
    <form className="flex gap-3"><input type="hidden" name="modulo" value={operationModule}/><label>Sucursal <select name="sucursal" className="rounded border bg-sb-surface p-2" defaultValue={branchCode}><option value="">Todas las sucursales</option>{branches.map(branch=><option key={branch.code} value={branch.code}>{branch.name}</option>)}</select></label><button className="rounded border px-4" type="submit">Filtrar</button></form>
    <p>{total} registros · Página {page} de {Math.max(1,Math.ceil(total/25))}</p>
    <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-left text-sm"><caption className="sr-only">{modules[operationModule]} por sucursal</caption><thead><tr>{columns.map(column=><th scope="col" className="border-b bg-slate-50 p-3" key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={`${page}-${index}`}>{row.map((value,cell)=><td className="border-b p-3" key={cell}>{value}</td>)}</tr>)}</tbody></table>{!rows.length?<p className="p-6">No hay registros con estos filtros.</p>:null}</div>
    <nav aria-label="Páginas" className="flex gap-4">{page>1?<Link href={href(page-1)}>Anterior</Link>:null}{page*25<total?<Link href={href(page+1)}>Siguiente</Link>:null}</nav>
  </section>;
}
