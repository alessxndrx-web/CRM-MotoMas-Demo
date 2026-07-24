import type { Prisma } from "@prisma/client";

/**
 * Patch 4.0S-C1 — server-side financial invariants for Contabilidad.
 *
 * Pure guard helpers shared by the Contabilidad server actions. They always
 * read the current database state through the caller's transaction client, so
 * a forged or stale client request can never satisfy them, and no role —
 * including Admin — receives a bypass: the guards take no actor at all.
 *
 * Period semantics (existing model, no schema change):
 * - `AccountingClosing.period` is a `YYYY-MM` month; `branchId` is required,
 *   so every closing is branch-scoped and there is no global closing record.
 * - Only `CERRADO` blocks. `ABIERTO`, `EN_REVISION` and `REABIERTO` do not.
 * - A closing covers its whole month inclusively: from the first to the last
 *   day of `period`. Dates are compared date-only via the UTC `YYYY-MM`
 *   prefix, matching `parseAccountingDate`, which normalizes the panel's
 *   date-only inputs to UTC midnight — no timezone shift can move an
 *   accounting date across a period boundary.
 * - A journal entry without a branch cannot be attributed to a single closing
 *   scope, so it fails closed: any CERRADO closing in its period blocks it.
 */

export const PERIOD_CLOSED_ERROR =
  "El período contable correspondiente está cerrado y no admite nuevos movimientos.";
export const ACCOUNT_NOT_FOUND_ERROR = "La cuenta contable no existe.";
export const ACCOUNT_INACTIVE_ERROR =
  "La cuenta contable está inactiva y no admite nuevos movimientos.";
export const INVALID_ACCOUNTING_DATE_ERROR =
  "La fecha contable no es válida para validar el período.";

export type ContabilidadGuardResult =
  | { ok: true }
  | { ok: false; error: string };

/** Month period (`YYYY-MM`) an accounting date belongs to, in UTC. */
export function accountingPeriodOf(date: Date): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 7);
}

export function isAccountingPeriodClosed(
  closingStatus: string,
): boolean {
  return closingStatus === "CERRADO";
}

/**
 * Current CERRADO closing covering `accountingDate`, or null when the period
 * is open. `branchId` narrows to that branch's closing; a null branch fails
 * closed against any branch's CERRADO closing for the period.
 */
export async function findBlockingAccountingClosing(
  tx: Pick<Prisma.TransactionClient, "accountingClosing">,
  accountingDate: Date,
  branchId: string | null,
): Promise<{ period: string } | null> {
  const period = accountingPeriodOf(accountingDate);
  if (!period) return null;
  const closing = await tx.accountingClosing.findFirst({
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
  tx: Pick<Prisma.TransactionClient, "accountingClosing">,
  accountingDate: Date,
  branchId: string | null,
): Promise<ContabilidadGuardResult> {
  if (!accountingPeriodOf(accountingDate)) {
    return { ok: false, error: INVALID_ACCOUNTING_DATE_ERROR };
  }
  const blocking = await findBlockingAccountingClosing(
    tx,
    accountingDate,
    branchId,
  );
  if (blocking) return { ok: false, error: PERIOD_CLOSED_ERROR };
  return { ok: true };
}

/**
 * A journal line may only reference an existing, active chart account. The
 * schema has no posting/header flag, so the tree parent distinction is not
 * enforced here; activity and existence come from the current database row,
 * never from a client label.
 */
export async function assertChartAccountUsable(
  tx: Pick<Prisma.TransactionClient, "chartAccount">,
  accountId: string | null | undefined,
): Promise<ContabilidadGuardResult> {
  if (!accountId || typeof accountId !== "string") {
    return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
  }
  const account = await tx.chartAccount.findUnique({
    where: { id: accountId },
    select: { isActive: true },
  });
  if (!account) return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
  if (!account.isActive) return { ok: false, error: ACCOUNT_INACTIVE_ERROR };
  return { ok: true };
}

/**
 * Posting-time revalidation of every current line of an entry. This closes the
 * gap where an account was active when the draft line was written and was
 * deactivated afterwards: the stale draft cannot post until corrected.
 */
export async function validateJournalEntryAccounts(
  tx: Pick<Prisma.TransactionClient, "journalEntryLine">,
  entryId: string,
): Promise<ContabilidadGuardResult> {
  const lines = await tx.journalEntryLine.findMany({
    where: { entryId },
    select: { account: { select: { code: true, isActive: true } } },
  });
  for (const line of lines) {
    if (!line.account) return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
    if (!line.account.isActive) {
      return {
        ok: false,
        error: `La cuenta ${line.account.code} está inactiva. Corrige las líneas del asiento antes de contabilizar.`,
      };
    }
  }
  return { ok: true };
}
