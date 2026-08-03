import {
  postingRegistry,
  registerStrategy,
} from "@/server/finance/posting/registry";
import {
  accountingDocumentCreditNoteStrategy,
  accountingDocumentDebitNoteStrategy,
  accountingDocumentInvoiceStrategy,
  accountingDocumentReceiptStrategy,
} from "@/server/finance/posting/strategies/accounting-document";
import { accountingVoucherEgresoStrategy } from "@/server/finance/posting/strategies/accounting-voucher";
import {
  cashCreditNoteStrategy,
  cashDebitNoteStrategy,
  cashInvoiceStrategy,
  cashReceiptStrategy,
} from "@/server/finance/posting/strategies/cash-document";
import { expenseStrategy } from "@/server/finance/posting/strategies/expense";
import { payrollStrategy } from "@/server/finance/posting/strategies/payroll";
import type { PostingStrategy } from "@/server/finance/posting/strategy";

/**
 * Patch FF1.3-B — the registration point.
 *
 * Importing this module inscribes every known strategy in the default registry.
 * `posting/service.ts` imports it for its side effect, so the engine's public
 * entry point always sees the strategies without any component of the pipeline
 * knowing they exist.
 *
 * Adding an accounting event in FF1.4 means writing a strategy file and adding
 * one line here. The dispatcher, validator, builder and writer stay untouched —
 * which is the property FF1.3-A was built for and this patch verifies.
 *
 * The `has` guard exists because `register` throws on a duplicate event, and Next
 * can re-evaluate a module during development hot reloads. Without it, the
 * second evaluation would crash the process at import time.
 */
/**
 * Registers a strategy once. Generic per call on purpose: each strategy is
 * strongly typed on its own payload, and a heterogeneous array would collapse
 * them into a union the registry cannot accept.
 */
function ensureRegistered<TPayload>(strategy: PostingStrategy<TPayload>): void {
  if (!postingRegistry.has(strategy.event)) registerStrategy(strategy);
}

ensureRegistered(accountingVoucherEgresoStrategy);
ensureRegistered(accountingDocumentInvoiceStrategy);
ensureRegistered(accountingDocumentDebitNoteStrategy);
ensureRegistered(accountingDocumentCreditNoteStrategy);
ensureRegistered(accountingDocumentReceiptStrategy);
ensureRegistered(cashInvoiceStrategy);
ensureRegistered(cashReceiptStrategy);
ensureRegistered(cashDebitNoteStrategy);
ensureRegistered(cashCreditNoteStrategy);
ensureRegistered(expenseStrategy);
ensureRegistered(payrollStrategy);

export {
  accountingVoucherEgresoStrategy,
  accountingDocumentInvoiceStrategy,
  accountingDocumentDebitNoteStrategy,
  accountingDocumentCreditNoteStrategy,
  accountingDocumentReceiptStrategy,
  cashInvoiceStrategy,
  cashReceiptStrategy,
  cashDebitNoteStrategy,
  cashCreditNoteStrategy,
  expenseStrategy,
  payrollStrategy,
};
