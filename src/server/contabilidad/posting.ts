import type { Prisma } from "@prisma/client";

import { authorizeFinancialFoundation } from "@/server/finance/context";
import { getPrisma } from "@/server/db/prisma";
import { decimalToNumber } from "@/server/finance/money";
import type { PostingPipelineOptions } from "@/server/finance/posting/pipeline";
import {
  runPostingPipeline,
  runReversalPipeline,
} from "@/server/finance/posting/pipeline";
 import { postingRegistry } from "@/server/finance/posting/registry";
import {
  listPostingRecords,
  type PostingDb,
} from "@/server/finance/posting/repository";
import { executePosting } from "@/server/finance/posting/service";
import type {
  PostingEventValue,
  PostingRequest,
  PostingResult,
} from "@/server/finance/posting/shared";
import type {
  FinancialResult,
  FinancialTransactionContext,
} from "@/server/finance/transaction";
import type {
  AccountingDocumentTypeValue,
  VoucherTypeValue,
} from "@/server/contabilidad/shared";

/**
 * Patch FF1.3-B — the seam between Contabilidad and the posting engine.
 *
 * This file holds the rules that belong to the **module that owns the event**:
 * a voucher must exist, must not be annulled, and must carry an amount. It does
 * NOT re-check anything the engine already guarantees — accounting period,
 * account eligibility, journal balance, mapping existence or duplicate posting —
 * because duplicating those checks is how two answers to the same question start
 * to drift.
 *
 * Everything else travels through `executePosting`, which authorizes, opens the
 * financial transaction and runs the full pipeline. No stage is bypassed.
 *
 * It is a plain server function, not a `"use server"` action, following the
 * FF1.0/FF1.3-A precedent: no screen posts a voucher yet, and exposing an RPC
 * endpoint that writes to the ledger before its UI exists would be attack
 * surface with no purpose.
 */

export const VOUCHER_NOT_FOUND = "El comprobante no existe.";
export const VOUCHER_CANCELLED =
  "Un comprobante anulado no representa un hecho económico y no se contabiliza.";
export const VOUCHER_NO_AMOUNT =
  "El comprobante no tiene un monto válido para contabilizar.";
export const EXPENSE_NOT_FOUND = "El gasto no existe.";

/**
 * Voucher type → accounting event.
 *
 * The whole table is declared even though FF1.3-B registers a strategy only for
 * `EGRESO`: the remaining types resolve to an event with no strategy and fail
 * with `STRATEGY_NOT_FOUND`, which is the honest answer. Making them postable in
 * FF1.4 means writing five strategy files — this caller does not change.
 */
const VOUCHER_EVENT: Record<VoucherTypeValue, PostingEventValue> = {
  INGRESO: "COMPROBANTE_INGRESO",
  EGRESO: "COMPROBANTE_EGRESO",
  CHEQUE: "COMPROBANTE_CHEQUE",
  TRANSFERENCIA: "COMPROBANTE_TRANSFERENCIA",
  REEMBOLSO: "COMPROBANTE_REEMBOLSO",
  AJUSTE: "COMPROBANTE_AJUSTE",
};

/** Columns the posting needs from a voucher. */
export const voucherPostingSelect = {
  id: true,
  branchId: true,
  type: true,
  status: true,
  voucherNumber: true,
  voucherDate: true,
  beneficiary: true,
  concept: true,
  amount: true,
  currency: true,
} as const;

export type VoucherForPosting = {
  id: string;
  branchId: string;
  type: string;
  status: string;
  voucherNumber: string;
  voucherDate: Date;
  beneficiary: string;
  concept: string;
  amount: Prisma.Decimal;
  currency: string | null;
};

/** Builds the engine request from a voucher row. No side effect. */
export function buildVoucherPostingRequest(
  voucher: VoucherForPosting,
): PostingRequest {
  return {
    event: VOUCHER_EVENT[voucher.type as VoucherTypeValue],
    source: { type: "ACCOUNTING_VOUCHER", id: voucher.id },
    branchId: voucher.branchId,
    accountingDate: voucher.voucherDate,
    currency: voucher.currency,
    description: `Comprobante ${voucher.voucherNumber} · ${voucher.beneficiary}`,
    journalSource: "DOCUMENTO",
    payload: {
      voucherId: voucher.id,
      voucherNumber: voucher.voucherNumber,
      amount: decimalToNumber(voucher.amount),
      beneficiary: voucher.beneficiary,
      concept: voucher.concept,
    },
  };
}

