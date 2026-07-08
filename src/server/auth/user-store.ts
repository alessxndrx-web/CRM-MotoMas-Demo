import {
  DatabaseNotConfiguredError,
  getPrisma,
  isDatabaseConfigured,
} from "@/server/db/prisma";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import type { UserRoleEnum } from "@/server/auth/roles";
import {
  authenticateDevUser,
  listDevUsers,
} from "@/server/auth/dev-users";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRoleEnum;
  branchCode: string | null;
  isActive: boolean;
};

export function isDevFallbackEnabled() {
  return !isDatabaseConfigured() && process.env.AUTH_DEV_FALLBACK !== "false";
}

/** Human-facing note about where users currently come from. */
export function authSourceLabel(): "database" | "dev-fallback" | "disabled" {
  if (isDatabaseConfigured()) return "database";
  if (isDevFallbackEnabled()) return "dev-fallback";
  return "disabled";
}

export async function authenticate(
  email: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const normalizedEmail = email.trim().toLowerCase();

  if (isDatabaseConfigured()) {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { branch: true },
    });
    if (!user || !user.isActive) return null;
    if (!verifyPassword(password, user.passwordHash)) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRoleEnum,
      branchCode: user.branch?.code ?? null,
      isActive: user.isActive,
    };
  }

  if (isDevFallbackEnabled()) {
    return authenticateDevUser(normalizedEmail, password);
  }

  return null;
}

export async function listUsers(options?: {
  branchCode?: string | null;
}): Promise<AuthenticatedUser[]> {
  if (isDatabaseConfigured()) {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      include: { branch: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    const mapped: AuthenticatedUser[] = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as UserRoleEnum,
      branchCode: user.branch?.code ?? null,
      isActive: user.isActive,
    }));
    if (options?.branchCode) {
      return mapped.filter((user) => user.branchCode === options.branchCode);
    }
    return mapped;
  }

  if (isDevFallbackEnabled()) {
    const users = listDevUsers();
    if (options?.branchCode) {
      return users.filter((user) => user.branchCode === options.branchCode);
    }
    return users;
  }

  return [];
}

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRoleEnum;
  branchCode: string | null;
  isActive: boolean;
};

export type CreateUserResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; error: string };

export async function createUser(
  input: CreateUserInput,
  actorUserId: string,
): Promise<CreateUserResult> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error:
        "La creación de usuarios requiere una base de datos configurada (DATABASE_URL). En modo demo los usuarios son de solo lectura.",
    };
  }

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "El correo no tiene un formato válido." };
  }
  if (input.password.length < 8) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  }

  try {
    const prisma = getPrisma();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: "Ya existe un usuario con ese correo." };
    }

    let branchId: string | null = null;
    if (input.branchCode) {
      const branch = await prisma.branch.findUnique({
        where: { code: input.branchCode },
      });
      if (!branch) {
        return { ok: false, error: "La sucursal seleccionada no existe." };
      }
      branchId = branch.id;
    }

    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: hashPassword(input.password),
        role: input.role,
        branchId,
        isActive: input.isActive,
      },
      include: { branch: true },
    });

    await prisma.userAuditLog.create({
      data: {
        actorUserId,
        action: "USER_CREATED",
        targetType: "User",
        targetId: created.id,
        description: `Creó al usuario ${created.email} con rol ${created.role}.`,
      },
    });

    return {
      ok: true,
      user: {
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role as UserRoleEnum,
        branchCode: created.branch?.code ?? null,
        isActive: created.isActive,
      },
    };
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "No se pudo crear el usuario. Revisa la conexión a la base de datos.",
    };
  }
}
