import type { FinancialDocumentSeries } from "@prisma/client";

/**
 * Patch FF1.0 — client-safe contracts for the sequential numbering service.
 *
 * Pure values and types only: no Prisma client, no session, no database access,
 * so a future configuration screen can import this file directly.
 */

export type FinancialDocumentSeriesValue = FinancialDocumentSeries;

/**
 * Labels are the single source of truth for the runtime series list: typing
 * them as a total `Record` over the Prisma enum makes adding a series to the
 * schema a compile error until it is labelled here, so the list can never fall
 * silently out of sync with the database.
 */
export const financialDocumentSeriesLabels: Record<
  FinancialDocumentSeriesValue,
  string
> = {
  CAJA_FACTURA: "Caja — Factura",
  CAJA_RECIBO: "Caja — Recibo oficial",
  CAJA_NOTA_DEBITO: "Caja — Nota de débito",
  CAJA_NOTA_CREDITO: "Caja — Nota de crédito",
  CONTABILIDAD_DOCUMENTO: "Contabilidad — Documento",
  CONTABILIDAD_ASIENTO: "Contabilidad — Asiento",
  CONTABILIDAD_COMPROBANTE: "Contabilidad — Comprobante",
};

export const financialDocumentSeriesValues = Object.keys(
  financialDocumentSeriesLabels,
) as FinancialDocumentSeriesValue[];

const seriesSet = new Set<string>(financialDocumentSeriesValues);

export function isFinancialDocumentSeriesValue(
  value: string,
): value is FinancialDocumentSeriesValue {
  return seriesSet.has(value);
}

/**
 * Suggested prefixes only. The stored prefix is what actually builds a number,
 * and it stays configurable per series, branch and fiscal year — a branch can
 * therefore carry its own prefix without the formatter needing a branch join.
 */
export const defaultSeriesPrefixes: Record<
  FinancialDocumentSeriesValue,
  string
> = {
  CAJA_FACTURA: "FAC",
  CAJA_RECIBO: "ROC",
  CAJA_NOTA_DEBITO: "ND",
  CAJA_NOTA_CREDITO: "NC",
  CONTABILIDAD_DOCUMENTO: "DOC",
  CONTABILIDAD_ASIENTO: "AS",
  CONTABILIDAD_COMPROBANTE: "CMP",
};

/**
 * Non-null stand-in for a corporate (branch-less) series. PostgreSQL treats
 * NULLs as distinct in a unique key, so a nullable branch column alone would
 * allow two corporate counters for the same series and year.
 */
export const CORPORATE_SEQUENCE_BRANCH_KEY = "__CORPORATIVO__";

export function sequenceBranchKey(branchId: string | null): string {
  return branchId ?? CORPORATE_SEQUENCE_BRANCH_KEY;
}

export const MIN_SEQUENCE_PADDING = 1;
export const MAX_SEQUENCE_PADDING = 12;
export const DEFAULT_SEQUENCE_PADDING = 6;

/** Highest counter value a series may reach before it must be reconfigured. */
export const MAX_SEQUENCE_VALUE = 2_000_000_000;

export const MIN_FISCAL_YEAR = 2000;
export const MAX_FISCAL_YEAR = 2999;

/**
 * Fiscal year of an accounting date. `startMonth` is 1-12 and defaults to
 * January, which matches the Nicaraguan calendar fiscal year the company uses;
 * a fiscal year starting later belongs to the calendar year it begins in.
 *
 * Dates are read in UTC, exactly like `parseAccountingDate` in Contabilidad, so
 * a date-only accounting input cannot drift into a neighbouring year.
 */
export function resolveFiscalYear(date: Date, startMonth = 1): number | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return month >= startMonth ? year : year - 1;
}

export function isValidFiscalYear(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_FISCAL_YEAR &&
    value <= MAX_FISCAL_YEAR
  );
}

/**
 * Accepts `FAC`, `FAC-PI`, `ROC_01`. Uppercase letters, digits, hyphen and
 * underscore only, so a number never carries whitespace or a separator that
 * would break parsing back into its parts.
 */
export function sanitizeSequencePrefix(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 20) return null;
  return /^[A-Z0-9][A-Z0-9_-]*$/.test(normalized) ? normalized : null;
}

export function sanitizeSequencePadding(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return DEFAULT_SEQUENCE_PADDING;
  if (!Number.isInteger(value)) return null;
  return value >= MIN_SEQUENCE_PADDING && value <= MAX_SEQUENCE_PADDING
    ? value
    : null;
}

/** `PREFIX-YYYY-000123`. Values wider than `padding` are never truncated. */
export function formatDocumentNumber(input: {
  prefix: string;
  fiscalYear: number;
  value: number;
  padding: number;
}): string {
  const padded = String(input.value).padStart(input.padding, "0");
  return `${input.prefix}-${input.fiscalYear}-${padded}`;
}

export type DocumentSequenceDTO = {
  id: string;
  series: FinancialDocumentSeriesValue;
  seriesLabel: string;
  /** Branch code, or null for a corporate series. */
  branchCode: string | null;
  fiscalYear: number;
  prefix: string;
  padding: number;
  /** Value the next allocation will consume. */
  nextValue: number;
  lastNumber: string | null;
  lastIssuedAt: string | null;
  isActive: boolean;
  notes: string | null;
  /** Preview of the number the next allocation would produce. */
  preview: string;
};

export type AllocatedDocumentNumber = {
  number: string;
  value: number;
  sequenceId: string;
};