/**
 * Patch FF1.4-A — posts a voucher **inside the caller's transaction**.
 *
 * This is what makes the business write and its posting atomic: the voucher and
 * its journal entry are written by the same transaction, so neither can exist
 * without the other. There is no second transaction anywhere in the flow.
 *
 * Returns null when the engine has no strategy for the voucher type. That check
 * asks the **registry**, not a hardcoded list of types: an event is postable
 * exactly when someone wrote a strategy for it, so registering the remaining
 * voucher strategies later starts posting them here with no change to this file.
 */
export async function postVoucherInTransaction(
  ctx: FinancialTransactionContext,
  voucher: VoucherForPosting,
): Promise<PostingResult | null> {
  const event = VOUCHER_EVENT[voucher.type as VoucherTypeValue];
  if (!event || !postingRegistry.has(event)) return null;
  if (voucher.status === "ANULADO") return null;

  return runPostingPipeline(ctx, buildVoucherPostingRequest(voucher));
}

/** The active posting of a voucher, or null. */
export async function findActiveVoucherPosting(
  db: PostingDb,
  voucherId: string,
): Promise<{ id: string } | null> {
  const records = await listPostingRecords(db, {
    sourceType: "ACCOUNTING_VOUCHER",
    sourceId: voucherId,
    status: "CONTABILIZADO",
  });
  return records[0] ? { id: records[0].id } : null;
}

/**
 * Patch FF1.4-A — reverses the posting of a voucher inside the caller's
 * transaction, if it has one. Reuses the engine's reversal pipeline; no
 * reversal logic is recreated here.
 */
export async function reverseVoucherPostingInTransaction(
  ctx: FinancialTransactionContext,
  voucherId: string,
  reason: string,
): Promise<string | null> {
  const active = await findActiveVoucherPosting(ctx.tx, voucherId);
  if (!active) return null;
  const reversed = await runReversalPipeline(ctx, {
    postingRecordId: active.id,
    reason,
  });
  return reversed.reversalJournalEntryId || null;
}

export type PostAccountingVoucherInput = {
  voucherId: string;
  /**
   * When true, re-posting an already-posted voucher is an error instead of
   * converging on the existing entry. Off by default, matching the engine.
   */
  strict?: boolean;
};

/**
 * Posts a comprobante through the engine.
 *
 * The voucher itself is left untouched. `VoucherStatus` has no CONTABILIZADO
 * state, and inventing one would be a business-behaviour change beyond this
 * patch; the `PostingRecord` is the link between the voucher and its entry, and
 * it is what makes a second call idempotent.
 */
export async function postAccountingVoucher(
  input: PostAccountingVoucherInput,
): Promise<FinancialResult<PostingResult>> {
  // The read needs its own gate: delegating straight to `executePosting` would
  // expose voucher data to any server caller before authorization ran. It is the
  // same predicate the engine applies, so no role sees anything new.
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const voucher = await getPrisma().accountingVoucher.findUnique({
    where: { id: input.voucherId },
    select: {
      id: true,
      branchId: true,
      type: true,
      status: true,
      voucherNumber: true,
      voucherDate: true,
      beneficiary: true,
      concept: true,
      amount: true,
      currency: true,
    },
  });
  if (!voucher) return { ok: false, error: VOUCHER_NOT_FOUND };

  // Business rules of the module, not of the engine.
  if (voucher.status === "ANULADO") {
    return { ok: false, error: VOUCHER_CANCELLED };
  }
  const amount = decimalToNumber(voucher.amount);
  if (amount <= 0) return { ok: false, error: VOUCHER_NO_AMOUNT };

  const options: PostingPipelineOptions = input.strict
    ? { strictDuplicates: true }
    : {};

  return executePosting(
    {
      event: VOUCHER_EVENT[voucher.type as VoucherTypeValue],
      source: { type: "ACCOUNTING_VOUCHER", id: voucher.id },
      branchId: voucher.branchId,
      accountingDate: voucher.voucherDate,
      currency: voucher.currency,
      description: `Comprobante ${voucher.voucherNumber} · ${voucher.beneficiary}`,
      journalSource: "DOCUMENTO",
      payload: {
        voucherId: voucher.id,
        voucherNumber: voucher.voucherNumber,
        amount,
        beneficiary: voucher.beneficiary,
        concept: voucher.concept,
      },
    },
    options,
  );
}

