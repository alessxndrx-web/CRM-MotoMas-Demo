"use server";

import {
  Prisma,
  type CashClosing,
  type CashDocument,
  type CashDocumentItem,
  type CashPayment,
  type CashSession,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  canAccessCaja,
  canOperateCaja,
  canReviewCaja,
  getCajaScopeForUser,
  type CajaScope,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import {
  canAccessCashClosing,
  canAccessCashDocument,
  canAccessCashSession,
  resolveCajaBranchIdByCode,
} from "@/server/caja/queries";
import { collectCashClosingInputs } from "@/server/caja/closing";
import {
  postCashDocumentInTransaction,
  reverseCashDocumentPostingInTransaction,
} from "@/server/caja/posting";
import { runFinancialTransaction } from "@/server/finance/transaction";
import {
  calculateCashClosingTotals,
  isCashDocumentTypeValue,
  isCashPaymentMethodValue,
  sanitizeCajaText,
  sanitizeCashCurrency,
  sanitizeCashMoney,
  sanitizeCashQuantity,
  type CashDocumentTypeValue,
  type CashPaymentBreakdown,
  type CashPaymentMethodValue,
} from "@/server/caja/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { decimalToNumber } from "@/server/finance/money";
import {
  DATABASE_REQUIRED_ERROR,
  NO_FINANCIAL_PERMISSION_ERROR,
  UNKNOWN_BRANCH_ERROR,
} from "@/server/finance/errors";
import { recordFinancialAuditEvent } from "@/server/financial-audit/record";

/**
 * PostgreSQL-backed Caja writes (Patch 3.4B). Every action calls requireAuth,
 * enforces Caja role/scope server-side and derives branch ownership from the
 * authenticated actor/session. Nothing here is connected to the legacy UI yet.
 */

// Patch TD-01: shared financial wording lives in one place. The local names
// stay so no call site changes.
const DB_REQUIRED = DATABASE_REQUIRED_ERROR;
const NO_PERMISSION = NO_FINANCIAL_PERMISSION_ERROR;
const NO_SESSION = "El turno no existe o no está en tu alcance.";
const NO_DOCUMENT = "El documento no existe o no está en tu alcance.";
const NO_CLOSING = "El cierre no existe o no está en tu alcance.";
const CLOSED_SESSION = "El turno está cerrado y no admite más operaciones.";
const LOCKED_DOCUMENT =
  "Solo puedes modificar ítems y pagos de un documento en borrador.";

export type CajaActionResult = { ok: true } | { ok: false; error: string };

type CajaActor = {
  userId: string;
  role: UserRoleEnum;
  branchCode: string | null;
  scope: CajaScope;
};

type DocumentItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  position?: number;
};

type PaymentInput = {
  method: string;
  amount: number;
  currency?: string | null;
  bank?: string | null;
  reference?: string | null;
  paidAt?: string | null;
  notes?: string | null;
};

type CashSessionAuditSource = Pick<
  CashSession,
  "status" | "openedAt" | "closedAt" | "cancelledAt" | "notes"
>;

type CashDocumentAuditSource = Pick<
  CashDocument,
  | "type"
  | "documentNumber"
  | "status"
  | "thirdPartyName"
  | "taxId"
  | "concept"
  | "description"
  | "motorcycleDescription"
  | "subtotal"
  | "tax"
  | "appliedPayment"
  | "retention1"
  | "retention2"
  | "total"
  | "currency"
  | "notes"
  | "issuedAt"
  | "cancelledAt"
  | "relatedDocumentNumber"
>;

type CashDocumentItemAuditSource = Pick<
  CashDocumentItem,
  "description" | "quantity" | "unitPrice" | "total" | "position"
>;

type CashPaymentAuditSource = Pick<
  CashPayment,
  | "method"
  | "amount"
  | "currency"
  | "bank"
  | "reference"
  | "paidAt"
  | "notes"
>;

type CashClosingAuditSource = Pick<
  CashClosing,
  | "status"
  | "cashAmount"
  | "transferAmount"
  | "checkAmount"
  | "cardAmount"
  | "expectedCashAmount"
  | "expectedTransferAmount"
  | "expectedCheckAmount"
  | "expectedCardAmount"
  | "expectedTotal"
  | "invoicedTotal"
  | "receivedTotal"
  | "retentionTotal"
  | "difference"
  | "currency"
  | "notes"
  | "preparedAt"
  | "closedAt"
  | "reviewedAt"
>;

function auditMoney(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

function auditQuantity(value: Prisma.Decimal): string {
  return value.toFixed(3);
}

function auditDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function cashSessionAuditCode(row: Pick<CashSession, "openedAt">): string {
  return `TURNO-${row.openedAt.toISOString()}`;
}

function cashClosingAuditCode(row: Pick<CashClosing, "preparedAt">): string {
  return `CIERRE-${row.preparedAt.toISOString()}`;
}

function auditValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cashSessionAuditSnapshot(row: CashSessionAuditSource) {
  return {
    status: row.status,
    openedAt: auditDate(row.openedAt),
    closedAt: auditDate(row.closedAt),
    cancelledAt: auditDate(row.cancelledAt),
    notes: row.notes,
  };
}

function cashDocumentAuditSnapshot(row: CashDocumentAuditSource) {
  return {
    type: row.type,
    documentNumber: row.documentNumber,
    status: row.status,
    thirdPartyName: row.thirdPartyName,
    concept: row.concept,
    description: row.description,
    motorcycleDescription: row.motorcycleDescription,
    subtotal: auditMoney(row.subtotal),
    tax: auditMoney(row.tax),
    appliedPayment: auditMoney(row.appliedPayment),
    retention1: auditMoney(row.retention1),
    retention2: auditMoney(row.retention2),
    total: auditMoney(row.total),
    currency: row.currency,
    notes: row.notes,
    issuedAt: auditDate(row.issuedAt),
    cancelledAt: auditDate(row.cancelledAt),
    relatedDocumentNumber: row.relatedDocumentNumber,
  };
}

function cashDocumentMutationFingerprint(row: CashDocumentAuditSource) {
  return {
    ...cashDocumentAuditSnapshot(row),
    taxId: row.taxId,
  };
}

function cashDocumentItemAuditSnapshot(row: CashDocumentItemAuditSource) {
  return {
    description: row.description,
    quantity: auditQuantity(row.quantity),
    unitPrice: auditMoney(row.unitPrice),
    total: auditMoney(row.total),
    position: row.position,
  };
}

function cashDocumentItemEventSnapshot(
  row: CashDocumentItemAuditSource | null,
  document: Pick<CashDocument, "subtotal" | "total">,
) {
  return {
    description: row?.description ?? null,
    quantity: row ? auditQuantity(row.quantity) : null,
    unitPrice: row ? auditMoney(row.unitPrice) : null,
    amount: row ? auditMoney(row.total) : null,
    position: row?.position ?? null,
    subtotal: auditMoney(document.subtotal),
    total: auditMoney(document.total),
  };
}

function cashPaymentAuditSnapshot(
  row: CashPaymentAuditSource,
  detailsChanged = false,
) {
  return {
    method: row.method,
    amount: auditMoney(row.amount),
    currency: row.currency,
    paidAt: auditDate(row.paidAt),
    bankName: row.bank,
    detailsChanged,
  };
}

function cashPaymentMutationFingerprint(row: CashPaymentAuditSource) {
  return {
    ...cashPaymentAuditSnapshot(row),
    bank: row.bank,
    reference: row.reference,
    notes: row.notes,
  };
}

function cashClosingAuditSnapshot(row: CashClosingAuditSource) {
  return {
    status: row.status,
    cashAmount: auditMoney(row.cashAmount),
    transferAmount: auditMoney(row.transferAmount),
    checkAmount: auditMoney(row.checkAmount),
    cardAmount: auditMoney(row.cardAmount),
    expectedCashAmount: auditMoney(row.expectedCashAmount),
    expectedTransferAmount: auditMoney(row.expectedTransferAmount),
    expectedCheckAmount: auditMoney(row.expectedCheckAmount),
    expectedCardAmount: auditMoney(row.expectedCardAmount),
    expectedTotal: auditMoney(row.expectedTotal),
    invoicedTotal: auditMoney(row.invoicedTotal),
    receivedTotal: auditMoney(row.receivedTotal),
    retentionTotal: auditMoney(row.retentionTotal),
    difference: auditMoney(row.difference),
    currency: row.currency,
    notes: row.notes,
    preparedAt: auditDate(row.preparedAt),
    closedAt: auditDate(row.closedAt),
    reviewedAt: auditDate(row.reviewedAt),
  };
}

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

/** Routes the Caja writes invalidate, shared with . */
const cajaRoutes = [
  "/panel/caja",
  "/panel/caja/facturacion",
  "/panel/caja/recibos",
  "/panel/caja/notas",
  "/panel/caja/cierres",
] as const;

function revalidateCajaRoutes() {
  for (const route of cajaRoutes) revalidatePath(route);
}

async function authorizeCaja(
  permission: "access" | "operate" | "review",
): Promise<
  { ok: true; actor: CajaActor } | { ok: false; error: string }
> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  const allowed =
    permission === "operate"
      ? canOperateCaja(session.roleEnum)
      : permission === "review"
        ? canReviewCaja(session.roleEnum)
        : canAccessCaja(session.roleEnum);
  if (!allowed) return { ok: false, error: NO_PERMISSION };

  const branchCode = sessionBranchCode(session.branchId);
  const scope = getCajaScopeForUser(
    session.roleEnum,
    branchCode,
    session.uid,
  );
  if (scope.level === "none") return { ok: false, error: NO_PERMISSION };

  return {
    ok: true,
    actor: {
      userId: session.uid,
      role: session.roleEnum,
      branchCode,
      scope,
    },
  };
}

