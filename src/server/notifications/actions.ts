"use server";

import { getCurrentUserSession } from "@/server/auth/context";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  hrefForNotification,
  userNotificationKindLabels,
  type UserNotificationDTO,
  type UserNotificationKindValue,
} from "@/server/notifications/shared";

/**
 * Patch CRM-AUD2 — lo que la campana consulta.
 *
 * ## El aislamiento es estructural
 *
 * **Ninguna función de este archivo acepta un identificador de usuario.** Todas
 * resuelven el destinatario desde la sesión firmada. Por construcción no existe
 * el parámetro con el que un empleado pediría los avisos de otro, ni el que le
 * dejaría marcar como leído algo ajeno.
 *
 * ## La entrega es por consulta periódica, no por empuje
 *
 * Es la misma decisión, por la misma razón, que el portal del cliente: este
 * repositorio no tiene intermediario de mensajes, ni Redis, ni proceso
 * permanente, y su despliegue no garantiza una sola instancia. Un canal SSE
 * sostenido en la memoria de un proceso **no vería** el aviso escrito por otra
 * instancia — parecería tiempo real y fallaría justo cuando importa.
 *
 * La consulta lee PostgreSQL, que todas las instancias ven. **No es tiempo
 * real y no se llama así**: es un sondeo de 45 segundos.
 */

const POLL_LIMIT = 20;

export type MyNotificationsResult = {
  notifications: UserNotificationDTO[];
  unread: number;
};

export async function getMyNotificationsAction(): Promise<MyNotificationsResult> {
  const empty: MyNotificationsResult = { notifications: [], unread: 0 };
  if (!isDatabaseConfigured()) return empty;

  const session = await getCurrentUserSession();
  if (!session) return empty;

  const prisma = getPrisma();
  const [rows, unread] = await Promise.all([
    prisma.userNotification.findMany({
      where: { userId: session.uid },
      // El código de seguimiento se pide prestado al lead para derivar el
      // enlace: el aviso no duplica el dato de negocio.
      include: { lead: { select: { trackingCode: true } } },
      orderBy: { createdAt: "desc" },
      take: POLL_LIMIT,
    }),
    prisma.userNotification.count({
      where: { userId: session.uid, readAt: null },
    }),
  ]);

  return {
    unread,
    notifications: rows.map((row) => {
      const kind = row.kind as UserNotificationKindValue;
      return {
        id: row.id,
        kind,
        kindLabel: userNotificationKindLabels[kind] ?? row.kind,
        title: row.title,
        body: row.body,
        href: hrefForNotification({
          kind,
          customerId: row.customerId,
          leadTrackingCode: row.lead?.trackingCode ?? null,
        }),
        readAt: row.readAt ? row.readAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      };
    }),
  };
}

/**
 * Marca uno o todos como leídos.
 *
 * `updateMany` con `userId` en el `where` es lo que hace imposible marcar el
 * aviso de otro: un identificador ajeno simplemente no encuentra fila. No hace
 * falta comprobar antes y actuar después — la comprobación ES la escritura.
 */
export async function markNotificationsReadAction(input: {
  notificationId?: string | null;
}): Promise<{ ok: boolean }> {
  if (!isDatabaseConfigured()) return { ok: false };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false };

  await getPrisma().userNotification.updateMany({
    where: {
      userId: session.uid,
      readAt: null,
      ...(input.notificationId ? { id: input.notificationId } : {}),
    },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