// --- Accounting documents (Patch FF1.4-C) --------------------------------

const DOCUMENT_EVENT: Record<AccountingDocumentTypeValue, PostingEventValue> = {
  FACTURA: "DOCUMENTO_FACTURA",
  NOTA_DEBITO: "DOCUMENTO_NOTA_DEBITO",
  NOTA_CREDITO: "DOCUMENTO_NOTA_CREDITO",
  RECIBO_OFICIAL_CAJA: "DOCUMENTO_RECIBO_OFICIAL_CAJA",
};

export type DocumentForPosting = {
  id: string;
  branchId: string;
  type: string;
  status: string;
  documentNumber: string;
  documentDate: Date;
  thirdPartyName: string;
  concept: string;
  subtotal: Prisma.Decimal;
  /** Patch FF2.0-B. */
  tax: Prisma.Decimal;
  retention1: Prisma.Decimal;
  retention2: Prisma.Decimal;
  appliedPayment: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string | null;
};

/** Builds the engine request from a document row. No side effect. */
export function buildDocumentPostingRequest(
  document: DocumentForPosting,
): PostingRequest {
  return {
    event: DOCUMENT_EVENT[document.type as AccountingDocumentTypeValue],
    source: { type: "ACCOUNTING_DOCUMENT", id: document.id },
    branchId: document.branchId,
    accountingDate: document.documentDate,
    currency: document.currency,
    description: `Documento ${document.documentNumber} · ${document.thirdPartyName}`,
    journalSource: "DOCUMENTO",
    payload: {
      documentId: document.id,
      documentNumber: document.documentNumber,
      subtotal: decimalToNumber(document.subtotal),
      tax: decimalToNumber(document.tax),
      retention1: decimalToNumber(document.retention1),
      retention2: decimalToNumber(document.retention2),
      appliedPayment: decimalToNumber(document.appliedPayment),
      total: decimalToNumber(document.total),
      thirdPartyName: document.thirdPartyName,
      concept: document.concept,
    },
  };
}

/**
 * Patch FF1.4-C — posts an accounting document **inside the caller's
 * transaction**, so the CONTABILIZADO transition and its journal entry are
 * written together or not at all.
 *
 * The engine also receives the document id, which lets the writer stamp
 * `JournalEntry.accountingDocumentId` — the traceability column that has existed
 * since Patch 3.5A and that no flow had ever populated (finding I-07 of
 * docs/ACCOUNTING_EVENTS.md).
 *
 * Returns null when no strategy covers the document type: the engine decides
 * what is postable, not a hardcoded list here.
 */
export async function postDocumentInTransaction(
  ctx: FinancialTransactionContext,
  document: DocumentForPosting,
): Promise<PostingResult | null> {
  const event = DOCUMENT_EVENT[document.type as AccountingDocumentTypeValue];
  if (!event || !postingRegistry.has(event)) return null;
  if (document.status === "ANULADO") return null;

  return runPostingPipeline(ctx, buildDocumentPostingRequest(document), {
    accountingDocumentId: document.id,
  });
}

/** The active posting of an accounting document, or null. */
export async function findActiveDocumentPosting(
  db: PostingDb,
  documentId: string,
): Promise<{ id: string } | null> {
  const records = await listPostingRecords(db, {
    sourceType: "ACCOUNTING_DOCUMENT",
    sourceId: documentId,
    status: "CONTABILIZADO",
  });
  return records[0] ? { id: records[0].id } : null;
}

