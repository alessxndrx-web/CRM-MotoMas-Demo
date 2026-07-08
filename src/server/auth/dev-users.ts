import { getInternalUserById } from "@/data/operations/users";
import { spanishToRoleEnum } from "@/server/auth/roles";
import type { AuthenticatedUser } from "@/server/auth/user-store";

/**
 * Development login fallback used only outside production and only when
 * DATABASE_URL is not configured.
 *
 * Each dev account maps to an existing internal demo identity so that the
 * localStorage demo data (leads, activities, etc.) still shows up after login.
 * With a real database configured, or in NODE_ENV=production, these accounts
 * are ignored and users come from the `users` table instead.
 *
 * Documented development password (see ROLES.md). Change before production.
 */
export const DEV_LOGIN_PASSWORD = "Motomas.2026";

const devAccountByEmail: Record<string, string> = {
  "admin@motomas.local": "admin-general",
  "gerente@motomas.local": "manager-central",
  "vendedor@motomas.local": "seller-roberto",
  "cajero@motomas.local": "cashier-central",
  "contador@motomas.local": "accountant-general",
};

function toAuthenticatedUser(
  email: string,
  demoUserId: string,
): AuthenticatedUser | null {
  const demo = getInternalUserById(demoUserId);
  if (!demo) return null;
  return {
    id: demo.userId,
    name: demo.userName,
    email,
    role: spanishToRoleEnum[demo.role],
    branchCode: demo.branchId === "all" ? null : demo.branchId,
    isActive: true,
  };
}

export function listDevUsers(): AuthenticatedUser[] {
  return Object.entries(devAccountByEmail)
    .map(([email, demoUserId]) => toAuthenticatedUser(email, demoUserId))
    .filter((user): user is AuthenticatedUser => user !== null);
}

export function authenticateDevUser(
  email: string,
  password: string,
): AuthenticatedUser | null {
  const normalizedEmail = email.trim().toLowerCase();
  const demoUserId = devAccountByEmail[normalizedEmail];
  if (!demoUserId) return null;
  if (password !== DEV_LOGIN_PASSWORD) return null;
  return toAuthenticatedUser(normalizedEmail, demoUserId);
}
