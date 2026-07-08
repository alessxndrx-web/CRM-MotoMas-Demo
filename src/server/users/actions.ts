"use server";

import { revalidatePath } from "next/cache";

import {
  canCreateUserInBranch,
  canCreateUserRole,
  canManageUsers,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import type { UserRoleEnum } from "@/server/auth/roles";
import { createUser } from "@/server/auth/user-store";

export type CreateUserActionResult = { ok: true } | { ok: false; error: string };

const globalRoles: UserRoleEnum[] = ["ADMIN", "CONTADOR"];

export async function createUserAction(input: {
  name: string;
  email: string;
  password: string;
  role: UserRoleEnum;
  branchCode: string | null;
  isActive: boolean;
}): Promise<CreateUserActionResult> {
  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: "Sesión no válida." };

  if (!canManageUsers(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para gestionar usuarios." };
  }

  if (!canCreateUserRole(session.roleEnum, input.role)) {
    return {
      ok: false,
      error: "No puedes crear usuarios con ese rol.",
    };
  }

  // Global roles (Admin, Accountant) never carry a branch; others require one.
  const branchCode = globalRoles.includes(input.role) ? null : input.branchCode;
  if (!globalRoles.includes(input.role) && !branchCode) {
    return { ok: false, error: "Selecciona una sucursal para este rol." };
  }

  if (!canCreateUserInBranch(session.roleEnum, session.branchId === "all" ? null : session.branchId, branchCode)) {
    return {
      ok: false,
      error: "No puedes crear usuarios para esa sucursal.",
    };
  }

  const result = await createUser(
    {
      name: input.name,
      email: input.email,
      password: input.password,
      role: input.role,
      branchCode,
      isActive: input.isActive,
    },
    session.uid,
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/panel/configuracion");
  return { ok: true };
}
