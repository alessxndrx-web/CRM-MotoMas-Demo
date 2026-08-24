import type { Prisma } from "@prisma/client";

import type { CajaScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  buildCashPaymentBreakdown,
  calculateCashBalance,
  calculateCashPaidTotal,
  cashClosingStatusLabels,
  cashDocumentStatusLabels,
  cashDocumentTypeLabels,
  cashPaymentMethodLabels,
  cashSessionStatusLabels,
  dateToISOString,
  decimalToNumber,
  type CajaDashboardSummaryDTO,
  type CashClosingDTO,
  type CashClosingDetailDTO,
  type CashClosingStatusValue,
  type CashDocumentDTO,
  type CashDocumentDetailDTO,
  type CashDocumentStatusValue,
  type CashDocumentTypeValue,
  type CashPaymentDTO,
  type CashPaymentMethodValue,
  type CashSessionDTO,
  type CashSessionDetailDTO,
  type CashSessionStatusValue,
} from "@/server/caja/shared";

/**
 * Role-scoped Caja reads (Patch 3.4B). Every optional client filter is ANDed
 * with the server-created Caja scope; an unknown branch/scope yields no rows,
 * never an unfiltered query.
 */

const LIST_LIMIT = 200;

const sessionInclude = {
  branch: true,
  cashier: true,
} satisfies Prisma.CashSessionInclude;
const documentSummaryInclude = {
  branch: true,
  issuedBy: true,
  customer: { select: { name: true } },
  sale: { select: { saleNumber: true } },
  reservation: { select: { reservationNumber: true } },
  payments: { select: { amount: true } },
  _count: { select: { items: true, payments: true } },
} satisfies Prisma.CashDocumentInclude;
const documentDetailInclude = {
  ...documentSummaryInclude,
  items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
  payments: {
    include: { branch: true, recordedBy: true },
    orderBy: { paidAt: "asc" },
  },
} satisfies Prisma.CashDocumentInclude;
const paymentInclude = {
  branch: true,
  recordedBy: true,
} satisfies Prisma.CashPaymentInclude;
const closingInclude = {
  branch: true,
  cashier: true,
  preparedBy: true,
  reviewedBy: true,
} satisfies Prisma.CashClosingInclude;

type SessionRow = Prisma.CashSessionGetPayload<{ include: typeof sessionInclude }>;
type DocumentSummaryRow = Prisma.CashDocumentGetPayload<{
  include: typeof documentSummaryInclude;
}>;
type DocumentDetailRow = Prisma.CashDocumentGetPayload<{
  include: typeof documentDetailInclude;
}>;
type PaymentRow = Prisma.CashPaymentGetPayload<{ include: typeof paymentInclude }>;
type ClosingRow = Prisma.CashClosingGetPayload<{ include: typeof closingInclude }>;

export type CashSessionFilters = {
  status?: CashSessionStatusValue;
  branchCode?: string;
  cashierId?: string;
};

export type CashDocumentFilters = {
  type?: CashDocumentTypeValue;
  status?: CashDocumentStatusValue;
  branchCode?: string;
  cashSessionId?: string;
  customerId?: string;
};

export type CashClosingFilters = {
  status?: CashClosingStatusValue;
  branchCode?: string;
  cashierId?: string;
};

export async function resolveCajaBranchIdByCode(
  branchCode: string,
): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const branch = await getPrisma().branch.findUnique({
    where: { code: branchCode },
    select: { id: true },
  });
  return branch?.id ?? null;
}

async function branchIdForScope(scope: CajaScope): Promise<string | null> {
  if (scope.level === "global") return "global";
  if (scope.level === "none") return null;
  return resolveCajaBranchIdByCode(scope.branchCode);
}

async function sessionScopeFilter(
  scope: CajaScope,
): Promise<Prisma.CashSessionWhereInput | null> {
  const branchId = await branchIdForScope(scope);
  if (!branchId) return null;
  if (branchId === "global") return {};
  if (scope.level === "cashier") {
    return { branchId, cashierId: scope.userId };
  }
  return { branchId };
}