/**
 * Standalone entry point, the document twin of `postAccountingVoucher`. It
 * authorizes, reads and delegates; the lifecycle action posts through
 * `postDocumentInTransaction` instead, so the state change and the entry share
 * one transaction.
 */
export async function postAccountingDocument(input: {
  documentId: string;
  strict?: boolean;
}): Promise<FinancialResult<PostingResult>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const document = await getPrisma().accountingDocument.findUnique({
    where: { id: input.documentId },
    select: {
      id: true,
      branchId: true,
      type: true,
      status: true,
      documentNumber: true,
      documentDate: true,
      thirdPartyName: true,
      concept: true,
      subtotal: true,
      tax: true,
      retention1: true,
      retention2: true,
      appliedPayment: true,
      total: true,
      currency: true,
    },
  });
  if (!document) return { ok: false, error: "El documento no existe." };
  if (document.status === "ANULADO") {
    return {
      ok: false,
      error:
        "Un documento anulado no representa un hecho económico y no se contabiliza.",
    };
  }

  return executePosting(
    buildDocumentPostingRequest(document),
    {
      accountingDocumentId: document.id,
      ...(input.strict ? { strictDuplicates: true } : {}),
    },
  );
}

// --- Expenses (Patch FF1.4-E) --------------------------------------------

export type ExpenseForPosting = {
  id: string;
  branchId: string;
  status: string;
  invoiceNumber: string | null;
  expenseDate: Date;
  supplier: string;
  concept: string;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  retention1: Prisma.Decimal;
  retention2: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string | null;
};

/**
 * An expense has no number column of its own: `invoiceNumber` is the supplier's
 * and is nullable. The id is the fallback so every entry carries a stable,
 * non-empty reference — a display concern, not an accounting one.
 */
function expenseReference(expense: ExpenseForPosting): string {
  return expense.invoiceNumber?.trim() || expense.id;
}

/** Builds the engine request from an expense row. No side effect. */
export function buildExpensePostingRequest(
  expense: ExpenseForPosting,
): PostingRequest {
  const reference = expenseReference(expense);
  return {
    event: "GASTO",
    source: { type: "EXPENSE", id: expense.id },
    branchId: expense.branchId,
    accountingDate: expense.expenseDate,
    currency: expense.currency,
    description: `Gasto ${reference} · ${expense.supplier}`,
    // An expense originates in a supplier document, not in a cash session and
    // not in hand-keyed data; `MANUAL` would misstate where the entry came
    // from. `JournalEntrySource` offers no third option.
    journalSource: "DOCUMENTO",
    payload: {
      expenseId: expense.id,
      reference,
      subtotal: decimalToNumber(expense.subtotal),
      tax: decimalToNumber(expense.tax),
      retention1: decimalToNumber(expense.retention1),
      retention2: decimalToNumber(expense.retention2),
      total: decimalToNumber(expense.total),
      supplier: expense.supplier,
      concept: expense.concept,
    },
  };
}

/**
 * Patch FF1.4-E — posts an expense **inside the caller's transaction**, so the
 * REGISTRADO → REVISADO transition and its journal entry are written together
 * or not at all.
 *
 * Unlike the voucher and document seams there is no annulled state to skip:
 * `ExpenseStatus` is `REGISTRADO | REVISADO` and nothing else.
 */
export async function postExpenseInTransaction(
  ctx: FinancialTransactionContext,
  expense: ExpenseForPosting,
): Promise<PostingResult | null> {
  if (!postingRegistry.has("GASTO")) return null;
  return runPostingPipeline(ctx, buildExpensePostingRequest(expense));
}

/** The active posting of an expense, or null. */
export async function findActiveExpensePosting(
  db: PostingDb,
  expenseId: string,
): Promise<{ id: string } | null> {
  const records = await listPostingRecords(db, {
    sourceType: "EXPENSE",
    sourceId: expenseId,
    status: "CONTABILIZADO",
  });
  return records[0] ? { id: records[0].id } : null;
}

