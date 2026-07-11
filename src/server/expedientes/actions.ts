"use server";

import { revalidatePath } from "next/cache";

import {
  canOperateActivities,
  canOperateExpedientes,
  canReviewExpedienteDocuments,
  getActivityScopeForUser,
  getExpedienteScopeForUser,
  isGlobalScopeRole,
  type CrmScope,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import {
  isActivityPriorityValue,
  isActivityTypeValue,
  resolvedActivityStatuses,
  sanitizeText,
  type ActivityStatusValue,
} from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  canAccessActivity,
  canAccessCustomerFile,
  resolveBranchIdByCode,
} from "@/server/expedientes/queries";
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

// --- Activities / follow-ups (Patch 3.3C.1) ------------------------------

const NO_ACTIVITY = "La actividad no existe o no está en tu alcance.";
const ACTIVITY_CLOSED = "La actividad ya está cerrada y no puede modificarse.";
const NO_BRANCH = "Selecciona la sucursal de la actividad.";

/** Revalidates every route that renders activities. */
function revalidateActivityRoutes() {
  revalidatePath("/panel/actividades");
  revalidatePath("/panel/expedientes");
}

type ActivityActor = {
  userId: string;
  role: UserRoleEnum;
  scope: CrmScope;
  branchCode: string | null;
};

/**
 * Resolves the caller and enforces the activity role gate. Cashier and
 * Accountant never get past this point.
 */
async function authorizeActivities(): Promise<
  { ok: true; actor: ActivityActor } | { ok: false; error: string }
> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canOperateActivities(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const branchCode = sessionBranchCode(session.branchId);
  return {
    ok: true,
    actor: {
      userId: session.uid,
      role: session.roleEnum,
      branchCode,
      scope: getActivityScopeForUser(session.roleEnum, branchCode, session.uid),
    },
  };
}

/**
 * Same as {@link authorizeActivities}, plus confirmation that the activity is
 * inside the caller's scope. Returns its current status so the caller can
 * reject writes against a closed activity.
 */
async function authorizeForActivity(activityId: string): Promise<
  | { ok: true; actor: ActivityActor; status: ActivityStatusValue }
  | { ok: false; error: string }
> {
  const auth = await authorizeActivities();
  if (!auth.ok) return auth;

  if (!(await canAccessActivity(auth.actor.scope, activityId))) {
    return { ok: false, error: NO_ACTIVITY };
  }

  const prisma = getPrisma();
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { status: true },
  });
  if (!activity) return { ok: false, error: NO_ACTIVITY };

  return {
    ok: true,
    actor: auth.actor,
    status: activity.status as ActivityStatusValue,
  };
}

/**
 * Where the activity lives. An activity attached to an expediente inherits that
 * expediente's branch; a standalone activity inherits the actor's own branch.
 * A branch-scoped user (Manager / Seller) can never place an activity in
 * another branch, so `input.branchCode` is only honoured for a global role.
 */
async function resolveActivityContext(
  actor: ActivityActor,
  input: { customerFileId?: string | null; branchCode?: string | null },
): Promise<
  | {
      ok: true;
      branchId: string;
      customerFileId: string | null;
      customerId: string | null;
      leadId: string | null;
    }
  | { ok: false; error: string }
> {
  const prisma = getPrisma();

  if (input.customerFileId) {
    if (!(await canAccessCustomerFile(actor.scope, input.customerFileId))) {
      return { ok: false, error: NO_FILE };
    }
    const file = await prisma.customerFile.findUnique({
      where: { id: input.customerFileId },
      select: { branchId: true, customerId: true, leadId: true },
    });
    if (!file) return { ok: false, error: NO_FILE };
    return {
      ok: true,
      // Branch comes from the expediente, never from the client payload.
      branchId: file.branchId,
      customerFileId: input.customerFileId,
      customerId: file.customerId,
      leadId: file.leadId,
    };
  }

  const branchCode = isGlobalScopeRole(actor.role)
    ? input.branchCode
    : actor.branchCode;
  if (!branchCode) return { ok: false, error: NO_BRANCH };

  const branchId = await resolveBranchIdByCode(branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };

  return {
    ok: true,
    branchId,
    customerFileId: null,
    customerId: null,
    leadId: null,
  };
}

export type CreateActivityInput = {
  type: string;
  priority?: string | null;
  description: string;
  scheduledAt?: string | null;
  /** Optional expediente this follow-up belongs to. */
  customerFileId?: string | null;
  /** Only honoured for a global role; ignored for Manager and Seller. */
  branchCode?: string | null;
};

/**
 * Creates a follow-up assigned to the caller. `scheduledAt` stays optional so a
 * plain note or a past contact can be recorded without an agenda date.
 */
