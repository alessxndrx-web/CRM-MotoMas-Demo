"use server";

import { revalidatePath } from "next/cache";

import { canManageDelegatedPermissions } from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  delegatedPermissionLabels,
  isDelegatedPermissionValue,
  type GrantMode,
} from "@/server/permissions/shared";

/**
 * Patch CRM-INT1 — el Administrador decide qué usuario de Marketing edita qué,
 * y en qué sucursales.
 *
 * Una sola acción que **sustituye** las concesiones de un permiso para un
 * usuario: ninguna, todas las sucursales o una lista. Sustituir en lugar de
 * añadir y quitar de una en una es lo que hace que la pantalla y la base no
 * puedan quedar a medias. El cambio queda en `UserAuditLog` con el antes y el
 * después.
 */

export type PermissionActionResult = { ok: true } | { ok: false; error: string };

export async function setDelegatedPermissionAction(input: {
  userId: string;
  permission: string;
  mode: GrantMode;
  branchCodes?: string[];
}): Promise<PermissionActionResult> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "Esta acción requiere una base de datos configurada." };
  }
  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: "Sesión no válida." };
  if (!canManageDelegatedPermissions(session.roleEnum)) {
    return { ok: false, error: "Sólo el Administrador asigna permisos de Marketing." };
  }
  if (!isDelegatedPermissionValue(input.permission)) {
    return { ok: false, error: "Permiso no válido." };
  }
  const permission = input.permission;
  if (!["NONE", "ALL", "BRANCHES"].includes(input.mode)) {
    return { ok: false, error: "Alcance no válido." };
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, role: true },
  });
  if (!user) return { ok: false, error: "El usuario no existe." };
  if (user.role !== "MARKETING") {
    return {
      ok: false,
      error: "Estos permisos sólo se conceden a usuarios de Marketing; el resto de roles los trae de su rol.",
    };
  }

  let branchIds: string[] = [];
  let branchNames: string[] = [];
  if (input.mode === "BRANCHES") {
    const codes = [...new Set((input.branchCodes ?? []).map((code) => code.trim()).filter(Boolean))];
    if (!codes.length) {
      return { ok: false, error: "Elige al menos una sucursal, o concede todas." };
    }
    const branches = await prisma.branch.findMany({
      where: { code: { in: codes }, isActive: true },
      select: { id: true, name: true },
    });
    if (branches.length !== codes.length) {
      return { ok: false, error: "Alguna sucursal elegida no existe o está desactivada." };
    }
    branchIds = branches.map((branch) => branch.id);
    branchNames = branches.map((branch) => branch.name);
  }

  const scopeText =
    input.mode === "NONE"
      ? "sin permiso"
      : input.mode === "ALL"
        ? "todas las sucursales"
        : branchNames.sort((a, b) => a.localeCompare(b, "es")).join(", ");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userPermissionGrant.deleteMany({
        where: { userId: user.id, permission },
      });
      if (input.mode === "ALL") {
        await tx.userPermissionGrant.create({
          data: {
            userId: user.id,
            permission,
            branchId: null,
            grantedById: session.uid,
          },
        });
      } else if (input.mode === "BRANCHES") {
        await tx.userPermissionGrant.createMany({
          data: branchIds.map((branchId) => ({
            userId: user.id,
            permission,
            branchId,
            grantedById: session.uid,
          })),
        });
      }
      await tx.userAuditLog.create({
        data: {
          actorUserId: session.uid,
          action: "DELEGATED_PERMISSION_SET",
          targetType: "User",
          targetId: user.id,
          description: `${user.name} · ${delegatedPermissionLabels[permission]}: ${scopeText}.`,
        },
      });
    });
  } catch {
    return { ok: false, error: "No se pudo guardar el permiso." };
  }

  revalidatePath("/panel/configuracion");
  revalidatePath("/panel/marketing");
  return { ok: true };
}
