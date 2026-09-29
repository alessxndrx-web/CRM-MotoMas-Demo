import type { Prisma, PrismaClient } from "@prisma/client";

import type { UserRoleEnum } from "@/server/auth/roles";
import type { DelegatedPermissionValue } from "@/server/permissions/shared";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Patch CRM-INT1 — hasta dónde alcanza un permiso delegado para un usuario.
 *
 * - `global`: todas las sucursales (el Administrador siempre; un usuario
 *   MARKETING con la concesión sin sucursal).
 * - `branches`: sólo esas sucursales (ids).
 * - `null`: nada. Cualquier otro rol, o un MARKETING sin concesión.
 *
 * **Sólo MARKETING recibe concesiones.** El resto de roles tiene sus permisos
 * en el enumerado de siempre (`access.ts`); este mecanismo existe para separar
 * en Marketing la visibilidad global de la edición.
 */
export type GrantCoverage =
  | { global: true }
  | { global: false; branchIds: Set<string> };

export async function resolveGrantCoverage(
  db: Db,
  user: { id: string; role: UserRoleEnum },
  permission: DelegatedPermissionValue,
): Promise<GrantCoverage | null> {
  if (user.role === "ADMIN") return { global: true };
  if (user.role !== "MARKETING") return null;

  const grants = await db.userPermissionGrant.findMany({
    where: { userId: user.id, permission },
    select: { branchId: true },
  });
  if (!grants.length) return null;
  if (grants.some((grant) => grant.branchId === null)) return { global: true };
  return {
    global: false,
    branchIds: new Set(grants.map((grant) => grant.branchId as string)),
  };
}

/**
 * ¿Cubre la concesión este conjunto de sucursales?
 *
 * **Un conjunto vacío significa «todas las sucursales»** —una campaña para
 * toda la empresa—, y por eso sólo lo cubre una concesión global. Si no, un
 * usuario con permiso en una sola sucursal podría editar la campaña de todas.
 */
export function coverageAllows(
  coverage: GrantCoverage | null,
  branchIds: readonly string[],
): boolean {
  if (!coverage) return false;
  if (coverage.global) return true;
  if (branchIds.length === 0) return false;
  return branchIds.every((id) => coverage.branchIds.has(id));
}
