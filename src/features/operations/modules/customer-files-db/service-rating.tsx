"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rateCustomerFileServiceAction } from "@/server/crm/rating-actions";

export function ServiceRating({fileId,rating,canRate}:{fileId:string;rating:number|null;canRate:boolean}) {
  const [pending,startTransition]=useTransition();
  const [error,setError]=useState("");
  const router=useRouter();
  return <fieldset className="space-y-2" disabled={pending || !canRate}>
    <legend className="text-sm font-semibold">Calificación de atención</legend>
    <div className="flex gap-2">{[1,2,3,4,5].map(value=><button key={value} type="button" aria-label={`${value} ${value===1?"estrella":"estrellas"}`} aria-pressed={rating===value} className={`rounded p-1 text-3xl focus-visible:outline-2 ${value<=(rating??0)?"text-amber-500":"text-slate-400"}`} onClick={()=>{setError("");startTransition(async()=>{const result=await rateCustomerFileServiceAction({customerFileId:fileId,rating:value});if(!result.ok)setError(result.error??"No se pudo guardar.");else router.refresh();});}}>★</button>)}</div>
    <p className="text-xs text-slate-500">{rating ? `${rating}/5 · Registrada por el equipo` : "Sin calificación registrada"}</p>
    {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
  </fieldset>;
}
