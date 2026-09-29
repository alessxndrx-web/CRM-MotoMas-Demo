"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { canManageBranches } from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import {
  BRANCH_NAME_MAX,
  branchCodeFromName,
} from "@/server/branches/shared";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch CRM-INT1 — administración de sucursales.
 *
 * No existía ninguna pantalla para esto: las sucursales entraban sólo por el
 * seed, y cualquier cambio exigía editar código. Lo que se puede hacer aquí:
 *
 * - **Crear** una sucursal. El código se deriva del nombre con la regla del
 *   seed; un código o un nombre repetidos se rechazan (los dos son únicos en
 *   la base), que es lo que impide duplicar una sucursal.
 * - **Editar** nombre, dirección y teléfono. El código no se toca nunca.
 * - **Activar o desactivar.** Nunca borrar: leads, clientes, ventas y
 *   asientos apuntan a la sucursal. Desactivarla la quita de los selectores
 *   de registros nuevos y deja intacto todo lo que ya existe.
 *
 * Cada cambio deja su rastro en `UserAuditLog`.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "Sólo el Administrador puede gestionar sucursales.";

export type BranchActionResult = { ok: true; code: string } | { ok: false; error: string };

function optionalText(value: string | null | undefined, max: number): string | null {
  const clean = sanitizeText(value ?? "");
  return clean ? clean.slice(0, max) : null;
}

async function authorize() {
  if (!isDatabaseConfigured()) return { ok: false as const, error: DB_REQUIRED };
  const session = await getCurrentUserSession();
  if (!session) return { ok: false as const, error: "Sesión no válida." };
  if (!canManageBranches(session.roleEnum)) {
    return { ok: false as const, error: NO_PERMISSION };
  }
  return { ok: true as const, session };
}

export async function createBranchAction(input: {
  name: string;
  address?: string | null;
  phone?: string | null;
}): Promise<BranchActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const name = sanitizeText(input.name ?? "");
  if (!name) return { ok: false, error: "El nombre de la sucursal es obligatorio." };
  if (name.length > BRANCH_NAME_MAX) {
    return { ok: false, error: `El nombre no puede pasar de ${BRANCH_NAME_MAX} caracteres.` };
  }
  const code = branchCodeFromName(name);
  if (!code) {
    return { ok: false, error: "El nombre debe contener letras o números." };
  }

  const prisma = getPrisma();
  const clash = await prisma.branch.findFirst({
    where: {
      OR: [{ code }, { name: { equals: name, mode: "insensitive" } }],
    },
    select: { name: true, isActive: true },
  });
  if (clash) {
    return {
      ok: false,
      error: clash.isActive
        ? `Ya existe la sucursal «${clash.name}».`
        : `Ya existe la sucursal «${clash.name}», desactivada. Reactívala en lugar de crear otra.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.create({
        data: {
          code,
          name,
          address: optionalText(input.address, 200),
          phone: optionalText(input.phone, 40),
          isActive: true,
        },
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.session.uid,
          action: "BRANCH_CREATED",
          targetType: "Branch",
          targetId: branch.id,
          description: `Creó la sucursal ${name} (${code}).`,
        },
      });
    });
  } catch (error) {
    // La carrera entre la comprobación de arriba y el `create`: otro
    // administrador creó la misma sucursal en ese intervalo. El único la para.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: `Ya existe una sucursal con el nombre «${name}».` };
    }
    return { ok: false, error: "No se pudo crear la sucursal." };
  }

  revalidatePath("/panel/configuracion");
  return { ok: true, code };
}

export async function updateBranchAction(input: {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}): Promise<BranchActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { code: input.code } });
  if (!branch) return { ok: false, error: "La sucursal no existe." };

  const name = sanitizeText(input.name ?? "");
  if (!name) return { ok: false, error: "El nombre de la sucursal es obligatorio." };
  if (name.length > BRANCH_NAME_MAX) {
    return { ok: false, error: `El nombre no puede pasar de ${BRANCH_NAME_MAX} caracteres.` };
  }
  if (name.toLowerCase() !== branch.name.toLowerCase()) {
    const clash = await prisma.branch.findFirst({
      where: { name: { equals: name, mode: "insensitive" }, id: { not: branch.id } },
      select: { id: true },
    });
    if (clash) return { ok: false, error: `Ya existe otra sucursal llamada «${name}».` };
  }

  // Desactivar una sucursal con gente trabajando en ella dejaría a esos
  // usuarios dentro de un perímetro que ya no aparece en ningún selector. Se
  // pide resolverlo antes, y se dice cuántos son.
  if (branch.isActive && !input.isActive) {
    const activeUsers = await prisma.user.count({
      where: { branchId: branch.id, isActive: true },
    });
    if (activeUsers > 0) {
      return {
        ok: false,
        error: `La sucursal tiene ${activeUsers} usuario(s) activo(s). Reasígnalos o desactívalos antes de desactivarla.`,
      };
    }
  }

  const changes: string[] = [];
  if (name !== branch.name) changes.push(`nombre «${branch.name}» → «${name}»`);
  if (input.isActive !== branch.isActive) {
    changes.push(input.isActive ? "reactivada" : "desactivada");
  }
  const address = optionalText(input.address, 200);
  const phone = optionalText(input.phone, 40);
  if (address !== branch.address) changes.push("dirección");
  if (phone !== branch.phone) changes.push("teléfono");
  if (!changes.length) return { ok: true, code: branch.code };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id: branch.id },
        data: { name, address, phone, isActive: input.isActive },
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.session.uid,
          action: input.isActive === branch.isActive
            ? "BRANCH_UPDATED"
            : input.isActive
              ? "BRANCH_REACTIVATED"
              : "BRANCH_DEACTIVATED",
          targetType: "Branch",
          targetId: branch.id,
          description: `Sucursal ${branch.code}: ${changes.join(", ")}.`,
        },
      });
    });
  } catch {
    return { ok: false, error: "No se pudo actualizar la sucursal." };
  }

  revalidatePath("/panel/configuracion");
  return { ok: true, code: branch.code };
}
