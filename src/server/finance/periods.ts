import type { Prisma } from "@prisma/client";

/**
 * Patch FF1.3-A — accounting period lock, in the finance base layer.
 *
 * The rule itself is Patch 4.0S-C1's and is unchanged: a `CERRADO`
 * `AccountingClosing` blocks any movement dated inside its branch+period.
 *
 * It moved down here because the posting engine must enforce it and
 * `finance` may never import `contabilidad` — the alternative was a second copy
 * of a financial invariant, which is exactly what TD-01 spent a patch removing.
 * `@/server/contabilidad/guards` re-exports these under their historical names,
 * so every existing call site is untouched and there is one implementation.
 *
 * Period semantics (existing model, no schema change):
 * - `AccountingClosing.period` is a `YYYY-MM` month; `branchId` is required,
 *   so every closing is branch-scoped and there is no global closing record.
 * - Only `CERRADO` blocks. `ABIERTO`, `EN_REVISION` and `REABIERTO` do not.
 * - A closing covers its whole month inclusively. Dates are compared date-only
 *   through the UTC `YYYY-MM` prefix, matching `parseAccountingDate`, so no
 *   timezone shift can move a date across a period boundary.
 * - A movement without a branch cannot be attributed to a single closing scope,
 *   so it fails closed: any CERRADO closing in its period blocks it.
 */

export const PERIOD_CLOSED_ERROR =
  "El período contable correspondiente está cerrado y no admite nuevos movimientos.";

export const INVALID_ACCOUNTING_DATE_ERROR =
  "La fecha contable no es válida para validar el período.";

export type AccountingPeriodResult = { ok: true } | { ok: false; error: string };

/** Client able to read closings; satisfied by both Prisma clients. */
export type AccountingPeriodDb = Pick<
  Prisma.TransactionClient,
  "accountingClosing"
>;

/** Month period (`YYYY-MM`) an accounting date belongs to, in UTC. */
export function accountingPeriodOf(date: Date): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

export function isAccountingPeriodClosed(closingStatus: string): boolean {
  return closingStatus === "CERRADO";
}

/**
 * Current CERRADO closing covering `accountingDate`, or null when the period
 * is open. `branchId` narrows to that branch's closing; a null branch fails
 * closed against any branch's CERRADO closing for the period.
 */
export async function findBlockingAccountingClosing(
  db: AccountingPeriodDb,
  accountingDate: Date,
  branchId: string | null,
): Promise<{ period: string } | null> {
  const period = accountingPeriodOf(accountingDate);
  if (!period) return null;
  const closing = await db.accountingClosing.findFirst({
    where: {
      period,
      status: "CERRADO",
      ...(branchId ? { branchId } : {}),
    },
    select: { period: true },
  });
  return closing ? { period: closing.period } : null;
}

/**
 * Fails when the accounting date falls inside a CERRADO closing for the given
 * scope. An unparseable date fails closed — it can never skip the lock.
 */
export async function assertAccountingDateIsOpen(
  db: AccountingPeriodDb,
  accountingDate: Date,
  branchId: string | null,
): Promise<AccountingPeriodResult> {
  if (!accountingPeriodOf(accountingDate)) {
    return { ok: false, error: INVALID_ACCOUNTING_DATE_ERROR };
  }
  const blocking = await findBlockingAccountingClosing(
    db,
    accountingDate,
    branchId,
  );
  if (blocking) return { ok: false, error: PERIOD_CLOSED_ERROR };
  return { ok: true };
}
