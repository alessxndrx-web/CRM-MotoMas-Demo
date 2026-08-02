import { getPrisma } from "@/server/db/prisma";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { decimalToNumber } from "@/server/finance/money";
import { listPostableEvents } from "@/server/finance/posting/dispatcher";
import {
  runPostingPipeline,
  type PostingPipelineOptions,
} from "@/server/finance/posting/pipeline";
import {
  findPostingRecordWithEntry,
  listPostingRecords,
  type PostingRecordRow,
} from "@/server/finance/posting/repository";
import {
  postingRecordStatusLabels,
  type PostingRecordDTO,
  type PostingRecordFilters,
  type PostingRequest,
  type PostingResult,
} from "@/server/finance/posting/shared";
import {
  runFinancialTransaction,
  type FinancialResult,
} from "@/server/finance/transaction";

/**
 * Patch FF1.3-A — authorized entry point of the posting engine.
 *
 * This is the seam between the engine and the rest of the application: it
 * authorizes, opens the financial transaction and hands control to the pipeline.
 * It holds no accounting rule of its own.
 *
 * Authorization is `authorizeFinancialFoundation` — Admin and Contador with a
 * global accounting scope — the same predicate numbering, mapping, the chart of
 * accounts and receivables already use. **No role changed.**
 *
 * These are plain server functions, not `"use server"` actions, following the
 * FF1.0 precedent: nothing calls the engine yet, and exposing an RPC endpoint
 * that can write to the ledger before a single strategy exists would be an
 * attack surface with no purpose.
 *
 * **No strategy is registered in FF1.3-A.** Every call therefore fails with
 * `STRATEGY_NOT_FOUND`, which is the intended state: the infrastructure ships
 * without changing the accounting behaviour of anything.
 */

const POSTING_ROUTES = ["/panel/contabilidad"] as const;

export async function executePosting(
  request: PostingRequest,
  options: PostingPipelineOptions = {},
): Promise<FinancialResult<PostingResult>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: POSTING_ROUTES,
    uniqueErrorMessages: {
      posting_records_idempotency_key_key:
        "Ese evento ya fue contabilizado por otra operación simultánea.",
      posting_records_journal_entry_id_key:
        "El asiento generado ya pertenece a otra contabilización.",
      journal_entries_entry_number_key:
        "Ya existe un asiento con ese número. Intenta de nuevo.",
    },
    errorMessage: "No se pudo contabilizar el evento.",
    run: (ctx) => runPostingPipeline(ctx, request, options),
  });
}

/** What the engine can post today. Empty until FF1.3-B registers a strategy. */
export async function getPostableEvents(): Promise<
  FinancialResult<Array<{ event: string; description: string }>>
> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, data: listPostableEvents() };
}

// --- Reads ---------------------------------------------------------------

const POSTING_LIST_LIMIT = 200;

function recordToDTO(row: PostingRecordRow): PostingRecordDTO {
  return {
    id: row.id,
    event: row.event,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    idempotencyKey: row.idempotencyKey,
    journalEntryId: row.journalEntryId,
    entryNumber: row.journalEntry.entryNumber,
    branchId: row.branchId,
    status: row.status,
    statusLabel: postingRecordStatusLabels[row.status],
    accountingDate: row.accountingDate.toISOString(),
    currency: row.currency,
    lineCount: row.lineCount,
    totalAmount: decimalToNumber(row.totalAmount),
    postedAt: row.postedAt.toISOString(),
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reversalReason: row.reversalReason,
  };
}

export async function listPostings(
  filters: PostingRecordFilters = {},
): Promise<FinancialResult<PostingRecordDTO[]>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const rows = await listPostingRecords(
    getPrisma(),
    filters,
    POSTING_LIST_LIMIT,
  );
  return { ok: true, data: rows.map(recordToDTO) };
}

export async function getPostingDetail(
  postingRecordId: string,
): Promise<FinancialResult<PostingRecordDTO>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const row = await findPostingRecordWithEntry(
    getPrisma(),
    postingRecordId,
  );
  if (!row) return { ok: false, error: "La contabilización no existe." };
  return { ok: true, data: recordToDTO(row) };
}
