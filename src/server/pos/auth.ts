import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifyPassword } from "@/server/auth/password";
import {
  POS_SESSION_COOKIE_NAME,
  verifyPosSessionToken,
} from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Server-resolved POS identity. It is deliberately not a `User` session:
 * `userId` is used only for existing immutable audit foreign keys; neither its
 * administrative password nor its role participates in POS authorization.
 */
export type PosOperatorSession = {
  operatorId: string;
  userId: string;
  username: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  canManagePurchases: boolean;
  sessionVersion: number;
};

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolves the signed POS cookie against the database every time. This makes
 * password resets, disabling an operator and POS logout invalidation effective
 * immediately instead of trusting a signed payload until its natural expiry.
 */
export async function getCurrentPosSession(): Promise<PosOperatorSession | null> {
  if (!isDatabaseConfigured()) return null;

  const store = await cookies();
  const payload = await verifyPosSessionToken(
    store.get(POS_SESSION_COOKIE_NAME)?.value,
  );
  if (!payload) return null;

  const operator = await getPrisma().posOperator.findUnique({
    where: { id: payload.operatorId },
    select: {
      id: true,
      username: true,
      userId: true,
      isActive: true,
      canManagePurchases: true,
      sessionVersion: true,
      branch: { select: { id: true, code: true, name: true, isActive: true } },
      auditUser: { select: { isActive: true } },
    },
  });

  if (
    !operator ||
    !operator.isActive ||
    !operator.auditUser.isActive ||
    !operator.branch.isActive ||
    operator.userId !== payload.auditUserId ||
    operator.username !== payload.username ||
    operator.branch.id !== payload.branchId ||
    operator.branch.code !== payload.branchCode ||
    operator.sessionVersion !== payload.sessionVersion
  ) {
    return null;
  }

  return {
    operatorId: operator.id,
    userId: operator.userId,
    username: operator.username,
    branchId: operator.branch.id,
    branchCode: operator.branch.code,
    branchName: operator.branch.name,
    canManagePurchases: operator.canManagePurchases,
    sessionVersion: operator.sessionVersion,
  };
}

export async function requirePosSession(): Promise<PosOperatorSession> {
  const session = await getCurrentPosSession();
  if (!session) redirect("/pos/login");
  return session;
}

/** Returns no credential details so callers can preserve a generic login error. */
export async function authenticatePosOperator(
  username: string,
  password: string,
): Promise<PosOperatorSession | null> {
  if (!isDatabaseConfigured()) return null;

  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || !password) return null;

  const operator = await getPrisma().posOperator.findUnique({
    where: { username: normalizedUsername },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      userId: true,
      isActive: true,
      canManagePurchases: true,
      sessionVersion: true,
      branch: { select: { id: true, code: true, name: true, isActive: true } },
      auditUser: { select: { isActive: true } },
    },
  });

  if (
    !operator ||
    !operator.isActive ||
    !operator.auditUser.isActive ||
    !operator.branch.isActive ||
    !verifyPassword(password, operator.passwordHash)
  ) {
    return null;
  }

  return {
    operatorId: operator.id,
    userId: operator.userId,
    username: operator.username,
    branchId: operator.branch.id,
    branchCode: operator.branch.code,
    branchName: operator.branch.name,
    canManagePurchases: operator.canManagePurchases,
    sessionVersion: operator.sessionVersion,
  };
}

export function normalizePosUsername(value: string): string {
  return normalizeUsername(value);
}
