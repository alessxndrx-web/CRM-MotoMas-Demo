"use server";

import { revalidatePath } from "next/cache";

import { canManageUsers } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { hashPassword } from "@/server/auth/password";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { normalizePosUsername } from "@/server/pos/auth";

/**
 * Patch POS2.4 — administración de credenciales de mostrador.
 *
 * ## Quién administra
 *
 * `canManageUsers`, el predicado que el repositorio **ya** usa para crear y
 * desactivar usuarios. Crear una credencial de POS es exactamente eso: dar
 * acceso a alguien. No se inventa un permiso nuevo, y deliberadamente **no** es
 * `canOperateCaja` — quien cobra no reparte credenciales.
 *
 * ## Lo que nunca sale de aquí
 *
 * Ninguna respuesta contiene el hash. La contraseña se devuelve **una sola vez**,
 * en el momento de crearla o restablecerla, porque quien la crea tiene que poder
 * dictársela al operador; después no hay forma de recuperarla, solo de
 * sustituirla.
 *
 * ## Por qué se exige un usuario interno
 *
 * `PosOperator.userId` no autentica nada: existe porque las claves foráneas de
 * auditoría de POS1.x —`cashierId`, `createdByUserId`— apuntan a `User` y son
 * inmutables. Cambiarlas habría sido reescribir el historial de ventas y
 * movimientos, que es precisamente lo que un ERP no debe hacer.
 */

const NO_DB = "La base de datos no está configurada.";
const NO_PERMISSION = "Tu rol no puede administrar credenciales de mostrador.";
/** Suficiente para que no se adivine, corta para que se pueda dictar. */
const GENERATED_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_LENGTH = 8;

export type PosOperatorResult =
  | { ok: true }
  | { ok: false; error: string };

export type PosOperatorSecretResult =
  | { ok: true; username: string; password: string }
  | { ok: false; error: string };

async function authorizeOperatorAdmin() {
  if (!isDatabaseConfigured()) return { ok: false as const, error: NO_DB };
  const session = await requireAuth();
  if (!canManageUsers(session.roleEnum)) {
    return { ok: false as const, error: NO_PERMISSION };
  }
  return { ok: true as const, userId: session.uid };
}

/**
 * Contraseña generada por el servidor.
 *
 * **No se acepta una escrita a mano en el formulario de creación**: el hueco
 * habitual por donde entran las contraseñas de tres letras. Quien la crea la lee
 * una vez y se la dicta al operador, que puede cambiarla después.
 *
 * Alfabeto sin caracteres que se confundan al dictarlos (`0/O`, `1/l/I`).
 */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(GENERATED_PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function validateUsername(value: string): string | null {
  const username = normalizePosUsername(value);
  if (username.length < 3) return null;
  if (!/^[a-z0-9._-]+$/.test(username)) return null;
  return username;
}

export async function createPosOperatorAction(input: {
  username: string;
  /** Usuario interno al que se atribuyen las ventas. No autentica el POS. */
  auditUserId: string;
  branchCode: string;
}): Promise<PosOperatorSecretResult> {
  const auth = await authorizeOperatorAdmin();
  if (!auth.ok) return auth;

  const username = validateUsername(input.username);
  if (!username) {
    return {
      ok: false,
      error: "El usuario debe tener al menos 3 caracteres: letras, números, punto, guion o guion bajo.",
    };
  }

  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({
    where: { code: input.branchCode },
    select: { id: true },
  });
  if (!branch) return { ok: false, error: "La sucursal no existe." };

  const auditUser = await prisma.user.findUnique({
    where: { id: input.auditUserId },
    select: { id: true, isActive: true },
  });
  if (!auditUser || !auditUser.isActive) {
    return { ok: false, error: "El usuario interno de auditoría no existe o está inactivo." };
  }

  const password = generatePassword();
  try {
    await prisma.posOperator.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        userId: auditUser.id,
        branchId: branch.id,
      },
    });
  } catch {
    // Los dos únicos choques posibles son los índices únicos; no se distingue
    // cuál para no confirmar qué usuarios internos ya tienen credencial.
    return {
      ok: false,
      error: "Ese usuario ya existe, o el usuario interno ya tiene credenciales.",
    };
  }

  revalidatePath("/panel/configuracion");
  // La contraseña viaja **una vez**. No se guarda en claro y no se puede volver
  // a consultar.
  return { ok: true, username, password };
}

/**
 * Restablece la contraseña y **corta las sesiones abiertas** de ese operador
 * rotando `sessionVersion`: cambiar la clave sin invalidar la sesión dejaría
 * dentro a quien ya estaba.
 */
export async function resetPosOperatorPasswordAction(input: {
  operatorId: string;
}): Promise<PosOperatorSecretResult> {
  const auth = await authorizeOperatorAdmin();
  if (!auth.ok) return auth;

  const prisma = getPrisma();
  const operator = await prisma.posOperator.findUnique({
    where: { id: input.operatorId },
    select: { id: true, username: true },
  });
  if (!operator) return { ok: false, error: "El operador no existe." };

  const password = generatePassword();
  await prisma.posOperator.update({
    where: { id: operator.id },
    data: {
      passwordHash: hashPassword(password),
      sessionVersion: { increment: 1 },
    },
  });

  revalidatePath("/panel/configuracion");
  return { ok: true, username: operator.username, password };
}

/**
 * Activa o desactiva. Desactivar **también** rota la sesión: si no, el operador
 * seguiría cobrando hasta que su cookie caducara.
 */
export async function setPosOperatorActiveAction(input: {
  operatorId: string;
  isActive: boolean;
}): Promise<PosOperatorResult> {
  const auth = await authorizeOperatorAdmin();
  if (!auth.ok) return auth;

  const updated = await getPrisma().posOperator.updateMany({
    where: { id: input.operatorId },
    data: input.isActive
      ? { isActive: true }
      : { isActive: false, sessionVersion: { increment: 1 } },
  });
  if (updated.count !== 1) return { ok: false, error: "El operador no existe." };

  revalidatePath("/panel/configuracion");
  return { ok: true };
}

export { MIN_PASSWORD_LENGTH };
