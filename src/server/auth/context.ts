import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionPayload,
} from "@/server/auth/session";
import {
  GLOBAL_BRANCH_ID,
  toDemoSession,
  type UserRoleEnum,
} from "@/server/auth/roles";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Server-only helpers to read and enforce the authenticated session from the
 * signed cookie. Authorization decisions use the pure predicates in access.ts.
 *
 * ## Patch CRM-AUD1 — la sesión se revalida contra la base
 *
 * El testigo es firmado y autocontenido, así que hasta este parche **su
 * contenido era la última palabra durante ocho horas**. Dos consecuencias, las
 * dos comprobadas leyendo el flujo:
 *
 * 1. **Desactivar a un usuario no cerraba su sesión.** `authenticate()` mira
 *    `isActive` al entrar; después nadie lo vuelve a mirar. Alguien dado de baja
 *    seguía operando el CRM hasta que su testigo caducaba.
 * 2. **Cambiar el rol no surtía efecto hasta un nuevo inicio de sesión.** El
 *    `roleEnum` viajaba congelado dentro del testigo, así que promover a un
 *    vendedor a Líder de ventas —o retirarle el permiso— no cambiaba nada
 *    mientras su pestaña siguiera abierta.
 *
 * El segundo importa especialmente ahora: la puesta en marcha de CRM-QA1 consiste
 * precisamente en promover vendedores a Líder de ventas.
 *
 * **[R] Se consulta la fila del usuario en cada petición autenticada.** Es un
 * `findUnique` por clave primaria contra una tabla pequeña, en pantallas que ya
 * hacen varias consultas; el coste es despreciable frente a que la autorización
 * sea cierta. El POS resolvió lo mismo con `PosOperator.sessionVersion`, que es
 * una consulta equivalente.
 *
 * **[D] No se toca el testigo.** Sigue firmado, sigue siendo `httpOnly` y sigue
 * caducando solo. Lo que cambia es que deja de ser la autoridad sobre el rol y
 * el estado de alta: pasa a ser la prueba de identidad, y la autoridad es la
 * base. Sin base configurada —el arranque en desarrollo— el testigo manda, como
 * antes, porque no hay nada contra lo que contrastarlo.
 */

export async function getCurrentUserSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  if (!isDatabaseConfigured()) return payload;

  try {
    const user = await getPrisma().user.findUnique({
      where: { id: payload.uid },
      select: {
        name: true,
        email: true,
        role: true,
        isActive: true,
        branch: { select: { code: true, name: true } },
      },
    });

    // Usuario borrado o dado de baja: la sesión deja de existir ya, no en ocho
    // horas. Devolver `null` hace que `requireAuth` lo mande al login, que es
    // exactamente lo que le pasaría si no tuviera testigo.
    if (!user || !user.isActive) return null;

    const refreshed = toDemoSession({
      userId: payload.uid,
      name: user.name,
      role: user.role as UserRoleEnum,
      branchCode: user.branch?.code ?? null,
    });

    return {
      ...payload,
      email: user.email,
      name: user.name,
      role: refreshed.role,
      roleEnum: user.role as UserRoleEnum,
      branchId: refreshed.branchId,
      // Patch CRM-INT1. El nombre sale de la fila, no de la lista fija de
      // `desiredBranches`: una sucursal creada o renombrada desde Configuración
      // se veía con su código crudo en la cabecera de todo el panel.
      branchName:
        user.branch && refreshed.branchId !== GLOBAL_BRANCH_ID
          ? user.branch.name
          : refreshed.branchName,
    };
  } catch {
    // Un fallo de base no debe convertirse en una elevación de privilegios ni en
    // un cierre de sesión masivo: se conserva lo que el testigo firmado dice,
    // que es lo que regía antes de este parche.
    return payload;
  }
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
