import type {
  ReceivableAllocation,
  ReceivableDocument,
  ReceivablePayment,
} from "@prisma/client";

import { getPrisma } from "@/server/db/prisma";
import {
  authorizeFinancialFoundation,
  resolveBranchCodesByIds,
  resolveFinancialBranchId,
} from "@/server/finance/context";
import { UNKNOWN_BRANCH_ERROR } from "@/server/finance/errors";
import {
  decimalToNumber,
  parseFinancialDate,
  roundFinancialMoney,
  sanitizeFinancialCurrency,
  sanitizeFinancialMoney,
} from "@/server/finance/money";
import {
  createAllocation,
  createDocument,
  createPayment,
  findAllocationById,
  findDocumentById,
  findDocumentWithAllocations,
  findPaymentById,
  findPaymentWithAllocations,
  listActiveAllocationsOfPayment,
  listDocuments,
  listPayments,
  sumAllocatedByDocument,
  sumAllocatedByPayment,
  sumAllocatedFromPayment,
  sumAllocatedToDocument,
  updateAllocation,
  updateDocument,
  updatePayment,
  type ReceivableDocumentRow,
  type ReceivablePaymentRow,
} from "@/server/finance/receivables/repository";
import {
  receivableAllocationStatusLabels,
  receivableBalance,
  receivableOriginLabels,
  receivablePaymentStatusLabels,
  receivableSettlementLabels,
  resolveSettlementStatus,
  unappliedAmount,
  type ReceivableAllocationDTO,
  type ReceivableDocumentDTO,
  type ReceivableDocumentDetailDTO,
  type ReceivableDocumentFilters,
  type ReceivablePartyPositionDTO,
  type ReceivablePaymentDTO,
  type ReceivablePaymentDetailDTO,
  type ReceivablePaymentFilters,
} from "@/server/finance/receivables/shared";
import { sanitizeFinancialText } from "@/server/finance/text";
import {
  runFinancialTransaction,
  type FinancialResult,
  type FinancialTransactionContext,
} from "@/server/finance/transaction";
import type { FinancialAuditField } from "@/server/financial-audit/shared";

/**
 * Patch FF1.2-B — accounts receivable foundation service.
 *
 * The customer's financial position, independent of any cash shift. This is not
 * billing, not the posting engine and not a tax module: it records what is owed,
 * what was collected and how each collection was applied.
 *
 * Five invariants hold everywhere in this file:
 *
 * 1. **No balance is ever stored.** Every figure is recomputed from the
 *    allocation rows inside the transaction that needs it, so a balance cannot
 *    drift from its own history and a stale read cannot authorize a write.
 * 2. **An advance is never deleted, only applied.** A collection with no
 *    allocations is money held in favour of the party; it stays as a row with an
 *    unapplied remainder until someone applies it.
 * 3. **Reversals preserve history.** An allocation or a collection is marked
 *    REVERTIDA/REVERTIDO with who, when and why — never removed.
 * 4. **Over-allocation is impossible.** A collection cannot apply more than it
 *    holds, and an obligation cannot receive more than it owes.
 * 5. **A receivable mirrors a document that already exists.** It never invents a
 *    debt: it is created from an issued Caja or accounting document, one per
 *    source, enforced by a nullable unique column.
 *
 * Authorization is `authorizeFinancialFoundation` — Admin and Contador with a
 * global accounting scope — the same predicate the numbering, mapping and
 * chart-of-accounts services use.
 *
 * These are plain server functions, not `"use server"` actions, following the
 * FF1.0 precedent: no screen consumes them yet, and exposing unused RPC
 * endpoints would enlarge the attack surface for no benefit. The patch that
 * introduces the collections screen wraps them.
 */

const RECEIVABLE_ROUTES = ["/panel/contabilidad"] as const;

const RECEIVABLE_UNIQUE_MESSAGES = {
  receivable_documents_cash_document_id_key:
    "Ese documento de caja ya tiene una cuenta por cobrar registrada.",
  receivable_documents_accounting_document_id_key:
    "Ese documento contable ya tiene una cuenta por cobrar registrada.",
  receivable_payments_payment_number_key:
    "Ya existe un cobro con ese número.",
  receivable_payments_cash_payment_id_key:
    "Ese pago de caja ya fue registrado como cobro.",
} as const;

export const RECEIVABLE_NOT_FOUND = "La cuenta por cobrar no existe.";
export const PAYMENT_NOT_FOUND = "El cobro no existe.";
export const ALLOCATION_NOT_FOUND = "La aplicación no existe.";
export const INVALID_AMOUNT = "El monto no es válido.";
export const INVALID_DATE = "La fecha no es válida.";
export const RECEIVABLE_CANCELLED =
  "La cuenta por cobrar está anulada y no admite aplicaciones.";
export const PAYMENT_REVERSED =
  "El cobro está revertido y no admite aplicaciones.";