/**
 * Reverses the posting of an expense inside the caller's transaction. Reuses
 * the engine's reversal pipeline; no reversal logic is recreated here.
 *
 * **No lifecycle transition calls this today**: `ExpenseStatus` has no annulled
 * state, so the repository has no event that means "this expense stopped being
 * true". Inventing one would be a business-behaviour change beyond this patch.
 * Reversal stays reachable through the engine's own `reversePosting`, and this
 * helper is what a future cancellation would call. See `docs/POSTING_ENGINE.md`
 * §13.
 */
export async function reverseExpensePostingInTransaction(
  ctx: FinancialTransactionContext,
  expenseId: string,
  reason: string,
): Promise<string | null> {
  const active = await findActiveExpensePosting(ctx.tx, expenseId);
  if (!active) return null;
  const reversed = await runReversalPipeline(ctx, {
    postingRecordId: active.id,
    reason,
  });
  return reversed.reversalJournalEntryId || null;
}

/**
 * Standalone entry point, the expense twin of `postAccountingDocument`. It
 * authorizes, reads and delegates; `reviewExpenseAction` posts through
 * `postExpenseInTransaction` instead, so the state change and the entry share
 * one transaction.
 */
export async function postExpense(input: {
  expenseId: string;
  strict?: boolean;
}): Promise<FinancialResult<PostingResult>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const expense = await getPrisma().expense.findUnique({
    where: { id: input.expenseId },
    select: {
      id: true,
      branchId: true,
      status: true,
      invoiceNumber: true,
      expenseDate: true,
      supplier: true,
      concept: true,
      subtotal: true,
      tax: true,
      retention1: true,
      retention2: true,
      total: true,
      currency: true,
    },
  });
  if (!expense) return { ok: false, error: EXPENSE_NOT_FOUND };

  return executePosting(
    buildExpensePostingRequest(expense),
    input.strict ? { strictDuplicates: true } : {},
  );
}

// --- Payroll (Patch FF1.4-F) ---------------------------------------------

export const PAYROLL_NOT_FOUND = "La planilla no existe.";

export type PayrollForPosting = {
  id: string;
  branchId: string;
  status: string;
  employeeName: string;
  period: string;
  baseSalary: Prisma.Decimal;
  commissions: Prisma.Decimal;
  bonuses: Prisma.Decimal;
  deductions: Prisma.Decimal;
  advances: Prisma.Decimal;
  netPay: Prisma.Decimal;
  currency: string | null;
};

/**
 * `PayrollRecord` has **no date column** — only `period` (`YYYY-MM`, enforced by
 * `sanitizeAccountingPeriod`). The entry needs a date, so it is derived: the
 * last day of the period, in UTC.
 *
 * The month is what actually decides anything, because `accountingPeriodOf`
 * compares the UTC `YYYY-MM` prefix, so any day inside the period locks
 * identically. The last day is chosen because a monthly payroll accrues over
 * the period and is recognized at its close — it is the only choice that never
 * dates the entry before the work it pays for. This is a reasoned choice, not a
 * rule read from the repository; see `docs/POSTING_ENGINE.md` §14.
 *
 * A malformed period yields an invalid date, which the engine's period
 * validator refuses. It fails closed rather than guessing a month.
 */
export function payrollAccountingDate(period: string): Date {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) return new Date(Number.NaN);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0));
}

/** Builds the engine request from a payroll row. No side effect. */
export function buildPayrollPostingRequest(
  payroll: PayrollForPosting,
): PostingRequest {
  const reference = `${payroll.period} · ${payroll.employeeName}`;
  return {
    event: "PLANILLA",
    source: { type: "PAYROLL_RECORD", id: payroll.id },
    branchId: payroll.branchId,
    accountingDate: payrollAccountingDate(payroll.period),
    currency: payroll.currency,
    description: `Planilla ${reference}`,
    // Payroll originates in an internal calculation, not in a third-party
    // document and not in a cash session. `MANUAL` is the honest option of the
    // three `JournalEntrySource` offers.
    journalSource: "MANUAL",
    payload: {
      payrollRecordId: payroll.id,
      reference,
      employeeName: payroll.employeeName,
      period: payroll.period,
      baseSalary: decimalToNumber(payroll.baseSalary),
      commissions: decimalToNumber(payroll.commissions),
      bonuses: decimalToNumber(payroll.bonuses),
      deductions: decimalToNumber(payroll.deductions),
      advances: decimalToNumber(payroll.advances),
      netPay: decimalToNumber(payroll.netPay),
    },
  };
}

