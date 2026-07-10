import { desiredBranches } from "@/data/operations/leads";
import { userRoleEnums, type UserRoleEnum } from "@/server/auth/roles";

/**
 * Pure authorization predicates shared by server (enforcement) and client
 * (UI gating). These never read cookies or the database — pass the role/branch
 * already resolved from the session.
 */

export function canViewCosts(role: UserRoleEnum): boolean {
  // Accountant and Admin see global costs; Manager sees own-branch costs.
  // Seller and Cashier never see costs.
  return role === "ADMIN" || role === "CONTADOR" || role === "GERENTE";
}

export function canManageInventory(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

export function canRegisterMotorcycleIngress(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

export function canRegisterMotorcycleEgress(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

export function isGlobalScopeRole(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "CONTADOR";
}

export type BranchScope =
  | { global: true; branchCode: null }
  | { global: false; branchCode: string };

export function getBranchScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
): BranchScope {
  if (isGlobalScopeRole(role) || !branchCode) {
    return { global: true, branchCode: null };
  }
  return { global: false, branchCode };
}

export function canAccessBranch(
  role: UserRoleEnum,
  userBranchCode: string | null,
  targetBranchCode: string,
): boolean {
  const scope = getBranchScopeForUser(role, userBranchCode);
  if (scope.global) return true;
  return scope.branchCode === targetBranchCode;
}

/**
 * CRM (Customers / Leads / Expedientes) access. Only Admin, Manager and Seller
 * operate the commercial CRM. Cashier and Accountant never do.
 */
export function canOperateCrm(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE" || role === "VENDEDOR";
}

/** Only Admin and Manager may assign/reassign leads. */
export function canAssignLeads(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

/**
 * Three-level CRM visibility scope resolved from the session:
 * - `global`   → Admin sees all branches.
 * - `branch`   → Manager sees only their branch.
 * - `personal` → Seller sees only assigned/personal records.
 *
 * `branchCode` is a branch code (slug), never the internal "all" sentinel.
 */
export type CrmScope =
  | { level: "global" }
  | { level: "branch"; branchCode: string }
  | { level: "personal"; userId: string; branchCode: string | null };

export function getCrmScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
  userId: string,
): CrmScope {
  if (role === "ADMIN") return { level: "global" };
  if (role === "GERENTE" && branchCode) {
    return { level: "branch", branchCode };
  }
  // Seller — and any fallback — see only their own assigned/personal data.
  return { level: "personal", userId, branchCode };
}

/**
 * Operations (Reservations / Sales / Transfers, Patch 3.2B). Only Admin,
 * Manager and Seller operate here. Cashier and Accountant never do.
 */
export function canManageReservations(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE" || role === "VENDEDOR";
}

export function canManageSales(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE" || role === "VENDEDOR";
}

/** Requesting/creating a transfer (a Seller may request). */
export function canManageTransfers(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE" || role === "VENDEDOR";
}

/** Approving, dispatching, receiving or cancelling a transfer (Manager+Admin). */
export function canApproveTransfers(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

/**
 * Operations visibility scope. Identical shape/semantics to {@link CrmScope}:
 * global (Admin) / branch (Manager) / personal (Seller sees own records).
 */
export function getOperationsScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
  userId: string,
): CrmScope {
  return getCrmScopeForUser(role, branchCode, userId);
}

/**
 * Expediente support (proforma / document checklist / manual credit follow-up,
 * Patch 3.3B). This lives inside the commercial expediente, so it follows CRM
 * access exactly: Admin, Manager and Seller operate it; Cashier and Accountant
 * are blocked outright (the Accountant reviews accounting documents in
 * Contabilidad, not commercial expedientes — no read-only exception exists).
 */
export function canOperateExpedientes(role: UserRoleEnum): boolean {
  return canOperateCrm(role);
}

/** Only Admin and Manager may review (approve/reject) checklist documents. */
export function canReviewExpedienteDocuments(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

/**
 * Expediente-support visibility scope. Same shape/semantics as {@link CrmScope}:
 * global (Admin) / branch (Manager) / personal (Seller sees own expedientes).
 */
export function getExpedienteScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
  userId: string,
): CrmScope {
  return getCrmScopeForUser(role, branchCode, userId);
}

/** Which roles this actor is allowed to create. */
export function getCreatableRolesForActor(
  actorRole: UserRoleEnum,
): UserRoleEnum[] {
  if (actorRole === "ADMIN") return [...userRoleEnums];
  if (actorRole === "GERENTE") return ["VENDEDOR"];
  return [];
}

export function canCreateUserRole(
  actorRole: UserRoleEnum,
  targetRole: UserRoleEnum,
): boolean {
  return getCreatableRolesForActor(actorRole).includes(targetRole);
}

/** Which branch codes this actor may assign a new user to. */
export function getAssignableBranchCodesForActor(
  actorRole: UserRoleEnum,
  actorBranchCode: string | null,
): string[] {
  if (actorRole === "ADMIN") return desiredBranches.map((branch) => branch.id);
  if (actorRole === "GERENTE") return actorBranchCode ? [actorBranchCode] : [];
  return [];
}

export function canCreateUserInBranch(
  actorRole: UserRoleEnum,
  actorBranchCode: string | null,
  targetBranchCode: string | null,
): boolean {
  if (actorRole === "ADMIN") return true;
  if (actorRole === "GERENTE") {
    return Boolean(targetBranchCode) && targetBranchCode === actorBranchCode;
  }
  return false;
}

export function canManageUsers(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}
