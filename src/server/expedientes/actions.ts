"use server";

import {
  canOperateExpedientes,
  canReviewExpedienteDocuments,
  getExpedienteScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { canAccessCustomerFile } from "@/server/expedientes/queries";
import {
  canTransitionQuote,
  defaultExpedienteDocumentTypes,
  isCreditFinancingTypeValue,
  isCreditStatusValue,
  isExpedienteDocumentStatusValue,
  isExpedienteDocumentTypeValue,
  isQuoteSaleTypeValue,
  isQuoteStatusValue,
  isSupportedCurrency,
  resolvedCreditStatuses,
  sanitizeMoney,
  sanitizeTermMonths,
  type CreditStatusValue,
  type QuoteStatusValue,
} from "@/server/expedientes/shared";

/**
 * Server-side expediente-support write actions (Patch 3.3B): proforma, document
 * checklist and manual credit follow-up. Every action re-checks the session
 * role and re-resolves the caller's scope against the owning CustomerFile;
 * authorization is enforced here, never in the UI.
 *
 * Branch is ALWAYS derived from the expediente (`customerFile.branchId`) and
 * never taken from the client, so a branch-scoped user cannot write a row into
 * another branch by posting a different id. Free text is sanitized, money and
 * term values are bounded, and every enum is validated before it reaches Prisma.
 *
 * These actions never touch Caja, Contabilidad or the public portal, never
 * expose costs, and never create a Customer or a MotorcycleUnit — Customer and
 * MotorcycleUnit stay strictly separate. The localStorage fallback and the
 * presentation bridge are untouched: nothing here is wired into the UI yet.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para esta operación.";
const NO_FILE = "El expediente no existe o no está en tu alcance.";

export type ExpedienteActionResult = { ok: true } | { ok: false; error: string };

/** A proforma may only be edited while it is still open. */
const editableQuoteStatuses: QuoteStatusValue[] = ["BORRADOR", "EMITIDA"];

function optionalText(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = sanitizeText(value);
  return clean ? clean.slice(0, 500) : null;
}

function optionalCurrency(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = sanitizeText(value).toUpperCase();
  return isSupportedCurrency(clean) ? clean : null;
}

function sessionBranchCode(branchId: string): string | null {
  return branchId === GLOBAL_BRANCH_ID ? null : branchId;
}

/**
 * Resolves the caller, enforces the role gate, and confirms the expediente is
 * inside their scope. Returns the expediente's own branchId — the only branch a
 * support row may be written to.
 */
async function authorizeForFile(customerFileId: string): Promise<
  | { ok: true; userId: string; role: UserRoleEnum; branchId: string }
  | { ok: false; error: string }
> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canOperateExpedientes(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const scope = getExpedienteScopeForUser(
    session.roleEnum,
    sessionBranchCode(session.branchId),
    session.uid,
  );
  if (!(await canAccessCustomerFile(scope, customerFileId))) {
    return { ok: false, error: NO_FILE };
  }

  const prisma = getPrisma();
  const file = await prisma.customerFile.findUnique({
    where: { id: customerFileId },
    select: { branchId: true, customerId: true },
  });
  if (!file) return { ok: false, error: NO_FILE };

  return {
    ok: true,
    userId: session.uid,
    role: session.roleEnum,
    // Branch comes from the expediente, never from the client payload.
    branchId: file.branchId,
  };
}

// --- Quote / Proforma ----------------------------------------------------

export type SaveQuoteInput = {
  customerFileId: string;
  motorcycleModel: string;
  saleType?: string | null;
  price?: number | null;
  downPayment?: number | null;
  termMonths?: number | null;
  estimatedPayment?: number | null;
  currency?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
};

/**
 * Creates or updates the single proforma of an expediente (Quote.customerFileId
 * is unique). An existing quote in a terminal state is not editable.
 */
export async function saveQuoteAction(
  input: SaveQuoteInput,
): Promise<ExpedienteActionResult> {
  const auth = await authorizeForFile(input.customerFileId);
  if (!auth.ok) return auth;

  const motorcycleModel = optionalText(input.motorcycleModel);
  if (!motorcycleModel) {
    return { ok: false, error: "El modelo de la proforma es obligatorio." };
  }

  const saleType =
    input.saleType && isQuoteSaleTypeValue(input.saleType)
      ? input.saleType
      : null;

  const expiresAt = parseDate(input.expiresAt);
  if (input.expiresAt && !expiresAt) {
    return { ok: false, error: "La fecha de vencimiento no es válida." };
  }

  const prisma = getPrisma();
  const existing = await prisma.quote.findUnique({
    where: { customerFileId: input.customerFileId },
    select: { id: true, status: true },
  });

  // Only an open proforma is editable; ACEPTADA / VENCIDA / CANCELADA are final.
  if (existing && !editableQuoteStatuses.includes(existing.status as QuoteStatusValue)) {
    return {
      ok: false,
      error: "La proforma ya está cerrada y no puede editarse.",
    };
  }

  const file = await prisma.customerFile.findUnique({
    where: { id: input.customerFileId },
    select: { customerId: true },
  });

  const data = {
    motorcycleModel,
    saleType,
    price: sanitizeMoney(input.price),
    downPayment: sanitizeMoney(input.downPayment),
    termMonths: sanitizeTermMonths(input.termMonths),
    estimatedPayment: sanitizeMoney(input.estimatedPayment),
    currency: optionalCurrency(input.currency),
    expiresAt,
    notes: optionalText(input.notes),
  };

  try {
    await prisma.quote.upsert({
      where: { customerFileId: input.customerFileId },
      update: data,
      create: {
        ...data,
        customerFileId: input.customerFileId,
        customerId: file?.customerId ?? null,
        branchId: auth.branchId,
        createdByUserId: auth.userId,
        quoteNumber: generateCode("PRO"),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar la proforma." };
  }
}

export async function changeQuoteStatusAction(input: {
  customerFileId: string;
  status: string;
}): Promise<ExpedienteActionResult> {
  const auth = await authorizeForFile(input.customerFileId);
  if (!auth.ok) return auth;

  if (!isQuoteStatusValue(input.status)) {
    return { ok: false, error: "Estado de proforma no válido." };
  }

  const prisma = getPrisma();
  const quote = await prisma.quote.findUnique({
    where: { customerFileId: input.customerFileId },
    select: { id: true, status: true, issuedAt: true },
  });
  if (!quote) return { ok: false, error: "El expediente no tiene proforma." };

  const current = quote.status as QuoteStatusValue;
  if (!canTransitionQuote(current, input.status)) {
    return {
      ok: false,
      error: `No se puede pasar de ${current} a ${input.status}.`,
    };
  }

  await prisma.quote.update({
    where: { id: quote.id },
    data: {
      status: input.status,
      // Stamp the issue date the first time the proforma is emitted.
      issuedAt:
        input.status === "EMITIDA" && !quote.issuedAt
          ? new Date()
          : quote.issuedAt,
    },
  });
  return { ok: true };
}

// --- Document checklist --------------------------------------------------

/**
 * Seeds the default checklist rows for an expediente. Runs in a transaction and
 * skips types that already exist, so calling it twice is safe.
 */
export async function seedExpedienteChecklistAction(input: {
  customerFileId: string;
}): Promise<ExpedienteActionResult> {
  const auth = await authorizeForFile(input.customerFileId);
  if (!auth.ok) return auth;

  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.expedienteDocument.findMany({
        where: { customerFileId: input.customerFileId },
        select: { documentType: true },
      });
      const present = new Set(existing.map((row) => row.documentType));
      const missing = defaultExpedienteDocumentTypes.filter(
        (type) => !present.has(type),
      );
      if (!missing.length) return;

      await tx.expedienteDocument.createMany({
        data: missing.map((documentType) => ({
          customerFileId: input.customerFileId,
          branchId: auth.branchId,
          documentType,
        })),
      });
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo preparar la lista de documentos." };
  }
}

export async function addExpedienteDocumentAction(input: {
  customerFileId: string;
  documentType: string;
  notes?: string | null;
}): Promise<ExpedienteActionResult> {
  const auth = await authorizeForFile(input.customerFileId);
  if (!auth.ok) return auth;

  if (!isExpedienteDocumentTypeValue(input.documentType)) {
    return { ok: false, error: "Tipo de documento no válido." };
  }

  const prisma = getPrisma();
  try {
    await prisma.expedienteDocument.create({
      data: {
        customerFileId: input.customerFileId,
        branchId: auth.branchId,
        documentType: input.documentType,
        notes: optionalText(input.notes),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo agregar el documento." };
  }
}

/**
 * Updates a checklist row's status. REVISADO/RECHAZADO are review outcomes and
 * are restricted to Admin and Manager; a Seller may only mark PENDIENTE or
 * RECIBIDO on their own expediente.
 */
export async function updateExpedienteDocumentAction(input: {
  documentId: string;
  status: string;
  notes?: string | null;
}): Promise<ExpedienteActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const prisma = getPrisma();
  const document = await prisma.expedienteDocument.findUnique({
    where: { id: input.documentId },
    select: { id: true, customerFileId: true },
  });
  if (!document) return { ok: false, error: "El documento no existe." };

  const auth = await authorizeForFile(document.customerFileId);
  if (!auth.ok) return auth;

  if (!isExpedienteDocumentStatusValue(input.status)) {
    return { ok: false, error: "Estado de documento no válido." };
  }

  const isReviewOutcome =
    input.status === "REVISADO" || input.status === "RECHAZADO";
  if (isReviewOutcome && !canReviewExpedienteDocuments(auth.role)) {
    return { ok: false, error: NO_PERMISSION };
  }

  await prisma.expedienteDocument.update({
    where: { id: document.id },
    data: {
      status: input.status,
      notes: optionalText(input.notes),
      reviewedByUserId: isReviewOutcome ? auth.userId : null,
      reviewedAt: isReviewOutcome ? new Date() : null,
    },
  });
  return { ok: true };
}

// --- Manual credit follow-up ---------------------------------------------

export type SaveCreditApplicationInput = {
  customerFileId: string;
  financialInstitution?: string | null;
  financingType?: string | null;
  amount?: number | null;
  downPayment?: number | null;
  termMonths?: number | null;
  estimatedPayment?: number | null;
  currency?: string | null;
  pendingItems?: string | null;
  observations?: string | null;
  requestedAt?: string | null;
};

/** Creates or updates the single manual credit follow-up of an expediente. */
export async function saveCreditApplicationAction(
  input: SaveCreditApplicationInput,
): Promise<ExpedienteActionResult> {
  const auth = await authorizeForFile(input.customerFileId);
  if (!auth.ok) return auth;

  const financingType =
    input.financingType && isCreditFinancingTypeValue(input.financingType)
      ? input.financingType
      : null;

  const requestedAt = parseDate(input.requestedAt);
  if (input.requestedAt && !requestedAt) {
    return { ok: false, error: "La fecha de solicitud no es válida." };
  }

  const prisma = getPrisma();
  const file = await prisma.customerFile.findUnique({
    where: { id: input.customerFileId },
    select: { customerId: true },
  });

  const data = {
    financialInstitution: optionalText(input.financialInstitution),
    financingType,
    amount: sanitizeMoney(input.amount),
    downPayment: sanitizeMoney(input.downPayment),
    termMonths: sanitizeTermMonths(input.termMonths),
    estimatedPayment: sanitizeMoney(input.estimatedPayment),
    currency: optionalCurrency(input.currency),
    pendingItems: optionalText(input.pendingItems),
    observations: optionalText(input.observations),
    requestedAt,
  };

  try {
    await prisma.creditApplication.upsert({
      where: { customerFileId: input.customerFileId },
      update: data,
      create: {
        ...data,
        customerFileId: input.customerFileId,
        customerId: file?.customerId ?? null,
        branchId: auth.branchId,
        createdByUserId: auth.userId,
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar el seguimiento de crédito." };
  }
}

export async function changeCreditStatusAction(input: {
  customerFileId: string;
  status: string;
}): Promise<ExpedienteActionResult> {
  const auth = await authorizeForFile(input.customerFileId);
  if (!auth.ok) return auth;

  if (!isCreditStatusValue(input.status)) {
    return { ok: false, error: "Estado de crédito no válido." };
  }

  const prisma = getPrisma();
  const application = await prisma.creditApplication.findUnique({
    where: { customerFileId: input.customerFileId },
    select: { id: true, status: true },
  });
  if (!application) {
    return { ok: false, error: "El expediente no tiene seguimiento de crédito." };
  }

  const current = application.status as CreditStatusValue;
  if (resolvedCreditStatuses.includes(current)) {
    return {
      ok: false,
      error: "El seguimiento de crédito ya está cerrado.",
    };
  }

  await prisma.creditApplication.update({
    where: { id: application.id },
    data: {
      status: input.status,
      resolvedAt: resolvedCreditStatuses.includes(input.status)
        ? new Date()
        : null,
    },
  });
  return { ok: true };
}

// --- Helpers -------------------------------------------------------------

function generateCode(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

/** Accepts an ISO date string; rejects anything unparseable. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
