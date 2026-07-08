import { desiredBranches } from "@/data/operations/leads";
import type {
  DemoSession,
  OperationBranchId,
  OperationRole,
} from "@/features/operations/types";

/**
 * Role and branch mapping between the production database representation
 * (English enum, cuid branch ids) and the internal operations session shape
 * (Spanish role, branch slug) that every existing panel already understands.
 */

export type UserRoleEnum =
  | "ADMIN"
  | "GERENTE"
  | "VENDEDOR"
  | "CAJERO"
  | "CONTADOR";

export const userRoleEnums: UserRoleEnum[] = [
  "ADMIN",
  "GERENTE",
  "VENDEDOR",
  "CAJERO",
  "CONTADOR",
];

export const roleEnumToSpanish: Record<UserRoleEnum, OperationRole> = {
  ADMIN: "Administrador",
  GERENTE: "Gerente",
  VENDEDOR: "Vendedor",
  CAJERO: "Cajero",
  CONTADOR: "Contador",
};

export const spanishToRoleEnum: Record<OperationRole, UserRoleEnum> = {
  Administrador: "ADMIN",
  Gerente: "GERENTE",
  Vendedor: "VENDEDOR",
  Cajero: "CAJERO",
  Contador: "CONTADOR",
};

export const GLOBAL_BRANCH_ID: OperationBranchId = "all";
export const GLOBAL_BRANCH_NAME = "Todas las sucursales";

/** Roles that operate globally (no single branch scope). */
export function isGlobalRole(role: UserRoleEnum) {
  return role === "ADMIN" || role === "CONTADOR";
}

export function branchNameForCode(code: string | null | undefined): string {
  if (!code) return GLOBAL_BRANCH_NAME;
  return desiredBranches.find((branch) => branch.id === code)?.name ?? code;
}

/**
 * Build the internal {@link DemoSession} shape from database-facing values so
 * the existing localStorage-based panels keep working unchanged.
 */
export function toDemoSession(input: {
  userId: string;
  name: string;
  role: UserRoleEnum;
  branchCode: string | null;
}): DemoSession {
  const global = isGlobalRole(input.role) || !input.branchCode;
  return {
    userId: input.userId,
    userName: input.name,
    role: roleEnumToSpanish[input.role],
    branchId: (global ? GLOBAL_BRANCH_ID : input.branchCode) as OperationBranchId,
    branchName: global ? GLOBAL_BRANCH_NAME : branchNameForCode(input.branchCode),
  };
}