export const ALLOCATION_ALREADY_REVERSED = "La aplicación ya fue revertida.";
export const CURRENCY_MISMATCH =
  "La moneda del cobro no coincide con la de la cuenta por cobrar.";
export const SOURCE_NOT_ISSUED =
  "Solo un documento emitido genera una cuenta por cobrar.";
export const NO_PARTY = "Indica el cliente o tercero del cobro.";

// --- Numbering -----------------------------------------------------------

/**
 * Collection number. It follows the prefix+date+random shape the rest of the
 * project still uses.
 *
 * TODO(FF1.0-numbering): the sequential `DocumentSequence` service exists and is
 * exactly what this should consume, but adopting it requires a new
 * `FinancialDocumentSeries` value (an enum migration) and a configured series
 * per branch — an unconfigured series fails closed by design, which would make
 * a fresh installation unable to register a collection. Wiring it is a patch of
 * its own, tracked as inconsistency I-06 in docs/ACCOUNTING_EVENTS.md.
 */
function generateCollectionNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `COB-${date}-${suffix}`;
}

// --- Audit ---------------------------------------------------------------

type ReceivableAuditAction =
  | "RECEIVABLE_DOCUMENT_CREATED"
  | "RECEIVABLE_DOCUMENT_SETTLED"
  | "RECEIVABLE_DOCUMENT_REOPENED"
  | "RECEIVABLE_DOCUMENT_CANCELLED"
  | "RECEIVABLE_PAYMENT_REGISTERED"
  | "RECEIVABLE_PAYMENT_REVERSED"
  | "RECEIVABLE_ALLOCATION_APPLIED"
  | "RECEIVABLE_ALLOCATION_REVERSED";

function documentSnapshot(
  document: ReceivableDocument,
  allocatedAmount: number,
): Partial<Record<FinancialAuditField, unknown>> {
  const originalAmount = decimalToNumber(document.originalAmount);
  return {
    documentNumber: document.documentNumber,
    origin: document.origin,
    originalAmount,
    allocatedAmount,
    balance: receivableBalance({ originalAmount, allocatedAmount }),
    dueDate: document.dueDate,
    settledAt: document.settledAt,
    cancelledAt: document.cancelledAt,
    currency: document.currency,
  };
}

function paymentSnapshot(
  payment: ReceivablePayment,
  allocatedAmount: number,
): Partial<Record<FinancialAuditField, unknown>> {
  const amount = decimalToNumber(payment.amount);
  return {
    paymentNumber: payment.paymentNumber,
    status: payment.status,
    method: payment.method,
    amount,
    allocatedAmount,
    unappliedAmount: unappliedAmount({ amount, allocatedAmount }),
    receivedAt: payment.receivedAt,
    reversedAt: payment.reversedAt,
    currency: payment.currency,
  };
}

async function auditReceivable(
  ctx: FinancialTransactionContext,
  action: ReceivableAuditAction,
  input: {
    entityType:
      | "RECEIVABLE_DOCUMENT"
      | "RECEIVABLE_PAYMENT"
      | "RECEIVABLE_ALLOCATION";
    entityId: string;
    entityCode: string;
    branchId: string;
    reason?: string | null;
    before?: Partial<Record<FinancialAuditField, unknown>> | null;
    after?: Partial<Record<FinancialAuditField, unknown>> | null;
    changedFields?: FinancialAuditField[];
  },
): Promise<void> {
  await ctx.audit({
    // Receivables are accounting records operated by Admin/Contador, so they
    // audit under CONTABILIDAD even when the money entered through a Caja shift.
    domain: "CONTABILIDAD",
    action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityCode: input.entityCode,
    branchId: input.branchId,
    reason: input.reason ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: {
      component: input.entityType === "RECEIVABLE_ALLOCATION" ? "LINE" : "HEADER",
      operation:
        action === "RECEIVABLE_DOCUMENT_CREATED" ||
        action === "RECEIVABLE_PAYMENT_REGISTERED" ||
        action === "RECEIVABLE_ALLOCATION_APPLIED"
          ? "CREATE"
          : "STATUS_CHANGE",
      ...(input.changedFields?.length
        ? { changedFields: input.changedFields }
        : {}),
    },
  });
}

// --- Settlement maintenance ----------------------------------------------

/**
 * Recomputes the settlement event of an obligation from its allocations and
 * writes `settledAt` only when it actually changes.
 *
 * `settledAt` is the one derived value the schema keeps, and it is kept as an
 * *event*, not as a cached balance: it answers "when was this settled", which no
 * sum can reconstruct after the fact. Reversing an allocation clears it, because
 * an obligation that owes money again was never settled at that instant.
 */
