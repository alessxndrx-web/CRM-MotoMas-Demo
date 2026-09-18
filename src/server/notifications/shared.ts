/**
 * Patch CRM-AUD2 — tipos, etiquetas y rutas de los avisos a empleados.
 *
 * Puro y sin base de datos, como el resto de los `shared.ts` del repositorio:
 * la campana es un componente de cliente y necesita las etiquetas sin arrastrar
 * Prisma al navegador.
 */

export type UserNotificationKindValue =
  | "LEAD_ASIGNADO"
  | "CLIENTE_ASIGNADO"
  | "COMPROBANTE_POR_REVISAR"
  | "COMPROBANTE_REVISADO"
  | "PAGO_CONFIRMADO";

export const userNotificationKindLabels: Record<
  UserNotificationKindValue,
  string
> = {
  LEAD_ASIGNADO: "Lead asignado",
  CLIENTE_ASIGNADO: "Cliente asignado",
  COMPROBANTE_POR_REVISAR: "Comprobante por revisar",
  COMPROBANTE_REVISADO: "Comprobante revisado",
  PAGO_CONFIRMADO: "Pago confirmado",
};

/**
 * Los motivos que piden una acción del destinatario, no sólo enterarse.
 *
 * La campana los destaca porque no es lo mismo «te asignaron un lead» —trabajo
 * nuevo que puedes planificar— que «hay un comprobante reteniendo una moto
 * mientras nadie lo mira».
 */
export const actionableNotificationKinds: UserNotificationKindValue[] = [
  "COMPROBANTE_POR_REVISAR",
];

export type UserNotificationDTO = {
  id: string;
  kind: UserNotificationKindValue;
  kindLabel: string;
  title: string;
  body: string;
  /** Derivada, nunca almacenada. Ver {@link hrefForNotification}. */
  href: string;
  readAt: string | null;
  createdAt: string;
};

/**
 * A dónde lleva un aviso.
 *
 * **Se deriva al leer y no se guarda en la fila.** Una URL almacenada envejece
 * mal: renombrar una ruta dejaría enlaces rotos en filas que nadie va a volver a
 * tocar, y no hay forma de migrarlas sin adivinar. Derivar cuesta una función
 * pura y deja el rastro siempre válido.
 *
 * `trackingCode` llega de la relación con el lead, que la consulta ya trae: el
 * aviso no duplica el dato de negocio, lo pide prestado al abrirlo.
 */
export function hrefForNotification(input: {
  kind: UserNotificationKindValue;
  customerId: string | null;
  leadTrackingCode: string | null;
}): string {
  switch (input.kind) {
    case "CLIENTE_ASIGNADO":
      // La ficha del cliente, que CRM-AUD2 estrena.
      return input.customerId ? `/panel/clientes/${input.customerId}` : "/panel/clientes";
    case "LEAD_ASIGNADO":
      // No hay ruta de detalle de lead: la ficha se abre desde la lista. El
      // buscador de CRM-AUD1 la deja en una sola fila.
      return input.leadTrackingCode
        ? `/panel/leads?q=${encodeURIComponent(input.leadTrackingCode)}`
        : "/panel/leads";
    case "COMPROBANTE_POR_REVISAR":
    case "COMPROBANTE_REVISADO":
    case "PAGO_CONFIRMADO":
      return "/panel/reservas";
  }
}

/** Cuánto hace, en palabras. La campana no necesita una fecha completa. */
export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(iso).getTime()) / 60000),
  );
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}
