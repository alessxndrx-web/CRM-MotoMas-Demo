import type { Prisma } from "@prisma/client";

const MASK = "[DATO_SENSIBLE_OCULTO]";
const DATABASE_MASK = "[URL_DE_BASE_DE_DATOS_OCULTA]";
const CARD_MASK = "[NUMERO_DE_TARJETA_OCULTO]";
const STACK_MASK = "[TRAZA_TECNICA_OCULTA]";

const sensitiveKey =
  /(?:pass(?:word|wd)?|contrase(?:n|ñ)a|token|api[_ -]?key|secret|session[_ -]?secret|meta[_ -]?(?:token|secret)|cvv|cvc|cookie|authorization|database[_ -]?url)/i;

/**
 * Best-effort masking for user-provided ticket context. It intentionally errs
 * on the side of hiding data, but it is not a complete DLP system and callers
 * must still avoid collecting credentials, payment data, env files or cookies.
 */
export function sanitizeTicketText(value: string, maxLength = 8_000): string {
  let clean = String(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  clean = clean.replace(
    /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/gi,
    DATABASE_MASK,
  );
  clean = clean.replace(
    /(^|\n)(\s*(?:export\s+)?[A-Z][A-Z0-9_]{1,64}\s*=)\s*[^\n]*/g,
    `$1$2${MASK}`,
  );
  clean = clean.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, `Bearer ${MASK}`);
  clean = clean.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, MASK);
  clean = clean.replace(/\b(?:Cookie|Set-Cookie)\s*:\s*[^\n]+/gi, `Cookie: ${MASK}`);
  clean = clean.replace(/\bmotomas_session\s*=\s*[^;\s]+/gi, `motomas_session=${MASK}`);
  clean = clean.replace(
    /\b(?:session(?:id)?|connect\.sid|auth|access_token|refresh_token)\s*=\s*[^;\s]+/gi,
    (match) => `${match.slice(0, match.indexOf("=") + 1)}${MASK}`,
  );
  clean = clean.replace(
    /\b(pass(?:word|wd)?|contrase(?:n|ñ)a|token|api[_ -]?key|secret|session[_ -]?secret|meta[_ -]?(?:token|secret)|cvv|cvc|cookie|authorization|database[_ -]?url)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;\n]+)/gi,
    (_match, key: string) => `${key}=${MASK}`,
  );
  clean = clean.replace(
    /\b(?:correo|email)\s+(?:password|pass|contrase(?:n|ñ)a)\s*[:=]\s*[^\s,;\n]+/gi,
    `correo password=${MASK}`,
  );
  clean = clean.replace(/(^|\n)\s*at\s+[^\n]+/g, `$1${STACK_MASK}`);
  clean = clean.replace(/(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, (candidate) => {
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 13 && digits.length <= 19 ? CARD_MASK : candidate;
  });

  return clean.slice(0, maxLength);
}

export function sanitizeOptionalTicketText(
  value: string | null | undefined,
  maxLength = 500,
): string | null {
  if (!value) return null;
  const clean = sanitizeTicketText(value, maxLength);
  return clean || null;
}

function sanitizeJsonValue(value: unknown, depth: number): Prisma.InputJsonValue {
  if (depth > 5) return "[CONTEXTO_TRUNCADO]";
  if (value === null) return "[VALOR_NULO]";
  if (typeof value === "string") return sanitizeTicketText(value, 2_000);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeJsonValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [rawKey, rawValue] of Object.entries(value).slice(0, 50)) {
      const key = sanitizeTicketText(rawKey, 100) || "campo";
      result[key] = sensitiveKey.test(key)
        ? MASK
        : sanitizeJsonValue(rawValue, depth + 1);
    }
    return result;
  }
  return sanitizeTicketText(String(value), 500);
}

export function sanitizeTicketMetadata(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return sanitizeJsonValue(value, 0);
}