export async function createActivityAction(
  input: CreateActivityInput,
): Promise<ExpedienteActionResult> {
  const auth = await authorizeActivities();
  if (!auth.ok) return auth;

  if (!isActivityTypeValue(input.type)) {
    return { ok: false, error: "Tipo de actividad no válido." };
  }
  const priority =
    input.priority && isActivityPriorityValue(input.priority)
      ? input.priority
      : "MEDIA";

  const description = optionalText(input.description);
  if (!description) {
    return { ok: false, error: "La descripción de la actividad es obligatoria." };
  }

  const scheduledAt = parseDate(input.scheduledAt);
  if (input.scheduledAt && !scheduledAt) {
    return { ok: false, error: "La fecha programada no es válida." };
  }

  const context = await resolveActivityContext(auth.actor, input);
  if (!context.ok) return context;

  const prisma = getPrisma();
  try {
    await prisma.activity.create({
      data: {
        type: input.type,
        priority,
        description,
        scheduledAt,
        branchId: context.branchId,
        userId: auth.actor.userId,
        customerFileId: context.customerFileId,
        customerId: context.customerId,
        leadId: context.leadId,
      },
    });
    revalidateActivityRoutes();
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo registrar la actividad." };
  }
}

export type UpdateActivityInput = {
  activityId: string;
  type?: string | null;
  priority?: string | null;
  description?: string | null;
  scheduledAt?: string | null;
};

/** Edits a pending activity. Branch and ownership are never reassigned here. */
export async function updateActivityAction(
  input: UpdateActivityInput,
): Promise<ExpedienteActionResult> {
  const auth = await authorizeForActivity(input.activityId);
  if (!auth.ok) return auth;
  if (resolvedActivityStatuses.includes(auth.status)) {
    return { ok: false, error: ACTIVITY_CLOSED };
  }

  if (input.type && !isActivityTypeValue(input.type)) {
    return { ok: false, error: "Tipo de actividad no válido." };
  }
  if (input.priority && !isActivityPriorityValue(input.priority)) {
    return { ok: false, error: "Prioridad de actividad no válida." };
  }

  const scheduledAt = parseDate(input.scheduledAt);
  if (input.scheduledAt && !scheduledAt) {
    return { ok: false, error: "La fecha programada no es válida." };
  }

  const description =
    input.description === undefined ? undefined : optionalText(input.description);
  if (description === null) {
    return { ok: false, error: "La descripción de la actividad es obligatoria." };
  }

  const prisma = getPrisma();
  await prisma.activity.update({
    where: { id: input.activityId },
    data: {
      type: input.type && isActivityTypeValue(input.type) ? input.type : undefined,
      priority:
        input.priority && isActivityPriorityValue(input.priority)
          ? input.priority
          : undefined,
      description,
      // An explicit null clears the agenda date; `undefined` leaves it alone.
      scheduledAt: input.scheduledAt === undefined ? undefined : scheduledAt,
    },
  });
  revalidateActivityRoutes();
  return { ok: true };
}

export async function completeActivityAction(input: {
  activityId: string;
  result?: string | null;
}): Promise<ExpedienteActionResult> {
  const auth = await authorizeForActivity(input.activityId);
  if (!auth.ok) return auth;
  if (resolvedActivityStatuses.includes(auth.status)) {
    return { ok: false, error: ACTIVITY_CLOSED };
  }

  const prisma = getPrisma();
  await prisma.activity.update({
    where: { id: input.activityId },
    data: {
      status: "COMPLETADA",
      completedAt: new Date(),
      result: optionalText(input.result),
    },
  });
  revalidateActivityRoutes();
  return { ok: true };
}

export async function cancelActivityAction(input: {
  activityId: string;
  result?: string | null;
}): Promise<ExpedienteActionResult> {
  const auth = await authorizeForActivity(input.activityId);
  if (!auth.ok) return auth;
  if (resolvedActivityStatuses.includes(auth.status)) {
    return { ok: false, error: ACTIVITY_CLOSED };
  }

  const prisma = getPrisma();
  await prisma.activity.update({
    where: { id: input.activityId },
    data: { status: "CANCELADA", result: optionalText(input.result) },
  });
  revalidateActivityRoutes();
  return { ok: true };
}

/** Moves the agenda date of a pending activity. */
export async function rescheduleActivityAction(input: {
  activityId: string;
  scheduledAt: string;
}): Promise<ExpedienteActionResult> {
  const auth = await authorizeForActivity(input.activityId);
  if (!auth.ok) return auth;
  if (resolvedActivityStatuses.includes(auth.status)) {
    return { ok: false, error: ACTIVITY_CLOSED };
  }

  const scheduledAt = parseDate(input.scheduledAt);
  if (!scheduledAt) {
    return { ok: false, error: "La fecha programada no es válida." };
  }

  const prisma = getPrisma();
  await prisma.activity.update({
    where: { id: input.activityId },
    data: { scheduledAt, status: "PENDIENTE" },
  });
  revalidateActivityRoutes();
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