/**
 * Patch FF1.4-F — posts a payroll record **inside the caller's transaction**,
 * so the BORRADOR → PREPARADA transition and its journal entry are written
 * together or not at all.
 *
 * `PREPARADA` is the accrual, not the payment: it is the transition guarded by
 * the `review` permission and the point past which `updatePayrollRecordAction`
 * refuses to edit. The later PAGADA transition is **not** posted — the matrix
 * has no payment event to express it with. See `docs/POSTING_ENGINE.md` §14.
 */
export async function postPayrollInTransaction(
  ctx: FinancialTransactionContext,
  payroll: PayrollForPosting,
): Promise<PostingResult | null> {
  if (!postingRegistry.has("PLANILLA")) return null;
  return runPostingPipeline(ctx, buildPayrollPostingRequest(payroll));
}

/** The active posting of a payroll record, or null. */
export async function findActivePayrollPosting(
  db: PostingDb,
  payrollRecordId: string,
): Promise<{ id: string } | null> {
  const records = await listPostingRecords(db, {
    sourceType: "PAYROLL_RECORD",
    sourceId: payrollRecordId,
    status: "CONTABILIZADO",
  });
  return records[0] ? { id: records[0].id } : null;
}

/**
 * Reverses the posting of a payroll record inside the caller's transaction.
 * Reuses the engine's reversal pipeline; no reversal logic is recreated here.
 *
 * **No lifecycle transition calls this today**: `PayrollStatus` is
 * `BORRADOR | PREPARADA | PAGADA` with no annulment and no backward move, so
 * the repository has no event meaning "this payroll stopped being true".
 * Reversal stays reachable through the engine's own `reversePosting`.
 */
export async function reversePayrollPostingInTransaction(
  ctx: FinancialTransactionContext,
  payrollRecordId: string,
  reason: string,
): Promise<string | null> {
  const active = await findActivePayrollPosting(ctx.tx, payrollRecordId);
  if (!active) return null;
  const reversed = await runReversalPipeline(ctx, {
    postingRecordId: active.id,
    reason,
  });
  return reversed.reversalJournalEntryId || null;
}

/**
 * Standalone entry point, the payroll twin of `postExpense`. It authorizes,
 * reads and delegates; `preparePayrollRecordAction` posts through
 * `postPayrollInTransaction` instead, so the state change and the entry share
 * one transaction.
 */
export async function postPayrollRecord(input: {
  payrollRecordId: string;
  strict?: boolean;
}): Promise<FinancialResult<PostingResult>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const payroll = await getPrisma().payrollRecord.findUnique({
    where: { id: input.payrollRecordId },
    select: {
      id: true,
      branchId: true,
      status: true,
      employeeName: true,
      period: true,
      baseSalary: true,
      commissions: true,
      bonuses: true,
      deductions: true,
      advances: true,
      netPay: true,
      currency: true,
    },
  });
  if (!payroll) return { ok: false, error: PAYROLL_NOT_FOUND };

  return executePosting(
    buildPayrollPostingRequest(payroll),
    input.strict ? { strictDuplicates: true } : {},
  );
}

// --- VAT settlement (Patch FF2.0-E) --------------------------------------

export const VAT_SETTLEMENT_NOT_FOUND = "La liquidación de IVA no existe.";

export type VatSettlementForPosting = {
  id: string;
  branchId: string;
  period: string;
  amount: Prisma.Decimal;
  status: string;
  notes: string | null;
};

/**
 * Accounting date of a settlement: the last day of the period it settles, in
 * UTC — the same derivation `payrollAccountingDate` uses, for the same reason.
 * A settlement closes a period; dating it inside that period is what makes the
 * lock judge it against the month being settled.
 */
export function vatSettlementAccountingDate(period: string): Date {
  return payrollAccountingDate(period);
}

