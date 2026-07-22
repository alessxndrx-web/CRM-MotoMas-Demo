import { randomInt } from "node:crypto";

export const TICKET_CODE_ATTEMPTS = 8;

/** Public/internal-facing ticket code; the database cuid is never displayed. */
export function generateTicketCodeCandidate(date = new Date()): string {
  const year = date.getUTCFullYear();
  const sequence = randomInt(0, 100_000).toString().padStart(5, "0");
  return `TKT-${year}-${sequence}`;
}
