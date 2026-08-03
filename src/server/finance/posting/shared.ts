import type {
  AccountingEventComponent,
  AccountingEventType,
  JournalEntrySource,
  PostingRecordStatus,
} from "@prisma/client";

/**
 * Patch FF1.3-A — client-safe contracts of the posting engine.
 *
 * Pure values and types: no Prisma client, no session, no database access.
 *
 * This module is the vocabulary every stage of the pipeline speaks. It defines
 * *what* a posting is, never *how* any particular business event becomes one:
 * the framework knows about events, components, amounts and accounts, and
 * nothing about sales, cash, receivables, inventory, POS, billing or taxes.
 */

export type PostingEventValue = AccountingEventType;
export type PostingComponentValue = AccountingEventComponent;
export type PostingRecordStatusValue = PostingRecordStatus;
export type PostingJournalSource = JournalEntrySource;

export const postingRecordStatusLabels: Record<
  PostingRecordStatusValue,
  string
> = {
  CONTABILIZADO: "Contabilizado",
  REVERTIDO: "Revertido",
};

/**
 * Source discriminators. A runtime allowlist rather than a database enum, so a
 * new source costs a code change and not a migration — the same decision the
 * financial audit already made for its action list.
 *
 * FF1.3-A registers no strategy, so none of these is produced yet; they are the
 * vocabulary FF1.3-B onward will use.
 */
export const postingSourceTypes = [
  "CASH_DOCUMENT",
  "CASH_CLOSING",
  "ACCOUNTING_DOCUMENT",
  "ACCOUNTING_VOUCHER",
  "EXPENSE",
  "PAYROLL_RECORD",
  "RECEIVABLE_ALLOCATION",
  "RECEIVABLE_PAYMENT",
  /**
   * Patch FF2.0-D. A VAT settlement has no business row of its own, so its
   * identity is the period it settles (`YYYY-MM`). That is what makes the
   * idempotency key meaningful: `LIQUIDACION_IVA:VAT_SETTLEMENT:2026-08` can
   * exist once, so a period cannot be settled twice by accident.
   */
  "VAT_SETTLEMENT",
] as const;

export type PostingSourceType = (typeof postingSourceTypes)[number];

const postingSourceTypeSet = new Set<string>(postingSourceTypes);

export function isPostingSourceType(value: string): value is PostingSourceType {
  return postingSourceTypeSet.has(value);
}

/** What produced the event. The engine only ever treats it as an identity. */
export type PostingSourceRef = {
  type: PostingSourceType;
  id: string;
};

// --- Request -------------------------------------------------------------

/**
 * A business event asking to be posted.
 *
 * `payload` is deliberately `unknown`: the framework must not know the shape of
 * any event. The strategy that owns the event narrows it through its own
 * `parse`, which is both the type boundary and the first validation.
 */
export type PostingRequest = {
  event: PostingEventValue;
  source: PostingSourceRef;
  /** Branch scope; null is an intentionally corporate posting. */
  branchId: string | null;
  /** Date the movement claims. The period lock is judged against it. */
  accountingDate: Date;
  currency?: string | null;
  /** Defaults to `event:sourceType:sourceId`. */
  idempotencyKey?: string | null;
  /** Header concept of the resulting journal entry. */
  description?: string | null;
  /** How the entry declares its provenance; defaults to DOCUMENTO. */
  journalSource?: PostingJournalSource;
  payload: unknown;
};

/**
 * Canonical idempotency key of a request. Deterministic on purpose: two retries
 * of the same business fact must collide at the unique index instead of
 * producing two journal entries.
 */
export function postingIdempotencyKey(request: {
  event: PostingEventValue;
  source: PostingSourceRef;
  idempotencyKey?: string | null;
}): string {
  const explicit = request.idempotencyKey?.trim();
  if (explicit) return explicit.slice(0, 200);
  return `${request.event}:${request.source.type}:${request.source.id}`.slice(
    0,
    200,
  );
}

// --- Plan and draft ------------------------------------------------------

/**
 * One monetary component of an event, as declared by its strategy.
 *
 * A component carries an amount and nothing else: no account, no debit/credit
 * side, no tax, no business meaning beyond the component name. Turning it into
 * accounts is the mapping resolver's job, and turning it into lines is the
 * builder's.
 */
export type PostingComponentAmount = {
  component: PostingComponentValue;
  amount: number;
  concept?: string | null;
};

/** What the dispatcher returns: the strategy's declaration, still accountless. */
export type PostingPlan = {
  event: PostingEventValue;
  components: PostingComponentAmount[];
};

/** A journal line before it exists in the database. */
export type PostingLineDraft = {
  accountId: string;
  accountCode: string;
  debit: number;
  credit: number;
  concept: string | null;
  position: number;
  /** Component that produced the line, for traceability. */
  component: PostingComponentValue;
};

/** A complete, balanced journal entry before it is written. */
export type PostingJournalDraft = {
  lines: PostingLineDraft[];
  debitTotal: number;
  creditTotal: number;
};

// --- Result --------------------------------------------------------------

export type PostingResult = {
  postingRecordId: string;
  journalEntryId: string;
  entryNumber: string;
  event: PostingEventValue;
  idempotencyKey: string;
  lineCount: number;
  totalAmount: number;
  /**
   * True when the event had already been posted and the existing entry is
   * returned untouched. Re-posting is not an error: a caller retrying after a
   * timeout must be able to converge on the same answer.
   */
  alreadyPosted: boolean;
};

// --- Read DTOs -----------------------------------------------------------

export type PostingRecordDTO = {
  id: string;
  event: PostingEventValue;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  journalEntryId: string;
  entryNumber: string;
  branchId: string | null;
  status: PostingRecordStatusValue;
  statusLabel: string;
  accountingDate: string;
  currency: string | null;
  lineCount: number;
  totalAmount: number;
  postedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
};

export type PostingRecordFilters = {
  event?: PostingEventValue;
  sourceType?: string;
  sourceId?: string;
  status?: PostingRecordStatusValue;
  branchId?: string | null;
};
