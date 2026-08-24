/**
 * Capa pura y segura para el cliente del módulo de WhatsApp: constantes de
 * negocio, la ventana de servicio de 24 h, los códigos de error tipados y los
 * DTOs de la conversación. Sin `import` de la base de datos, para que el panel
 * pueda reutilizar las formas y calcular la ventana en pantalla con la misma
 * regla que el servidor.
 *
 * Este archivo NO habla con Meta.
 */

/**
 * ⚠️ TEXTO PROVISIONAL — NO ES LA REDACCIÓN FINAL DEL NEGOCIO.
 *
 * La respuesta automática que recibe alguien que escribe por primera vez. Está
 * aquí, en una sola constante, precisamente para que cambiarla sea editar esta
 * línea y no tocar ninguna lógica. Ver docs/META_INTEGRATIONS.md §WhatsApp.
 */
export const WHATSAPP_WELCOME_MESSAGE_ES =
  "Gracias por escribir a MotoMas. En breve te atiende alguien de nuestro equipo.";

/**
 * Plantillas aprobadas que este código puede enviar.
 *
 * ⚠️ **Cada nombre y su idioma tienen que coincidir EXACTAMENTE con lo que está
 * registrado y aprobado en el WhatsApp Manager.** Meta rechaza el envío si el
 * nombre no existe o si el idioma no es el de la plantilla aprobada, y el error
 * llega en la respuesta del envío, no antes.
 *
 * `hello_world` es la plantilla de muestra que Meta crea ya aprobada en toda
 * cuenta de WhatsApp Business nueva, en `en_US`. Está aquí como **marcador de
 * posición operativo**: sirve para comprobar que el camino de plantilla
 * funciona de punta a punta, y hay que sustituirla por la plantilla de apertura
 * real en español en cuanto esté aprobada.
 *
 * Este módulo NO crea ni somete plantillas a aprobación; eso se hace en el
 * WhatsApp Manager.
 */
export const WHATSAPP_APPROVED_TEMPLATES: Readonly<
  Record<string, { language: string }>
> = {
  hello_world: { language: "en_US" },
};

export function approvedTemplateLanguage(name: string): string | null {
  return WHATSAPP_APPROVED_TEMPLATES[name]?.language ?? null;
}

/**
 * La ventana de servicio al cliente de Meta: fuera de las 24 h posteriores al
 * último mensaje **entrante** del cliente, sólo se puede enviar una plantilla
 * aprobada. No es una regla que invente este CRM — es política de plataforma, y
 * la API de Meta rechaza el texto libre por su cuenta. Se comprueba aquí antes
 * para dar un error entendible en vez del de Meta.
 */
export const WHATSAPP_SERVICE_WINDOW_HOURS = 24;

const WINDOW_MS = WHATSAPP_SERVICE_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * Si el texto libre está permitido ahora mismo para ese teléfono.
 *
 * `lastInboundAt` sale SIEMPRE de la bitácora de mensajes (el `createdAt` del
 * último ENTRANTE). Nunca de un campo "visto por última vez": un campo aparte se
 * desviaría del log en cuanto una escritura fallara a medias, y la ventana
 * dejaría de describir la conversación real.
 */
export function isWithinServiceWindow(
  lastInboundAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  if (!lastInboundAt) return false;
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return false;
  return now.getTime() - last < WINDOW_MS;
}

/** Cuándo se cierra la ventana, para poder decirlo en pantalla. */
export function serviceWindowExpiresAt(
  lastInboundAt: Date | string | null,
): Date | null {
  if (!lastInboundAt) return null;
  const last = new Date(lastInboundAt).getTime();
  if (Number.isNaN(last)) return null;
  return new Date(last + WINDOW_MS);
}

// --- Errores tipados ------------------------------------------------------

