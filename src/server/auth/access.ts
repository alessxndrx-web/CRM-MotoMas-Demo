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
