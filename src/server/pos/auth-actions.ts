"use server";

import { cookies } from "next/headers";

import {
  createPosSessionToken,
  POS_SESSION_COOKIE_NAME,
  POS_SESSION_TTL_SECONDS,
} from "@/server/auth/session";
import {
  authenticatePosOperator,
  getCurrentPosSession,
} from "@/server/pos/auth";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

export type PosLoginResult =
  | { ok: true; redirectTo: "/pos/venta" }
  | { ok: false; error: string };

const GENERIC_LOGIN_ERROR = "Usuario o contraseña incorrectos.";

/** Dedicated POS login. It never reads or issues the administrative cookie. */
export async function loginPosAction(input: {
  username: string;
  password: string;
}): Promise<PosLoginResult> {
  let operator;
  try {
    operator = await authenticatePosOperator(input.username ?? "", input.password ?? "");
  } catch {
    // Keep username existence, account state and database failures indistinct.
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (!operator) return { ok: false, error: GENERIC_LOGIN_ERROR };

  const token = await createPosSessionToken({
    operatorId: operator.operatorId,
    auditUserId: operator.userId,
    username: operator.username,
    branchId: operator.branchId,
    branchCode: operator.branchCode,
    branchName: operator.branchName,
    sessionVersion: operator.sessionVersion,
  });

  const store = await cookies();
  store.set(POS_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: POS_SESSION_TTL_SECONDS,
  });

  return { ok: true, redirectTo: "/pos/venta" };
}

/**
 * Deletes the browser cookie and rotates the persisted session version. The
 * latter makes a copied cookie unusable on the next server-side validation.
 */
export async function logoutPosAction(): Promise<{ ok: true }> {
  const session = await getCurrentPosSession();
  const store = await cookies();
  store.delete(POS_SESSION_COOKIE_NAME);

  if (session && isDatabaseConfigured()) {
    await getPrisma().posOperator.updateMany({
      where: { id: session.operatorId, sessionVersion: session.sessionVersion },
      data: { sessionVersion: { increment: 1 } },
    });
  }

  return { ok: true };
}