/**
 * Por qué no se pudo enviar. La UI distingue estos casos: "fuera de ventana"
 * ofrece la plantilla, mientras que "sin número configurado" es un problema de
 * instalación que el vendedor no puede resolver. Un error genérico obligaría a
 * leer el texto para decidir, y el texto es para la persona, no para el código.
 */
export type WhatsAppSendErrorCode =
  | "fuera-de-ventana"
  | "sin-numero-configurado"
  | "sin-token-configurado"
  | "plantilla-no-aprobada"
  | "telefono-invalido"
  | "mensaje-vacio"
  | "rechazado-por-meta";

export type WhatsAppSendResult =
  | { ok: true; messageId: string; waMessageId: string }
  | { ok: false; code: WhatsAppSendErrorCode; error: string };

export const whatsAppSendErrorMessages: Record<WhatsAppSendErrorCode, string> = {
  "fuera-de-ventana":
    "Pasaron más de 24 horas desde el último mensaje del cliente. Meta sólo permite texto libre dentro de esa ventana; usa una plantilla aprobada.",
  "sin-numero-configurado":
    "WHATSAPP_PHONE_NUMBER_ID no configurado. El número emisor de WhatsApp todavía no está dado de alta en el servidor.",
  "sin-token-configurado":
    "WHATSAPP_ACCESS_TOKEN no configurado. El servidor no tiene credenciales para llamar a la API de WhatsApp.",
  "plantilla-no-aprobada":
    "Esa plantilla no está registrada como aprobada en este servidor. Regístrala en el WhatsApp Manager y añádela a WHATSAPP_APPROVED_TEMPLATES.",
  "telefono-invalido": "El teléfono no es válido.",
  "mensaje-vacio": "El mensaje está vacío.",
  "rechazado-por-meta": "Meta rechazó el envío.",
};

// --- DTOs de la conversación ---------------------------------------------

export type WhatsAppMessageDirectionValue = "ENTRANTE" | "SALIENTE";

export type WhatsAppMessageStatusValue =
  | "PENDIENTE"
  | "ENVIADO"
  | "ENTREGADO"
  | "LEIDO"
  | "FALLIDO";

export const whatsAppMessageStatusLabels: Record<
  WhatsAppMessageStatusValue,
  string
> = {
  PENDIENTE: "Pendiente",
  ENVIADO: "Enviado",
  ENTREGADO: "Entregado",
  LEIDO: "Leído",
  FALLIDO: "Fallido",
};

/**
 * Orden de avance de una entrega. Meta puede entregar las devoluciones de estado
 * desordenadas —un `sent` después de un `delivered` es normal— y aplicarlas tal
 * cual haría retroceder el estado mostrado. Sólo se avanza.
 *
 * `FALLIDO` queda fuera de la escala: es terminal y siempre gana, venga cuando
 * venga.
 */
const statusRank: Record<WhatsAppMessageStatusValue, number> = {
  PENDIENTE: 0,
  ENVIADO: 1,
  ENTREGADO: 2,
  LEIDO: 3,
  FALLIDO: 0,
};

export function shouldAdvanceStatus(
  current: WhatsAppMessageStatusValue,
  incoming: WhatsAppMessageStatusValue,
): boolean {
  if (current === "FALLIDO") return false;
  if (incoming === "FALLIDO") return true;
  return statusRank[incoming] > statusRank[current];
}

export type WhatsAppMessageDTO = {
  id: string;
  direction: WhatsAppMessageDirectionValue;
  phone: string;
  body: string | null;
  templateName: string | null;
  status: WhatsAppMessageStatusValue;
  statusLabel: string;
  createdAt: string;
};

/**
 * El hilo de un teléfono con todo lo que la pantalla necesita para decidir qué
 * puede enviarse: los mensajes y el momento del último entrante, que es lo que
 * define la ventana.
 */
export type WhatsAppConversationDTO = {
  phone: string;
  messages: WhatsAppMessageDTO[];
  lastInboundAt: string | null;
};
