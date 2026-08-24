/**
 * Short public codes for CRM records: `SOL-20260708-3F9A2B7C` for a lead,
 * `EXP-...` for an expediente.
 *
 * This lived as a private helper inside actions.ts until Meta Lead Ads needed
 * to create leads from outside that file. It is not in shared.ts on purpose:
 * shared.ts is the pure, client-safe layer and this is neither pure (it draws
 * randomness) nor useful to a client component.
 */

/** Short unique-ish public tracking / file code, e.g. SOL-20260708-3F9A2B7C. */
export function generateCrmCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}
