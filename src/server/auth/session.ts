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

function getSecret(): string {
  return process.env.SESSION_SECRET || DEV_FALLBACK_SECRET;
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