async function authorizeForSession(cashSessionId: string) {
  const auth = await authorizeCaja("operate");
  if (!auth.ok) return auth;
  if (!(await canAccessCashSession(auth.actor.scope, cashSessionId))) {
    return { ok: false as const, error: NO_SESSION };
  }
  const cashSession = await getPrisma().cashSession.findUnique({
    where: { id: cashSessionId },
    select: {
      id: true,
      branchId: true,
      cashierId: true,
      status: true,
      closedAt: true,
    },
  });
  if (!cashSession) return { ok: false as const, error: NO_SESSION };
  return { ok: true as const, actor: auth.actor, cashSession };
}

async function authorizeForDocument(
  documentId: string,
  existingActor?: CajaActor,
) {
  const auth = existingActor
    ? ({ ok: true, actor: existingActor } as const)
    : await authorizeCaja("operate");
  if (!auth.ok) return auth;
  if (!(await canAccessCashDocument(auth.actor.scope, documentId))) {
    return { ok: false as const, error: NO_DOCUMENT };
  }
  const document = await getPrisma().cashDocument.findUnique({
    where: { id: documentId },
    include: {
      cashSession: { select: { status: true, cashierId: true } },
      payments: { select: { id: true, amount: true } },
      _count: { select: { items: true } },
    },
  });
  if (!document) return { ok: false as const, error: NO_DOCUMENT };
  return { ok: true as const, actor: auth.actor, document };
}

async function authorizeForClosing(closingId: string) {
  const auth = await authorizeCaja("review");
  if (!auth.ok) return auth;
  if (!(await canAccessCashClosing(auth.actor.scope, closingId))) {
    return { ok: false as const, error: NO_CLOSING };
  }
  const closing = await getPrisma().cashClosing.findUnique({
    where: { id: closingId },
    include: { cashSession: { select: { status: true } } },
  });
  if (!closing) return { ok: false as const, error: NO_CLOSING };
  return { ok: true as const, actor: auth.actor, closing };
}

async function resolveOperationalBranch(
  actor: CajaActor,
  requestedBranchCode?: string | null,
): Promise<{ id: string; code: string } | null> {
  const branchCode =
    actor.role === "ADMIN" ? requestedBranchCode?.trim() : actor.branchCode;
  if (!branchCode) return null;
  const branchId = await resolveCajaBranchIdByCode(branchCode);
  return branchId ? { id: branchId, code: branchCode } : null;
}

function requiredText(
  value: string | null | undefined,
  maxLength = 500,
): string | null {
  return sanitizeCajaText(value, maxLength);
}

