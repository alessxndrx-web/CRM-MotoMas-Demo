import {
  canAccessContabilidad,
  canOperateContabilidad,
  canReviewContabilidad,
  canViewAccountingCosts,
  canViewAccountingLedger,
  getContabilidadScopeForUser,
  type ContabilidadScope,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Single place where the Contabilidad routes resolve who is reading and how far
 * they see (Patch 3.5C). Mirrors `getCajaPageContext`: `enabled` gates the
 * database-backed panels, and every query/action re-applies the scope resolved
 * here — no route trusts a client-side filter.
 *
 * - `canViewLedger` is Accountant/Admin only. A Gerente reaches Contabilidad
 *   with `branchReadOnly` scope: dashboard summary and own-branch valued
 *   inventory, never the global ledger (journals, vouchers, documents, banks…).
 * - `canViewCosts` follows ROLES.md: Accountant and Admin globally, Gerente for
 *   their own branch, Cashier and Seller never.
 */

export type ContabilidadPageContext = {
  branchCode: string | null;
  canAccess: boolean;
  canOperate: boolean;
  canReview: boolean;
  canViewCosts: boolean;
  canViewLedger: boolean;
  dbConfigured: boolean;
  enabled: boolean;
  isGlobal: boolean;
  role: UserRoleEnum;
  scope: ContabilidadScope;
  scopeLabel: string;
  /** Manager and Admin read Contabilidad as supervisors; Accountant operates it. */
  supervision: boolean;
  userId: string;
};

export async function getContabilidadPageContext(): Promise<ContabilidadPageContext> {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const scope = getContabilidadScopeForUser(session.roleEnum, branchCode);
  const canAccess = canAccessContabilidad(session.roleEnum);

  return {
    branchCode,
    canAccess,
    canOperate: canOperateContabilidad(session.roleEnum),
    canReview: canReviewContabilidad(session.roleEnum),
    canViewCosts: canViewAccountingCosts(session.roleEnum),
    canViewLedger: canViewAccountingLedger(session.roleEnum),
    dbConfigured,
    enabled: dbConfigured && canAccess && scope.level !== "none",
    isGlobal: scope.level === "global",
    role: session.roleEnum,
    scope,
    scopeLabel:
      session.roleEnum === "GERENTE" ? session.branchName : "Vista global",
    supervision: session.roleEnum !== "CONTADOR",
    userId: session.uid,
  };
}
