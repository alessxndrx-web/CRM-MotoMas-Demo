import type { MetaWebhookPayload } from "@/server/meta/webhook";
import type { WhatsAppMessageStatusValue } from "@/server/whatsapp/shared";

/**
 * La forma que manda WhatsApp Cloud API por el webhook, verificada contra la
 * documentación vigente de Meta (no de memoria).
 *
 * ## Dos eventos distintos bajo el MISMO nombre de campo
 *
 * Lead Ads llega con `object: "page"` y `field: "leadgen"`. WhatsApp llega con
 * `object: "whatsapp_business_account"` y **`field: "messages"` para las dos
 * cosas**: los mensajes entrantes y las devoluciones de estado de los salientes.
 *
 * Lo que las distingue no es el campo sino qué arreglo trae el `value`:
 *
 *   value.messages[]  → mensajes que escribió el cliente
 *   value.statuses[]  → cambios de estado de lo que enviamos nosotros
 *
 * Una misma entrega puede traer los dos. Ramificar por `field` y quedarse ahí es
 * el error que hace que las devoluciones de estado se pierdan en silencio.
 *
 * Ejemplo real de entrante:
 *
 *   { "object": "whatsapp_business_account",
 *     "entry": [{ "id": "...", "changes": [{ "field": "messages", "value": {
 *       "messaging_product": "whatsapp",
 *       "metadata": { "display_phone_number": "...", "phone_number_id": "..." },
 *       "contacts": [{ "profile": { "name": "..." }, "wa_id": "16505551234" }],
 *       "messages": [{ "from": "16505551234", "id": "wamid...",
 *                      "timestamp": "1749416383", "type": "text",
 *                      "text": { "body": "..." } }] } }] }] }
 *
 * Y de estado, mismo `field`:
 *
 *   "statuses": [{ "id": "wamid...", "status": "delivered",
 *                  "timestamp": "...", "recipient_id": "16505551234" }]
 */

export const WHATSAPP_WEBHOOK_OBJECT = "whatsapp_business_account";
export const WHATSAPP_WEBHOOK_FIELD = "messages";

export type WhatsAppInboundMessage = {
  waMessageId: string;
  from: string;
  /** Sólo `text` produce cuerpo. Otros tipos se registran igual, sin cuerpo. */
  type: string;
  body: string | null;
};

export type WhatsAppStatusUpdate = {
  waMessageId: string;
  status: WhatsAppMessageStatusValue;
  /** El valor crudo de Meta, para poder registrar uno que no conocemos. */
  rawStatus: string;
  recipientId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Traduce el estado de Meta al enumerado del CRM. Devuelve `null` para un valor
 * que no conocemos — Meta puede añadir estados nuevos, y adivinar uno sería peor
 * que registrarlo y no tocar la fila.
 */
export function mapWhatsAppStatus(
  raw: string,
): WhatsAppMessageStatusValue | null {
  switch (raw) {
    case "sent":
      return "ENVIADO";
    case "delivered":
      return "ENTREGADO";
    case "read":
      return "LEIDO";
    case "failed":
      return "FALLIDO";
    default:
      return null;
  }
}

function parseInboundMessage(value: unknown): WhatsAppInboundMessage | null {
  if (!isRecord(value)) return null;
  const waMessageId = str(value.id);
  const from = str(value.from);
  if (!waMessageId || !from) return null;

  const type = str(value.type) ?? "unknown";
  let body: string | null = null;
  if (type === "text" && isRecord(value.text)) {
    body = str(value.text.body);
  }

  return { waMessageId, from, type, body };
}

function parseStatusUpdate(
  value: unknown,
): { parsed: WhatsAppStatusUpdate | null; unknownStatus: string | null } {
  if (!isRecord(value)) return { parsed: null, unknownStatus: null };
  const waMessageId = str(value.id);
  const rawStatus = str(value.status);
  if (!waMessageId || !rawStatus) return { parsed: null, unknownStatus: null };

  const status = mapWhatsAppStatus(rawStatus);
  if (!status) return { parsed: null, unknownStatus: rawStatus };

  return {
    parsed: {
      waMessageId,
      status,
      rawStatus,
      recipientId: str(value.recipient_id),
    },
    unknownStatus: null,
  };
}

export type WhatsAppWebhookEvents = {
  inbound: WhatsAppInboundMessage[];
  statuses: WhatsAppStatusUpdate[];
  /** Formas reconocidas como de WhatsApp pero no procesables. Sólo para el log. */
  ignored: string[];
};

/**
 * Extrae los eventos de WhatsApp de una entrega ya verificada por firma.
 *
 * No toca los cambios `leadgen`: son otro producto y los recoge
 * `collectLeadgenChanges`. Una entrega nunca mezcla los dos objetos, pero el
 * recorrido es independiente de todas formas.
 */
export function collectWhatsAppEvents(
  payload: MetaWebhookPayload,
): WhatsAppWebhookEvents {
  const inbound: WhatsAppInboundMessage[] = [];
  const statuses: WhatsAppStatusUpdate[] = [];
  const ignored: string[] = [];

  if (payload.object !== WHATSAPP_WEBHOOK_OBJECT) {
    return { inbound, statuses, ignored };
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (!change || change.field !== WHATSAPP_WEBHOOK_FIELD) continue;
      if (!isRecord(change.value)) continue;

      const value = change.value;

      if (Array.isArray(value.messages)) {
        for (const raw of value.messages) {
          const message = parseInboundMessage(raw);
          if (message) inbound.push(message);
          else ignored.push("mensaje-malformado");
        }
      }

      if (Array.isArray(value.statuses)) {
        for (const raw of value.statuses) {
          const { parsed, unknownStatus } = parseStatusUpdate(raw);
          if (parsed) statuses.push(parsed);
          else if (unknownStatus) ignored.push(`estado-desconocido:${unknownStatus}`);
          else ignored.push("estado-malformado");
        }
      }

      // `errors` a nivel de value y otras formas (reacciones, etc.) todavía no
      // se procesan. Se registran para que se sepan y la entrega responde 200.
      if (!value.messages && !value.statuses) {
        ignored.push("whatsapp-sin-messages-ni-statuses");
      }
    }
  }

  return { inbound, statuses, ignored };
}
