"use server";

import { cookies } from "next/headers";

import { getDefaultRouteForSession } from "@/data/operations/users";
import type { DemoSession } from "@/features/operations/types";
import { toDemoSession } from "@/server/auth/roles";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  createSessionToken,
} from "@/server/auth/session";
import { authenticate } from "@/server/auth/user-store";

export type LoginResult =
  | { ok: true; session: DemoSession; redirectTo: string }
  | { ok: false; error: string };

export async function loginAction(input: {
  email: string;
  password: string;
}): Promise<LoginResult> {
  const email = (input.email ?? "").trim();
  const password = input.password ?? "";

  if (!email || !password) {
    return { ok: false, error: "Ingresa tu correo y contraseña." };
  }

  let user;
  try {
    user = await authenticate(email, password);
  } catch {
    return {
      ok: false,
      error:
        "No se pudo validar el acceso. Revisa la conexión a la base de datos.",
    };
  }

  if (!user) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  const session = toDemoSession({
    userId: user.id,
    name: user.name,
    role: user.role,
    branchCode: user.branchCode,
  });

  const token = await createSessionToken({
    uid: user.id,
    email: user.email,
    name: user.name,
    role: session.role,
    roleEnum: user.role,
    branchId: session.branchId,
    branchName: session.branchName,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return {
    ok: true,
    session,
    redirectTo: getDefaultRouteForSession(session),
  };
}

export async function logoutAction(): Promise<{ ok: true }> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  return { ok: true };
}
