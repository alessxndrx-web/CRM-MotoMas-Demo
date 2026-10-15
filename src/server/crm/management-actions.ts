"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserSession } from "@/server/auth/context";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { normalizeCedula, normalizePhone, sanitizeText } from "@/server/crm/shared";
import { lockIdentity } from "@/server/crm/identity";

/** Removing a commercial record is reversible; its financial links and history survive. */
export async function manageCrmRecordAction(input: {
  kind: "lead" | "customer" | "credit";
  id: string;
  operation: "save" | "archive" | "restore";
  updatedAt: string;
  name?: string;
  phone?: string;
  email?: string;
  cedula?: string;
  notes?: string;
  financialInstitution?: string;
  pendingItems?: string;
}): Promise<{ok: boolean; error?: string}> {
  const session = await getCurrentUserSession();
  if (!session || !["ADMIN", "GERENTE"].includes(session.roleEnum)) return {ok:false,error:"No tienes permiso para gestionar estos registros."};
  if (!isDatabaseConfigured()) return {ok:false,error:"La base de datos no está disponible."};
  if (!["lead", "customer", "credit"].includes(input.kind) || !["save", "archive", "restore"].includes(input.operation)) return {ok:false,error:"Operación no válida."};
  const db = getPrisma();
  const branch = session.roleEnum === "ADMIN" ? null : await db.branch.findUnique({where:{code:session.branchId},select:{id:true}});
  if (session.roleEnum !== "ADMIN" && !branch) return {ok:false,error:"Tu sucursal no está disponible."};
  const updatedAt = new Date(input.updatedAt);
  if (!Number.isFinite(updatedAt.getTime())) return {ok:false,error:"Recarga el registro antes de continuar."};
  const where = {id:input.id, updatedAt, ...(branch ? {branchId:branch.id} : {})};
  const text = (value: string | undefined) => sanitizeText(value ?? "").slice(0,500) || null;
  try {
    const result = await db.$transaction(async (tx) => {
      const archiveData = {archivedAt: input.operation === "archive" ? new Date() : null};
      let count = 0;
      if (input.kind === "credit") {
        const saved = await tx.creditApplication.updateMany({where,data:input.operation === "save" ? {
          financialInstitution:text(input.financialInstitution),pendingItems:text(input.pendingItems),observations:text(input.notes),
        } : archiveData});
        count = saved.count;
      } else if (input.kind === "lead") {
        if (input.operation === "save" && (!text(input.name) || !normalizePhone(input.phone ?? ""))) return {ok:false,error:"Completa nombre y teléfono."};
        count = (await tx.lead.updateMany({where,data:input.operation === "save" ? {
          name:text(input.name)!,phone:normalizePhone(input.phone ?? ""),email:text(input.email),cedula:normalizeCedula(input.cedula ?? "") || null,notes:text(input.notes),
        } : archiveData})).count;
      } else {
        if (input.operation === "save") {
          const name = text(input.name);
          const phone = normalizePhone(input.phone ?? "");
          const cedula = normalizeCedula(input.cedula ?? "") || null;
          if (!name || !phone) return {ok:false,error:"Completa nombre y teléfono."};
          await lockIdentity(tx,{phone,cedula});
          if (cedula && await tx.customer.findFirst({where:{cedulaNormalized:cedula,id:{not:input.id}},select:{id:true}})) return {ok:false,error:"La cédula pertenece a otro cliente. Revisa la identidad antes de modificarla."};
          count = (await tx.customer.updateMany({where,data:{name,phone,phoneNormalized:phone,cedula,cedulaNormalized:cedula,email:text(input.email)}})).count;
        } else count = (await tx.customer.updateMany({where,data:archiveData})).count;
      }
      if (!count) return {ok:false,error:"El registro cambió o no pertenece a tu sucursal. Recarga la página."};
      await tx.userAuditLog.create({data:{actorUserId:session.uid,action:`CRM_${input.operation.toUpperCase()}`,targetType:input.kind,targetId:input.id,description:input.operation === "archive" ? "Retirado del listado activo; historial conservado." : "Gestión comercial autorizada."}});
      return {ok:true};
    });
    for (const path of ["/panel/gestion-crm","/panel/leads","/panel/clientes","/panel/creditos","/panel/expedientes"]) revalidatePath(path);
    return result;
  } catch { return {ok:false,error:"No se pudo guardar el cambio. Ningún registro fue eliminado permanentemente."}; }
}
