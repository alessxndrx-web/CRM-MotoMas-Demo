import type { Prisma } from "@prisma/client";

import { canReviewReservationPaymentProofs } from "@/server/auth/access";
import type { UserRoleEnum } from "@/server/auth/roles";
import type { UserNotificationKindValue } from "@/server/notifications/shared";

/**
 * Patch CRM-AUD2 — escribir avisos a empleados.
 *
 * ## Siempre dentro de la transacción del hecho
 *
 * Igual que `notify` del lado del cliente: un aviso que sobreviviera a un
 * `rollback` estaría diciéndole a alguien que trabaje sobre algo que no pasó.
 * Por eso todas las funciones reciben el `tx`, no el cliente de Prisma.
 *
 * ## Nunca al actor
 *
 * Quien ejecuta la acción no recibe su propio aviso. Un líder que sube el
 * comprobante de su propia reserva no necesita que le digan que hay un
 * comprobante esperando su revisión; ya lo sabe, acaba de subirlo.
 */

type Recipients = string[];

/** Escribe un aviso por destinatario, saltándose al actor. */
export async function notifyUsers(
  tx: Prisma.TransactionClient,
  input: {
    userIds: Recipients;
    /** Se excluye del reparto: nadie se avisa a sí mismo. */
    exceptUserId?: string | null;
    kind: UserNotificationKindValue;
    title: string;
    body: string;
    leadId?: string | null;
    customerId?: string | null;
    reservationId?: string | null;
    paymentRequestId?: string | null;
  },
): Promise<void> {
  const targets = [...new Set(input.userIds)].filter(
    (id) => id && id !== input.exceptUserId,
  );
  if (targets.length === 0) return;

  await tx.userNotification.createMany({
    data: targets.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      leadId: input.leadId ?? null,
      customerId: input.customerId ?? null,
      reservationId: input.reservationId ?? null,
      paymentRequestId: input.paymentRequestId ?? null,
    })),
  });
}

/**
 * Quién debe revisar los comprobantes de una sucursal.
 *
 * **Se pregunta al predicado, no se enumeran roles.** `access.ts` es quien sabe
 * qué roles revisan comprobantes; repetir la lista aquí es exactamente la
 * duplicación que CRM-AUD1 encontró tres veces y que hace que un rol nuevo se
 * comporte bien en un sitio y mal en otro.
 *
 * **[D] Se acota a la sucursal de la reserva, no se avisa a los ADMIN.** Un
 * administrador es global: avisarle de cada comprobante de las doce sucursales
 * convertiría la campana en ruido y dejaría de leerla. El administrador tiene la
 * alerta de Inicio, que es un resumen y no un aviso por hecho.
 */
export async function resolveProofReviewers(
  tx: Prisma.TransactionClient,
  branchId: string,
): Promise<Recipients> {
  const candidates = await tx.user.findMany({
    where: { branchId, isActive: true },
    select: { id: true, role: true },
  });
  return candidates
    .filter((user) => canReviewReservationPaymentProofs(user.role as UserRoleEnum))
    .map((user) => user.id);
}
