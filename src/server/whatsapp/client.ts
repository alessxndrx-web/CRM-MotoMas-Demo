import {
  approvedTemplateLanguage,
  type WhatsAppSendErrorCode,
} from "@/server/whatsapp/shared";

/**
 * Llamadas de salida a la API de WhatsApp Cloud.
 *
 * Endpoint verificado contra la documentación vigente de Meta:
 *
 *   POST https://graph.facebook.com/{version}/{WHATSAPP_PHONE_NUMBER_ID}/messages
 *
 * y el `wamid` del mensaje enviado vuelve en `messages[0].id`, que es lo que
 * después correlaciona las devoluciones de estado.
 *
 * Las credenciales se leen con `process.env` en el punto de uso, igual que
 * `getSecret()` en `src/server/auth/session.ts` y que los tres `META_*` de
 * Meta-1. Nunca se guardan en la base.
 */

/**
 * Versión fijada. Es independiente a propósito de la de Lead Ads
 * (`GRAPH_API_VERSION` en `src/server/meta/ingest.ts`, hoy v21.0): son dos
 * productos con contratos distintos, y subir uno no debe obligar a revalidar el
 * otro. Al subirla, revisar la forma de `messages[].id` en la respuesta.
 */
const GRAPH_API_VERSION = "v23.0";
const GRAPH_API_HOST = "https://graph.facebook.com";

export type WhatsAppApiFailure = {
  code: WhatsAppSendErrorCode;
  detail: string;
};

export type WhatsAppApiResult =
  | { ok: true; waMessageId: string }
  | { ok: false; failure: WhatsAppApiFailure };

/**
 * El número emisor todavía no está dado de alta en producción, así que la falta
 * de esta variable es un estado esperado y tiene su propio código de error: el
 * vendedor que ve el mensaje no puede resolverlo, y decírselo con un fallo
 * genérico lo mandaría a buscar un problema suyo que no existe.
 */
function getPhoneNumberId(): string | null {
  return process.env.WHATSAPP_PHONE_NUMBER_ID || null;
}

function getAccessToken(): string | null {
  return process.env.WHATSAPP_ACCESS_TOKEN || null;
}

/** Lo que se puede comprobar antes de gastar una llamada de red. */
export function checkWhatsAppCredentials(): WhatsAppApiFailure | null {
  if (!getPhoneNumberId()) {
    return {
      code: "sin-numero-configurado",
      detail: "WHATSAPP_PHONE_NUMBER_ID no configurado",
    };
  }
  if (!getAccessToken()) {
    return {
      code: "sin-token-configurado",
      detail: "WHATSAPP_ACCESS_TOKEN no configurado",
    };
  }
  return null;
}

async function postToGraph(body: unknown): Promise<WhatsAppApiResult> {
  const missing = checkWhatsAppCredentials();
  if (missing) return { ok: false, failure: missing };

  const phoneNumberId = getPhoneNumberId();
  const token = getAccessToken();
  const url = `${GRAPH_API_HOST}/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      ok: false,
      failure: {
        code: "rechazado-por-meta",
        detail: `no se pudo contactar la API: ${
          error instanceof Error ? error.message : "desconocido"
        }`,
      },
    };
  }

  if (!response.ok) {
    // El cuerpo de error de Meta puede repetir el token; sólo se propaga el
    // estado y el mensaje corto, nunca la respuesta completa.
    let detail = `la API respondió ${response.status}`;
    try {
      const parsed: unknown = await response.json();
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as { error?: { message?: unknown } }).error?.message ===
          "string"
      ) {
        detail = `${detail}: ${
          (parsed as { error: { message: string } }).error.message
        }`;
      }
    } catch {
      // Un error sin JSON legible sigue siendo un error; basta con el estado.
    }
    return { ok: false, failure: { code: "rechazado-por-meta", detail } };
  }

  const parsed: unknown = await response.json();
  const waMessageId = extractWaMessageId(parsed);
  if (!waMessageId) {
    return {
      ok: false,
      failure: {
        code: "rechazado-por-meta",
        detail: "la API aceptó el envío pero no devolvió el id del mensaje",
      },
    };
  }

  return { ok: true, waMessageId };
}

function extractWaMessageId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || !messages.length) return null;
  const first = messages[0];
  if (typeof first !== "object" || first === null) return null;
  const id = (first as { id?: unknown }).id;
  return typeof id === "string" && id ? id : null;
}

/** Texto libre. Meta sólo lo acepta dentro de la ventana de 24 h. */
export function sendWhatsAppText(
  phone: string,
  body: string,
): Promise<WhatsAppApiResult> {
  return postToGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: { preview_url: false, body },
  });
}

/**
 * Plantilla aprobada, el único envío permitido fuera de la ventana.
 *
 * El idioma sale del registro de plantillas aprobadas, no de un parámetro: Meta
 * rechaza el envío si el idioma no es exactamente el de la plantilla aprobada, y
 * dejarlo elegir desde fuera invitaría a ese error.
 *
 * Sin componentes: la plantilla de apertura no lleva variables. Una con
 * variables necesitaría `components`, y eso es gestión de plantillas — fuera del
 * alcance de este parche.
 */
export function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
): Promise<WhatsAppApiResult> {
  const language = approvedTemplateLanguage(templateName);
  if (!language) {
    return Promise.resolve({
      ok: false,
      failure: {
        code: "plantilla-no-aprobada",
        detail: `la plantilla "${templateName}" no está registrada como aprobada`,
      },
    });
  }

  return postToGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: { name: templateName, language: { code: language } },
  });
}
