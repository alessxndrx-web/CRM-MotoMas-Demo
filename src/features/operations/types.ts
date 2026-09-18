import type { DesiredBranchId } from "@/data/operations/leads";

export type OperationRole =
  | "Vendedor"
  /**
   * Patch CRM-QA1. Un vendedor con supervision sobre el equipo de su sucursal,
   * no un tipo de empleado aparte: misma tabla `users`, misma sesion firmada,
   * misma sucursal. Lo que anade es asignar, revisar y **reportar la venta**.
   */
  | "Líder de Ventas"
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