async function syncSettlement(
  ctx: FinancialTransactionContext,
  document: ReceivableDocument,
): Promise<{ allocatedAmount: number; balance: number }> {
  const allocatedAmount = await sumAllocatedToDocument(ctx.tx, document.id);
  const originalAmount = decimalToNumber(document.originalAmount);
  const balance = receivableBalance({ originalAmount, allocatedAmount });
  const shouldBeSettled = balance <= 0 && !document.cancelledAt;

  if (shouldBeSettled && !document.settledAt) {
    const before = documentSnapshot(document, allocatedAmount);
    const updated = await updateDocument(ctx.tx, document.id, {
      settledAt: new Date(),
    });
    await auditReceivable(ctx, "RECEIVABLE_DOCUMENT_SETTLED", {
      entityType: "RECEIVABLE_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      before,
      after: documentSnapshot(updated, allocatedAmount),
      changedFields: ["settledAt", "balance"],
    });
  } else if (!shouldBeSettled && document.settledAt) {
    const before = documentSnapshot(document, allocatedAmount);
    const updated = await updateDocument(ctx.tx, document.id, {
      settledAt: null,
    });
    await auditReceivable(ctx, "RECEIVABLE_DOCUMENT_REOPENED", {
      entityType: "RECEIVABLE_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      before,
      after: documentSnapshot(updated, allocatedAmount),
      changedFields: ["settledAt", "balance"],
    });
  }

  return { allocatedAmount, balance };
}

// --- Registering obligations ---------------------------------------------

export type RegisterReceivableInput = {
  /** Exactly one source must be supplied. */
  cashDocumentId?: string | null;
  accountingDocumentId?: string | null;
  dueDate?: string | null;
  notes?: string | null;
};

/**
 * Creates the obligation that mirrors an already issued document.
 *
 * It never invents an amount: `originalAmount` is the source document's total,
 * which is already net of the `appliedPayment` that document carries, so a
 * prepayment baked into the document is not counted a second time here.
 *
 * Idempotent by construction: the source columns are unique, so a second call
 * for the same document fails with a business message instead of duplicating
 * the debt. That is what lets the future Caja→Contabilidad hand-off (FF1.3) run
 * safely over documents that already produced a receivable.
 */
export async function registerReceivableFromDocument(
  input: RegisterReceivableInput,
): Promise<
  FinancialResult<{ receivableId: string; documentNumber: string }>
> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const cashDocumentId = input.cashDocumentId?.trim() || null;
  const accountingDocumentId = input.accountingDocumentId?.trim() || null;
  if (Boolean(cashDocumentId) === Boolean(accountingDocumentId)) {
    return {
      ok: false,
      error: "Indica exactamente un documento de origen (caja o contabilidad).",
    };
  }

  const dueDate = input.dueDate ? parseFinancialDate(input.dueDate) : null;
  if (input.dueDate && !dueDate) return { ok: false, error: INVALID_DATE };
  const notes = sanitizeFinancialText(input.notes, 500);

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: RECEIVABLE_ROUTES,
    uniqueErrorMessages: RECEIVABLE_UNIQUE_MESSAGES,
    errorMessage: "No se pudo registrar la cuenta por cobrar.",
    run: async (ctx) => {
      const source = cashDocumentId
        ? await ctx.tx.cashDocument.findUnique({
            where: { id: cashDocumentId },
            select: {
              id: true,
              branchId: true,
              customerId: true,
              thirdPartyName: true,
              documentNumber: true,
              status: true,
              total: true,
              currency: true,
              issuedAt: true,
            },
          })
        : await ctx.tx.accountingDocument.findUnique({
            where: { id: accountingDocumentId ?? "" },
            select: {
              id: true,
              branchId: true,
              customerId: true,
              thirdPartyId: true,
              thirdPartyName: true,
              documentNumber: true,
              status: true,
              total: true,
              currency: true,
              documentDate: true,
            },
          });
      if (!source) return ctx.fail("El documento de origen no existe.");

      // A draft is not an obligation and an annulled document is not one either.
      const issued = cashDocumentId
        ? source.status === "EMITIDO"
        : source.status !== "BORRADOR" && source.status !== "ANULADO";
      ctx.ensure(issued, SOURCE_NOT_ISSUED);

      const originalAmount = sanitizeFinancialMoney(
        decimalToNumber(source.total),
      );
      if (originalAmount === null || originalAmount <= 0) {
        return ctx.fail(
          "El documento de origen no tiene un monto por cobrar válido.",
        );
      }

      const created = await createDocument(ctx.tx, {
        branchId: source.branchId,
        customerId: source.customerId ?? null,
        thirdPartyId:
          "thirdPartyId" in source ? (source.thirdPartyId ?? null) : null,
        partyName: source.thirdPartyName,
        origin: cashDocumentId ? "CAJA" : "CONTABILIDAD",
        cashDocumentId,
        accountingDocumentId,
        documentNumber: source.documentNumber,
        issuedAt:
          "issuedAt" in source ? source.issuedAt : source.documentDate,
        dueDate,
        originalAmount: source.total,
        currency: source.currency,
        notes,
        createdByUserId: auth.actor.userId,
      });

      await auditReceivable(ctx, "RECEIVABLE_DOCUMENT_CREATED", {
        entityType: "RECEIVABLE_DOCUMENT",
        entityId: created.id,
        entityCode: created.documentNumber,
        branchId: created.branchId,
        after: documentSnapshot(created, 0),
      });

      return { receivableId: created.id, documentNumber: created.documentNumber };
    },
  });
}

