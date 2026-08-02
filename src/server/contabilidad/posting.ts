import { authorizeFinancialFoundation } from "@/server/finance/context";
import { getPrisma } from "@/server/db/prisma";
import { decimalToNumber } from "@/server/finance/money";
import type { PostingPipelineOptions } from "@/server/finance/posting/pipeline";
import { executePosting } from "@/server/finance/posting/service";
import type {
  PostingEventValue,
  PostingResult,
} from "@/server/finance/posting/shared";
import type { FinancialResult } from "@/server/finance/transaction";
import type { VoucherTypeValue } from "@/server/contabilidad/shared";

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
