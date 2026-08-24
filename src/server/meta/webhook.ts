import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Contrato HTTP del webhook de Meta: el saludo de verificación y la firma de
 * cada entrega. Vive fuera de la ruta para poder ejercitarse desde un script
 * (`npm run smoke:meta`) sin levantar el servidor.
 *
 * Los tres secretos se leen con `process.env` en el punto de uso, siguiendo la
 * misma convención que `getSecret()` en `src/server/auth/session.ts`: nunca se
 * guardan en la base y nunca viajan al cliente.
 */

/**
 * Comparación en tiempo constante de dos cadenas.
 *
 * `===` sobre un valor derivado de un secreto termina antes en el primer byte
 * distinto, y esa diferencia de tiempo es medible: filtra el secreto byte a
 * byte. La comparación de longitud sí puede ser directa — la longitud no es
 * parte del secreto.
 */
function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export class MetaConfigError extends Error {
  constructor(variable: string) {
    super(
      `${variable} no está configurada. Es obligatoria para operar el webhook ` +
        `de Meta; sin ella la firma de las entregas no se puede verificar. ` +
        `Ver .env.example y docs/META_INTEGRATIONS.md.`,
    );
    this.name = "MetaConfigError";
  }
}

function requiredEnv(variable: string): string {
  const value = process.env[variable];
  if (!value) throw new MetaConfigError(variable);
  return value;
}

export function getMetaAppSecret(): string {
  return requiredEnv("META_APP_SECRET");
}

export function getMetaVerifyToken(): string {
  return requiredEnv("META_WEBHOOK_VERIFY_TOKEN");
}

export function getMetaPageAccessToken(): string {
  return requiredEnv("META_PAGE_ACCESS_TOKEN");
}

/**
 * El saludo de suscripción (`GET`). Meta llama una sola vez con estos tres
 * parámetros y espera el `hub.challenge` crudo si el token coincide.
 *
 * Si esto no es exacto, Meta se niega a suscribir el webhook y el error queda
 * de su lado, sin mensaje útil del nuestro. De ahí que sea literal.
 */
export function resolveVerificationChallenge(params: URLSearchParams): {
  ok: boolean;
  challenge: string;
} {
  const mode = params.get("hub.mode") ?? "";
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";

  if (mode !== "subscribe") return { ok: false, challenge: "" };
  if (!safeEquals(token, getMetaVerifyToken())) {
    return { ok: false, challenge: "" };
  }
  return { ok: true, challenge };
}

/**
 * Verifica `X-Hub-Signature-256` contra el HMAC-SHA256 del cuerpo **crudo**.
 *
 * Tiene que ser el cuerpo crudo: volver a serializar el JSON reordena claves y
 * cambia espacios, y el HMAC deja de coincidir. Por eso la ruta lee `text()`
 * una sola vez y pasa esa misma cadena aquí y al parseo.
 *
 * Sin esto, cualquiera que descubra la URL puede inyectar leads falsos.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;

  const [algorithm, received] = signatureHeader.split("=");
  if (algorithm !== "sha256" || !received) return false;

  const expected = createHmac("sha256", getMetaAppSecret())
    .update(rawBody, "utf8")
    .digest("hex");

  return safeEquals(received, expected);
}

/** Firma un cuerpo como lo haría Meta. Sólo la usa el smoke para armar casos. */
export function signMetaBody(rawBody: string, appSecret: string): string {
  const digest = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  return `sha256=${digest}`;
}

// --- Forma del payload ----------------------------------------------------

export type MetaLeadgenChangeValue = {
  leadgen_id: string;
  page_id: string;
  form_id: string;
  created_time?: number;
};

export type MetaWebhookChange = {
  field: string;
  value: unknown;
};

export type MetaWebhookEntry = {
  id?: string;
  time?: number;
  changes?: MetaWebhookChange[];
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: MetaWebhookEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `leadgen_id`, `page_id` y `form_id` son lo único que el webhook garantiza. */
export function asLeadgenValue(value: unknown): MetaLeadgenChangeValue | null {
  if (!isRecord(value)) return null;
  const leadgenId = value.leadgen_id;
  const pageId = value.page_id;
  const formId = value.form_id;
  if (typeof leadgenId !== "string" || !leadgenId) return null;
  if (typeof pageId !== "string" || !pageId) return null;
  if (typeof formId !== "string" || !formId) return null;
  return {
    leadgen_id: leadgenId,
    page_id: pageId,
    form_id: formId,
    created_time:
      typeof value.created_time === "number" ? value.created_time : undefined,
  };
}

/**
 * Extrae sólo los cambios `leadgen`. Cualquier otra forma (mensajes de WhatsApp
 * más adelante, cambios de la página, etc.) se ignora a propósito: esta entrega
 * responde 200 igual, porque Meta reintenta con insistencia ante cualquier otra
 * cosa y un tipo de evento que todavía no manejamos no es un fallo.
 */
export function collectLeadgenChanges(payload: MetaWebhookPayload): {
  leadgen: MetaLeadgenChangeValue[];
  ignored: string[];
} {
  const leadgen: MetaLeadgenChangeValue[] = [];
  const ignored: string[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (!change || typeof change.field !== "string") continue;
      if (change.field !== "leadgen") {
        ignored.push(change.field);
        continue;
      }
      const value = asLeadgenValue(change.value);
      if (value) leadgen.push(value);
      else ignored.push("leadgen(malformado)");
    }
  }

  return { leadgen, ignored };
}