/**
 * Marks an obligation as void because its source document was annulled. The row
 * survives with its history; only new applications are refused.
 */
export async function cancelReceivableDocument(input: {
  receivableId: string;
  reason: string;
}): Promise<FinancialResult<{ receivableId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = sanitizeFinancialText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la anulación." };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: RECEIVABLE_ROUTES,
    errorMessage: "No se pudo anular la cuenta por cobrar.",
    run: async (ctx) => {
      const document = await findDocumentById(ctx.tx, input.receivableId);
      if (!document) return ctx.fail(RECEIVABLE_NOT_FOUND);
      ctx.ensure(!document.cancelledAt, "La cuenta por cobrar ya está anulada.");

      const allocatedAmount = await sumAllocatedToDocument(ctx.tx, document.id);
      // Money already applied would be stranded: the collections must be
      // reversed first, so their advances return to the party instead of
      // vanishing with the obligation.
      ctx.ensure(
        allocatedAmount === 0,
        "Revierte primero las aplicaciones de cobro de esta cuenta por cobrar.",
      );

      const before = documentSnapshot(document, allocatedAmount);
      const updated = await updateDocument(ctx.tx, document.id, {
        cancelledAt: new Date(),
        cancelledByUserId: auth.actor.userId,
        cancelReason: reason,
      });
      await auditReceivable(ctx, "RECEIVABLE_DOCUMENT_CANCELLED", {
        entityType: "RECEIVABLE_DOCUMENT",
        entityId: updated.id,
        entityCode: updated.documentNumber,
        branchId: updated.branchId,
        reason,
        before,
        after: documentSnapshot(updated, allocatedAmount),
        changedFields: ["cancelledAt"],
      });
      return { receivableId: updated.id };
    },
  });
}

// --- Collections ---------------------------------------------------------

export type RegisterReceivablePaymentInput = {
  branchCode: string;
  customerId?: string | null;
  thirdPartyId?: string | null;
  /** Free text party, required when neither id is supplied (walk-in). */
  partyName?: string | null;
  method: string;
  amount: number;
  currency?: string | null;
  bank?: string | null;
  reference?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  /** Set when the money entered through a Caja shift. */
  cashPaymentId?: string | null;
  cashSessionId?: string | null;
  /** Optional immediate application; omit to register a pure advance. */
  allocations?: Array<{ receivableId: string; amount: number }>;
};

/**
 * Registers money received from a party, with or without applying it.
 *
 * A collection with no allocations **is** the customer advance: it is not a
 * special record type and it is never deleted, it simply carries an unapplied
 * remainder until someone applies it.
 *
 * `cashPaymentId` links the collection to the Caja payment when the money came
 * through a shift. The cash arqueo (FF1.1-B) keeps reading `CashPayment` as its
 * only source, so a collection mirrored here is never counted twice, and a
 * collection registered outside Caja (a transfer received by the Contador) has
 * no session and correctly does not affect any arqueo.
 */
export async function registerReceivablePayment(
  input: RegisterReceivablePaymentInput,
): Promise<
  FinancialResult<{
    paymentId: string;
    paymentNumber: string;
    allocatedAmount: number;
    unappliedAmount: number;
  }>
> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const amount = sanitizeFinancialMoney(input.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: INVALID_AMOUNT };
  }

  const method = input.method;
  if (
    method !== "EFECTIVO" &&
    method !== "TRANSFERENCIA" &&
    method !== "CHEQUE" &&
    method !== "TARJETA"
  ) {
    return { ok: false, error: "La forma de pago no es válida." };
  }

  const branch = await resolveFinancialBranchId(input.branchCode);
  if (!branch.ok || !branch.branchId) {
    return { ok: false, error: UNKNOWN_BRANCH_ERROR };
  }

  const receivedAt = input.receivedAt
    ? parseFinancialDate(input.receivedAt)
    : new Date();
  if (!receivedAt) return { ok: false, error: INVALID_DATE };

  const currency = input.currency
    ? sanitizeFinancialCurrency(input.currency)
    : null;
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }

  const customerId = input.customerId?.trim() || null;
  const thirdPartyId = input.thirdPartyId?.trim() || null;
  const partyNameInput = sanitizeFinancialText(input.partyName, 200);
  if (!customerId && !thirdPartyId && !partyNameInput) {
    return { ok: false, error: NO_PARTY };
  }

  const branchId = branch.branchId;

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: RECEIVABLE_ROUTES,
    uniqueErrorMessages: RECEIVABLE_UNIQUE_MESSAGES,
    errorMessage: "No se pudo registrar el cobro.",
    run: async (ctx) => {
      // The party name is resolved from the database when an id is supplied, so
      // a client cannot label a collection with someone else's name.
      let partyName = partyNameInput;
      if (customerId) {
        const customer = await ctx.tx.customer.findUnique({
          where: { id: customerId },
          select: { name: true },
        });
        if (!customer) return ctx.fail("El cliente no existe.");
        partyName = customer.name;
      } else if (thirdPartyId) {
        const thirdParty = await ctx.tx.thirdParty.findUnique({
          where: { id: thirdPartyId },
          select: { name: true },
        });
        if (!thirdParty) return ctx.fail("El tercero no existe.");
        partyName = thirdParty.name;
      }
      if (!partyName) return ctx.fail(NO_PARTY);

      const payment = await createPayment(ctx.tx, {
        branchId,
        customerId,
        thirdPartyId,
        partyName,
        paymentNumber: generateCollectionNumber(),
        method,
        amount,
        currency,
        bank: sanitizeFinancialText(input.bank, 120),
        reference: sanitizeFinancialText(input.reference, 120),
        receivedAt,
        cashPaymentId: input.cashPaymentId?.trim() || null,
        cashSessionId: input.cashSessionId?.trim() || null,
        notes: sanitizeFinancialText(input.notes, 500),
        recordedByUserId: auth.actor.userId,
      });

      await auditReceivable(ctx, "RECEIVABLE_PAYMENT_REGISTERED", {
        entityType: "RECEIVABLE_PAYMENT",
        entityId: payment.id,
        entityCode: payment.paymentNumber,
        branchId: payment.branchId,
        after: paymentSnapshot(payment, 0),
      });

      const allocatedAmount = await applyAllocations(ctx, {
        payment,
        actorUserId: auth.actor.userId,
        requests: input.allocations ?? [],
      });

      return {
        paymentId: payment.id,
        paymentNumber: payment.paymentNumber,
        allocatedAmount,
        unappliedAmount: unappliedAmount({
          amount: decimalToNumber(payment.amount),
          allocatedAmount,
        }),
      };
    },
  });
}

/**
 * Applies part or all of an existing collection to one or more obligations.
 * This is how an advance stops being an advance.
 */
export async function allocateReceivablePayment(input: {
  paymentId: string;
  allocations: Array<{ receivableId: string; amount: number }>;
}): Promise<
  FinancialResult<{ paymentId: string; allocatedAmount: number; unappliedAmount: number }>
> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!input.allocations?.length) {
    return { ok: false, error: "Indica al menos una aplicación." };
  }

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: RECEIVABLE_ROUTES,
    errorMessage: "No se pudo aplicar el cobro.",
    run: async (ctx) => {
      const payment = await findPaymentById(ctx.tx, input.paymentId);
      if (!payment) return ctx.fail(PAYMENT_NOT_FOUND);

      await applyAllocations(ctx, {
        payment,
        actorUserId: auth.actor.userId,
        requests: input.allocations,
      });

      const allocatedAmount = await sumAllocatedFromPayment(
        ctx.tx,
        payment.id,
      );
      return {
        paymentId: payment.id,
        allocatedAmount,
        unappliedAmount: unappliedAmount({
          amount: decimalToNumber(payment.amount),
          allocatedAmount,
        }),
      };
    },
  });
}

/**
 * Core of the module: turns application requests into allocation rows.
 *
 * Every amount is validated against state read **inside this transaction** —
 * the collection's unapplied remainder and each obligation's live balance — so
 * two concurrent applications cannot both believe the money is available.
 */
