import type { Prisma } from "@prisma/client";

import type { CrmScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  buildDocumentProgress,
  creditFinancingTypeLabels,
  creditStatusLabels,
  expedienteDocumentStatusLabels,
  expedienteDocumentTypeLabels,
  quoteStatusLabels,
  type CreditApplicationDTO,
  type CreditFinancingTypeValue,
  type CreditStatusValue,
  type ExpedienteDocumentDTO,
  type ExpedienteDocumentStatusValue,
  type ExpedienteDocumentTypeValue,
  type ExpedienteSupportDTO,
  type QuoteDTO,
  type QuoteSaleTypeValue,
  type QuoteStatusValue,
} from "@/server/expedientes/shared";

/**
 * Role-scoped expediente-support read queries (Patch 3.3B). Each function
 * resolves the caller's {@link CrmScope} into a Prisma `where` filter, so
 * branch/personal visibility is enforced in the database layer and never only
 * in the UI.
 *
 * Scope maps to the owning CustomerFile, not to the support row itself:
 * - global   → Admin, every branch.
 * - branch   → Manager, own branch.
 * - personal → Seller, only expedientes they own (`customerFile.sellerId`).
 *
 * Cashier and Accountant never reach here; `canOperateExpedientes` blocks them
 * before a scope is ever built.
 */

const LIST_LIMIT = 200;

async function resolveBranchId(branchCode: string): Promise<string | null> {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  return branch?.id ?? null;
}

/**
 * The scope filter, expressed against the related CustomerFile. Returns `null`
 * when the scope can never match anything (e.g. an unknown branch code), which
 * callers translate into an empty result rather than an unfiltered query.
 */
async function customerFileScopeFilter(
  scope: CrmScope,
): Promise<Prisma.CustomerFileWhereInput | null> {
  if (scope.level === "global") return {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return null;
    return { branchId };
  }
  return { sellerId: scope.userId };
}

/** True when the caller's scope allows reading/writing this expediente. */
export async function canAccessCustomerFile(
  scope: CrmScope,
  customerFileId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const filter = await customerFileScopeFilter(scope);
  if (!filter) return false;

  const prisma = getPrisma();
  const file = await prisma.customerFile.findFirst({
    where: { id: customerFileId, ...filter },
    select: { id: true },
  });
  return Boolean(file);
}

// --- Quotes / Proformas --------------------------------------------------

export async function listQuotes(scope: CrmScope): Promise<QuoteDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const filter = await customerFileScopeFilter(scope);
  if (!filter) return [];

  const prisma = getPrisma();
  const quotes = await prisma.quote.findMany({
    where: { customerFile: filter },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      customerFile: { select: { fileNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return quotes.map(mapQuote);
}

export async function getQuoteForFile(
  scope: CrmScope,
  customerFileId: string,
): Promise<QuoteDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const filter = await customerFileScopeFilter(scope);
  if (!filter) return null;

  const prisma = getPrisma();
  const quote = await prisma.quote.findFirst({
    where: { customerFileId, customerFile: filter },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      customerFile: { select: { fileNumber: true } },
    },
  });

  return quote ? mapQuote(quote) : null;
}

// --- Document checklist --------------------------------------------------

export async function listExpedienteDocuments(
  scope: CrmScope,
  customerFileId: string,
): Promise<ExpedienteDocumentDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const filter = await customerFileScopeFilter(scope);
  if (!filter) return [];

  const prisma = getPrisma();
  const documents = await prisma.expedienteDocument.findMany({
    where: { customerFileId, customerFile: filter },
    include: { branch: true, reviewedBy: true },
    orderBy: { createdAt: "asc" },
    take: LIST_LIMIT,
  });

  return documents.map(mapDocument);
}

// --- Manual credit follow-up ---------------------------------------------

export async function listCreditApplications(
  scope: CrmScope,
): Promise<CreditApplicationDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const filter = await customerFileScopeFilter(scope);
  if (!filter) return [];

  const prisma = getPrisma();
  const applications = await prisma.creditApplication.findMany({
    where: { customerFile: filter },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      customerFile: { select: { fileNumber: true } },
    },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return applications.map(mapCreditApplication);
}

export async function getCreditApplicationForFile(
  scope: CrmScope,
  customerFileId: string,
): Promise<CreditApplicationDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const filter = await customerFileScopeFilter(scope);
  if (!filter) return null;

  const prisma = getPrisma();
  const application = await prisma.creditApplication.findFirst({
    where: { customerFileId, customerFile: filter },
    include: {
      branch: true,
      customer: true,
      createdBy: true,
      customerFile: { select: { fileNumber: true } },
    },
  });

  return application ? mapCreditApplication(application) : null;
}

// --- Combined payload ----------------------------------------------------

/** Everything the expediente support tab needs, scoped in one place. */
export async function getExpedienteSupport(
  scope: CrmScope,
  customerFileId: string,
): Promise<ExpedienteSupportDTO | null> {
  if (!isDatabaseConfigured()) return null;
  if (!(await canAccessCustomerFile(scope, customerFileId))) return null;

  const [quote, documents, creditApplication] = await Promise.all([
    getQuoteForFile(scope, customerFileId),
    listExpedienteDocuments(scope, customerFileId),
    getCreditApplicationForFile(scope, customerFileId),
  ]);

  return {
    customerFileId,
    quote,
    documents,
    documentProgress: buildDocumentProgress(documents),
    creditApplication,
  };
}

