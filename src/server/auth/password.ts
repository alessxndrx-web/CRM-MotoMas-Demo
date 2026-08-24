import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing with Node's built-in scrypt (no external dependency).
 * The scheme and parameters are kept identical to prisma/seed.mjs.
 *
 * Stored format: `<saltHex>:<derivedHex>`
 */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  }).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  try {
    const derived = Buffer.from(derivedHex, "hex");
    const check = scryptSync(password, salt, SCRYPT.keylen, {
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
    });
    return derived.length === check.length && timingSafeEqual(derived, check);
  } catch {
    return false;
  }
}
