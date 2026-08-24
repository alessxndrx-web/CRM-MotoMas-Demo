import type { DesiredBranchId } from "@/data/operations/leads";

export type OperationRole =
  | "Vendedor"
  | "Gerente"
  | "Administrador"
  | "Contador"
  | "Cajero"
  | "Marketing"
  | "Soporte Técnico";

export type OperationBranchId = DesiredBranchId | "all";

export type DemoSession = {
  role: OperationRole;
  userId: string;
  userName: string;
  branchId: OperationBranchId;
  branchName: string;
};

export type InternalUser = DemoSession;