async function applyAllocations(
  ctx: FinancialTransactionContext,
  input: {
    payment: ReceivablePayment;
    actorUserId: string;
    requests: Array<{ receivableId: string; amount: number }>;
  },
): Promise<number> {
  const { payment } = input;
  if (!input.requests.length) {
    return sumAllocatedFromPayment(ctx.tx, payment.id);
  }

  ctx.ensure(payment.status === "REGISTRADO", PAYMENT_REVERSED);

  const paymentAmount = decimalToNumber(payment.amount);
  let allocated = await sumAllocatedFromPayment(ctx.tx, payment.id);

  for (const request of input.requests) {
    const amount = sanitizeFinancialMoney(request.amount);
    if (amount === null || amount <= 0) return ctx.fail(INVALID_AMOUNT);

    const document = await findDocumentById(ctx.tx, request.receivableId);
    if (!document) return ctx.fail(RECEIVABLE_NOT_FOUND);
    ctx.ensure(!document.cancelledAt, RECEIVABLE_CANCELLED);

    // No exchange rate exists anywhere in the project (risk R-03), so mixing
    // currencies here would silently invent one.
    ctx.ensure(
      (document.currency ?? null) === (payment.currency ?? null),
      CURRENCY_MISMATCH,
    );

    const documentAllocated = await sumAllocatedToDocument(
      ctx.tx,
      document.id,
    );
    const documentBalance = receivableBalance({
      originalAmount: decimalToNumber(document.originalAmount),
      allocatedAmount: documentAllocated,
    });
    ctx.ensure(
      amount <= documentBalance,
      `La aplicación excede el saldo de ${document.documentNumber}.`,
    );

    const remaining = roundFinancialMoney(paymentAmount - allocated);
    ctx.ensure(
      amount <= remaining,
      "La aplicación excede el monto disponible del cobro.",
    );

    const allocation = await createAllocation(ctx.tx, {
      paymentId: payment.id,
      receivableDocumentId: document.id,
      amount,
      allocatedByUserId: input.actorUserId,
    });
    allocated = roundFinancialMoney(allocated + amount);

    await auditReceivable(ctx, "RECEIVABLE_ALLOCATION_APPLIED", {
      entityType: "RECEIVABLE_ALLOCATION",
      entityId: allocation.id,
      entityCode: `${payment.paymentNumber}·${document.documentNumber}`,
      branchId: document.branchId,
      after: {
        amount,
        documentNumber: document.documentNumber,
        paymentNumber: payment.paymentNumber,
        balance: receivableBalance({
          originalAmount: decimalToNumber(document.originalAmount),
          allocatedAmount: roundFinancialMoney(documentAllocated + amount),
        }),
      },
    });

    await syncSettlement(ctx, document);
  }

  return allocated;
}

/**
 * Reverses one application. The obligation owes that money again and the
 * collection recovers it as an available advance — nothing disappears.
 */
export async function reverseReceivableAllocation(input: {
  allocationId: string;
  reason: string;
}): Promise<FinancialResult<{ allocationId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = sanitizeFinancialText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la reversión." };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: RECEIVABLE_ROUTES,
    errorMessage: "No se pudo revertir la aplicación.",
    run: async (ctx) => {
      const allocation = await findAllocationById(ctx.tx, input.allocationId);
      if (!allocation) return ctx.fail(ALLOCATION_NOT_FOUND);
      ctx.ensure(
        allocation.status === "APLICADA",
        ALLOCATION_ALREADY_REVERSED,
      );

      await reverseAllocationRow(ctx, allocation, auth.actor.userId, reason);
      return { allocationId: allocation.id };
    },
  });
}

/** Shared by the single reversal and by the reversal of a whole collection. */
async function reverseAllocationRow(
  ctx: FinancialTransactionContext,
  allocation: ReceivableAllocation,
  actorUserId: string,
  reason: string,
): Promise<void> {
  const document = await findDocumentById(
    ctx.tx,
    allocation.receivableDocumentId,
  );
  if (!document) return ctx.fail(RECEIVABLE_NOT_FOUND);

  await updateAllocation(ctx.tx, allocation.id, {
    status: "REVERTIDA",
    reversedAt: new Date(),
    reversedByUserId: actorUserId,
    reversalReason: reason,
  });

  const allocatedAmount = await sumAllocatedToDocument(ctx.tx, document.id);
  await auditReceivable(ctx, "RECEIVABLE_ALLOCATION_REVERSED", {
    entityType: "RECEIVABLE_ALLOCATION",
    entityId: allocation.id,
    entityCode: document.documentNumber,
    branchId: document.branchId,
    reason,
    before: { amount: decimalToNumber(allocation.amount), status: "APLICADA" },
    after: {
      amount: decimalToNumber(allocation.amount),
      status: "REVERTIDA",
      balance: receivableBalance({
        originalAmount: decimalToNumber(document.originalAmount),
        allocatedAmount,
      }),
    },
    changedFields: ["status"],
  });

  // Re-read: `settledAt` must be judged against the row as it is now.
  const current = await findDocumentById(ctx.tx, document.id);
  if (current) await syncSettlement(ctx, current);
}

/**
 * Reverses a whole collection: the money is treated as never received. Every
 * active application it made is reversed first, so the obligations it had
 * settled owe again.
 *
 * The row is kept as REVERTIDO with its reason and author. A collection is
 * never deleted, because the fact that it was once registered is part of the
 * history a supervisor may have already reviewed.
 */
export async function reverseReceivablePayment(input: {
  paymentId: string;
  reason: string;
}): Promise<
  FinancialResult<{ paymentId: string; reversedAllocations: number }>
> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = sanitizeFinancialText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la reversión." };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: RECEIVABLE_ROUTES,
    timeoutMs: 30_000,
    errorMessage: "No se pudo revertir el cobro.",
    run: async (ctx) => {
      const payment = await findPaymentById(ctx.tx, input.paymentId);
      if (!payment) return ctx.fail(PAYMENT_NOT_FOUND);
      ctx.ensure(payment.status === "REGISTRADO", "El cobro ya está revertido.");

      const active = await listActiveAllocationsOfPayment(ctx.tx, payment.id);
      for (const allocation of active) {
        await reverseAllocationRow(
          ctx,
          allocation,
          auth.actor.userId,
          `Reversión del cobro ${payment.paymentNumber}: ${reason}`,
        );
      }

      const before = paymentSnapshot(
        payment,
        await sumAllocatedFromPayment(ctx.tx, payment.id),
      );
      const updated = await updatePayment(ctx.tx, payment.id, {
        status: "REVERTIDO",
        reversedAt: new Date(),
        reversedByUserId: auth.actor.userId,
        reversalReason: reason,
      });
      await auditReceivable(ctx, "RECEIVABLE_PAYMENT_REVERSED", {
        entityType: "RECEIVABLE_PAYMENT",
        entityId: updated.id,
        entityCode: updated.paymentNumber,
        branchId: updated.branchId,
        reason,
        before,
        after: paymentSnapshot(updated, 0),
        changedFields: ["status", "reversedAt"],
      });

      return { paymentId: updated.id, reversedAllocations: active.length };
    },
  });
}

// --- Reads ---------------------------------------------------------------

const RECEIVABLE_LIST_LIMIT = 500;

function allocationToDTO(
  row: ReceivableDocumentRow["allocations"][number],
): ReceivableAllocationDTO {
  return {
    id: row.id,
    paymentId: row.paymentId,
    paymentNumber: row.payment.paymentNumber,
    receivableDocumentId: row.receivableDocumentId,
    receivableDocumentNumber: row.receivableDocument.documentNumber,
    amount: decimalToNumber(row.amount),
    status: row.status,
    statusLabel: receivableAllocationStatusLabels[row.status],
    allocatedAt: row.allocatedAt.toISOString(),
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reversalReason: row.reversalReason,
    notes: row.notes,
  };
}

function documentToDTO(
  row: ReceivableDocumentRow,
  allocatedAmount: number,
  branchCodes: Map<string, string>,
  at: Date,
): ReceivableDocumentDTO {
  const originalAmount = decimalToNumber(row.originalAmount);
  const balance = receivableBalance({ originalAmount, allocatedAmount });
  const settlementStatus = resolveSettlementStatus({
    originalAmount,
    allocatedAmount,
    cancelled: Boolean(row.cancelledAt),
  });
  return {
    id: row.id,
    branchCode: branchCodes.get(row.branchId) ?? row.branch.code,
    branchName: row.branch.name,
    customerId: row.customerId,
    thirdPartyId: row.thirdPartyId,
    partyName: row.partyName,
    origin: row.origin,
    originLabel: receivableOriginLabels[row.origin],
    cashDocumentId: row.cashDocumentId,
    accountingDocumentId: row.accountingDocumentId,
    documentNumber: row.documentNumber,
    issuedAt: row.issuedAt.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    originalAmount,
    allocatedAmount,
    balance,
    settlementStatus,
    settlementLabel: receivableSettlementLabels[settlementStatus],
    settledAt: row.settledAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancelReason: row.cancelReason,
    currency: row.currency,
    notes: row.notes,
    overdue: Boolean(
      row.dueDate && !row.cancelledAt && balance > 0 && row.dueDate < at,
    ),
    allocationCount: row.allocations.filter(
      (allocation) => allocation.status === "APLICADA",
    ).length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function paymentToDTO(
  row: ReceivablePaymentRow,
  allocatedAmount: number,
  branchCodes: Map<string, string>,
): ReceivablePaymentDTO {
  const amount = decimalToNumber(row.amount);
  return {
    id: row.id,
    branchCode: branchCodes.get(row.branchId) ?? row.branch.code,
    branchName: row.branch.name,
    customerId: row.customerId,
    thirdPartyId: row.thirdPartyId,
    partyName: row.partyName,
    paymentNumber: row.paymentNumber,
    method: row.method,
    methodLabel: row.method,
    amount,
    allocatedAmount,
    unappliedAmount: unappliedAmount({ amount, allocatedAmount }),
    status: row.status,
    statusLabel: receivablePaymentStatusLabels[row.status],
    currency: row.currency,
    bank: row.bank,
    reference: row.reference,
    receivedAt: row.receivedAt.toISOString(),
    cashPaymentId: row.cashPaymentId,
    cashSessionId: row.cashSessionId,
    reversedAt: row.reversedAt?.toISOString() ?? null,
    reversalReason: row.reversalReason,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listReceivableDocuments(
  filters: ReceivableDocumentFilters = {},
): Promise<FinancialResult<ReceivableDocumentDTO[]>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const branch = await resolveFinancialBranchId(filters.branchCode);
  if (!branch.ok) return { ok: false, error: UNKNOWN_BRANCH_ERROR };

  const db = getPrisma();
  const rows = await listDocuments(
    db,
    filters,
    branch.branchId,
    RECEIVABLE_LIST_LIMIT,
  );
  const allocated = await sumAllocatedByDocument(
    db,
    rows.map((row) => row.id),
  );
  const branchCodes = await resolveBranchCodesByIds(
    rows.map((row) => row.branchId),
  );
  const now = new Date();

  const data = rows.map((row) =>
    documentToDTO(row, allocated.get(row.id) ?? 0, branchCodes, now),
  );
  // `openOnly` is a settlement filter at the database level; an obligation whose
  // balance is zero without a settlement event (data corrected outside the
  // service) is filtered out here so a list of "open" items never shows a
  // settled one.
  return {
    ok: true,
    data: filters.openOnly ? data.filter((item) => item.balance > 0) : data,
  };
}

export async function getReceivableDocumentDetail(
  receivableId: string,
): Promise<FinancialResult<ReceivableDocumentDetailDTO>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getPrisma();
  const row = await findDocumentWithAllocations(db, receivableId);
  if (!row) return { ok: false, error: RECEIVABLE_NOT_FOUND };

  const allocatedAmount = await sumAllocatedToDocument(db, row.id);
  const branchCodes = await resolveBranchCodesByIds([row.branchId]);
  return {
    ok: true,
    data: {
      ...documentToDTO(row, allocatedAmount, branchCodes, new Date()),
      allocations: row.allocations.map(allocationToDTO),
    },
  };
}

export async function listReceivablePayments(
  filters: ReceivablePaymentFilters = {},
): Promise<FinancialResult<ReceivablePaymentDTO[]>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const branch = await resolveFinancialBranchId(filters.branchCode);
  if (!branch.ok) return { ok: false, error: UNKNOWN_BRANCH_ERROR };

  const db = getPrisma();
  const rows = await listPayments(
    db,
    filters,
    branch.branchId,
    RECEIVABLE_LIST_LIMIT,
  );
  const allocated = await sumAllocatedByPayment(
    db,
    rows.map((row) => row.id),
  );
  const branchCodes = await resolveBranchCodesByIds(
    rows.map((row) => row.branchId),
  );

  const data = rows.map((row) =>
    paymentToDTO(row, allocated.get(row.id) ?? 0, branchCodes),
  );
  return {
    ok: true,
    data: filters.withAdvanceOnly
      ? data.filter(
          (item) => item.status === "REGISTRADO" && item.unappliedAmount > 0,
        )
      : data,
  };
}

export async function getReceivablePaymentDetail(
  paymentId: string,
): Promise<FinancialResult<ReceivablePaymentDetailDTO>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getPrisma();
  const row = await findPaymentWithAllocations(db, paymentId);
  if (!row) return { ok: false, error: PAYMENT_NOT_FOUND };

  const allocatedAmount = await sumAllocatedFromPayment(db, row.id);
  const branchCodes = await resolveBranchCodesByIds([row.branchId]);
  return {
    ok: true,
    data: {
      ...paymentToDTO(row, allocatedAmount, branchCodes),
      allocations: row.allocations.map(allocationToDTO),
    },
  };
}

