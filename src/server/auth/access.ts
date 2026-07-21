import { desiredBranches } from "@/data/operations/leads";
import { userRoleEnums, type UserRoleEnum } from "@/server/auth/roles";

/**
 * Pure authorization predicates shared by server (enforcement) and client
 * (UI gating). These never read cookies or the database — pass the role/branch
 * already resolved from the session.
 *
 * Patch 4.0C activates MARKETING only for the dedicated Marketing predicates.
 * It remains excluded from every commercial, inventory, finance and user
 * management allow-list. SOPORTE_TECNICO remains fully scaffolded/inactive.
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
  if (isGlobalScopeRole(role)) {
    return { global: true, branchCode: null };
  }
  // Missing branch context must fail closed for every non-global role. The
  // empty code cannot resolve to a real branch and never widens to global.
  return { global: false, branchCode: branchCode ?? "" };
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

/**
 * Commercial activities / follow-ups (Patch 3.3C.1). An activity always hangs
 * off the commercial flow (a lead, a customer or an expediente), so it follows
 * CRM access exactly: Admin, Manager and Seller operate it; Cashier and
 * Accountant are blocked outright, with no read-only exception.
 */
export function canOperateActivities(role: UserRoleEnum): boolean {
  return canOperateCrm(role);
}

/**
 * Activity visibility scope. Same shape/semantics as {@link CrmScope}: global
 * (Admin) / branch (Manager) / personal (Seller sees only activities assigned to
 * them or hanging off an expediente/lead they own).
 */
export function getActivityScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
  userId: string,
): CrmScope {
  return getCrmScopeForUser(role, branchCode, userId);
}

/**
 * Caja access (Patch 3.4B). Admin supervises globally, Manager supervises their
 * branch and Cashier operates their own branch/sessions. Seller and Accountant
 * do not enter the operational Caja layer; accounting review remains isolated
 * in Contabilidad until that module is migrated explicitly.
 */
export function canAccessCaja(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE" || role === "CAJERO";
}

/** Cashier operates Caja; Admin retains explicit operational fallback. */
export function canOperateCaja(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "CAJERO";
}

/** Caja closing review is supervision, never a Cashier action. */
export function canReviewCaja(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

export type CajaScope =
  | { level: "global" }
  | { level: "branch"; branchCode: string }
  | { level: "cashier"; branchCode: string; userId: string }
  | { level: "none" };

/**
 * Safe Caja scope. Missing branch context and blocked roles resolve to `none`
 * rather than accidentally widening to global access.
 */
export function getCajaScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
  userId: string,
): CajaScope {
  if (role === "ADMIN") return { level: "global" };
  if (role === "GERENTE" && branchCode) {
    return { level: "branch", branchCode };
  }
  if (role === "CAJERO" && branchCode) {
    return { level: "cashier", branchCode, userId };
  }
  return { level: "none" };
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

/**
 * Analytics / Dashboard KPIs and commercial Reports (Patch 3.7C.1).
 *
 * The operational Dashboard and Reportes are commercial surfaces, so they follow
 * CRM access: Admin (global), Manager (branch) and Seller (personal) see them,
 * scoped exactly like the CRM. Cashier and Accountant never read commercial
 * analytics — their dashboards stay inside Caja / Contabilidad respectively.
 */
export function canViewCommercialAnalytics(role: UserRoleEnum): boolean {
  return canOperateCrm(role);
}

/** Branch comparison is an Admin-only, cross-branch supervision view. */
export function canViewBranchPerformance(role: UserRoleEnum): boolean {
  return role === "ADMIN";
}

/** Seller ranking is available to Admin (global) and Manager (own branch). */
export function canViewSellerPerformance(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE";
}

/**
 * Analytics visibility scope. Same three-level shape/semantics as
 * {@link CrmScope}: global (Admin) / branch (Manager) / personal (Seller sees
 * only their own commercial data).
 */
export function getAnalyticsScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
  userId: string,
): CrmScope {
  return getCrmScopeForUser(role, branchCode, userId);
}

/**
 * Marketing access. Admin and MARKETING manage campaigns; a Manager reads
 * campaigns scoped to their own branch. Every other role is blocked.
 */
export function canViewMarketing(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "GERENTE" || role === "MARKETING";
}

/** Creating/updating/archiving a campaign is limited to Admin and MARKETING. */
export function canManageMarketing(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "MARKETING";
}

/**
 * Lead-level attribution is a reduced Marketing DTO, never general CRM access.
 * Managers keep aggregate campaign metrics but do not receive lead-level rows.
 */
export function canViewLeadAttribution(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "MARKETING";
}

export type MarketingScope =
  | { level: "global" }
  /** Manager: own-branch and company-wide (untargeted) campaigns only. */
  | { level: "branch"; branchCode: string }
  | { level: "none" };

/**
 * Safe Marketing-only scope. MARKETING has cross-branch campaign/attribution
 * scope inside this module, but is not a global business-data role and remains
 * blocked by every CRM/operations/finance predicate. A blocked role, or a
 * Manager without branch context, resolves to `none`.
 */
export function getMarketingScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
): MarketingScope {
  if (role === "ADMIN" || role === "MARKETING") {
    return { level: "global" };
  }
  if (role === "GERENTE" && branchCode) {
    return { level: "branch", branchCode };
  }
  return { level: "none" };
}

/**
 * Contabilidad access (Patch 3.5B), following ROLES.md §12:
 *
 * - Accountant and Admin run the whole accounting centre with global reach.
 * - Manager only *consults* accounting inventory and reports, filtered to their
 *   own branch: "los diarios, comprobantes y documentos globales quedan
 *   reservados para Contador y Administrador".
 * - Cashier and Seller never enter Contabilidad.
 */
export function canAccessContabilidad(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "CONTADOR" || role === "GERENTE";
}

/** Writing anywhere in Contabilidad is an Accountant/Admin act. */
export function canOperateContabilidad(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "CONTADOR";
}

/** Reviewing, posting, reconciling and closing are Accountant/Admin acts. */
export function canReviewContabilidad(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "CONTADOR";
}

/**
 * The accounting ledger proper — chart of accounts, journals, vouchers,
 * documents, expenses, payroll, banks, reconciliations, closings and third
 * parties. Reserved for Accountant and Admin; a Manager never reads it.
 */
export function canViewAccountingLedger(role: UserRoleEnum): boolean {
  return role === "ADMIN" || role === "CONTADOR";
}

/**
 * Valued inventory. ROLES.md is explicit: Accountant and Admin see costs
 * globally, Manager sees costs of their own branch only, Seller and Cashier
 * never. This mirrors {@link canViewCosts} and must stay in sync with it.
 */
export function canViewAccountingCosts(role: UserRoleEnum): boolean {
  return canViewCosts(role);
}

export type ContabilidadScope =
  | { level: "global" }
  /** Manager: read-only, own branch, inventory and report summaries only. */
  | { level: "branchReadOnly"; branchCode: string }
  | { level: "none" };

/**
 * Safe Contabilidad scope. A blocked role, or a Manager without branch context,
 * resolves to `none` rather than widening to global.
 */
export function getContabilidadScopeForUser(
  role: UserRoleEnum,
  branchCode: string | null,
): ContabilidadScope {
  if (role === "ADMIN" || role === "CONTADOR") return { level: "global" };
  if (role === "GERENTE" && branchCode) {
    return { level: "branchReadOnly", branchCode };
  }
  return { level: "none" };
}
