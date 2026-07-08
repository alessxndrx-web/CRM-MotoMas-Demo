import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionPayload,
} from "@/server/auth/session";
import type { UserRoleEnum } from "@/server/auth/roles";

/**
 * Server-only helpers to read and enforce the authenticated session from the
 * signed cookie. Authorization decisions use the pure predicates in access.ts.
 */

export async function getCurrentUserSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function requireAuth(): Promise<SessionPayload> {
  const session = await getCurrentUserSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(
  roles: UserRoleEnum[],
): Promise<SessionPayload> {
  const session = await requireAuth();
  if (!roles.includes(session.roleEnum)) {
    redirect("/panel");
  }
  return session;
}
