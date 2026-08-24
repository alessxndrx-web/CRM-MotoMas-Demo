/**
 * Patch FF1.0 — text normalization for financial inputs.
 *
 * Same semantics as `sanitizeAccountingText` and `sanitizeCajaText`, which are
 * byte-for-byte identical today: strip control characters, trim, bound the
 * length, and treat an empty result as absent. It lives in the finance base
 * layer so future financial modules stop copying the function a third time.
 *
 * Caja and Contabilidad keep their own copies for now — replacing them is a
 * behaviour-neutral cleanup that belongs to a later patch, not to FF1.0.
 *
 * This is deliberately NOT the ticket sanitizer: that one masks credential-like
 * `KEY=value` text, which would corrupt legitimate accounting notes. Audit
 * payloads are still masked by the audit writer itself.
 */
const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

export function sanitizeFinancialText(
  value: string | null | undefined,
  maxLength = 500,
): string | null {
  if (!value) return null;
  const clean = value.replace(CONTROL_CHARACTERS, " ").trim();
  return clean ? clean.slice(0, maxLength) : null;
}
