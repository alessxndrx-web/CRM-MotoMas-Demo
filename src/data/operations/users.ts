import {
  desiredBranches,
  type DesiredBranchId,
  type DemoSeller,
} from "@/data/operations/leads";
import type {
  DemoSession,
  InternalUser,
  OperationRole,
} from "@/features/operations/types";

export const DEMO_ADMIN_BRANCH_ID = "all";
export const DEMO_ADMIN_BRANCH_NAME = "Todas las sucursales";

export const operationRoles: OperationRole[] = [
  "Vendedor",
  "Gerente",
  "Administrador",
];

export const demoInternalUsers: InternalUser[] = [
  {
    role: "Vendedor",
    userId: "seller-roberto",
    userName: "Roberto",
    branchId: "plaza-inter",
    branchName: "Plaza Inter",
  },
  {
    role: "Vendedor",
    userId: "seller-maria",
    userName: "María",
    branchId: "rubenia",
    branchName: "Rubenia",
  },
  {
    role: "Vendedor",
    userId: "seller-jose",
    userName: "José",
    branchId: "masaya",
    branchName: "Masaya",
  },
  {
    role: "Gerente",
    userId: "manager-plaza-inter",
    userName: "Gerente Plaza Inter",
    branchId: "plaza-inter",
    branchName: "Plaza Inter",
  },
  {
    role: "Gerente",
    userId: "manager-rubenia",
    userName: "Gerente Rubenia",
    branchId: "rubenia",
    branchName: "Rubenia",
  },
  {
    role: "Gerente",
    userId: "manager-masaya",
    userName: "Gerente Masaya",
    branchId: "masaya",
    branchName: "Masaya",
  },
  {
    role: "Administrador",
    userId: "admin-general",
    userName: "Administrador General",
    branchId: DEMO_ADMIN_BRANCH_ID,
    branchName: DEMO_ADMIN_BRANCH_NAME,
  },
];

export const demoSellerNames = demoInternalUsers
  .filter((user) => user.role === "Vendedor")
  .map((user) => user.userName) as DemoSeller[];

export function getInternalUserById(userId: string) {
  return demoInternalUsers.find((user) => user.userId === userId) ?? null;
}

export function getUsersByRole(role: OperationRole) {
  return demoInternalUsers.filter((user) => user.role === role);
}

export function getUsersByRoleAndBranch(
  role: OperationRole,
  branchId: DesiredBranchId,
) {
  return demoInternalUsers.filter(
    (user) => user.role === role && user.branchId === branchId,
  );
}

export function getSellersForBranch(branchId: DesiredBranchId) {
  return getUsersByRoleAndBranch("Vendedor", branchId).map(
    (user) => user.userName,
  ) as DemoSeller[];
}

export function getBranchesWithUsers(role: OperationRole) {
  const users = getUsersByRole(role);
  const userBranchIds = new Set(users.map((user) => user.branchId));

  return desiredBranches.filter((branch) => userBranchIds.has(branch.id));
}

export function getDefaultRouteForSession(session: DemoSession) {
  if (session.role === "Administrador") return "/panel/dashboard";
  return "/panel/leads";
}
