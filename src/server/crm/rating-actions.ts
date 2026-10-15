"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserSession } from "@/server/auth/context";
import { getCrmScopeForUser } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { canAccessCustomerFile } from "@/server/expedientes/queries";

export async function rateCustomerFileServiceAction(input:{customerFileId:string;rating:number}) {
  const session=await getCurrentUserSession();
  if(!session || !["ADMIN","GERENTE","CALL_CENTER"].includes(session.roleEnum)) return {ok:false,error:"No tienes permiso para registrar esta calificación."};
  if(!Number.isInteger(input.rating) || input.rating<1 || input.rating>5) return {ok:false,error:"Selecciona entre una y cinco estrellas."};
  if(!isDatabaseConfigured()) return {ok:false,error:"La base de datos no está disponible."};
  const scope=getCrmScopeForUser(session.roleEnum,session.branchId,session.uid);
  if(!await canAccessCustomerFile(scope,input.customerFileId)) return {ok:false,error:"El expediente no está en tu alcance."};
  try {
    await getPrisma().$transaction(async tx=>{
      await tx.customerFile.update({where:{id:input.customerFileId},data:{serviceRating:input.rating}});
      await tx.userAuditLog.create({data:{actorUserId:session.uid,action:"SERVICE_RATED",targetType:"CustomerFile",targetId:input.customerFileId,description:`Calificación de atención registrada: ${input.rating}/5.`}});
    });
    revalidatePath("/panel/expedientes");
    return {ok:true};
  } catch {return {ok:false,error:"No se pudo guardar la calificación."};}
}
