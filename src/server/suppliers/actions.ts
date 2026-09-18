"use server";

import { revalidatePath } from "next/cache";

import { canAccessBranch, canManageSuppliers } from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch CRM-QA1 — alta y mantenimiento de proveedores, fuera de Contabilidad.
 *
 * Escribe sobre `ThirdParty` con `type = PROVEEDOR`, que es el proveedor que el
 * repositorio ya tenía. **No crea un modelo paralelo**: un proveedor dado de
 * alta aquí es el mismo que Contabilidad ve en Terceros y el mismo que una orden
 * de compra referencia.
 *
 * Estas acciones nunca escriben `type`: es siempre `PROVEEDOR`. Un cliente o un
 * empleado se siguen manteniendo desde Contabilidad, donde su ficha tiene
 * sentido contable; esta pantalla no es una puerta de atrás al maestro de
 * terceros.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_SESSION = "Sesión no válida.";
const NO_PERMISSION = "No tienes permiso para administrar proveedores.";

export type SupplierActionResult = { ok: true } | { ok: false; error: string };

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

export type SaveSupplierInput = {
  /** Vacío para dar de alta; con id, edita. */
  supplierId?: string | null;
  nombre: string;
  identificacion?: string | null;
  telefono?: string | null;
  correo?: string | null;
  notas?: string | null;
  /** Sólo lo elige un rol global; el resto hereda su sucursal. */
  branchCode?: string | null;
};

export async function saveSupplierAction(
  input: SaveSupplierInput,
): Promise<SupplierActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageSuppliers(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const name = sanitizeText(input.nombre ?? "");
  if (!name) return { ok: false, error: "El nombre del proveedor es obligatorio." };

  const actorBranch = sessionBranchCode(session.branchId);
  const data = {
    name,
    taxId: sanitizeText(input.identificacion ?? "").slice(0, 40) || null,
    phone: sanitizeText(input.telefono ?? "").slice(0, 40) || null,
    email: input.correo?.trim().toLowerCase().slice(0, 120) || null,
    notes: sanitizeText(input.notas ?? "").slice(0, 500) || null,
  };

  try {
    const prisma = getPrisma();

    if (input.supplierId?.trim()) {
      const existing = await prisma.thirdParty.findUnique({
        where: { id: input.supplierId.trim() },
        include: { branch: true },
      });
      // `type` se comprueba además del id: sin esto, esta pantalla podría editar
      // un CLIENTE o un EMPLEADO pasando su identificador.
      if (!existing || existing.type !== "PROVEEDOR") {
        return { ok: false, error: "El proveedor no existe." };
      }
      if (!canAccessBranch(session.roleEnum, actorBranch, existing.branch.code)) {
        return { ok: false, error: "El proveedor no pertenece a tu sucursal." };
      }
      await prisma.thirdParty.update({ where: { id: existing.id }, data });
      revalidatePath("/panel/proveedores");
      return { ok: true };
    }

    const branchCode =
      actorBranch ?? (input.branchCode ?? "").trim();
    if (!branchCode) {
      return { ok: false, error: "Selecciona la sucursal del proveedor." };
    }
    if (!canAccessBranch(session.roleEnum, actorBranch, branchCode)) {
      return { ok: false, error: "No puedes registrar proveedores en esa sucursal." };
    }
    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) return { ok: false, error: "La sucursal no existe." };

    await prisma.thirdParty.create({
      data: { ...data, type: "PROVEEDOR", branchId: branch.id, isActive: true },
    });

    revalidatePath("/panel/proveedores");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar el proveedor." };
  }
}

/**
 * Activa o desactiva un proveedor.
 *
 * **Baja lógica y nunca borrado.** Una orden de compra referencia al proveedor
 * con `onDelete: Restrict`, así que borrarlo o es imposible o rompe el historial
 * de compras. Desactivarlo lo saca de los desplegables y deja intacto todo lo
 * que ya se le compró.
 */
export async function setSupplierActiveAction(input: {
  supplierId: string;
  activo: boolean;
}): Promise<SupplierActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: NO_SESSION };
  if (!canManageSuppliers(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const actorBranch = sessionBranchCode(session.branchId);

  try {
    const prisma = getPrisma();
    const supplier = await prisma.thirdParty.findUnique({
      where: { id: input.supplierId },
      include: { branch: true },
    });
    if (!supplier || supplier.type !== "PROVEEDOR") {
      return { ok: false, error: "El proveedor no existe." };
    }
    if (!canAccessBranch(session.roleEnum, actorBranch, supplier.branch.code)) {
      return { ok: false, error: "El proveedor no pertenece a tu sucursal." };
    }

    await prisma.thirdParty.update({
      where: { id: supplier.id },
      data: { isActive: input.activo },
    });

    revalidatePath("/panel/proveedores");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo actualizar el proveedor." };
  }
}
