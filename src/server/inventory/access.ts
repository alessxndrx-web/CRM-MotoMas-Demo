import { canRegisterMotorcycleIngress, getBranchScopeForUser } from "@/server/auth/access";
import type { SessionPayload } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/** Inventory operations belong to Sales Leads, Managers and Admin; never regular sellers. */
export async function getInventoryIngressAccess(session: SessionPayload) {
  if (!isDatabaseConfigured()) return { allowed: false, branches: [] as Array<{code: string; name: string}> };
  const db = getPrisma();
  if (canRegisterMotorcycleIngress(session.roleEnum)) {
    const scope = getBranchScopeForUser(session.roleEnum, session.branchId);
    const branches = await db.branch.findMany({
      where: { isActive: true, ...(scope.global ? {} : { code: scope.branchCode }) },
      select: { code: true, name: true }, orderBy: { name: "asc" },
    });
    return { allowed: branches.length > 0, branches };
  }
  return { allowed: false, branches: [] as Array<{code: string; name: string}> };
}