/**
 * The settlement's posting identity is **branch + period, not the row id**.
 *
 * That is deliberate. `@@unique([branchId, period])` already guarantees one row
 * per branch and period, so the two are equivalent today — but keying on the
 * period means the identity survives a draft being deleted and redrafted, and
 * it is the identity FF2.0-D already verified. A row id would make "the same
 * period" a different fact every time the draft was recreated.
 */
export function vatSettlementSourceId(settlement: {
  branchId: string;
  period: string;
}): string {
  return `${settlement.branchId}:${settlement.period}`;
}

/** Builds the engine request from a settlement row. No side effect. */
export function buildVatSettlementPostingRequest(
  settlement: VatSettlementForPosting,
): PostingRequest {
  return {
    event: "LIQUIDACION_IVA",
    source: { type: "VAT_SETTLEMENT", id: vatSettlementSourceId(settlement) },
    branchId: settlement.branchId,
    accountingDate: vatSettlementAccountingDate(settlement.period),
    currency: null,
    description: `Liquidación de IVA ${settlement.period}`,
    // Not a third-party document and not a cash session: a settlement is an
    // internal statutory calculation, the same reasoning payroll follows.
    journalSource: "MANUAL",
    payload: {
      period: settlement.period,
      amount: decimalToNumber(settlement.amount),
      concept: settlement.notes?.trim() || "Declaración del período",
    },
  };
}

/**
 * Patch FF2.0-E — posts a settlement **inside the caller's transaction**, so the
 * BORRADOR → EJECUTADA transition and its journal entry are written together or
 * not at all.
 *
 * The engine keeps enforcing idempotency: a second execution of the same
 * branch+period converges on the existing entry rather than duplicating it.
 */
export async function postVatSettlementInTransaction(
  ctx: FinancialTransactionContext,
  settlement: VatSettlementForPosting,
): Promise<PostingResult | null> {
  if (!postingRegistry.has("LIQUIDACION_IVA")) return null;
  return runPostingPipeline(ctx, buildVatSettlementPostingRequest(settlement));
}

/** The active posting of a settlement, or null. */
export async function findActiveVatSettlementPosting(
  db: PostingDb,
  settlement: { branchId: string; period: string },
): Promise<{ id: string } | null> {
  const records = await listPostingRecords(db, {
    sourceType: "VAT_SETTLEMENT",
    sourceId: vatSettlementSourceId(settlement),
    status: "CONTABILIZADO",
  });
  return records[0] ? { id: records[0].id } : null;
}

/**
 * Reverses the posting of a settlement inside the caller's transaction.
 *
 * **No lifecycle transition calls this today**: `VatSettlementStatus` has no
 * annulled state, so nothing means "this settlement stopped being true". Same
 * gap as expenses and payroll — see `docs/POSTING_CONTRACT.md`, blocker B-2.
 */
export async function reverseVatSettlementPostingInTransaction(
  ctx: FinancialTransactionContext,
  settlement: { branchId: string; period: string },
  reason: string,
): Promise<string | null> {
  const active = await findActiveVatSettlementPosting(ctx.tx, settlement);
  if (!active) return null;
  const reversed = await runReversalPipeline(ctx, {
    postingRecordId: active.id,
    reason,
  });
  return reversed.reversalJournalEntryId || null;
}

/**
 * Standalone entry point, the settlement twin of `postPayrollRecord`. The
 * lifecycle action posts through `postVatSettlementInTransaction` instead, so
 * the state change and the entry share one transaction.
 */
export async function postVatSettlement(input: {
  settlementId: string;
  strict?: boolean;
}): Promise<FinancialResult<PostingResult>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const settlement = await getPrisma().vatSettlement.findUnique({
    where: { id: input.settlementId },
    select: {
      id: true,
      branchId: true,
      period: true,
      amount: true,
      status: true,
      notes: true,
    },
  });
  if (!settlement) return { ok: false, error: VAT_SETTLEMENT_NOT_FOUND };

  return executePosting(
    buildVatSettlementPostingRequest(settlement),
    input.strict ? { strictDuplicates: true } : {},
  );
}