async function documentScopeFilter(
  scope: CajaScope,
): Promise<Prisma.CashDocumentWhereInput | null> {
  const branchId = await branchIdForScope(scope);
  if (!branchId) return null;
  if (branchId === "global") return {};
  if (scope.level === "cashier") {
    return {
      branchId,
      OR: [
        { issuedByUserId: scope.userId },
        { cashSession: { is: { cashierId: scope.userId } } },
      ],
    };
  }
  return { branchId };
}

async function paymentScopeFilter(
  scope: CajaScope,
): Promise<Prisma.CashPaymentWhereInput | null> {
  const branchId = await branchIdForScope(scope);
  if (!branchId) return null;
  if (branchId === "global") return {};
  if (scope.level === "cashier") {
    return {
      branchId,
      OR: [
        { recordedByUserId: scope.userId },
        { cashSession: { is: { cashierId: scope.userId } } },
      ],
    };
  }
  return { branchId };
}

async function closingScopeFilter(
  scope: CajaScope,
): Promise<Prisma.CashClosingWhereInput | null> {
  const branchId = await branchIdForScope(scope);
  if (!branchId) return null;
  if (branchId === "global") return {};
  if (scope.level === "cashier") {
    return { branchId, cashierId: scope.userId };
  }
  return { branchId };
}

async function optionalBranchId(
  branchCode: string | undefined,
): Promise<string | null | undefined> {
  if (!branchCode) return undefined;
  return resolveCajaBranchIdByCode(branchCode);
}

export async function canAccessCashSession(
  scope: CajaScope,
  cashSessionId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const filter = await sessionScopeFilter(scope);
  if (!filter) return false;
  const row = await getPrisma().cashSession.findFirst({
    where: { AND: [filter, { id: cashSessionId }] },
    select: { id: true },
  });
  return Boolean(row);
}

export async function canAccessCashDocument(
  scope: CajaScope,
  documentId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const filter = await documentScopeFilter(scope);
  if (!filter) return false;
  const row = await getPrisma().cashDocument.findFirst({
    where: { AND: [filter, { id: documentId }] },
    select: { id: true },
  });
  return Boolean(row);
}

export async function canAccessCashClosing(
  scope: CajaScope,
  closingId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const filter = await closingScopeFilter(scope);
  if (!filter) return false;
  const row = await getPrisma().cashClosing.findFirst({
    where: { AND: [filter, { id: closingId }] },
    select: { id: true },
  });
  return Boolean(row);
}

export async function getCurrentCashSession(
  scope: CajaScope,
): Promise<CashSessionDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const filter = await sessionScopeFilter(scope);
  if (!filter) return null;
  const session = await getPrisma().cashSession.findFirst({
    where: { AND: [filter, { status: "ABIERTO" }] },
    include: sessionInclude,
    orderBy: { openedAt: "desc" },
  });
  return session ? mapSession(session) : null;
}

export async function listCashSessions(
  scope: CajaScope,
  filters: CashSessionFilters = {},
): Promise<CashSessionDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const [scopeFilter, branchId] = await Promise.all([
    sessionScopeFilter(scope),
    optionalBranchId(filters.branchCode),
  ]);
  if (!scopeFilter || branchId === null) return [];

  const sessions = await getPrisma().cashSession.findMany({
    where: {
      AND: [
        scopeFilter,
        {
          branchId,
          status: filters.status,
          cashierId: filters.cashierId,
        },
      ],
    },
    include: sessionInclude,
    orderBy: { openedAt: "desc" },
    take: LIST_LIMIT,
  });
  return sessions.map(mapSession);
}

