import {
  canConfigureFinancialFoundation,
  canViewFinancialFoundation,
  getContabilidadScopeForUser,
  type ContabilidadScope,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  DATABASE_REQUIRED_ERROR,
  NO_FINANCIAL_PERMISSION_ERROR,
} from "@/server/finance/errors";
import type { FinancialTransactionActor } from "@/server/finance/transaction";

/**
 * Patch FF1.0 — authorization entry point for the financial foundation.
 *
 * Mirrors `getContabilidadPageContext` / `authorizeContabilidad`: the role and
 * branch always come from the signed session, never from the caller, and a
 * blocked role or a missing branch context resolves to a refusal instead of
 * widening. The foundation adds no new access: reading follows the accounting
 * ledger boundary and writing follows Contabilidad's operate permission
 * (Admin/Contador), exactly as ROLES.md §12 defines.
 */

export type FinancialFoundationActor = FinancialTransactionActor & {
  scope: ContabilidadScope;
};

export type FinancialAuthorization =
  | { ok: true; actor: FinancialFoundationActor }
  | { ok: false; error: string };

export async function authorizeFinancialFoundation(
  permission: "view" | "configure",
): Promise<FinancialAuthorization> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: DATABASE_REQUIRED_ERROR };
  }

  const session = await requireAuth();
  const allowed =
    permission === "configure"
      ? canConfigureFinancialFoundation(session.roleEnum)
      : canViewFinancialFoundation(session.roleEnum);
  if (!allowed) return { ok: false, error: NO_FINANCIAL_PERMISSION_ERROR };

  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const scope = getContabilidadScopeForUser(session.roleEnum, branchCode);
  // Only a global accounting scope reaches the foundation. `branchReadOnly`
  // (Gerente) never configures numbering or mappings.
  if (scope.level !== "global") {
    return { ok: false, error: NO_FINANCIAL_PERMISSION_ERROR };
  }

  return {
    ok: true,
    actor: { userId: session.uid, role: session.roleEnum, scope },
  };
}

export type FinancialRole = UserRoleEnum;

/**
 * Branch code → id. The foundation is the base layer, so it resolves branches
 * itself instead of importing Caja or Contabilidad and inverting the dependency.
 * A null/empty code means an intentionally corporate (branch-less) record.
 */
export async function resolveFinancialBranchId(
  branchCode: string | null | undefined,
): Promise<{ ok: true; branchId: string | null } | { ok: false }> {
  const code = typeof branchCode === "string" ? branchCode.trim() : "";
  if (!code) return { ok: true, branchId: null };

  const branch = await getPrisma().branch.findUnique({
    where: { code },
    select: { id: true },
  });
  return branch ? { ok: true, branchId: branch.id } : { ok: false };
}

/** Reverse lookup used to expose branch codes in DTOs, never internal ids. */
export async function resolveBranchCodesByIds(
  branchIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(branchIds)];
  if (!unique.length) return new Map();

  const branches = await getPrisma().branch.findMany({
    where: { id: { in: unique } },
    select: { id: true, code: true },
  });
  return new Map(branches.map((branch) => [branch.id, branch.code]));
}
