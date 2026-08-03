import { componentsForEvent } from "@/server/finance/account-mapping/shared";
import { PostingPayloadError } from "@/server/finance/posting/errors";
import type { PostingComponentAmount } from "@/server/finance/posting/shared";
import type { PostingStrategy } from "@/server/finance/posting/strategy";
import { roundFinancialMoney } from "@/server/finance/money";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF2.0-D — posting strategy for VAT settlement (`LIQUIDACION_IVA`).
 *
 * ## Why this event exists at all
 *
 * FF2.0-A…C made tax recognisable on both sides: purchases accumulate a
 * creditable balance, sales accumulate a payable one. Settling those balances
 * against the tax authority is a **different economic fact** — it is statutory,
 * periodic, and it is what closes the cycle the other three patches opened.
 *
 * The alternative was `COMPROBANTE_AJUSTE`, and the repository rules it out:
 * it allows only `TOTAL`, it has no strategy, and the voucher seam binds it to
 * a `VoucherType.AJUSTE` row, so every posting of it originates in an
 * `AccountingVoucher`. A settlement is not a voucher. Burying it there would
 * make a statutory operation indistinguishable from an ordinary correction in
 * every report that groups by event.
 *
 * ## Which components an entry declares
 *
 * `componentsForEvent("LIQUIDACION_IVA")` is `IMPUESTO`, and that is the whole
 * fact: one figure, the net VAT owed to or recoverable from the authority.
 * There is no gross to recognize, nothing was collected, nothing was withheld.
 *
 * This is the only event in the catalogue whose sole component is `IMPUESTO`,
 * and the only one where `IMPUESTO` is not a modifier of something else. That
 * is why X3 does not apply to it: with no `SUBTOTAL` in the event there is
 * nothing for the tax to cancel against, and the mapping validator returns
 * early on its own.
 *
 * ## Direction is the mapping's, as always
 *
 * A period may close owing tax or having credit in favour. This strategy
 * declares an amount and nothing else; whether the settlement debits the
 * payable and credits the bank, or debits a receivable from the authority, is
 * the pair of accounts the active mapping names. **The strategy never looks at
 * the sign, because a negative component would mean "swap the sides" — a
 * decision the mapping owns** (see `validatePostingPlan`).
 *
 * ## What this strategy never does
 *
 * It computes no balance. It does **not** read the ledger to work out what is
 * owed: the amount arrives already determined, and reconciling it against the
 * accumulated VAT accounts is a reporting concern this patch does not touch.
 */

export type VatSettlementPostingPayload = {
  /** Period being settled, `YYYY-MM`. Also the source id, hence the identity. */
  period: string;
  amount: number;
  concept: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseVatSettlementPayload(
  payload: unknown,
): VatSettlementPostingPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;

  if (!isNonEmptyString(candidate.period)) return null;
  if (!isNonEmptyString(candidate.concept)) return null;
  // The period is the settlement's identity, so a malformed one would make the
  // idempotency key meaningless.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(candidate.period)) return null;

  const amount = candidate.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return null;
  }

  return {
    period: candidate.period,
    amount: roundFinancialMoney(amount),
    concept: candidate.concept,
  };
}

const allowed = new Set(componentsForEvent("LIQUIDACION_IVA"));

export const vatSettlementStrategy: PostingStrategy<VatSettlementPostingPayload> =
  {
    event: "LIQUIDACION_IVA",
    description: "Liquidación de IVA",
    parse: parseVatSettlementPayload,
    plan(payload): PostingComponentAmount[] {
      // Asked, never assumed — the same guard every other strategy applies.
      if (!allowed.has("IMPUESTO")) {
        throw new PostingPayloadError(
          `El evento LIQUIDACION_IVA no admite el componente IMPUESTO. No se contabiliza.`,
        );
      }

      // A settlement of nothing is not a settlement. The engine would reject it
      // downstream anyway, but with a message about "no moving amount"; this
      // one names the actual problem.
      if (payload.amount <= 0) {
        throw new PostingPayloadError(
          `La liquidación de IVA del período ${payload.period} no tiene monto por contabilizar.`,
        );
      }

      return [
        {
          component: "IMPUESTO",
          amount: payload.amount,
          concept:
            sanitizeFinancialText(
              `Liquidación de IVA ${payload.period} · ${payload.concept}`,
              300,
            ) ?? `Liquidación de IVA ${payload.period}`,
        },
      ];
    },
  };
