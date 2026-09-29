import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  delegatedPermissionValues,
  type DelegatedPermissionValue,
  type GrantMode,
  type MarketingUserGrantsDTO,
} from "@/server/permissions/shared";

/**
 * Patch CRM-INT1 — los usuarios de Marketing y lo que cada uno puede modificar.
 * Sólo la lee la pantalla de Configuración del Administrador.
 */
export async function listMarketingUsersWithGrants(): Promise<MarketingUserGrantsDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const users = await getPrisma().user.findMany({
    where: { role: "MARKETING" },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      permissionGrants: {
        select: { permission: true, branch: { select: { code: true } } },
      },
    },
  });

  return users.map((user) => {
    const grants = {} as MarketingUserGrantsDTO["grants"];
    for (const permission of delegatedPermissionValues) {
      const rows = user.permissionGrants.filter(
        (grant) => (grant.permission as DelegatedPermissionValue) === permission,
      );
      const mode: GrantMode = !rows.length
        ? "NONE"
        : rows.some((grant) => grant.branch === null)
          ? "ALL"
          : "BRANCHES";
      grants[permission] = {
        mode,
        branchCodes:
          mode === "BRANCHES"
            ? rows.flatMap((grant) => (grant.branch ? [grant.branch.code] : []))
            : [],
      };
    }
    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      grants,
    };
  });
}