/**
 * The party's financial position: what they owe, what they have in advance and
 * the net of the two. Every figure is a sum over persisted rows — there is no
 * stored customer balance to go stale.
 */
export async function getReceivablePartyPosition(input: {
  customerId?: string | null;
  thirdPartyId?: string | null;
}): Promise<FinancialResult<ReceivablePartyPositionDTO>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const customerId = input.customerId?.trim() || null;
  const thirdPartyId = input.thirdPartyId?.trim() || null;
  if (!customerId && !thirdPartyId) {
    return { ok: false, error: NO_PARTY };
  }

  const documents = await listReceivableDocuments({
    ...(customerId ? { customerId } : {}),
    ...(thirdPartyId ? { thirdPartyId } : {}),
  });
  if (!documents.ok) return documents;

  const payments = await listReceivablePayments({
    ...(customerId ? { customerId } : {}),
    ...(thirdPartyId ? { thirdPartyId } : {}),
    status: "REGISTRADO",
  });
  if (!payments.ok) return payments;

  const open = documents.data.filter(
    (document) => !document.cancelledAt && document.balance > 0,
  );
  const advances = payments.data.filter((payment) => payment.unappliedAmount > 0);

  const outstandingBalance = roundFinancialMoney(
    open.reduce((sum, document) => sum + document.balance, 0),
  );
  const advanceBalance = roundFinancialMoney(
    advances.reduce((sum, payment) => sum + payment.unappliedAmount, 0),
  );

  return {
    ok: true,
    data: {
      customerId,
      thirdPartyId,
      partyName:
        open[0]?.partyName ?? advances[0]?.partyName ?? documents.data[0]?.partyName ?? "",
      outstandingBalance,
      advanceBalance,
      netPosition: roundFinancialMoney(outstandingBalance - advanceBalance),
      openDocumentCount: open.length,
      overdueDocumentCount: open.filter((document) => document.overdue).length,
      advanceCount: advances.length,
    },
  };
}
