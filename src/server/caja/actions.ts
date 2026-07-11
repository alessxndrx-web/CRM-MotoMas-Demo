"use server";

import { Prisma } from "@prisma/client";
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
import {
  isCashDocumentTypeValue,
  isCashPaymentMethodValue,
  sanitizeCajaText,
  sanitizeCashCurrency,
  sanitizeCashMoney,
  sanitizeCashQuantity,
  type CashDocumentTypeValue,
  type CashPaymentMethodValue,
} from "@/server/caja/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * PostgreSQL-backed Caja writes (Patch 3.4B). Every action calls requireAuth,
 * enforces Caja role/scope server-side and derives branch ownership from the
 * authenticated actor/session. Nothing here is connected to the legacy UI yet.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para esta operación.";
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

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

function revalidateCajaRoutes() {
  revalidatePath("/panel/caja");
  revalidatePath("/panel/caja/facturacion");
  revalidatePath("/panel/caja/recibos");
  revalidatePath("/panel/caja/notas");
  revalidatePath("/panel/caja/cierres");
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

function calculateDocumentTotalDecimal(input: {
  subtotal: Prisma.Decimal;
  appliedPayment: Prisma.Decimal;
  retention1: Prisma.Decimal;
  retention2: Prisma.Decimal;
}): Prisma.Decimal {
  const result = input.subtotal
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
  if (!branch) return { ok: false, error: "Selecciona una sucursal válida." };

  const prisma = getPrisma();
  const existing = await prisma.cashSession.findFirst({
    where: {
      branchId: branch.id,
      cashierId: auth.actor.userId,
      status: "ABIERTO",
    },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "Ya tienes un turno abierto en esta sucursal." };
  }

  try {
    const created = await prisma.cashSession.create({
      data: {
        branchId: branch.id,
        cashierId: auth.actor.userId,
        notes: optionalText(input.notes),
      },
    });
    revalidateCajaRoutes();
    return { ok: true, cashSessionId: created.id };
  } catch {
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
  const appliedPayment = validateMoneyOrDefault(input.appliedPayment);
  const retention1 = validateMoneyOrDefault(input.retention1);
  const retention2 = validateMoneyOrDefault(input.retention2);
  if (
    inputSubtotal === null ||
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
    const created = await getPrisma().$transaction(async (tx) =>
      tx.cashDocument.create({
        data: {
          cashSessionId: auth.cashSession.id,
          branchId: auth.cashSession.branchId,
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
                  cashSessionId: auth.cashSession.id,
                  branchId: auth.cashSession.branchId,
                  recordedByUserId: auth.actor.userId,
                })),
              }
            : undefined,
        },
      }),
    );
    revalidateCajaRoutes();
    return { ok: true, documentId: created.id, documentNumber };
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

  const prisma = getPrisma();
  const itemTotal = await prisma.cashDocumentItem.aggregate({
    where: { documentId: document.id },
    _sum: { total: true },
  });
  const subtotal =
    document.type === "FACTURA" && document._count.items
      ? itemTotal._sum.total ?? new Prisma.Decimal(0)
      : input.subtotal === undefined
        ? document.subtotal
        : toDecimal(sanitizeCashMoney(input.subtotal) ?? 0);
  const appliedPayment =
    input.appliedPayment === undefined
      ? document.appliedPayment
      : toDecimal(sanitizeCashMoney(input.appliedPayment) ?? 0);
  const retention1 =
    input.retention1 === undefined
      ? document.retention1
      : toDecimal(sanitizeCashMoney(input.retention1) ?? 0);
  const retention2 =
    input.retention2 === undefined
      ? document.retention2
      : toDecimal(sanitizeCashMoney(input.retention2) ?? 0);
  const total = calculateDocumentTotalDecimal({
    subtotal,
    appliedPayment,
    retention1,
    retention2,
  });
  const paidTotal = document.payments.reduce(
    (sum, payment) => sum.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  if (paidTotal.greaterThan(total)) {
    return { ok: false, error: "El nuevo total sería menor que los pagos registrados." };
  }

  await prisma.cashDocument.update({
    where: { id: document.id },
    data: {
      thirdPartyName: thirdPartyName ?? undefined,
      taxId:
        input.taxId === undefined ? undefined : optionalText(input.taxId, 80),
      concept: concept ?? undefined,
      description:
        input.description === undefined
          ? undefined
          : optionalText(input.description, 1_000),
      motorcycleDescription:
        input.motorcycleDescription === undefined
          ? undefined
          : optionalText(input.motorcycleDescription, 2_000),
      subtotal,
      appliedPayment,
      retention1,
      retention2,
      total,
      currency,
      notes:
        input.notes === undefined ? undefined : optionalText(input.notes, 1_000),
    },
  });
  revalidateCajaRoutes();
  return { ok: true };
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

  const prisma = getPrisma();
  const itemTotal = await prisma.cashDocumentItem.aggregate({
    where: { documentId: document.id },
    _sum: { total: true },
  });
  const subtotal =
    document.type === "FACTURA"
      ? itemTotal._sum.total ?? new Prisma.Decimal(0)
      : document.subtotal;
  const total = calculateDocumentTotalDecimal({
    subtotal,
    appliedPayment: document.appliedPayment,
    retention1: document.retention1,
    retention2: document.retention2,
  });
  const paidTotal = document.payments.reduce(
    (sum, payment) => sum.plus(payment.amount),
    new Prisma.Decimal(0),
  );
  if (paidTotal.greaterThan(total)) {
    return { ok: false, error: "Los pagos superan el total del documento." };
  }

  await prisma.cashDocument.update({
    where: { id: document.id },
    data: { status: "EMITIDO", subtotal, total, issuedAt: new Date() },
  });
  revalidateCajaRoutes();
  return { ok: true };
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
  if (!reason) return { ok: false, error: "Indica el motivo de la anulación interna." };

  await getPrisma().cashDocument.update({
    where: { id: auth.document.id },
    data: {
      status: "ANULADO",
      cancelledAt: new Date(),
      notes: reason,
    },
  });
  revalidateCajaRoutes();
  return { ok: true };
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

  await getPrisma().$transaction(async (tx) => {
    await tx.cashDocumentItem.create({
      data: { ...normalized.data, documentId: auth.document.id },
    });
    await refreshDraftDocumentTotals(tx, auth.document.id);
  });
  revalidateCajaRoutes();
  return { ok: true };
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

  await getPrisma().$transaction(async (tx) => {
    await tx.cashDocumentItem.update({
      where: { id: input.itemId },
      data: normalized.data,
    });
    await refreshDraftDocumentTotals(tx, item.documentId);
  });
  revalidateCajaRoutes();
  return { ok: true };
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

  await getPrisma().$transaction(async (tx) => {
    await tx.cashDocumentItem.delete({ where: { id: input.itemId } });
    await refreshDraftDocumentTotals(tx, item.documentId);
  });
  revalidateCajaRoutes();
  return { ok: true };
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

  await getPrisma().cashPayment.create({
    data: {
      ...normalized.data,
      cashSessionId: auth.document.cashSessionId,
      documentId: auth.document.id,
      branchId: auth.document.branchId,
      recordedByUserId: auth.actor.userId,
    },
  });
  revalidateCajaRoutes();
  return { ok: true };
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

  await getPrisma().cashPayment.update({
    where: { id: input.paymentId },
    data: normalized.data,
  });
  revalidateCajaRoutes();
  return { ok: true };
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

  await getPrisma().cashPayment.delete({ where: { id: input.paymentId } });
  revalidateCajaRoutes();
  return { ok: true };
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
  const currency = sanitizeCashCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda del cierre no es válida." };
  }

  const prisma = getPrisma();
  try {
    const closing = await prisma.$transaction(async (tx) => {
      const existing = await tx.cashClosing.findUnique({
        where: { cashSessionId: auth.cashSession.id },
        select: { id: true },
      });
      if (existing) throw new Error("CLOSING_EXISTS");

      const documents = await tx.cashDocument.findMany({
        where: { cashSessionId: auth.cashSession.id, status: "EMITIDO" },
        select: { type: true, total: true, retention1: true, retention2: true },
      });
      const receivedTotal = cashAmount
        .plus(transferAmount)
        .plus(checkAmount)
        .plus(cardAmount)
        .toDecimalPlaces(2);
      const invoicedTotal = documents
        .filter((document) => document.type === "FACTURA")
        .reduce(
          (sum, document) => sum.plus(document.total),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(2);
      const retentionTotal = documents
        .reduce(
          (sum, document) =>
            sum.plus(document.retention1).plus(document.retention2),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(2);

      return tx.cashClosing.create({
        data: {
          cashSessionId: auth.cashSession.id,
          branchId: auth.cashSession.branchId,
          cashierId: auth.cashSession.cashierId,
          preparedByUserId: auth.actor.userId,
          cashAmount,
          transferAmount,
          checkAmount,
          cardAmount,
          invoicedTotal,
          receivedTotal,
          retentionTotal,
          difference: receivedTotal.minus(invoicedTotal).toDecimalPlaces(2),
          currency,
          notes: optionalText(input.notes, 1_000),
        },
      });
    });
    revalidateCajaRoutes();
    return { ok: true, closingId: closing.id };
  } catch (error) {
    if (error instanceof Error && error.message === "CLOSING_EXISTS") {
      return { ok: false, error: "El turno ya tiene un cierre preparado." };
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
      const [closing, draftCount, documents] = await Promise.all([
        tx.cashClosing.findUnique({
          where: { cashSessionId: auth.cashSession.id },
        }),
        tx.cashDocument.count({
          where: { cashSessionId: auth.cashSession.id, status: "BORRADOR" },
        }),
        tx.cashDocument.findMany({
          where: { cashSessionId: auth.cashSession.id, status: "EMITIDO" },
          select: { type: true, total: true, retention1: true, retention2: true },
        }),
      ]);
      if (!closing) throw new Error("NO_CLOSING");
      if (closing.status !== "ABIERTO") throw new Error("CLOSING_LOCKED");
      if (draftCount) throw new Error("DRAFTS_EXIST");

      const invoicedTotal = documents
        .filter((document) => document.type === "FACTURA")
        .reduce(
          (sum, document) => sum.plus(document.total),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(2);
      const retentionTotal = documents
        .reduce(
          (sum, document) =>
            sum.plus(document.retention1).plus(document.retention2),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(2);
      const closedAt = new Date();

      await tx.cashClosing.update({
        where: { id: closing.id },
        data: {
          status: "CERRADO",
          invoicedTotal,
          retentionTotal,
          difference: closing.receivedTotal.minus(invoicedTotal).toDecimalPlaces(2),
          closedAt,
        },
      });
      await tx.cashSession.update({
        where: { id: auth.cashSession.id },
        data: { status: "CERRADO", closedAt },
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

  await getPrisma().cashClosing.update({
    where: { id: auth.closing.id },
    data: {
      status: "REVISADO_CONTABILIDAD",
      reviewedByUserId: auth.actor.userId,
      reviewedAt: new Date(),
      notes:
        input.notes === undefined
          ? auth.closing.notes
          : optionalText(input.notes, 1_000),
    },
  });
  revalidateCajaRoutes();
  return { ok: true };
}
