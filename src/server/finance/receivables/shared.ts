import type {
  CashPaymentMethod,
  ReceivableAllocationStatus,
  ReceivableOrigin,
  ReceivablePaymentStatus,
} from "@prisma/client";

import { roundFinancialMoney } from "@/server/finance/money";

/**
 * Patch FF1.2-B — client-safe contracts for the accounts receivable foundation.
 *
 * Pure values, types and derivations: no Prisma client, no session, no database
 * access.
 *
 * The rule this module exists to hold is that **a balance is never stored**. It
 * is always Σ of the persisted allocation rows, so it cannot drift from its own
 * history, and no screen can invent one. `settledAt` on a receivable is an
 * event (the moment the balance reached zero), not a cached figure.
 */

export type ReceivableOriginValue = ReceivableOrigin;
export type ReceivablePaymentStatusValue = ReceivablePaymentStatus;
export type ReceivableAllocationStatusValue = ReceivableAllocationStatus;
/** Reused from Caja on purpose: a collection method is one concept, not two. */
export type ReceivableMethodValue = CashPaymentMethod;

export const receivableOriginLabels: Record<ReceivableOriginValue, string> = {
  CAJA: "Caja",
  CONTABILIDAD: "Contabilidad",
};

export const receivablePaymentStatusLabels: Record<
  ReceivablePaymentStatusValue,
  string
> = {
  REGISTRADO: "Registrado",
  REVERTIDO: "Revertido",
};

export const receivableAllocationStatusLabels: Record<
  ReceivableAllocationStatusValue,
  string
> = {
  APLICADA: "Aplicada",
  REVERTIDA: "Revertida",
};

export const receivableOriginValues = Object.keys(
  receivableOriginLabels,
) as ReceivableOriginValue[];

const receivableOriginSet = new Set<string>(receivableOriginValues);

export function isReceivableOriginValue(
  value: string,
): value is ReceivableOriginValue {
  return receivableOriginSet.has(value);
}

// --- Settlement ----------------------------------------------------------

/**
 * Settlement state of an obligation. Derived, never stored: the only thing the
 * database keeps is `settledAt`, the instant the balance first reached zero.
 *
 * `SOBREPAGADO` cannot be produced by this service — over-allocation is
 * rejected — but the state exists so a balance imported or corrected outside
 * the service is reported instead of silently displayed as settled.
 */
export type ReceivableSettlementStatus =
  | "PENDIENTE"
  | "PARCIAL"
  | "SALDADO"
  | "SOBREPAGADO"
  | "ANULADO";

export const receivableSettlementLabels: Record<
  ReceivableSettlementStatus,
  string
> = {
  PENDIENTE: "Pendiente",
  PARCIAL: "Abonado parcialmente",
  SALDADO: "Saldado",
  SOBREPAGADO: "Sobrepagado",
  ANULADO: "Anulado",
};

export function resolveSettlementStatus(input: {
  originalAmount: number;
  allocatedAmount: number;
  cancelled: boolean;
}): ReceivableSettlementStatus {
  if (input.cancelled) return "ANULADO";
  const balance = receivableBalance(input);
  if (balance < 0) return "SOBREPAGADO";
  if (balance === 0) return "SALDADO";
  return input.allocatedAmount > 0 ? "PARCIAL" : "PENDIENTE";
}

/**
 * Outstanding balance of an obligation.
 *
 * Deliberately NOT floored at zero, unlike Caja's `calculateCashBalance`: that
 * one floors because it summarizes unvalidated draft payments, where an
 * over-payment is a data-entry state. Here over-allocation is rejected at write
 * time, so a negative balance means something bypassed the service and must be
 * visible rather than hidden.
 */
export function receivableBalance(input: {
  originalAmount: number;
  allocatedAmount: number;
}): number {
  return roundFinancialMoney(input.originalAmount - input.allocatedAmount);
}

/** Portion of a collection not yet applied to any obligation — the advance. */
export function unappliedAmount(input: {
  amount: number;
  allocatedAmount: number;
}): number {
  return roundFinancialMoney(input.amount - input.allocatedAmount);
}

// --- DTOs ----------------------------------------------------------------

export type ReceivableDocumentDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  customerId: string | null;
  thirdPartyId: string | null;
  partyName: string;
  origin: ReceivableOriginValue;
  originLabel: string;
  cashDocumentId: string | null;
  accountingDocumentId: string | null;
  documentNumber: string;
  issuedAt: string;
  dueDate: string | null;
  originalAmount: number;
  /** Σ of the APLICADA allocations. */
  allocatedAmount: number;
  /** `originalAmount - allocatedAmount`. */
  balance: number;
  settlementStatus: ReceivableSettlementStatus;
  settlementLabel: string;
  settledAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  currency: string | null;
  notes: string | null;
  /** True once the due date has passed and a balance remains. */
  overdue: boolean;
  allocationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ReceivableAllocationDTO = {
  id: string;
  paymentId: string;
  paymentNumber: string;
  receivableDocumentId: string;
  receivableDocumentNumber: string;
  amount: number;
  status: ReceivableAllocationStatusValue;
  statusLabel: string;
  allocatedAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  notes: string | null;
};

export type ReceivablePaymentDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  customerId: string | null;
  thirdPartyId: string | null;
  partyName: string;
  paymentNumber: string;
  method: ReceivableMethodValue;
  methodLabel: string;
  amount: number;
  /** Σ of the APLICADA allocations of this collection. */
  allocatedAmount: number;
  /** `amount - allocatedAmount`: the advance still available. */
  unappliedAmount: number;
  status: ReceivablePaymentStatusValue;
  statusLabel: string;
  currency: string | null;
  bank: string | null;
  reference: string | null;
  receivedAt: string;
  /** Set when the money entered through a Caja shift. */
  cashPaymentId: string | null;
  cashSessionId: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReceivablePaymentDetailDTO = ReceivablePaymentDTO & {
  allocations: ReceivableAllocationDTO[];
};

export type ReceivableDocumentDetailDTO = ReceivableDocumentDTO & {
  allocations: ReceivableAllocationDTO[];
};

/**
 * The customer's financial position. Every figure is a sum over persisted rows;
 * nothing here is stored.
 */
export type ReceivablePartyPositionDTO = {
  customerId: string | null;
  thirdPartyId: string | null;
  partyName: string;
  /** Σ balance of the open, non-cancelled obligations. */
  outstandingBalance: number;
  /** Σ unapplied amount of the active collections — advances in favour. */
  advanceBalance: number;
  /** `outstandingBalance - advanceBalance`: what the party still owes net. */
  netPosition: number;
  openDocumentCount: number;
  overdueDocumentCount: number;
  advanceCount: number;
};

export type ReceivableDocumentFilters = {
  branchCode?: string;
  customerId?: string;
  thirdPartyId?: string;
  origin?: ReceivableOriginValue;
  /** Only obligations with a balance. */
  openOnly?: boolean;
  /** Cancelled obligations are excluded unless this is true. */
  includeCancelled?: boolean;
  overdueOnly?: boolean;
  search?: string;
};

export type ReceivablePaymentFilters = {
  branchCode?: string;
  customerId?: string;
  thirdPartyId?: string;
  status?: ReceivablePaymentStatusValue;
  /** Only collections with an unapplied remainder — the available advances. */
  withAdvanceOnly?: boolean;
  search?: string;
};
