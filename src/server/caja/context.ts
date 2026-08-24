import {
  canAccessCaja,
  canOperateCaja,
  canReviewCaja,
  getCajaScopeForUser,
  type CajaScope,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import { listCashDocuments } from "@/server/caja/queries";
import type {
  CashDocumentDTO,
  CashDocumentTypeValue,
} from "@/server/caja/shared";
import { isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Single place where the Caja routes resolve who is reading and how far they
 * see. `enabled` is the only gate the pages need: it is false whenever the
 * database is absent, the role has no Caja access, or the session lacks the
 * branch context a non-global role requires.
 */

export type CajaPageContext = {
  branchCode: string | null;
  canAccess: boolean;
  canOperate: boolean;
  canReview: boolean;
  dbConfigured: boolean;
  enabled: boolean;
  isGlobal: boolean;
  role: UserRoleEnum;
  scope: CajaScope;
  scopeLabel: string;
  /** Manager and Admin read Caja as supervisors; the Cashier operates it. */
  supervision: boolean;
  userId: string;
};

export async function getCajaPageContext(): Promise<CajaPageContext> {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const scope = getCajaScopeForUser(session.roleEnum, branchCode, session.uid);
  const canAccess = canAccessCaja(session.roleEnum);

  return {
    branchCode,
    canAccess,
    canOperate: canOperateCaja(session.roleEnum),
    canReview: canReviewCaja(session.roleEnum),
    dbConfigured,
    enabled: dbConfigured && canAccess && scope.level !== "none",
    isGlobal: scope.level === "global",
    role: session.roleEnum,
    scope,
    scopeLabel:
      session.roleEnum === "ADMIN"
        ? "Vista global"
        : session.roleEnum === "GERENTE"
          ? session.branchName
          : "Mi turno",
    supervision: session.roleEnum !== "CAJERO",
    userId: session.uid,
  };
}

/**
 * Notas cover two document types, so a section may need more than one scoped
 * list. Each call is scoped on its own; the merge is presentation ordering.
 */
export async function listCashDocumentsForTypes(
  scope: CajaScope,
  types: CashDocumentTypeValue[],
): Promise<CashDocumentDTO[]> {
  const lists = await Promise.all(
    types.map((type) => listCashDocuments(scope, { type })),
  );
  return lists
    .flat()
    .sort((left, right) => right.issuedAt.localeCompare(left.issuedAt));
}
