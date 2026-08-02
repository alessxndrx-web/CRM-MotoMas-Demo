/**
 * Patch TD-01 — canonical money, currency and serialization helpers.
 *
 * Caja and Contabilidad each carried their own copy of these functions, and the
 * copies were byte-for-byte identical: same bounds, same rounding, same null
 * handling. Two identical implementations are not two decisions, they are one
 * decision written twice — and the second copy is where a future bounds change
 * gets forgotten.
 *
 * This module holds the single implementation. Both modules keep exporting
 * their historical names (`sanitizeCashMoney`, `sanitizeAccountingMoney`, …) as
 * re-exports, so every call site is untouched and no behaviour changes.
 *
 * Deliberately NOT centralized here: `sanitizeCashQuantity` (three decimals,
 * strictly positive — a quantity, not an amount), `sanitizeMinimumStock` and
 * `sanitizeAccountingPeriod`. They look similar but encode different rules.
 *
 * Pure module: no Prisma client, no session, no database. Safe to import from a
 * client component, which is why the Caja and Contabilidad `shared.ts` files
 * can re-export it.
 */

import { sanitizeFinancialText } from "@/server/finance/text";

/** Structural stand-in for `Prisma.Decimal`, so this module stays Prisma-free. */
export type DecimalLike =
  | { toNumber(): number; toString(): string }
  | null
  | undefined;

/**
 * Upper bound of every monetary column in the schema, which is
 * `Decimal(12, 2)`. A value above it would be rejected by PostgreSQL after the
 * transaction had already started doing work.
 */
export const MAX_FINANCIAL_MONEY = 9_999_999_999.99;

export function roundFinancialMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Non-negative money bounded to the schema's `Decimal(12,2)`. */
export function sanitizeFinancialMoney(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > MAX_FINANCIAL_MONEY) {
    return null;
  }
  return roundFinancialMoney(value);
}

/** Closing differences and journal balances may legitimately go negative. */
export function sanitizeSignedFinancialMoney(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (
    !Number.isFinite(value) ||
    value < -MAX_FINANCIAL_MONEY ||
    value > MAX_FINANCIAL_MONEY
  ) {
    return null;
  }
  return roundFinancialMoney(value);
}

/**
 * Currency stays optional; when supplied it must be a neutral ISO-like code.
 * There is still no functional currency or exchange-rate policy in the project
 * (risk R-03 of docs/ACCOUNTING_EVENTS.md), so this only validates the shape.
 *
 * It goes through the text sanitizer with a 3-character bound on purpose: that
 * truncation is existing behaviour (`"NIOS"` becomes `"NIO"`), and this cleanup
 * is not the place to change what an input means.
 */
export function sanitizeFinancialCurrency(
  value: string | null | undefined,
): string | null {
  const clean = sanitizeFinancialText(value, 3)?.toUpperCase() ?? null;
  return clean && /^[A-Z]{3}$/.test(clean) ? clean : null;
}

export function parseFinancialDate(
  value: string | null | undefined,
): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// --- Serialization -------------------------------------------------------

export function decimalToNumber(value: DecimalLike): number {
  return value ? value.toNumber() : 0;
}

export function decimalToString(value: DecimalLike): string {
  return value ? value.toString() : "0";
}

export function dateToISOString(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
