"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { manageCrmRecordAction } from "@/server/crm/management-actions";

export type EditableCrmRecord = {
  id:string; kind:"lead"|"customer"|"credit"; updatedAt:string; archived:boolean;
  name:string; phone:string; email:string; cedula:string; notes:string;
  financialInstitution:string; pendingItems:string; branchName:string;
};

export function CrmRecordEditor({record}:{record:EditableCrmRecord}) {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const [message,setMessage]=useState("");
  const [confirm,setConfirm]=useState(false);
  const [fields,setFields]=useState(record);
  function run(operation:"save"|"archive"|"restore") {
    setMessage("");
    startTransition(async()=>{
      const result=await manageCrmRecordAction({...fields,id:record.id,kind:record.kind,updatedAt:record.updatedAt,operation});
      setMessage(result.ok ? "Cambio guardado." : result.error ?? "No se pudo guardar.");
      if(result.ok){setConfirm(false);router.refresh();}
    });
  }
  const keys = record.kind === "credit"
    ? ["financialInstitution","pendingItems","notes"] as const
    : ["name","phone","email","cedula",...(record.kind === "lead" ? ["notes" as const] : [])] as const;
  const labels: Record<string,string>={name:"Nombre",phone:"Teléfono",email:"Correo",cedula:"Cédula",notes:"Observaciones",financialInstitution:"Financiera",pendingItems:"Requisitos pendientes"};
  return <form className="space-y-3 rounded-xl border border-slate-200 p-5" onSubmit={(event)=>{event.preventDefault();run("save");}}>
    <p className="font-semibold">{record.name} · {record.branchName}{record.archived ? " · Eliminado del listado activo" : ""}</p>
    <div className="grid gap-3 md:grid-cols-2">{keys.map((key)=><label key={key} className="text-sm">{labels[key]}<input className="mt-1 block h-10 w-full rounded-lg border border-slate-300 bg-sb-surface px-3" value={fields[key]} onChange={(event)=>setFields({...fields,[key]:event.target.value})} /></label>)}</div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending} type="submit">Guardar cambios</Button>
      {record.archived ? <Button disabled={pending} type="button" variant="secondary" onClick={()=>run("restore")}>Restaurar</Button> : <Button disabled={pending} type="button" variant="danger" onClick={()=>setConfirm(true)}>Eliminar del listado</Button>}
    </div>
    {confirm ? <div className="rounded-lg border border-amber-300 p-3 text-sm"><p>Se retirará del listado activo. Se conservarán sus relaciones y su historial; podrás restaurarlo.</p><Button disabled={pending} variant="danger" type="button" onClick={()=>run("archive")}>Confirmar eliminación del listado</Button><Button type="button" variant="secondary" onClick={()=>setConfirm(false)}>Cancelar</Button></div> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </form>;
}