export async function getCashSessionDetail(
  scope: CajaScope,
  cashSessionId: string,
): Promise<CashSessionDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const [sessionFilter, documentFilter, paymentFilter] = await Promise.all([
    sessionScopeFilter(scope),
    documentScopeFilter(scope),
    paymentScopeFilter(scope),
  ]);
  if (!sessionFilter || !documentFilter || !paymentFilter) return null;

  const prisma = getPrisma();
  const session = await prisma.cashSession.findFirst({
    where: { AND: [sessionFilter, { id: cashSessionId }] },
    include: sessionInclude,
  });
  if (!session) return null;

  const [documents, payments, closing] = await Promise.all([
    prisma.cashDocument.findMany({
      where: { AND: [documentFilter, { cashSessionId }] },
      include: documentSummaryInclude,
      orderBy: { issuedAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.cashPayment.findMany({
      where: { AND: [paymentFilter, { cashSessionId }] },
      include: paymentInclude,
      orderBy: { paidAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.cashClosing.findUnique({
      where: { cashSessionId },
      include: closingInclude,
    }),
  ]);

  const documentDTOs = documents.map(mapDocumentSummary);
  const paymentDTOs = payments.map(mapPayment);
  const documentTotal = documentDTOs.reduce(
    (sum, document) =>
      document.status === "ANULADO" ? sum : sum + document.total,
    0,
  );
  const paidTotal = calculateCashPaidTotal(paymentDTOs);

  return {
    session: mapSession(session),
    documents: documentDTOs,
    payments: paymentDTOs,
    closing: closing ? mapClosing(closing) : null,
    totals: {
      documentTotal,
      paidTotal,
      balance: calculateCashBalance(documentTotal, paidTotal),
      paymentBreakdown: buildCashPaymentBreakdown(paymentDTOs),
    },
  };
}

export async function listCashDocuments(
  scope: CajaScope,
  filters: CashDocumentFilters = {},
): Promise<CashDocumentDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const [scopeFilter, branchId] = await Promise.all([
    documentScopeFilter(scope),
    optionalBranchId(filters.branchCode),
  ]);
  if (!scopeFilter || branchId === null) return [];

  const documents = await getPrisma().cashDocument.findMany({
    where: {
      AND: [
        scopeFilter,
        {
          branchId,
          type: filters.type,
          status: filters.status,
          cashSessionId: filters.cashSessionId,
          customerId: filters.customerId,
        },
      ],
    },
    include: documentSummaryInclude,
    orderBy: { issuedAt: "desc" },
    take: LIST_LIMIT,
  });
  return documents.map(mapDocumentSummary);
}

export async function getCashDocumentDetail(
  scope: CajaScope,
  documentId: string,
): Promise<CashDocumentDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const filter = await documentScopeFilter(scope);
  if (!filter) return null;

  const document = await getPrisma().cashDocument.findFirst({
    where: { AND: [filter, { id: documentId }] },
    include: documentDetailInclude,
  });
  return document ? mapDocumentDetail(document) : null;
}

export async function listCashClosings(
  scope: CajaScope,
  filters: CashClosingFilters = {},
): Promise<CashClosingDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const [scopeFilter, branchId] = await Promise.all([
    closingScopeFilter(scope),
    optionalBranchId(filters.branchCode),
  ]);
  if (!scopeFilter || branchId === null) return [];

  const closings = await getPrisma().cashClosing.findMany({
    where: {
      AND: [
        scopeFilter,
        {
          branchId,
          status: filters.status,
          cashierId: filters.cashierId,
        },
      ],
    },
    include: closingInclude,
    orderBy: { preparedAt: "desc" },
    take: LIST_LIMIT,
  });
  return closings.map(mapClosing);
}

export async function getCashClosingDetail(
  scope: CajaScope,
  closingId: string,
): Promise<CashClosingDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const filter = await closingScopeFilter(scope);
  if (!filter) return null;

  const closing = await getPrisma().cashClosing.findFirst({
    where: { AND: [filter, { id: closingId }] },
    include: closingInclude,
  });
  if (!closing) return null;

  const detail = await getCashSessionDetail(scope, closing.cashSessionId);
  if (!detail) return null;
  return {
    closing: mapClosing(closing),
    session: detail.session,
    documents: detail.documents,
    payments: detail.payments,
  };
}

export async function getCajaDashboardSummary(
  scope: CajaScope,
): Promise<CajaDashboardSummaryDTO> {
  const empty: CajaDashboardSummaryDTO = {
    currentSession: null,
    openSessionCount: 0,
    documentCount: 0,
    draftDocumentCount: 0,
    issuedDocumentCount: 0,
    cancelledDocumentCount: 0,
    issuedInvoiceTotal: 0,
    paymentTotal: 0,
    balance: 0,
    pendingClosingCount: 0,
    paymentBreakdown: buildCashPaymentBreakdown([]),
  };
  if (!isDatabaseConfigured()) return empty;

  const [sessionFilter, documentFilter, paymentFilter, closingFilter] =
    await Promise.all([
      sessionScopeFilter(scope),
      documentScopeFilter(scope),
      paymentScopeFilter(scope),
      closingScopeFilter(scope),
    ]);
  if (!sessionFilter || !documentFilter || !paymentFilter || !closingFilter) {
    return empty;
  }

  const prisma = getPrisma();
  const [
    currentSession,
    openSessionCount,
    statusGroups,
    invoiceTotal,
    paymentGroups,
    pendingClosingCount,
  ] = await Promise.all([
    prisma.cashSession.findFirst({
      where: { AND: [sessionFilter, { status: "ABIERTO" }] },
      include: sessionInclude,
      orderBy: { openedAt: "desc" },
    }),
    prisma.cashSession.count({
      where: { AND: [sessionFilter, { status: "ABIERTO" }] },
    }),
    prisma.cashDocument.groupBy({
      by: ["status"],
      where: documentFilter,
      _count: { _all: true },
    }),
    prisma.cashDocument.aggregate({
      where: {
        AND: [documentFilter, { status: "EMITIDO", type: "FACTURA" }],
      },
      _sum: { total: true },
    }),
    prisma.cashPayment.groupBy({
      by: ["method"],
      where: paymentFilter,
      _sum: { amount: true },
    }),
    prisma.cashClosing.count({
      where: { AND: [closingFilter, { status: "ABIERTO" }] },
    }),
  ]);

  const countFor = (status: CashDocumentStatusValue) =>
    statusGroups.find((group) => group.status === status)?._count._all ?? 0;
  const paymentBreakdown = buildCashPaymentBreakdown(
    paymentGroups.map((group) => ({
      method: group.method as CashPaymentMethodValue,
      amount: decimalToNumber(group._sum.amount),
    })),
  );
  const paymentTotal = Object.values(paymentBreakdown).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const issuedInvoiceTotal = decimalToNumber(invoiceTotal._sum.total);

  return {
    currentSession: currentSession ? mapSession(currentSession) : null,
    openSessionCount,
    documentCount: statusGroups.reduce(
      (sum, group) => sum + group._count._all,
      0,
    ),
    draftDocumentCount: countFor("BORRADOR"),
    issuedDocumentCount: countFor("EMITIDO"),
    cancelledDocumentCount: countFor("ANULADO"),
    issuedInvoiceTotal,
    paymentTotal,
    balance: calculateCashBalance(issuedInvoiceTotal, paymentTotal),
    pendingClosingCount,
    paymentBreakdown,
  };
}

function mapSession(session: SessionRow): CashSessionDTO {
  const status = session.status as CashSessionStatusValue;
  return {
    id: session.id,
    branchCode: session.branch.code,
    branchName: session.branch.name,
    cashierId: session.cashierId,
    cashierName: session.cashier.name,
    status,
    statusLabel: cashSessionStatusLabels[status] ?? session.status,
    openedAt: session.openedAt.toISOString(),
    closedAt: dateToISOString(session.closedAt),
    cancelledAt: dateToISOString(session.cancelledAt),
    notes: session.notes,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function mapDocumentSummary(document: DocumentSummaryRow): CashDocumentDTO {
  const type = document.type as CashDocumentTypeValue;
  const status = document.status as CashDocumentStatusValue;
  const paidTotal = document.payments.reduce(
    (sum, payment) => sum + decimalToNumber(payment.amount),
    0,
  );
  const total = decimalToNumber(document.total);
  return {
    id: document.id,
    cashSessionId: document.cashSessionId,
    branchCode: document.branch.code,
    branchName: document.branch.name,
    issuedByUserId: document.issuedByUserId,
    issuedByName: document.issuedBy.name,
    customerId: document.customerId,
    customerName: document.customer?.name ?? null,
    saleId: document.saleId,
    saleNumber: document.sale?.saleNumber ?? null,
    reservationId: document.reservationId,
    reservationNumber: document.reservation?.reservationNumber ?? null,
    relatedDocumentId: document.relatedDocumentId,
    relatedDocumentNumber: document.relatedDocumentNumber,
    type,
    typeLabel: cashDocumentTypeLabels[type] ?? document.type,
    documentNumber: document.documentNumber,
    status,
    statusLabel: cashDocumentStatusLabels[status] ?? document.status,
    thirdPartyName: document.thirdPartyName,
    taxId: document.taxId,
    concept: document.concept,
    description: document.description,
    motorcycleDescription: document.motorcycleDescription,
    subtotal: decimalToNumber(document.subtotal),
    appliedPayment: decimalToNumber(document.appliedPayment),
    retention1: decimalToNumber(document.retention1),
    retention2: decimalToNumber(document.retention2),
    total,
    paidTotal,
    balance: calculateCashBalance(total, paidTotal),
    currency: document.currency,
    notes: document.notes,
    itemCount: document._count.items,
    paymentCount: document._count.payments,
    issuedAt: document.issuedAt.toISOString(),
    cancelledAt: dateToISOString(document.cancelledAt),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function mapDocumentDetail(document: DocumentDetailRow): CashDocumentDetailDTO {
  const summary = mapDocumentSummary(document);
  return {
    ...summary,
    items: document.items.map((item) => ({
      id: item.id,
      documentId: item.documentId,
      description: item.description,
      quantity: decimalToNumber(item.quantity),
      unitPrice: decimalToNumber(item.unitPrice),
      total: decimalToNumber(item.total),
      position: item.position,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
    payments: document.payments.map(mapPayment),
  };
}

function mapPayment(payment: PaymentRow): CashPaymentDTO {
  const method = payment.method as CashPaymentMethodValue;
  return {
    id: payment.id,
    cashSessionId: payment.cashSessionId,
    documentId: payment.documentId,
    branchCode: payment.branch.code,
    branchName: payment.branch.name,
    recordedByUserId: payment.recordedByUserId,
    recordedByName: payment.recordedBy.name,
    method,
    methodLabel: cashPaymentMethodLabels[method] ?? payment.method,
    amount: decimalToNumber(payment.amount),
    currency: payment.currency,
    bank: payment.bank,
    reference: payment.reference,
    paidAt: payment.paidAt.toISOString(),
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  };
}

function mapClosing(closing: ClosingRow): CashClosingDTO {
  const status = closing.status as CashClosingStatusValue;
  return {
    id: closing.id,
    cashSessionId: closing.cashSessionId,
    branchCode: closing.branch.code,
    branchName: closing.branch.name,
    cashierId: closing.cashierId,
    cashierName: closing.cashier.name,
    preparedByUserId: closing.preparedByUserId,
    preparedByName: closing.preparedBy.name,
    reviewedByUserId: closing.reviewedByUserId,
    reviewedByName: closing.reviewedBy?.name ?? null,
    status,
    statusLabel: cashClosingStatusLabels[status] ?? closing.status,
    cashAmount: decimalToNumber(closing.cashAmount),
    transferAmount: decimalToNumber(closing.transferAmount),
    checkAmount: decimalToNumber(closing.checkAmount),
    cardAmount: decimalToNumber(closing.cardAmount),
    invoicedTotal: decimalToNumber(closing.invoicedTotal),
    receivedTotal: decimalToNumber(closing.receivedTotal),
    retentionTotal: decimalToNumber(closing.retentionTotal),
    difference: decimalToNumber(closing.difference),
    currency: closing.currency,
    notes: closing.notes,
    preparedAt: closing.preparedAt.toISOString(),
    closedAt: dateToISOString(closing.closedAt),
    reviewedAt: dateToISOString(closing.reviewedAt),
    cancelledAt: dateToISOString(closing.cancelledAt),
    createdAt: closing.createdAt.toISOString(),
    updatedAt: closing.updatedAt.toISOString(),
  };
}