function optionalText(
  value: string | null | undefined,
  maxLength = 500,
): string | null {
  return sanitizeCajaText(value, maxLength);
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

/**
 * Decimal twin of `calculateCashDocumentTotal` (caja/shared.ts). The two must
 * stay in step: this one writes the column, that one is what the rest of the
 * layer reasons with. Patch FF2.0-C added the `tax` term to both.
 */
function calculateDocumentTotalDecimal(input: {
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  appliedPayment: Prisma.Decimal;
  retention1: Prisma.Decimal;
  retention2: Prisma.Decimal;
}): Prisma.Decimal {
  const result = input.subtotal
    .plus(input.tax)
    .minus(input.appliedPayment)
    .minus(input.retention1)
    .minus(input.retention2);
  return result.isNegative() ? new Prisma.Decimal(0) : result.toDecimalPlaces(2);
}

function validateMoneyOrDefault(
  value: number | null | undefined,
  fallback = 0,
): number | null {
  if (value === null || value === undefined) return fallback;
  return sanitizeCashMoney(value);
}

function normalizeItem(
  item: DocumentItemInput,
  fallbackPosition: number,
):
  | {
      ok: true;
      data: {
        description: string;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        total: Prisma.Decimal;
        position: number;
      };
    }
  | { ok: false; error: string } {
  const description = requiredText(item.description, 500);
  const quantity = sanitizeCashQuantity(item.quantity);
  const unitPrice = sanitizeCashMoney(item.unitPrice);
  if (!description) return { ok: false, error: "La descripción del ítem es obligatoria." };
  if (quantity === null) return { ok: false, error: "La cantidad del ítem no es válida." };
  if (unitPrice === null) return { ok: false, error: "El precio del ítem no es válido." };

  const quantityDecimal = new Prisma.Decimal(quantity.toFixed(3));
  const unitPriceDecimal = toDecimal(unitPrice);
  return {
    ok: true,
    data: {
      description,
      quantity: quantityDecimal,
      unitPrice: unitPriceDecimal,
      total: quantityDecimal.mul(unitPriceDecimal).toDecimalPlaces(2),
      position:
        Number.isInteger(item.position) && (item.position ?? 0) >= 0
          ? (item.position as number)
          : fallbackPosition,
    },
  };
}

function normalizePayment(
  payment: PaymentInput,
):
  | {
      ok: true;
      data: {
        method: CashPaymentMethodValue;
        amount: Prisma.Decimal;
        currency: string | null;
        bank: string | null;
        reference: string | null;
        paidAt: Date;
        notes: string | null;
      };
    }
  | { ok: false; error: string } {
  if (!isCashPaymentMethodValue(payment.method)) {
    return { ok: false, error: "La forma de pago no es válida." };
  }
  const amount = sanitizeCashMoney(payment.amount);
  if (amount === null || amount <= 0) {
    return { ok: false, error: "El monto del pago debe ser mayor que cero." };
  }
  const currency = sanitizeCashCurrency(payment.currency);
  if (payment.currency && !currency) {
    return { ok: false, error: "La moneda del pago no es válida." };
  }
  const paidAt = parseDate(payment.paidAt) ?? new Date();
  if (payment.paidAt && !parseDate(payment.paidAt)) {
    return { ok: false, error: "La fecha del pago no es válida." };
  }
  return {
    ok: true,
    data: {
      method: payment.method,
      amount: toDecimal(amount),
      currency,
      bank: optionalText(payment.bank, 120),
      reference: optionalText(payment.reference, 120),
      paidAt,
      notes: optionalText(payment.notes),
    },
  };
}

async function validateDocumentRelations(input: {
  branchId: string;
  customerId?: string | null;
  saleId?: string | null;
  reservationId?: string | null;
  relatedDocumentId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const prisma = getPrisma();
  const [customer, sale, reservation, relatedDocument] = await Promise.all([
    input.customerId
      ? prisma.customer.findUnique({
          where: { id: input.customerId },
          select: { id: true },
        })
      : null,
    input.saleId
      ? prisma.sale.findUnique({
          where: { id: input.saleId },
          select: { branchId: true, customerId: true },
        })
      : null,
    input.reservationId
      ? prisma.reservation.findUnique({
          where: { id: input.reservationId },
          select: { branchId: true, customerId: true },
        })
      : null,
    input.relatedDocumentId
      ? prisma.cashDocument.findUnique({
          where: { id: input.relatedDocumentId },
          select: { branchId: true },
        })
      : null,
  ]);

  if (input.customerId && !customer) {
    return { ok: false, error: "El cliente relacionado no existe." };
  }
  if (input.saleId && (!sale || sale.branchId !== input.branchId)) {
    return { ok: false, error: "La venta no pertenece a la sucursal del turno." };
  }
  if (
    input.reservationId &&
    (!reservation || reservation.branchId !== input.branchId)
  ) {
    return { ok: false, error: "La reserva no pertenece a la sucursal del turno." };
  }
  if (
    input.customerId &&
    ((sale && sale.customerId !== input.customerId) ||
      (reservation && reservation.customerId !== input.customerId))
  ) {
    return { ok: false, error: "La venta o reserva no corresponde al cliente." };
  }
  if (
    input.relatedDocumentId &&
    (!relatedDocument || relatedDocument.branchId !== input.branchId)
  ) {
    return {
      ok: false,
      error: "El documento relacionado no pertenece a la sucursal del turno.",
    };
  }
  return { ok: true };
}

function documentPrefix(type: CashDocumentTypeValue): string {
  if (type === "FACTURA") return "FAC-CJA";
  if (type === "RECIBO") return "ROC-CJA";
  if (type === "NOTA_CREDITO") return "NC-CJA";
  return "ND-CJA";
}

function generateDocumentNumber(type: CashDocumentTypeValue): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${documentPrefix(type)}-${date}-${suffix}`;
}

// --- Sessions / shifts --------------------------------------------------

export async function openCashSessionAction(input: {
  branchCode?: string | null;
  notes?: string | null;
}): Promise<
  | { ok: true; cashSessionId: string }
  | { ok: false; error: string }
> {
  const auth = await authorizeCaja("operate");
  if (!auth.ok) return auth;

  const branch = await resolveOperationalBranch(auth.actor, input.branchCode);
  if (!branch) return { ok: false, error: UNKNOWN_BRANCH_ERROR };

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.cashSession.findFirst({
        where: {
          branchId: branch.id,
          cashierId: auth.actor.userId,
          status: "ABIERTO",
        },
        select: { id: true },
      });
      if (existing) {
        return {
          ok: false as const,
          error: "Ya tienes un turno abierto en esta sucursal.",
        };
      }

      const created = await tx.cashSession.create({
        data: {
          branchId: branch.id,
          cashierId: auth.actor.userId,
          notes: optionalText(input.notes),
        },
      });
      await recordFinancialAuditEvent(tx, {
        domain: "CAJA",
        action: "CASH_SESSION_OPENED",
        entityType: "CASH_SESSION",
        entityId: created.id,
        entityCode: cashSessionAuditCode(created),
        actor: { userId: auth.actor.userId, role: auth.actor.role },
        branchId: created.branchId,
        before: null,
        after: cashSessionAuditSnapshot(created),
      });
      return { ok: true as const, cashSessionId: created.id };
    });
    if (!result.ok) return result;
    revalidateCajaRoutes();
    return result;
  } catch (error) {
    /*
     * Patch CB4-A — quien pierde la carrera recibe el motivo, no un genérico.
     *
     * La lectura de arriba sigue atendiendo el caso normal —el cajero que ya
     * tiene turno y vuelve a pulsar— con su mensaje de siempre. Pero entre esa
     * lectura y la inserción cabe otra apertura, y desde CB4-A la base lo
     * rechaza con un índice único parcial. Sin esta rama, ese rechazo salía como
     * «No se pudo abrir el turno», que manda a buscar una avería donde solo hubo
     * una segunda pestaña.
     */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error: "Ya tienes un turno abierto en esta sucursal.",
      };
    }
    return { ok: false, error: "No se pudo abrir el turno de caja." };
  }
}

// --- Documents ----------------------------------------------------------

export type CreateCashDocumentInput = {
  cashSessionId: string;
  type: string;
  documentNumber?: string | null;
  customerId?: string | null;
  saleId?: string | null;
  reservationId?: string | null;
  relatedDocumentId?: string | null;
  relatedDocumentNumber?: string | null;
  thirdPartyName: string;
  taxId?: string | null;
  concept: string;
  description?: string | null;
  motorcycleDescription?: string | null;
  subtotal: number;
  /** Patch FF2.0-C. Additive, mirroring `AccountingDocument.tax`. Absent is 0. */
  tax?: number | null;
  appliedPayment?: number | null;
  retention1?: number | null;
  retention2?: number | null;
  currency?: string | null;
  notes?: string | null;
  items?: DocumentItemInput[];
  payments?: PaymentInput[];
  issueNow?: boolean;
};

export async function createCashDocumentAction(
  input: CreateCashDocumentInput,
): Promise<
  | { ok: true; documentId: string; documentNumber: string }
  | { ok: false; error: string }
> {
  const auth = await authorizeForSession(input.cashSessionId);
  if (!auth.ok) return auth;
  if (auth.cashSession.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }
  if (!isCashDocumentTypeValue(input.type)) {
    return { ok: false, error: "El tipo de documento no es válido." };
  }
  const documentType = input.type;

  const thirdPartyName = requiredText(input.thirdPartyName, 200);
  const concept = requiredText(input.concept, 500);
  if (!thirdPartyName) return { ok: false, error: "El cliente o tercero es obligatorio." };
  if (!concept) return { ok: false, error: "El concepto es obligatorio." };

  const currency = sanitizeCashCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }

  const itemResults = (input.items ?? []).map(normalizeItem);
  const invalidItem = itemResults.find((result) => !result.ok);
  if (invalidItem && !invalidItem.ok) return invalidItem;
  const items = itemResults.flatMap((result) => (result.ok ? [result.data] : []));
  if (input.type !== "FACTURA" && items.length) {
    return { ok: false, error: "Solo las facturas admiten ítems." };
  }
  if (input.issueNow && input.type === "FACTURA" && !items.length) {
    return { ok: false, error: "La factura necesita al menos un ítem antes de emitirse." };
  }

  const paymentResults = (input.payments ?? []).map(normalizePayment);
  const invalidPayment = paymentResults.find((result) => !result.ok);
  if (invalidPayment && !invalidPayment.ok) return invalidPayment;
  const payments = paymentResults.flatMap((result) =>
    result.ok ? [result.data] : [],
  );
  if (
    (input.type === "NOTA_DEBITO" || input.type === "NOTA_CREDITO") &&
    payments.length
  ) {
    return { ok: false, error: "Las notas no registran pagos directos." };
  }

  const inputSubtotal = sanitizeCashMoney(input.subtotal);
  const tax = validateMoneyOrDefault(input.tax);
  const appliedPayment = validateMoneyOrDefault(input.appliedPayment);
  const retention1 = validateMoneyOrDefault(input.retention1);
  const retention2 = validateMoneyOrDefault(input.retention2);
  if (
    inputSubtotal === null ||
    tax === null ||
    appliedPayment === null ||
    retention1 === null ||
    retention2 === null
  ) {
    return { ok: false, error: "Los montos del documento no son válidos." };
  }

  const subtotal =
    input.type === "FACTURA" && items.length
      ? items.reduce(
          (sum, item) => sum.plus(item.total),
          new Prisma.Decimal(0),
        )
      : toDecimal(inputSubtotal);
  const total = calculateDocumentTotalDecimal({
    subtotal,
    tax: toDecimal(tax),
    appliedPayment: toDecimal(appliedPayment),
    retention1: toDecimal(retention1),
    retention2: toDecimal(retention2),
  });
  const paymentTotal = payments.reduce(
    (sum, payment) => sum.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  if (paymentTotal.greaterThan(total)) {
    return { ok: false, error: "Los pagos no pueden superar el total del documento." };
  }

  const relations = await validateDocumentRelations({
    branchId: auth.cashSession.branchId,
    customerId: input.customerId,
    saleId: input.saleId,
    reservationId: input.reservationId,
    relatedDocumentId: input.relatedDocumentId,
  });
  if (!relations.ok) return relations;

  const documentNumber =
    optionalText(input.documentNumber, 100) ?? generateDocumentNumber(documentType);

  try {
    const result = await getPrisma().$transaction(async (tx) => {
      const currentSession = await tx.cashSession.findUnique({
        where: { id: auth.cashSession.id },
        select: { id: true, branchId: true, cashierId: true, status: true },
      });
      if (!currentSession || currentSession.status !== "ABIERTO") {
        return { ok: false as const, error: CLOSED_SESSION };
      }

      const created = await tx.cashDocument.create({
        data: {
          cashSessionId: currentSession.id,
          branchId: currentSession.branchId,
          issuedByUserId: auth.actor.userId,
          customerId: input.customerId || null,
          saleId: input.saleId || null,
          reservationId: input.reservationId || null,
          relatedDocumentId: input.relatedDocumentId || null,
          relatedDocumentNumber: optionalText(input.relatedDocumentNumber, 100),
          type: documentType,
          documentNumber,
          status: input.issueNow ? "EMITIDO" : "BORRADOR",
          thirdPartyName,
          taxId: optionalText(input.taxId, 80),
          concept,
          description: optionalText(input.description, 1_000),
          motorcycleDescription: optionalText(
            input.motorcycleDescription,
            2_000,
          ),
          subtotal,
          tax: toDecimal(tax),
          appliedPayment: toDecimal(appliedPayment),
          retention1: toDecimal(retention1),
          retention2: toDecimal(retention2),
          total,
          currency,
          notes: optionalText(input.notes, 1_000),
          issuedAt: new Date(),
          items: items.length ? { create: items } : undefined,
          payments: payments.length
            ? {
                create: payments.map((payment) => ({
                  ...payment,
                  cashSessionId: currentSession.id,
                  branchId: currentSession.branchId,
                  recordedByUserId: auth.actor.userId,
                })),
              }
            : undefined,
        },
      });
      const snapshot = cashDocumentAuditSnapshot(created);
      await recordFinancialAuditEvent(tx, {
        domain: "CAJA",
        action: "CASH_DOCUMENT_CREATED",
        entityType: "CASH_DOCUMENT",
        entityId: created.id,
        entityCode: created.documentNumber,
        actor: { userId: auth.actor.userId, role: auth.actor.role },
        branchId: created.branchId,
        before: null,
        after: snapshot,
        metadata: {
          itemCount: items.length,
          paymentCount: payments.length,
        },
      });
      if (input.issueNow) {
        await recordFinancialAuditEvent(tx, {
          domain: "CAJA",
          action: "CASH_DOCUMENT_ISSUED",
          entityType: "CASH_DOCUMENT",
          entityId: created.id,
          entityCode: created.documentNumber,
          actor: { userId: auth.actor.userId, role: auth.actor.role },
          branchId: created.branchId,
          before: null,
          after: snapshot,
          metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
        });
      }
      return { ok: true as const, documentId: created.id, documentNumber };
    });
    if (!result.ok) return result;
    revalidateCajaRoutes();
    return result;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, error: "El número de documento ya existe." };
    }
    return { ok: false, error: "No se pudo crear el documento de caja." };
  }
}

export type UpdateCashDocumentInput = {
  documentId: string;
  thirdPartyName?: string;
  taxId?: string | null;
  concept?: string;
  description?: string | null;
  motorcycleDescription?: string | null;
  subtotal?: number;
  appliedPayment?: number;
  tax?: number;
  retention1?: number;
  retention2?: number;
  currency?: string | null;
  notes?: string | null;
};

export async function updateCashDocumentAction(
  input: UpdateCashDocumentInput,
): Promise<CajaActionResult> {
  const auth = await authorizeForDocument(input.documentId);
  if (!auth.ok) return auth;
  const document = auth.document;
  if (document.status !== "BORRADOR") return { ok: false, error: LOCKED_DOCUMENT };
  if (document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }

  const thirdPartyName =
    input.thirdPartyName === undefined
      ? undefined
      : requiredText(input.thirdPartyName, 200);
  const concept =
    input.concept === undefined ? undefined : requiredText(input.concept, 500);
  if (input.thirdPartyName !== undefined && !thirdPartyName) {
    return { ok: false, error: "El cliente o tercero es obligatorio." };
  }
  if (input.concept !== undefined && !concept) {
    return { ok: false, error: "El concepto es obligatorio." };
  }

  const moneyInputs = [
    input.subtotal,
    input.appliedPayment,
    input.retention1,
    input.retention2,
  ];
  if (
    moneyInputs.some(
      (value) => value !== undefined && sanitizeCashMoney(value) === null,
    )
  ) {
    return { ok: false, error: "Los montos del documento no son válidos." };
  }
  const currency =
    input.currency === undefined ? undefined : sanitizeCashCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const current = await tx.cashDocument.findUnique({
      where: { id: document.id },
      include: {
        cashSession: { select: { status: true } },
        payments: { select: { amount: true } },
        _count: { select: { items: true } },
      },
    });
    if (!current) return { ok: false as const, error: NO_DOCUMENT };
    if (current.status !== "BORRADOR") {
      return { ok: false as const, error: LOCKED_DOCUMENT };
    }
    if (current.cashSession?.status !== "ABIERTO") {
      return { ok: false as const, error: CLOSED_SESSION };
    }

    const itemTotal = await tx.cashDocumentItem.aggregate({
      where: { documentId: current.id },
      _sum: { total: true },
    });
    const subtotal =
      current.type === "FACTURA" && current._count.items
        ? itemTotal._sum.total ?? new Prisma.Decimal(0)
        : input.subtotal === undefined
          ? current.subtotal
          : toDecimal(sanitizeCashMoney(input.subtotal) ?? 0);
    const appliedPayment =
      input.appliedPayment === undefined
        ? current.appliedPayment
        : toDecimal(sanitizeCashMoney(input.appliedPayment) ?? 0);
    const tax =
      input.tax === undefined
        ? current.tax
        : toDecimal(sanitizeCashMoney(input.tax) ?? 0);
    const retention1 =
      input.retention1 === undefined
        ? current.retention1
        : toDecimal(sanitizeCashMoney(input.retention1) ?? 0);
    const retention2 =
      input.retention2 === undefined
        ? current.retention2
        : toDecimal(sanitizeCashMoney(input.retention2) ?? 0);
    const total = calculateDocumentTotalDecimal({
      subtotal,
      tax,
      appliedPayment,
      retention1,
      retention2,
    });
    const paidTotal = current.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    if (paidTotal.greaterThan(total)) {
      return {
        ok: false as const,
        error: "El nuevo total sería menor que los pagos registrados.",
      };
    }

    const proposed = {
      ...current,
      thirdPartyName: thirdPartyName ?? current.thirdPartyName,
      taxId:
        input.taxId === undefined
          ? current.taxId
          : optionalText(input.taxId, 80),
      concept: concept ?? current.concept,
      description:
        input.description === undefined
          ? current.description
          : optionalText(input.description, 1_000),
      motorcycleDescription:
        input.motorcycleDescription === undefined
          ? current.motorcycleDescription
          : optionalText(input.motorcycleDescription, 2_000),
      subtotal,
      tax,
      appliedPayment,
      retention1,
      retention2,
      total,
      currency: currency === undefined ? current.currency : currency,
      notes:
        input.notes === undefined
          ? current.notes
          : optionalText(input.notes, 1_000),
    };
    if (
      auditValuesEqual(
        cashDocumentMutationFingerprint(current),
        cashDocumentMutationFingerprint(proposed),
      )
    ) {
      return { ok: true as const };
    }

    const updated = await tx.cashDocument.update({
      where: { id: current.id },
      data: {
        thirdPartyName: proposed.thirdPartyName,
        taxId: proposed.taxId,
        concept: proposed.concept,
        description: proposed.description,
        motorcycleDescription: proposed.motorcycleDescription,
        subtotal,
        tax,
        appliedPayment,
        retention1,
        retention2,
        total,
        currency: proposed.currency,
        notes: proposed.notes,
      },
    });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_DOCUMENT_UPDATED",
      entityType: "CASH_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: updated.branchId,
      before: {
        ...cashDocumentAuditSnapshot(current),
        displayNameChanged: false,
        detailsChanged: false,
      },
      after: {
        ...cashDocumentAuditSnapshot(updated),
        displayNameChanged: current.thirdPartyName !== updated.thirdPartyName,
        detailsChanged:
          current.taxId !== updated.taxId ||
          current.motorcycleDescription !== updated.motorcycleDescription,
      },
      metadata: { component: "HEADER", operation: "UPDATE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}

export async function issueCashDocumentAction(input: {
  documentId: string;
}): Promise<CajaActionResult> {
  const auth = await authorizeForDocument(input.documentId);
  if (!auth.ok) return auth;
  const document = auth.document;
  if (document.status !== "BORRADOR") {
    return { ok: false, error: "Solo puedes emitir un documento en borrador." };
  }
  if (document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }
  if (document.type === "FACTURA" && !document._count.items) {
    return { ok: false, error: "La factura necesita al menos un ítem." };
  }

  // Patch FF1.4-D: adopting `runFinancialTransaction` here is the incremental
  // adoption FF1.0 planned for actions touched for another reason, and it
  // closes a latent trap this action carried: returning `{ ok: false }` from
  // inside a Prisma interactive transaction COMMITS it. Every rejection below
  // now goes through `ctx.fail`, which rolls back.
  const result = await runFinancialTransaction({
    actor: auth.actor,
    revalidate: cajaRoutes,
    errorMessage: "No se pudo emitir el documento.",
    run: async (ctx) => {
      const current = await ctx.tx.cashDocument.findUnique({
        where: { id: document.id },
        include: {
          cashSession: { select: { status: true } },
          payments: { select: { amount: true } },
          _count: { select: { items: true } },
        },
      });
      if (!current) return ctx.fail(NO_DOCUMENT);
      ctx.ensure(
        current.status === "BORRADOR",
        "Solo puedes emitir un documento en borrador.",
      );
      ctx.ensure(
        current.cashSession?.status === "ABIERTO",
        CLOSED_SESSION,
      );
      ctx.ensure(
        current.type !== "FACTURA" || Boolean(current._count.items),
        "La factura necesita al menos un ítem.",
      );

      const itemTotal = await ctx.tx.cashDocumentItem.aggregate({
        where: { documentId: current.id },
        _sum: { total: true },
      });
      const subtotal =
        current.type === "FACTURA"
          ? (itemTotal._sum.total ?? new Prisma.Decimal(0))
          : current.subtotal;
      const total = calculateDocumentTotalDecimal({
        subtotal,
        tax: current.tax,
        appliedPayment: current.appliedPayment,
        retention1: current.retention1,
        retention2: current.retention2,
      });
      const paidTotal = current.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Prisma.Decimal(0),
      );
      ctx.ensure(
        !paidTotal.greaterThan(total),
        "Los pagos superan el total del documento.",
      );

      // Guarded transition (Patch FF1.4-D): the status is re-checked in the
      // WHERE, so two concurrent issues cannot both succeed. SMOKE-FF1.4-D
      // found that with a plain update both did — the engine's unique index
      // still kept the ledger correct, but the document was issued twice and
      // audited twice. This is the same guard the accounting document uses.
      const guarded = await ctx.tx.cashDocument.updateMany({
        where: { id: current.id, status: "BORRADOR" },
        data: { status: "EMITIDO", subtotal, total, issuedAt: new Date() },
      });
      if (guarded.count !== 1) {
        return ctx.fail("Solo puedes emitir un documento en borrador.");
      }
      const updated = await ctx.tx.cashDocument.findUniqueOrThrow({
        where: { id: current.id },
      });
      await ctx.audit({
        domain: "CAJA",
        action: "CASH_DOCUMENT_ISSUED",
        entityType: "CASH_DOCUMENT",
        entityId: updated.id,
        entityCode: updated.documentNumber,
        branchId: updated.branchId,
        before: cashDocumentAuditSnapshot(current),
        after: cashDocumentAuditSnapshot(updated),
      });

      // Issuing is the moment the document becomes an economic fact: its
      // totals are frozen here and no item or payment can be added
      // afterwards. The journal entry is therefore written by this same
      // transaction — either both happen or neither does.
      await postCashDocumentInTransaction(ctx, updated);
      return { ok: true as const };
    },
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function cancelCashDocumentAction(input: {
  documentId: string;
  reason: string;
}): Promise<CajaActionResult> {
  const auth = await authorizeForDocument(input.documentId);
  if (!auth.ok) return auth;
  if (auth.document.status === "ANULADO") {
    return { ok: false, error: "El documento ya está anulado." };
  }
  if (auth.document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }
  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  // Patch FF1.4-D: annulling a document that was posted also reverses its
  // posting, in the SAME transaction. An annulled document can never keep a
  // live journal entry behind it.
  const result = await runFinancialTransaction({
    actor: auth.actor,
    revalidate: cajaRoutes,
    errorMessage: "No se pudo anular el documento.",
    run: async (ctx) => {
      const current = await ctx.tx.cashDocument.findUnique({
        where: { id: auth.document.id },
        include: { cashSession: { select: { status: true } } },
      });
      if (!current) return ctx.fail(NO_DOCUMENT);
      ctx.ensure(
        current.status !== "ANULADO",
        "El documento ya está anulado.",
      );
      ctx.ensure(
        current.cashSession?.status === "ABIERTO",
        CLOSED_SESSION,
      );

      const updated = await ctx.tx.cashDocument.update({
        where: { id: current.id },
        data: { status: "ANULADO", cancelledAt: new Date() },
      });
      await ctx.audit({
        domain: "CAJA",
        action: "CASH_DOCUMENT_CANCELLED",
        entityType: "CASH_DOCUMENT",
        entityId: updated.id,
        entityCode: updated.documentNumber,
        branchId: updated.branchId,
        reason,
        before: cashDocumentAuditSnapshot(current),
        after: cashDocumentAuditSnapshot(updated),
      });

      // Delegates to the engine's reversal pipeline; a document that was
      // never posted simply has nothing to reverse.
      await reverseCashDocumentPostingInTransaction(
        ctx,
        updated.id,
        `Anulación del documento ${updated.documentNumber}: ${reason}`,
      );
      return { ok: true as const };
    },
  });

  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// --- Document items -----------------------------------------------------

async function refreshDraftDocumentTotals(
  tx: Prisma.TransactionClient,
  documentId: string,
) {
  const [document, itemTotal] = await Promise.all([
    tx.cashDocument.findUniqueOrThrow({ where: { id: documentId } }),
    tx.cashDocumentItem.aggregate({
      where: { documentId },
      _sum: { total: true },
    }),
  ]);
  const subtotal = itemTotal._sum.total ?? new Prisma.Decimal(0);
  await tx.cashDocument.update({
    where: { id: documentId },
    data: {
      subtotal,
      total: calculateDocumentTotalDecimal({
        subtotal,
        tax: document.tax,
        appliedPayment: document.appliedPayment,
        retention1: document.retention1,
        retention2: document.retention2,
      }),
    },
  });
}

export async function addCashDocumentItemAction(input: {
  documentId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  position?: number;
}): Promise<CajaActionResult> {
  const auth = await authorizeForDocument(input.documentId);
  if (!auth.ok) return auth;
  if (auth.document.status !== "BORRADOR") return { ok: false, error: LOCKED_DOCUMENT };
  if (auth.document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }
  if (auth.document.type !== "FACTURA") {
    return { ok: false, error: "Solo las facturas admiten ítems." };
  }
  const normalized = normalizeItem(input, auth.document._count.items);
  if (!normalized.ok) return normalized;

  const result = await getPrisma().$transaction(async (tx) => {
    const current = await tx.cashDocument.findUnique({
      where: { id: auth.document.id },
      include: { cashSession: { select: { status: true } } },
    });
    if (!current) return { ok: false as const, error: NO_DOCUMENT };
    if (current.status !== "BORRADOR") {
      return { ok: false as const, error: LOCKED_DOCUMENT };
    }
    if (current.cashSession?.status !== "ABIERTO") {
      return { ok: false as const, error: CLOSED_SESSION };
    }
    if (current.type !== "FACTURA") {
      return {
        ok: false as const,
        error: "Solo las facturas admiten ítems.",
      };
    }

    const created = await tx.cashDocumentItem.create({
      data: { ...normalized.data, documentId: current.id },
    });
    await refreshDraftDocumentTotals(tx, current.id);
    const refreshed = await tx.cashDocument.findUniqueOrThrow({
      where: { id: current.id },
      select: { subtotal: true, total: true },
    });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_DOCUMENT_ITEM_ADDED",
      entityType: "CASH_DOCUMENT",
      entityId: current.id,
      entityCode: current.documentNumber,
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: current.branchId,
      before: cashDocumentItemEventSnapshot(null, current),
      after: cashDocumentItemEventSnapshot(created, refreshed),
      metadata: { component: "ITEM", operation: "CREATE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}

export async function updateCashDocumentItemAction(input: {
  itemId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  position?: number;
}): Promise<CajaActionResult> {
  const gate = await authorizeCaja("operate");
  if (!gate.ok) return gate;
  const item = await getPrisma().cashDocumentItem.findUnique({
    where: { id: input.itemId },
    select: { documentId: true, position: true },
  });
  if (!item) return { ok: false, error: "El ítem no existe." };
  const auth = await authorizeForDocument(item.documentId, gate.actor);
  if (!auth.ok) return auth;
  if (auth.document.status !== "BORRADOR") return { ok: false, error: LOCKED_DOCUMENT };
  if (auth.document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }
  const normalized = normalizeItem(
    { ...input, position: input.position ?? item.position },
    item.position,
  );
  if (!normalized.ok) return normalized;

  const result = await getPrisma().$transaction(async (tx) => {
    const currentItem = await tx.cashDocumentItem.findUnique({
      where: { id: input.itemId },
    });
    if (!currentItem) {
      return { ok: false as const, error: "El ítem no existe." };
    }
    const current = await tx.cashDocument.findUnique({
      where: { id: currentItem.documentId },
      include: { cashSession: { select: { status: true } } },
    });
    if (!current) return { ok: false as const, error: NO_DOCUMENT };
    if (current.status !== "BORRADOR") {
      return { ok: false as const, error: LOCKED_DOCUMENT };
    }
    if (current.cashSession?.status !== "ABIERTO") {
      return { ok: false as const, error: CLOSED_SESSION };
    }
    if (
      auditValuesEqual(
        cashDocumentItemAuditSnapshot(currentItem),
        cashDocumentItemAuditSnapshot(normalized.data),
      )
    ) {
      return { ok: true as const };
    }

    const updated = await tx.cashDocumentItem.update({
      where: { id: currentItem.id },
      data: normalized.data,
    });
    await refreshDraftDocumentTotals(tx, current.id);
    const refreshed = await tx.cashDocument.findUniqueOrThrow({
      where: { id: current.id },
      select: { subtotal: true, total: true },
    });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_DOCUMENT_ITEM_UPDATED",
      entityType: "CASH_DOCUMENT",
      entityId: current.id,
      entityCode: current.documentNumber,
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: current.branchId,
      before: cashDocumentItemEventSnapshot(currentItem, current),
      after: cashDocumentItemEventSnapshot(updated, refreshed),
      metadata: { component: "ITEM", operation: "UPDATE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}

export async function removeCashDocumentItemAction(input: {
  itemId: string;
}): Promise<CajaActionResult> {
  const gate = await authorizeCaja("operate");
  if (!gate.ok) return gate;
  const item = await getPrisma().cashDocumentItem.findUnique({
    where: { id: input.itemId },
    select: { documentId: true },
  });
  if (!item) return { ok: false, error: "El ítem no existe." };
  const auth = await authorizeForDocument(item.documentId, gate.actor);
  if (!auth.ok) return auth;
  if (auth.document.status !== "BORRADOR") return { ok: false, error: LOCKED_DOCUMENT };
  if (auth.document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const currentItem = await tx.cashDocumentItem.findUnique({
      where: { id: input.itemId },
    });
    if (!currentItem) {
      return { ok: false as const, error: "El ítem no existe." };
    }
    const current = await tx.cashDocument.findUnique({
      where: { id: currentItem.documentId },
      include: { cashSession: { select: { status: true } } },
    });
    if (!current) return { ok: false as const, error: NO_DOCUMENT };
    if (current.status !== "BORRADOR") {
      return { ok: false as const, error: LOCKED_DOCUMENT };
    }
    if (current.cashSession?.status !== "ABIERTO") {
      return { ok: false as const, error: CLOSED_SESSION };
    }

    await tx.cashDocumentItem.delete({ where: { id: currentItem.id } });
    await refreshDraftDocumentTotals(tx, current.id);
    const refreshed = await tx.cashDocument.findUniqueOrThrow({
      where: { id: current.id },
      select: { subtotal: true, total: true },
    });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_DOCUMENT_ITEM_REMOVED",
      entityType: "CASH_DOCUMENT",
      entityId: current.id,
      entityCode: current.documentNumber,
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: current.branchId,
      before: cashDocumentItemEventSnapshot(currentItem, current),
      after: cashDocumentItemEventSnapshot(null, refreshed),
      metadata: { component: "ITEM", operation: "REMOVE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}

// --- Payments -----------------------------------------------------------

export async function addCashPaymentAction(input: {
  documentId: string;
  method: string;
  amount: number;
  currency?: string | null;
  bank?: string | null;
  reference?: string | null;
  paidAt?: string | null;
  notes?: string | null;
}): Promise<CajaActionResult> {
  const auth = await authorizeForDocument(input.documentId);
  if (!auth.ok) return auth;
  if (auth.document.status !== "BORRADOR") return { ok: false, error: LOCKED_DOCUMENT };
  if (auth.document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }
  if (
    auth.document.type === "NOTA_DEBITO" ||
    auth.document.type === "NOTA_CREDITO"
  ) {
    return { ok: false, error: "Las notas no registran pagos directos." };
  }
  const normalized = normalizePayment(input);
  if (!normalized.ok) return normalized;
  const existingTotal = auth.document.payments.reduce(
    (sum, payment) => sum.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  if (existingTotal.plus(normalized.data.amount).greaterThan(auth.document.total)) {
    return { ok: false, error: "Los pagos no pueden superar el total del documento." };
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const current = await tx.cashDocument.findUnique({
      where: { id: auth.document.id },
      include: {
        cashSession: { select: { status: true } },
        payments: { select: { amount: true } },
      },
    });
    if (!current) return { ok: false as const, error: NO_DOCUMENT };
    if (current.status !== "BORRADOR") {
      return { ok: false as const, error: LOCKED_DOCUMENT };
    }
    if (current.cashSession?.status !== "ABIERTO") {
      return { ok: false as const, error: CLOSED_SESSION };
    }
    if (current.type === "NOTA_DEBITO" || current.type === "NOTA_CREDITO") {
      return {
        ok: false as const,
        error: "Las notas no registran pagos directos.",
      };
    }
    const currentTotal = current.payments.reduce(
      (sum, payment) => sum.plus(payment.amount),
      new Prisma.Decimal(0),
    );
    if (currentTotal.plus(normalized.data.amount).greaterThan(current.total)) {
      return {
        ok: false as const,
        error: "Los pagos no pueden superar el total del documento.",
      };
    }

    const created = await tx.cashPayment.create({
      data: {
        ...normalized.data,
        cashSessionId: current.cashSessionId,
        documentId: current.id,
        branchId: current.branchId,
        recordedByUserId: auth.actor.userId,
      },
    });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_PAYMENT_ADDED",
      entityType: "CASH_DOCUMENT",
      entityId: current.id,
      entityCode: current.documentNumber,
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: current.branchId,
      before: null,
      after: cashPaymentAuditSnapshot(
        created,
        Boolean(created.reference || created.notes),
      ),
      metadata: { component: "PAYMENT", operation: "CREATE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}

export async function updateCashPaymentAction(input: {
  paymentId: string;
  method: string;
  amount: number;
  currency?: string | null;
  bank?: string | null;
  reference?: string | null;
  paidAt?: string | null;
  notes?: string | null;
}): Promise<CajaActionResult> {
  const gate = await authorizeCaja("operate");
  if (!gate.ok) return gate;
  const payment = await getPrisma().cashPayment.findUnique({
    where: { id: input.paymentId },
    select: { documentId: true, amount: true },
  });
  if (!payment) return { ok: false, error: "El pago no existe." };
  const auth = await authorizeForDocument(payment.documentId, gate.actor);
  if (!auth.ok) return auth;
  if (auth.document.status !== "BORRADOR") return { ok: false, error: LOCKED_DOCUMENT };
  if (auth.document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }
  const normalized = normalizePayment(input);
  if (!normalized.ok) return normalized;
  const otherPayments = auth.document.payments.reduce(
    (sum, row) =>
      row.id === input.paymentId ? sum : sum.plus(row.amount),
    new Prisma.Decimal(0),
  );
  if (otherPayments.plus(normalized.data.amount).greaterThan(auth.document.total)) {
    return { ok: false, error: "Los pagos no pueden superar el total del documento." };
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const currentPayment = await tx.cashPayment.findUnique({
      where: { id: input.paymentId },
    });
    if (!currentPayment) {
      return { ok: false as const, error: "El pago no existe." };
    }
    const current = await tx.cashDocument.findUnique({
      where: { id: currentPayment.documentId },
      include: {
        cashSession: { select: { status: true } },
        payments: { select: { id: true, amount: true } },
      },
    });
    if (!current) return { ok: false as const, error: NO_DOCUMENT };
    if (current.status !== "BORRADOR") {
      return { ok: false as const, error: LOCKED_DOCUMENT };
    }
    if (current.cashSession?.status !== "ABIERTO") {
      return { ok: false as const, error: CLOSED_SESSION };
    }
    const currentOtherPayments = current.payments.reduce(
      (sum, row) =>
        row.id === currentPayment.id ? sum : sum.plus(row.amount),
      new Prisma.Decimal(0),
    );
    if (
      currentOtherPayments
        .plus(normalized.data.amount)
        .greaterThan(current.total)
    ) {
      return {
        ok: false as const,
        error: "Los pagos no pueden superar el total del documento.",
      };
    }

    const proposed = { ...currentPayment, ...normalized.data };
    if (
      auditValuesEqual(
        cashPaymentMutationFingerprint(currentPayment),
        cashPaymentMutationFingerprint(proposed),
      )
    ) {
      return { ok: true as const };
    }
    const detailsChanged =
      currentPayment.bank !== proposed.bank ||
      currentPayment.reference !== proposed.reference ||
      currentPayment.notes !== proposed.notes;
    const updated = await tx.cashPayment.update({
      where: { id: currentPayment.id },
      data: normalized.data,
    });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_PAYMENT_UPDATED",
      entityType: "CASH_DOCUMENT",
      entityId: current.id,
      entityCode: current.documentNumber,
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: current.branchId,
      before: cashPaymentAuditSnapshot(currentPayment, false),
      after: cashPaymentAuditSnapshot(updated, detailsChanged),
      metadata: { component: "PAYMENT", operation: "UPDATE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}

export async function removeCashPaymentAction(input: {
  paymentId: string;
}): Promise<CajaActionResult> {
  const gate = await authorizeCaja("operate");
  if (!gate.ok) return gate;
  const payment = await getPrisma().cashPayment.findUnique({
    where: { id: input.paymentId },
    select: { documentId: true },
  });
  if (!payment) return { ok: false, error: "El pago no existe." };
  const auth = await authorizeForDocument(payment.documentId, gate.actor);
  if (!auth.ok) return auth;
  if (auth.document.status !== "BORRADOR") return { ok: false, error: LOCKED_DOCUMENT };
  if (auth.document.cashSession?.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const currentPayment = await tx.cashPayment.findUnique({
      where: { id: input.paymentId },
    });
    if (!currentPayment) {
      return { ok: false as const, error: "El pago no existe." };
    }
    const current = await tx.cashDocument.findUnique({
      where: { id: currentPayment.documentId },
      include: { cashSession: { select: { status: true } } },
    });
    if (!current) return { ok: false as const, error: NO_DOCUMENT };
    if (current.status !== "BORRADOR") {
      return { ok: false as const, error: LOCKED_DOCUMENT };
    }
    if (current.cashSession?.status !== "ABIERTO") {
      return { ok: false as const, error: CLOSED_SESSION };
    }

    await tx.cashPayment.delete({ where: { id: currentPayment.id } });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_PAYMENT_REMOVED",
      entityType: "CASH_DOCUMENT",
      entityId: current.id,
      entityCode: current.documentNumber,
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: current.branchId,
      before: cashPaymentAuditSnapshot(
        currentPayment,
        Boolean(currentPayment.reference || currentPayment.notes),
      ),
      after: null,
      metadata: { component: "PAYMENT", operation: "REMOVE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}

// --- Closings -----------------------------------------------------------

export async function createCashClosingAction(input: {
  cashSessionId: string;
  cashAmount: number;
  transferAmount: number;
  checkAmount: number;
  cardAmount: number;
  currency?: string | null;
  notes?: string | null;
}): Promise<
  { ok: true; closingId: string } | { ok: false; error: string }
> {
  const auth = await authorizeForSession(input.cashSessionId);
  if (!auth.ok) return auth;
  if (auth.cashSession.status !== "ABIERTO") {
    return { ok: false, error: CLOSED_SESSION };
  }

  const amounts = [
    sanitizeCashMoney(input.cashAmount),
    sanitizeCashMoney(input.transferAmount),
    sanitizeCashMoney(input.checkAmount),
    sanitizeCashMoney(input.cardAmount),
  ];
  if (amounts.some((amount) => amount === null)) {
    return { ok: false, error: "Los montos del cierre no son válidos." };
  }
  const [cashAmount, transferAmount, checkAmount, cardAmount] = amounts.map(
    (amount) => toDecimal(amount ?? 0),
  );
  const countedBreakdown: CashPaymentBreakdown = {
    EFECTIVO: amounts[0] ?? 0,
    TRANSFERENCIA: amounts[1] ?? 0,
    CHEQUE: amounts[2] ?? 0,
    TARJETA: amounts[3] ?? 0,
  };
  const currency = sanitizeCashCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda del cierre no es válida." };
  }

  const prisma = getPrisma();
  try {
    const closing = await prisma.$transaction(async (tx) => {
      const currentSession = await tx.cashSession.findUnique({
        where: { id: auth.cashSession.id },
        select: { id: true, branchId: true, cashierId: true, status: true },
      });
      if (!currentSession || currentSession.status !== "ABIERTO") {
        throw new Error("SESSION_LOCKED");
      }
      const existing = await tx.cashClosing.findUnique({
        where: { cashSessionId: currentSession.id },
        select: { id: true },
      });
      if (existing) throw new Error("CLOSING_EXISTS");

      // FF1.1-B: the expectation comes from the payments registered against
      // the shift's issued documents, through the single shared formula.
      const sources = await collectCashClosingInputs(tx, currentSession.id);
      const totals = calculateCashClosingTotals({
        counted: countedBreakdown,
        expected: sources.expected,
        invoicedTotal: sources.invoicedTotal,
        retentionTotal: sources.retentionTotal,
      });

      const created = await tx.cashClosing.create({
        data: {
          cashSessionId: currentSession.id,
          branchId: currentSession.branchId,
          cashierId: currentSession.cashierId,
          preparedByUserId: auth.actor.userId,
          cashAmount,
          transferAmount,
          checkAmount,
          cardAmount,
          expectedCashAmount: toDecimal(sources.expected.EFECTIVO),
          expectedTransferAmount: toDecimal(sources.expected.TRANSFERENCIA),
          expectedCheckAmount: toDecimal(sources.expected.CHEQUE),
          expectedCardAmount: toDecimal(sources.expected.TARJETA),
          expectedTotal: toDecimal(totals.expectedTotal),
          invoicedTotal: toDecimal(totals.invoicedTotal),
          receivedTotal: toDecimal(totals.receivedTotal),
          retentionTotal: toDecimal(totals.retentionTotal),
          difference: toDecimal(totals.difference),
          currency,
          notes: optionalText(input.notes, 1_000),
        },
      });
      await recordFinancialAuditEvent(tx, {
        domain: "CAJA",
        action: "CASH_CLOSING_CREATED",
        entityType: "CASH_CLOSING",
        entityId: created.id,
        entityCode: cashClosingAuditCode(created),
        actor: { userId: auth.actor.userId, role: auth.actor.role },
        branchId: created.branchId,
        before: null,
        after: cashClosingAuditSnapshot(created),
      });
      return created;
    });
    revalidateCajaRoutes();
    return { ok: true, closingId: closing.id };
  } catch (error) {
    if (error instanceof Error && error.message === "CLOSING_EXISTS") {
      return { ok: false, error: "El turno ya tiene un cierre preparado." };
    }
    if (error instanceof Error && error.message === "SESSION_LOCKED") {
      return { ok: false, error: CLOSED_SESSION };
    }
    return { ok: false, error: "No se pudo preparar el cierre de caja." };
  }
}

export async function closeCashSessionAction(input: {
  cashSessionId: string;
}): Promise<CajaActionResult> {
  const auth = await authorizeForSession(input.cashSessionId);
  if (!auth.ok) return auth;
  if (auth.cashSession.status !== "ABIERTO") {
    return { ok: false, error: "El turno ya está cerrado." };
  }

  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      const currentSession = await tx.cashSession.findUnique({
        where: { id: auth.cashSession.id },
      });
      if (!currentSession || currentSession.status !== "ABIERTO") {
        throw new Error("SESSION_LOCKED");
      }
      const [closing, draftCount] = await Promise.all([
        tx.cashClosing.findUnique({
          where: { cashSessionId: currentSession.id },
        }),
        tx.cashDocument.count({
          where: { cashSessionId: currentSession.id, status: "BORRADOR" },
        }),
      ]);
      if (!closing) throw new Error("NO_CLOSING");
      if (closing.status !== "ABIERTO") throw new Error("CLOSING_LOCKED");
      if (draftCount) throw new Error("DRAFTS_EXIST");

      // FF1.1-B: the arqueo is recomputed at close time with the same collector
      // and the same formula used when it was prepared, so a document issued or
      // annulled in between is reflected instead of leaving stale totals. The
      // counted amounts are the cashier's and are never recalculated.
      const sources = await collectCashClosingInputs(tx, currentSession.id);
      const totals = calculateCashClosingTotals({
        counted: {
          EFECTIVO: decimalToNumber(closing.cashAmount),
          TRANSFERENCIA: decimalToNumber(closing.transferAmount),
          CHEQUE: decimalToNumber(closing.checkAmount),
          TARJETA: decimalToNumber(closing.cardAmount),
        },
        expected: sources.expected,
        invoicedTotal: sources.invoicedTotal,
        retentionTotal: sources.retentionTotal,
      });
      const closedAt = new Date();

      const closingWrite = await tx.cashClosing.updateMany({
        where: { id: closing.id, status: "ABIERTO" },
        data: {
          status: "CERRADO",
          expectedCashAmount: toDecimal(sources.expected.EFECTIVO),
          expectedTransferAmount: toDecimal(sources.expected.TRANSFERENCIA),
          expectedCheckAmount: toDecimal(sources.expected.CHEQUE),
          expectedCardAmount: toDecimal(sources.expected.TARJETA),
          expectedTotal: toDecimal(totals.expectedTotal),
          invoicedTotal: toDecimal(totals.invoicedTotal),
          receivedTotal: toDecimal(totals.receivedTotal),
          retentionTotal: toDecimal(totals.retentionTotal),
          difference: toDecimal(totals.difference),
          closedAt,
        },
      });
      if (closingWrite.count !== 1) throw new Error("CLOSING_LOCKED");
      const sessionWrite = await tx.cashSession.updateMany({
        where: { id: currentSession.id, status: "ABIERTO" },
        data: { status: "CERRADO", closedAt },
      });
      if (sessionWrite.count !== 1) throw new Error("SESSION_LOCKED");

      const [updatedClosing, updatedSession] = await Promise.all([
        tx.cashClosing.findUniqueOrThrow({ where: { id: closing.id } }),
        tx.cashSession.findUniqueOrThrow({ where: { id: currentSession.id } }),
      ]);
      await recordFinancialAuditEvent(tx, {
        domain: "CAJA",
        action: "CASH_CLOSING_SUBMITTED",
        entityType: "CASH_CLOSING",
        entityId: updatedClosing.id,
        entityCode: cashClosingAuditCode(updatedClosing),
        actor: { userId: auth.actor.userId, role: auth.actor.role },
        branchId: updatedClosing.branchId,
        before: cashClosingAuditSnapshot(closing),
        after: cashClosingAuditSnapshot(updatedClosing),
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
      await recordFinancialAuditEvent(tx, {
        domain: "CAJA",
        action: "CASH_SESSION_STATUS_CHANGED",
        entityType: "CASH_SESSION",
        entityId: updatedSession.id,
        entityCode: cashSessionAuditCode(updatedSession),
        actor: { userId: auth.actor.userId, role: auth.actor.role },
        branchId: updatedSession.branchId,
        before: cashSessionAuditSnapshot(currentSession),
        after: cashSessionAuditSnapshot(updatedSession),
        metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
      });
    });
    revalidateCajaRoutes();
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "NO_CLOSING") {
      return { ok: false, error: "Prepara el cierre antes de cerrar el turno." };
    }
    if (error instanceof Error && error.message === "DRAFTS_EXIST") {
      return { ok: false, error: "Emite o anula los borradores antes de cerrar el turno." };
    }
    if (error instanceof Error && error.message === "CLOSING_LOCKED") {
      return { ok: false, error: "El cierre ya no está abierto." };
    }
    if (error instanceof Error && error.message === "SESSION_LOCKED") {
      return { ok: false, error: "El turno ya está cerrado." };
    }
    return { ok: false, error: "No se pudo cerrar el turno de caja." };
  }
}

export async function reviewCashClosingAction(input: {
  closingId: string;
  notes?: string | null;
}): Promise<CajaActionResult> {
  const auth = await authorizeForClosing(input.closingId);
  if (!auth.ok) return auth;
  if (
    auth.closing.status !== "CERRADO" ||
    auth.closing.cashSession.status !== "CERRADO"
  ) {
    return { ok: false, error: "Solo puedes revisar un cierre ya cerrado." };
  }

  const reason = optionalText(input.notes, 500);
  const result = await getPrisma().$transaction(async (tx) => {
    const current = await tx.cashClosing.findUnique({
      where: { id: auth.closing.id },
      include: { cashSession: { select: { status: true } } },
    });
    if (!current) return { ok: false as const, error: NO_CLOSING };
    if (
      current.status !== "CERRADO" ||
      current.cashSession.status !== "CERRADO"
    ) {
      return {
        ok: false as const,
        error: "Solo puedes revisar un cierre ya cerrado.",
      };
    }

    const write = await tx.cashClosing.updateMany({
      where: { id: current.id, status: "CERRADO" },
      data: {
        status: "REVISADO_CONTABILIDAD",
        reviewedByUserId: auth.actor.userId,
        reviewedAt: new Date(),
      },
    });
    if (write.count !== 1) {
      return {
        ok: false as const,
        error: "Solo puedes revisar un cierre ya cerrado.",
      };
    }
    const updated = await tx.cashClosing.findUniqueOrThrow({
      where: { id: current.id },
    });
    await recordFinancialAuditEvent(tx, {
      domain: "CAJA",
      action: "CASH_CLOSING_REVIEWED",
      entityType: "CASH_CLOSING",
      entityId: updated.id,
      entityCode: cashClosingAuditCode(updated),
      actor: { userId: auth.actor.userId, role: auth.actor.role },
      branchId: updated.branchId,
      reason,
      before: cashClosingAuditSnapshot(current),
      after: cashClosingAuditSnapshot(updated),
      metadata: { component: "STATUS", operation: "STATUS_CHANGE" },
    });
    return { ok: true as const };
  });
  if (!result.ok) return result;
  revalidateCajaRoutes();
  return result;
}
