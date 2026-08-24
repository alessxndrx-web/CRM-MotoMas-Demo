import { componentsForEvent } from "@/server/finance/account-mapping/shared";
import { PostingPayloadError } from "@/server/finance/posting/errors";
import type {
  PostingComponentAmount,
  PostingEventValue,
} from "@/server/finance/posting/shared";
import type { PostingStrategy } from "@/server/finance/posting/strategy";
import { roundFinancialMoney } from "@/server/finance/money";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.4-C — posting strategies for accounting documents.
 * Patch FF2.0-B — taxed documents, once `AccountingDocument.tax` existed.
 *
 * One strategy per document event, all built from the same factory because the
 * payload and the component derivation are identical; what differs is the pair
 * of accounts, and that is the mapping's job, not this file's.
 *
 * ## Which components an entry declares, and why
 *
 * The model's own arithmetic decides it. `calculateAccountingDocumentTotal` is:
 *
 *     total = max(subtotal + tax − appliedPayment − retention1 − retention2, 0)
 *
 * so `subtotal` is the gross fact, `tax` is charged **on top of it**, and
 * `total` is what remains to collect once the deductions are applied. Each
 * component the engine receives becomes an independent balanced debit/credit
 * pair, therefore:
 *
 * - declaring `SUBTOTAL` recognizes the whole gross movement;
 * - declaring `IMPUESTO` **adds** the tax on its own account — the revenue or
 *   expense the subtotal recognized is never inflated by it;
 * - declaring each deduction reduces the balance on the account the mapping
 *   names;
 * - declaring `TOTAL` **as well** would recognize the same money twice.
 *
 * The set is not a preference, it is forced by the arithmetic: any other
 * combination double-counts or loses money. This derivation is documented here
 * because neither `ACCOUNTING_EVENTS.md` nor `FINANCIAL_FOUNDATION.md` states
 * which components form a document entry — they state which ones are *allowed*.
 * See the conflict note in `docs/POSTING_ENGINE.md` §11.
 *
 * A modifier worth zero is not declared at all: it did not move, and declaring
 * it would demand a mapping rule for a movement that never happens. An untaxed
 * document therefore posts exactly the entry it posted before FF2.0-B and needs
 * no `IMPUESTO` rule.
 *
 * ## Where the strategy refuses instead of guessing
 *
 * `componentsForEvent` (FF1.0) allows only `TOTAL` for a cash receipt and only
 * `SUBTOTAL`/`TOTAL` for the two note types. A document of those types carrying
 * retentions or an applied payment cannot be expressed: the deduction has no
 * component to travel in and would be silently dropped from the ledger. The
 * strategy refuses that document rather than posting a wrong entry.
 *
 * ## What this strategy never does
 *
 * It chooses no account, decides no debit/credit side and touches no database.
 * A credit note is not negative here: its mapping simply names the accounts the
 * other way round, which is why the same component set works for all four types.
 */

export type AccountingDocumentPostingPayload = {
  documentId: string;
  documentNumber: string;
  subtotal: number;
  /** Patch FF2.0-B. Additive, unlike every other modifier here. */
  tax: number;
  retention1: number;
  retention2: number;
  appliedPayment: number;
  total: number;
  thirdPartyName: string;
  concept: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readMoney(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return roundFinancialMoney(value);
}

function parseDocumentPayload(
  payload: unknown,
): AccountingDocumentPostingPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;

  if (!isNonEmptyString(candidate.documentId)) return null;
  if (!isNonEmptyString(candidate.documentNumber)) return null;
  if (!isNonEmptyString(candidate.thirdPartyName)) return null;
  if (!isNonEmptyString(candidate.concept)) return null;

  const subtotal = readMoney(candidate.subtotal);
  const tax = readMoney(candidate.tax);
  const retention1 = readMoney(candidate.retention1);
  const retention2 = readMoney(candidate.retention2);
  const appliedPayment = readMoney(candidate.appliedPayment);
  const total = readMoney(candidate.total);
  if (
    subtotal === null ||
    tax === null ||
    retention1 === null ||
    retention2 === null ||
    appliedPayment === null ||
    total === null
  ) {
    return null;
  }

  return {
    documentId: candidate.documentId,
    documentNumber: candidate.documentNumber,
    subtotal,
    tax,
    retention1,
    retention2,
    appliedPayment,
    total,
    thirdPartyName: candidate.thirdPartyName,
    concept: candidate.concept,
  };
}

function documentConcept(payload: AccountingDocumentPostingPayload): string {
  return (
    sanitizeFinancialText(
      `${payload.documentNumber} · ${payload.thirdPartyName} · ${payload.concept}`,
      300,
    ) ?? payload.documentNumber
  );
}

function createAccountingDocumentStrategy(
  event: PostingEventValue,
  description: string,
): PostingStrategy<AccountingDocumentPostingPayload> {
  // Read once, from FF1.0's matrix: the strategy never assumes what an event
  // may carry, it asks.
  const allowed = new Set(componentsForEvent(event));

  return {
    event,
    description,
    parse: parseDocumentPayload,
    plan(payload): PostingComponentAmount[] {
      const concept = documentConcept(payload);
      // `IMPUESTO` leads the list because it is the only one that ADDS to the
      // third-party balance; the rest subtract from it. The engine does not
      // care about the order, but a reader of this file should see the
      // distinction immediately.
      const modifiers = [
        { component: "IMPUESTO" as const, amount: payload.tax },
        { component: "RETENCION_1" as const, amount: payload.retention1 },
        { component: "RETENCION_2" as const, amount: payload.retention2 },
        { component: "ABONO_APLICADO" as const, amount: payload.appliedPayment },
      ].filter((modifier) => modifier.amount > 0);

      const unmappable = modifiers.filter(
        (modifier) => !allowed.has(modifier.component),
      );
      if (unmappable.length) {
        throw new PostingPayloadError(
          `El documento ${payload.documentNumber} tiene ${unmappable
            .map((modifier) => modifier.component)
            .join(", ")}, y el evento ${event} no admite ese componente. No se contabiliza para no perder el movimiento.`,
        );
      }

      // A cash receipt recognizes no gross revenue: the money received is the
      // whole fact, which is why its matrix allows TOTAL and nothing else.
      if (!allowed.has("SUBTOTAL")) {
        if (payload.total <= 0) {
          throw new PostingPayloadError(
            `El documento ${payload.documentNumber} no tiene monto por contabilizar.`,
          );
        }
        return [{ component: "TOTAL", amount: payload.total, concept }];
      }

      if (payload.subtotal <= 0) {
        throw new PostingPayloadError(
          `El documento ${payload.documentNumber} no tiene subtotal por contabilizar.`,
        );
      }

      return [
        { component: "SUBTOTAL", amount: payload.subtotal, concept },
        ...modifiers.map((modifier) => ({
          component: modifier.component,
          amount: modifier.amount,
          concept,
        })),
      ];
    },
  };
}

export const accountingDocumentInvoiceStrategy =
  createAccountingDocumentStrategy("DOCUMENTO_FACTURA", "Factura contable");

export const accountingDocumentDebitNoteStrategy =
  createAccountingDocumentStrategy(
    "DOCUMENTO_NOTA_DEBITO",
    "Nota de débito contable",
  );

export const accountingDocumentCreditNoteStrategy =
  createAccountingDocumentStrategy(
    "DOCUMENTO_NOTA_CREDITO",
    "Nota de crédito contable",
  );

export const accountingDocumentReceiptStrategy =
  createAccountingDocumentStrategy(
    "DOCUMENTO_RECIBO_OFICIAL_CAJA",
    "Recibo oficial de caja contable",
  );
