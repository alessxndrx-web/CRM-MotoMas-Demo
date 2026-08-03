import type { Prisma } from "@prisma/client";

import type { CashDocumentTypeValue } from "@/server/caja/shared";
import { decimalToNumber } from "@/server/finance/money";
import {
  runPostingPipeline,
  runReversalPipeline,
} from "@/server/finance/posting/pipeline";
import { postingRegistry } from "@/server/finance/posting/registry";
import {
  listPostingRecords,
  type PostingDb,
} from "@/server/finance/posting/repository";
import type {
  PostingEventValue,
  PostingRequest,
  PostingResult,
} from "@/server/finance/posting/shared";
import type { FinancialTransactionContext } from "@/server/finance/transaction";

/**
 * Patch FF1.4-D — the seam between Caja and the posting engine.
 *
 * It holds only what the module that owns the event knows: which accounting
 * event a document type is, and what its payments add up to. Everything the
 * engine already guarantees — accounting period, account eligibility, journal
 * balance, mapping existence, duplicate posting — is not re-checked here.
 *
 * `caja` importing `finance` is the sanctioned direction; the reverse never
 * happens.
 */

const CASH_DOCUMENT_EVENT: Record<CashDocumentTypeValue, PostingEventValue> = {
  FACTURA: "CAJA_FACTURA",
  RECIBO: "CAJA_RECIBO",
  NOTA_DEBITO: "CAJA_NOTA_DEBITO",
  NOTA_CREDITO: "CAJA_NOTA_CREDITO",
};

export type CashDocumentForPosting = {
  id: string;
  branchId: string;
  type: string;
  status: string;
  documentNumber: string;
  issuedAt: Date;
  thirdPartyName: string;
  concept: string;
  subtotal: Prisma.Decimal;
  /** Patch FF2.0-C. */
  tax: Prisma.Decimal;
  retention1: Prisma.Decimal;
  retention2: Prisma.Decimal;
  appliedPayment: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string | null;
};

export type CashPostingDb = PostingDb &
  Pick<Prisma.TransactionClient, "cashPayment">;

/**
 * Payments of a document, grouped by method.
 *
 * Read from the database inside the caller's transaction, never from the
 * client: the collection is what the ledger will record, so a forged total
 * could not reach it.
 */
export async function readDocumentPaymentTotals(
  db: CashPostingDb,
  documentId: string,
): Promise<Record<string, number>> {
  const groups = await db.cashPayment.groupBy({
    by: ["method"],
    where: { documentId },
    _sum: { amount: true },
  });
  const totals: Record<string, number> = {
    EFECTIVO: 0,
    TRANSFERENCIA: 0,
    CHEQUE: 0,
    TARJETA: 0,
  };
  for (const group of groups) {
    totals[group.method] = decimalToNumber(group._sum.amount);
  }
  return totals;
}

export function buildCashDocumentPostingRequest(
  document: CashDocumentForPosting,
  payments: Record<string, number>,
): PostingRequest {
  return {
    event: CASH_DOCUMENT_EVENT[document.type as CashDocumentTypeValue],
    source: { type: "CASH_DOCUMENT", id: document.id },
    branchId: document.branchId,
    // The document's own issue date, so the period lock is judged against the
    // movement and not against the wall clock.
    accountingDate: document.issuedAt,
    currency: document.currency,
    description: `Caja ${document.documentNumber} · ${document.thirdPartyName}`,
    journalSource: "CAJA",
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
      payments,
    },
  };
}

/**
 * Posts a cash document **inside the caller's transaction**, so issuing it and
 * its journal entry are written together or not at all.
 *
 * Returns null when no strategy covers the document type: the registry decides
 * what is postable, not a hardcoded list here.
 */
export async function postCashDocumentInTransaction(
  ctx: FinancialTransactionContext,
  document: CashDocumentForPosting,
): Promise<PostingResult | null> {
  const event = CASH_DOCUMENT_EVENT[document.type as CashDocumentTypeValue];
  if (!event || !postingRegistry.has(event)) return null;
  if (document.status !== "EMITIDO") return null;

  const payments = await readDocumentPaymentTotals(ctx.tx, document.id);
  return runPostingPipeline(
    ctx,
    buildCashDocumentPostingRequest(document, payments),
  );
}

/** The active posting of a cash document, or null. */
export async function findActiveCashDocumentPosting(
  db: PostingDb,
  documentId: string,
): Promise<{ id: string } | null> {
  const records = await listPostingRecords(db, {
    sourceType: "CASH_DOCUMENT",
    sourceId: documentId,
    status: "CONTABILIZADO",
  });
  return records[0] ? { id: records[0].id } : null;
}

/**
 * Reverses the posting of a cash document inside the caller's transaction, if
 * it has one. Delegates to the engine's reversal pipeline; no reversal logic is
 * recreated.
 */
export async function reverseCashDocumentPostingInTransaction(
  ctx: FinancialTransactionContext,
  documentId: string,
  reason: string,
): Promise<string | null> {
  const active = await findActiveCashDocumentPosting(ctx.tx, documentId);
  if (!active) return null;
  const reversed = await runReversalPipeline(ctx, {
    postingRecordId: active.id,
    reason,
  });
  return reversed.reversalJournalEntryId || null;
}
