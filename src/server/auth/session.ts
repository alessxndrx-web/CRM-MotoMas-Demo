import type {
  OperationBranchId,
  OperationRole,
} from "@/features/operations/types";
import type { UserRoleEnum } from "@/server/auth/roles";

/**
 * Stateless signed session (HMAC-SHA256) using the Web Crypto API only, so the
 * same verify path runs in the Edge proxy and in Node server actions/components.
 * The payload mirrors the internal session shape used by the existing panels.
 */

export const SESSION_COOKIE_NAME = "motomas_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
/** Dedicated Point of Sale boundary; never shared with the admin application. */
export const POS_SESSION_COOKIE_NAME = "motomas_pos_session";
export const POS_SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

/**
 * Local-development-only signing key. It is a published constant, so any session
 * cookie signed with it is forgeable: production must never reach it (see
 * getSecret) and must set SESSION_SECRET instead.
 */
const DEV_FALLBACK_SECRET =
  "motomas-dev-session-secret-change-me-in-production";

export type SessionPayload = {
  uid: string;
  email: string;
  name: string;
  role: OperationRole;
  roleEnum: UserRoleEnum;
  branchId: OperationBranchId;
  branchName: string;
  exp: number;
};

export type PosSessionPayload = {
  kind: "pos";
  operatorId: string;
  /** Existing internal user used only to preserve POS audit foreign keys. */
  auditUserId: string;
  username: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  /** Incremented on POS logout so a captured older token stops working. */
  sessionVersion: number;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET is not set. It is required in production to sign the " +
        "authentication session cookie; the development fallback key is public " +
        "and would allow session forgery. Set SESSION_SECRET (see .env.example) " +
        "and restart the server.",
    );
  }

  return DEV_FALLBACK_SECRET;
}

function base64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecodeToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded =
    normalized.length % 4 === 0
      ? normalized
      : normalized + "=".repeat(4 - (normalized.length % 4));
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function encodeJson(payload: SessionPayload): string {
  return base64urlEncodeBytes(new TextEncoder().encode(JSON.stringify(payload)));
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return new Uint8Array(signature);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

export async function createSessionToken(
  payload: Omit<SessionPayload, "exp">,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  const full: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = encodeJson(full);
  const signature = base64urlEncodeBytes(await hmac(body));
  return `${body}.${signature}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  // Resolved before the catch so a missing production SESSION_SECRET surfaces as
  // a configuration error instead of being masked as an invalid token.
  getSecret();

  try {
    const expected = await hmac(body);
    const provided = base64urlDecodeToBytes(signature);
    if (!constantTimeEqual(expected, provided)) return null;

    const json = new TextDecoder().decode(base64urlDecodeToBytes(body));
    const payload = JSON.parse(json) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Reuses the repository's signed-session infrastructure, but deliberately
 * creates a POS-only payload. A normal application session cannot satisfy the
 * explicit `kind` validation below.
 */
export async function createPosSessionToken(
  payload: Omit<PosSessionPayload, "kind" | "exp">,
  ttlSeconds: number = POS_SESSION_TTL_SECONDS,
): Promise<string> {
  const full: PosSessionPayload = {
    ...payload,
    kind: "pos",
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64urlEncodeBytes(new TextEncoder().encode(JSON.stringify(full)));
  const signature = base64urlEncodeBytes(await hmac(body));
  return `${body}.${signature}`;
}

/**
 * Signature/expiry validation for the dedicated POS token. The current
 * operator account and its session version are checked server-side by
 * `server/pos/auth.ts` on every protected request.
 */
export async function verifyPosSessionToken(
  token: string | undefined | null,
): Promise<PosSessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  getSecret();

  try {
    const expected = await hmac(body);
    const provided = base64urlDecodeToBytes(signature);
    if (!constantTimeEqual(expected, provided)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecodeToBytes(body)),
    ) as PosSessionPayload;
    if (
      payload.kind !== "pos" ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 < Date.now() ||
      typeof payload.operatorId !== "string" ||
      typeof payload.auditUserId !== "string" ||
      typeof payload.branchId !== "string" ||
      typeof payload.branchCode !== "string" ||
      typeof payload.sessionVersion !== "number"
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Patch CRM-QA1 — la credencial del cliente en el portal público.
 *
 * ## Por qué hace falta
 *
 * El portal verifica al cliente con código de seguimiento + teléfono o cédula.
 * Eso bastaba mientras la consulta era una sola pantalla de sólo lectura. Con
 * pagos y avisos, el navegador tiene que volver a pedir cosas cada pocos
 * segundos, y reenviar la cédula en cada una de esas peticiones es exactamente
 * lo que no se debe hacer con un documento de identidad.
 *
 * Este testigo lo sustituye: se emite **una sola vez**, cuando la verificación
 * de verdad ya pasó, y lleva dentro el cliente al que da acceso.
 *
 * ## Por qué no es una cookie
 *
 * Vive en la memoria del componente y viaja como argumento explícito de cada
 * Server Action. Una cookie se envía sola en toda petición al mismo origen, que
 * es la propiedad que hace posible el CSRF; un argumento explícito no. En un
 * dispositivo compartido, además, cerrar la pestaña se lleva el acceso.
 *
 * ## Vida corta a propósito
 *
 * Una hora. Es una sesión de trámite, no una sesión de trabajo: da tiempo a
 * pagar y a ver la confirmación, y no convierte una captura de pantalla del
 * enlace en un acceso permanente a los cobros de esa persona.
 */
export const PORTAL_TOKEN_TTL_SECONDS = 60 * 60;

export type PortalTokenPayload = {
  kind: "portal";
  customerId: string;
  /** El código con el que se verificó, sólo para mostrarlo de vuelta. */
  trackingCode: string | null;
  exp: number;
};

export async function createPortalToken(
  payload: Omit<PortalTokenPayload, "kind" | "exp">,
  ttlSeconds: number = PORTAL_TOKEN_TTL_SECONDS,
): Promise<string> {
  const full: PortalTokenPayload = {
    ...payload,
    kind: "portal",
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = base64urlEncodeBytes(new TextEncoder().encode(JSON.stringify(full)));
  const signature = base64urlEncodeBytes(await hmac(body));
  return `${body}.${signature}`;
}

/**
 * Verifica el testigo del portal. `kind` se comprueba de forma explícita: sin
 * eso, una sesión administrativa firmada con el mismo secreto pasaría por aquí,
 * que es la confusión que el POS ya evitó del mismo modo.
 */
export async function verifyPortalToken(
  token: string | undefined | null,
): Promise<PortalTokenPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  getSecret();

  try {
    const expected = await hmac(body);
    const provided = base64urlDecodeToBytes(signature);
    if (!constantTimeEqual(expected, provided)) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecodeToBytes(body)),
    ) as PortalTokenPayload;
    if (
      payload.kind !== "portal" ||
      typeof payload.customerId !== "string" ||
      !payload.customerId ||
      typeof payload.exp !== "number" ||
      payload.exp * 1000 < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