// --- Mappers -------------------------------------------------------------

type BranchRelation = { code: string; name: string } | null;
type DecimalLike = { toNumber(): number } | null;

function branchCodeOf(branch: BranchRelation): string | null {
  return branch?.code ?? null;
}

function branchNameOf(branch: BranchRelation): string {
  return branch?.name ?? "Sucursal";
}

/** Prisma Decimal is not serializable to a client component; expose a number. */
function decimalToNumber(value: DecimalLike): number | null {
  return value ? value.toNumber() : null;
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapQuote(quote: {
  id: string;
  quoteNumber: string | null;
  customerFileId: string;
  customerId: string | null;
  createdByUserId: string | null;
  motorcycleModel: string;
  saleType: string | null;
  price: DecimalLike;
  downPayment: DecimalLike;
  termMonths: number | null;
  estimatedPayment: DecimalLike;
  currency: string | null;
  status: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
  customer?: { name: string } | null;
  createdBy?: { name: string } | null;
  customerFile?: { fileNumber: string } | null;
}): QuoteDTO {
  const status = quote.status as QuoteStatusValue;
  return {
    id: quote.id,
    quoteNumber: quote.quoteNumber,
    customerFileId: quote.customerFileId,
    fileNumber: quote.customerFile?.fileNumber ?? null,
    customerId: quote.customerId,
    customerName: quote.customer?.name ?? null,
    branchCode: branchCodeOf(quote.branch ?? null),
    branchName: branchNameOf(quote.branch ?? null),
    createdById: quote.createdByUserId,
    createdByName: quote.createdBy?.name ?? null,
    motorcycleModel: quote.motorcycleModel,
    saleType: (quote.saleType as QuoteSaleTypeValue | null) ?? null,
    price: decimalToNumber(quote.price),
    downPayment: decimalToNumber(quote.downPayment),
    termMonths: quote.termMonths,
    estimatedPayment: decimalToNumber(quote.estimatedPayment),
    currency: quote.currency,
    status,
    statusLabel: quoteStatusLabels[status] ?? quote.status,
    issuedAt: isoOrNull(quote.issuedAt),
    expiresAt: isoOrNull(quote.expiresAt),
    notes: quote.notes,
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

function mapDocument(document: {
  id: string;
  customerFileId: string;
  documentType: string;
  status: string;
  notes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
  reviewedBy?: { name: string } | null;
}): ExpedienteDocumentDTO {
  const documentType = document.documentType as ExpedienteDocumentTypeValue;
  const status = document.status as ExpedienteDocumentStatusValue;
  return {
    id: document.id,
    customerFileId: document.customerFileId,
    branchCode: branchCodeOf(document.branch ?? null),
    branchName: branchNameOf(document.branch ?? null),
    documentType,
    documentTypeLabel:
      expedienteDocumentTypeLabels[documentType] ?? document.documentType,
    status,
    statusLabel: expedienteDocumentStatusLabels[status] ?? document.status,
    notes: document.notes,
    reviewedById: document.reviewedByUserId,
    reviewedByName: document.reviewedBy?.name ?? null,
    reviewedAt: isoOrNull(document.reviewedAt),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function mapCreditApplication(application: {
  id: string;
  customerFileId: string;
  customerId: string | null;
  createdByUserId: string | null;
  financialInstitution: string | null;
  financingType: string | null;
  status: string;
  amount: DecimalLike;
  downPayment: DecimalLike;
  termMonths: number | null;
  estimatedPayment: DecimalLike;
  currency: string | null;
  pendingItems: string | null;
  observations: string | null;
  requestedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
  customer?: { name: string } | null;
  createdBy?: { name: string } | null;
  customerFile?: { fileNumber: string } | null;
}): CreditApplicationDTO {
  const status = application.status as CreditStatusValue;
  const financingType =
    (application.financingType as CreditFinancingTypeValue | null) ?? null;
  return {
    id: application.id,
    customerFileId: application.customerFileId,
    fileNumber: application.customerFile?.fileNumber ?? null,
    customerId: application.customerId,
    customerName: application.customer?.name ?? null,
    branchCode: branchCodeOf(application.branch ?? null),
    branchName: branchNameOf(application.branch ?? null),
    createdById: application.createdByUserId,
    createdByName: application.createdBy?.name ?? null,
    financialInstitution: application.financialInstitution,
    financingType,
    financingTypeLabel: financingType
      ? creditFinancingTypeLabels[financingType]
      : null,
    status,
    statusLabel: creditStatusLabels[status] ?? application.status,
    amount: decimalToNumber(application.amount),
    downPayment: decimalToNumber(application.downPayment),
    termMonths: application.termMonths,
    estimatedPayment: decimalToNumber(application.estimatedPayment),
    currency: application.currency,
    pendingItems: application.pendingItems,
    observations: application.observations,
    requestedAt: isoOrNull(application.requestedAt),
    resolvedAt: isoOrNull(application.resolvedAt),
    createdAt: application.createdAt.toISOString(),
    updatedAt: application.updatedAt.toISOString(),
  };
}
