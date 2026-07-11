"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import {
  canAccessContabilidad,
  canOperateContabilidad,
  canReviewContabilidad,
  canViewAccountingCosts,
  getContabilidadScopeForUser,
  type ContabilidadScope,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID, type UserRoleEnum } from "@/server/auth/roles";
import {
  calculateAccountingClosingDifference,
  calculateAccountingDocumentTotal,
  calculateExpenseTotal,
  calculatePayrollNetPay,
  calculateReconciliationDifference,
  isAccountNatureValue,
  isAccountTypeValue,
  isAccountingDocumentTypeValue,
  isExpenseCategoryValue,
  isJournalEntrySourceValue,
  isThirdPartyTypeValue,
  isVoucherTypeValue,
  parseAccountingDate,
  reconciliationStatusForDifference,
  sanitizeAccountCode,
  sanitizeAccountingCurrency,
  sanitizeAccountingMoney,
  sanitizeAccountingPeriod,
  sanitizeAccountingText,
  sanitizeMinimumStock,
  sanitizeSignedAccountingMoney,
} from "@/server/contabilidad/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * PostgreSQL-backed Contabilidad writes (Patch 3.5B).
 *
 * Every action calls `requireAuth`, re-checks the Contabilidad role server-side
 * and derives the branch from a validated branch code — a client-supplied
 * branch is never trusted blindly. Writing anywhere in Contabilidad requires
 * `canOperateContabilidad`, which is Admin and Contador only; a Gerente reads
 * their own branch's valued inventory and nothing else (ROLES.md §12).
 *
 * Nothing here is connected to the legacy UI: the localStorage accounting panel
 * keeps running untouched, and no Caja record is imported or mutated.
 *
 * No fiscal/DGI numbering, electronic invoicing, banking integration or payroll
 * tax rule is implemented. Cancellation is an internal state change requiring a
 * reason, exactly as the current panel treats it.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para esta operación.";
const NO_BRANCH = "Selecciona una sucursal válida.";
const NO_ACCOUNT = "La cuenta contable no existe.";
const INVALID_MONEY = "Los montos no son válidos.";
const INVALID_DATE = "La fecha no es válida.";
const INVALID_PERIOD = "El periodo debe tener el formato AAAA-MM.";

export type ContabilidadActionResult =
  | { ok: true }
  | { ok: false; error: string };

type ContabilidadActor = {
  userId: string;
  role: UserRoleEnum;
  scope: ContabilidadScope;
};

const contabilidadRoutes = [
  "/panel/contabilidad",
  "/panel/contabilidad/bancos",
  "/panel/contabilidad/catalogo-cuentas",
  "/panel/contabilidad/cierres",
  "/panel/contabilidad/comprobantes",
  "/panel/contabilidad/conciliacion",
  "/panel/contabilidad/diarios",
  "/panel/contabilidad/documentos",
  "/panel/contabilidad/gastos",
  "/panel/contabilidad/inventario",
  "/panel/contabilidad/planilla",
  "/panel/contabilidad/reportes",
  "/panel/contabilidad/terceros",
];

function revalidateContabilidadRoutes() {
  for (const route of contabilidadRoutes) revalidatePath(route);
}

// --- Authorization -------------------------------------------------------

async function authorizeContabilidad(
  permission: "access" | "operate" | "review" | "costs",
): Promise<
  { ok: true; actor: ContabilidadActor } | { ok: false; error: string }
> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();

  const allowed =
    permission === "operate"
      ? canOperateContabilidad(session.roleEnum)
      : permission === "review"
        ? canReviewContabilidad(session.roleEnum)
        : permission === "costs"
          ? // Writing a cost requires both cost visibility and write access,
            // which together mean Admin or Contador — never a Gerente.
            canViewAccountingCosts(session.roleEnum) &&
            canOperateContabilidad(session.roleEnum)
          : canAccessContabilidad(session.roleEnum);
  if (!allowed) return { ok: false, error: NO_PERMISSION };

  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const scope = getContabilidadScopeForUser(session.roleEnum, branchCode);
  if (scope.level === "none") return { ok: false, error: NO_PERMISSION };

  return {
    ok: true,
    actor: { userId: session.uid, role: session.roleEnum, scope },
  };
}

// --- Shared helpers ------------------------------------------------------

function toDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function requiredText(value: string | null | undefined, maxLength = 500) {
  return sanitizeAccountingText(value, maxLength);
}

/** Only global roles write, so a branch must always be named and resolved. */
async function resolveAccountingBranchId(
  branchCode: string | null | undefined,
): Promise<string | null> {
  const code = sanitizeAccountingText(branchCode, 60);
  if (!code) return null;
  const branch = await getPrisma().branch.findUnique({
    where: { code },
    select: { id: true },
  });
  return branch?.id ?? null;
}

async function accountExists(accountId: string | null | undefined) {
  if (!accountId) return true;
  const row = await getPrisma().chartAccount.findUnique({
    where: { id: accountId },
    select: { id: true },
  });
  return Boolean(row);
}

/** `null` when any supplied value is invalid; missing values become 0. */
function money(...values: Array<number | null | undefined>): number[] | null {
  const parsed = values.map((value) =>
    value === null || value === undefined ? 0 : sanitizeAccountingMoney(value),
  );
  return parsed.some((value) => value === null) ? null : (parsed as number[]);
}

function generateNumber(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}-${date}-${suffix}`;
}

// --- Chart of accounts ---------------------------------------------------

export async function createChartAccountAction(input: {
  code: string;
  name: string;
  type: string;
  nature: string;
  parentId?: string | null;
  description?: string | null;
}): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const code = sanitizeAccountCode(input.code);
  const name = requiredText(input.name, 200);
  if (!code) return { ok: false, error: "El código de cuenta no es válido." };
  if (!name) return { ok: false, error: "El nombre de la cuenta es obligatorio." };
  if (!isAccountTypeValue(input.type)) {
    return { ok: false, error: "El tipo de cuenta no es válido." };
  }
  if (!isAccountNatureValue(input.nature)) {
    return { ok: false, error: "La naturaleza de la cuenta no es válida." };
  }
  if (!(await accountExists(input.parentId))) {
    return { ok: false, error: "La cuenta padre no existe." };
  }

  try {
    const created = await getPrisma().chartAccount.create({
      data: {
        code,
        name,
        type: input.type,
        nature: input.nature,
        parentId: input.parentId ?? null,
        description: sanitizeAccountingText(input.description),
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true, accountId: created.id };
  } catch {
    return { ok: false, error: "Ya existe una cuenta con ese código." };
  }
}

export async function updateChartAccountAction(input: {
  accountId: string;
  name?: string;
  type?: string;
  nature?: string;
  parentId?: string | null;
  description?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const account = await getPrisma().chartAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true },
  });
  if (!account) return { ok: false, error: NO_ACCOUNT };

  if (input.type !== undefined && !isAccountTypeValue(input.type)) {
    return { ok: false, error: "El tipo de cuenta no es válido." };
  }
  if (input.nature !== undefined && !isAccountNatureValue(input.nature)) {
    return { ok: false, error: "La naturaleza de la cuenta no es válida." };
  }
  const name = input.name === undefined ? undefined : requiredText(input.name, 200);
  if (input.name !== undefined && !name) {
    return { ok: false, error: "El nombre de la cuenta es obligatorio." };
  }
  // A cuenta cannot be its own parent, which would orphan the tree.
  if (input.parentId && input.parentId === input.accountId) {
    return { ok: false, error: "Una cuenta no puede ser su propia cuenta padre." };
  }
  if (!(await accountExists(input.parentId))) {
    return { ok: false, error: "La cuenta padre no existe." };
  }

  await getPrisma().chartAccount.update({
    where: { id: input.accountId },
    data: {
      name: name ?? undefined,
      type: input.type,
      nature: input.nature,
      parentId: input.parentId,
      description:
        input.description === undefined
          ? undefined
          : sanitizeAccountingText(input.description),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function deactivateChartAccountAction(input: {
  accountId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const account = await getPrisma().chartAccount.findUnique({
    where: { id: input.accountId },
    select: { id: true, isActive: true },
  });
  if (!account) return { ok: false, error: NO_ACCOUNT };
  if (!account.isActive) return { ok: false, error: "La cuenta ya está inactiva." };

  await getPrisma().chartAccount.update({
    where: { id: input.accountId },
    data: { isActive: false },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Third parties -------------------------------------------------------

export async function createThirdPartyAction(input: {
  branchCode: string;
  type: string;
  name: string;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  customerId?: string | null;
  notes?: string | null;
}): Promise<{ ok: true; thirdPartyId: string } | { ok: false; error: string }> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };
  if (!isThirdPartyTypeValue(input.type)) {
    return { ok: false, error: "El tipo de tercero no es válido." };
  }
  const name = requiredText(input.name, 200);
  if (!name) return { ok: false, error: "El nombre del tercero es obligatorio." };

  const created = await getPrisma().thirdParty.create({
    data: {
      branchId,
      type: input.type,
      name,
      taxId: sanitizeAccountingText(input.taxId, 40),
      phone: sanitizeAccountingText(input.phone, 40),
      email: sanitizeAccountingText(input.email, 120),
      customerId: input.customerId ?? null,
      notes: sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true, thirdPartyId: created.id };
}

export async function updateThirdPartyAction(input: {
  thirdPartyId: string;
  type?: string;
  name?: string;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const row = await getPrisma().thirdParty.findUnique({
    where: { id: input.thirdPartyId },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "El tercero no existe." };
  if (input.type !== undefined && !isThirdPartyTypeValue(input.type)) {
    return { ok: false, error: "El tipo de tercero no es válido." };
  }
  const name = input.name === undefined ? undefined : requiredText(input.name, 200);
  if (input.name !== undefined && !name) {
    return { ok: false, error: "El nombre del tercero es obligatorio." };
  }

  await getPrisma().thirdParty.update({
    where: { id: input.thirdPartyId },
    data: {
      type: input.type,
      name: name ?? undefined,
      taxId:
        input.taxId === undefined
          ? undefined
          : sanitizeAccountingText(input.taxId, 40),
      phone:
        input.phone === undefined
          ? undefined
          : sanitizeAccountingText(input.phone, 40),
      email:
        input.email === undefined
          ? undefined
          : sanitizeAccountingText(input.email, 120),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function deactivateThirdPartyAction(input: {
  thirdPartyId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const row = await getPrisma().thirdParty.findUnique({
    where: { id: input.thirdPartyId },
    select: { isActive: true },
  });
  if (!row) return { ok: false, error: "El tercero no existe." };
  if (!row.isActive) return { ok: false, error: "El tercero ya está inactivo." };

  await getPrisma().thirdParty.update({
    where: { id: input.thirdPartyId },
    data: { isActive: false },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Accounting documents ------------------------------------------------

export type CreateAccountingDocumentInput = {
  branchCode: string;
  type: string;
  documentNumber?: string | null;
  documentDate?: string | null;
  thirdPartyName: string;
  thirdPartyId?: string | null;
  taxId?: string | null;
  concept: string;
  sourceDocument?: string | null;
  subtotal: number;
  retention1?: number | null;
  retention2?: number | null;
  appliedPayment?: number | null;
  currency?: string | null;
  paymentMethod?: string | null;
  bank?: string | null;
  reference?: string | null;
  motorcycleDescription?: string[];
  notes?: string | null;
  /** Optional Caja/CRM references. Never imported automatically. */
  cashDocumentId?: string | null;
  cashClosingId?: string | null;
  saleId?: string | null;
  reservationId?: string | null;
  customerId?: string | null;
};

/**
 * A new accounting document always starts as BORRADOR (ROLES.md QA 2.22.1).
 * `origin` is CAJA only when the caller links an existing Caja record.
 */
export async function createAccountingDocumentAction(
  input: CreateAccountingDocumentInput,
): Promise<
  | { ok: true; documentId: string; documentNumber: string }
  | { ok: false; error: string }
> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };
  if (!isAccountingDocumentTypeValue(input.type)) {
    return { ok: false, error: "El tipo de documento no es válido." };
  }

  const thirdPartyName = requiredText(input.thirdPartyName, 200);
  const concept = requiredText(input.concept, 500);
  if (!thirdPartyName) return { ok: false, error: "El tercero es obligatorio." };
  if (!concept) return { ok: false, error: "El concepto es obligatorio." };

  const amounts = money(
    input.subtotal,
    input.retention1,
    input.retention2,
    input.appliedPayment,
  );
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [subtotal, retention1, retention2, appliedPayment] = amounts;

  const currency = sanitizeAccountingCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }

  const documentDate = input.documentDate
    ? parseAccountingDate(input.documentDate)
    : new Date();
  if (!documentDate) return { ok: false, error: INVALID_DATE };

  const cashLinked = Boolean(input.cashDocumentId || input.cashClosingId);
  const total = calculateAccountingDocumentTotal({
    appliedPayment,
    retention1,
    retention2,
    subtotal,
  });

  try {
    const created = await getPrisma().accountingDocument.create({
      data: {
        branchId,
        createdByUserId: auth.actor.userId,
        type: input.type,
        status: "BORRADOR",
        origin: cashLinked ? "CAJA" : "CONTABILIDAD",
        documentNumber:
          requiredText(input.documentNumber, 60) ?? generateNumber("DOC-CTB"),
        documentDate,
        thirdPartyId: input.thirdPartyId ?? null,
        thirdPartyName,
        taxId: sanitizeAccountingText(input.taxId, 40),
        concept,
        sourceDocument: sanitizeAccountingText(input.sourceDocument, 120),
        subtotal: toDecimal(subtotal),
        retention1: toDecimal(retention1),
        retention2: toDecimal(retention2),
        appliedPayment: toDecimal(appliedPayment),
        total: toDecimal(total),
        currency,
        paymentMethod: sanitizeAccountingText(input.paymentMethod, 60),
        bank: sanitizeAccountingText(input.bank, 120),
        reference: sanitizeAccountingText(input.reference, 120),
        motorcycleDescription: (input.motorcycleDescription ?? [])
          .map((line) => sanitizeAccountingText(line, 200))
          .filter((line): line is string => Boolean(line)),
        notes: sanitizeAccountingText(input.notes),
        cashDocumentId: input.cashDocumentId ?? null,
        cashClosingId: input.cashClosingId ?? null,
        saleId: input.saleId ?? null,
        reservationId: input.reservationId ?? null,
        customerId: input.customerId ?? null,
      },
    });
    revalidateContabilidadRoutes();
    return {
      ok: true,
      documentId: created.id,
      documentNumber: created.documentNumber,
    };
  } catch {
    return { ok: false, error: "Ya existe un documento con ese número." };
  }
}

export async function updateAccountingDocumentAction(input: {
  documentId: string;
  thirdPartyName?: string;
  taxId?: string | null;
  concept?: string;
  subtotal?: number;
  retention1?: number;
  retention2?: number;
  appliedPayment?: number;
  paymentMethod?: string | null;
  bank?: string | null;
  reference?: string | null;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const document = await getPrisma().accountingDocument.findUnique({
    where: { id: input.documentId },
  });
  if (!document) return { ok: false, error: "El documento no existe." };
  if (document.status !== "BORRADOR") {
    return {
      ok: false,
      error: "Solo puedes editar un documento en borrador.",
    };
  }

  const thirdPartyName =
    input.thirdPartyName === undefined
      ? undefined
      : requiredText(input.thirdPartyName, 200);
  const concept =
    input.concept === undefined ? undefined : requiredText(input.concept, 500);
  if (input.thirdPartyName !== undefined && !thirdPartyName) {
    return { ok: false, error: "El tercero es obligatorio." };
  }
  if (input.concept !== undefined && !concept) {
    return { ok: false, error: "El concepto es obligatorio." };
  }

  const amounts = money(
    input.subtotal ?? document.subtotal.toNumber(),
    input.retention1 ?? document.retention1.toNumber(),
    input.retention2 ?? document.retention2.toNumber(),
    input.appliedPayment ?? document.appliedPayment.toNumber(),
  );
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [subtotal, retention1, retention2, appliedPayment] = amounts;

  await getPrisma().accountingDocument.update({
    where: { id: input.documentId },
    data: {
      thirdPartyName: thirdPartyName ?? undefined,
      taxId:
        input.taxId === undefined
          ? undefined
          : sanitizeAccountingText(input.taxId, 40),
      concept: concept ?? undefined,
      subtotal: toDecimal(subtotal),
      retention1: toDecimal(retention1),
      retention2: toDecimal(retention2),
      appliedPayment: toDecimal(appliedPayment),
      total: toDecimal(
        calculateAccountingDocumentTotal({
          appliedPayment,
          retention1,
          retention2,
          subtotal,
        }),
      ),
      paymentMethod:
        input.paymentMethod === undefined
          ? undefined
          : sanitizeAccountingText(input.paymentMethod, 60),
      bank:
        input.bank === undefined
          ? undefined
          : sanitizeAccountingText(input.bank, 120),
      reference:
        input.reference === undefined
          ? undefined
          : sanitizeAccountingText(input.reference, 120),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function issueAccountingDocumentAction(input: {
  documentId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const document = await getPrisma().accountingDocument.findUnique({
    where: { id: input.documentId },
    select: { status: true },
  });
  if (!document) return { ok: false, error: "El documento no existe." };
  if (document.status !== "BORRADOR") {
    return { ok: false, error: "Solo puedes emitir un documento en borrador." };
  }

  await getPrisma().accountingDocument.update({
    where: { id: input.documentId },
    data: { status: "EMITIDO" },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

/** Review precedes posting: "Contabilizar requiere revisión previa". */
export async function reviewAccountingDocumentAction(input: {
  documentId: string;
  accountingNotes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const document = await getPrisma().accountingDocument.findUnique({
    where: { id: input.documentId },
    select: { status: true },
  });
  if (!document) return { ok: false, error: "El documento no existe." };
  if (document.status !== "BORRADOR" && document.status !== "EMITIDO") {
    return {
      ok: false,
      error: "Solo puedes revisar un documento en borrador o emitido.",
    };
  }

  await getPrisma().accountingDocument.update({
    where: { id: input.documentId },
    data: {
      status: "REVISADO",
      reviewedByUserId: auth.actor.userId,
      reviewedAt: new Date(),
      accountingNotes:
        input.accountingNotes === undefined
          ? undefined
          : sanitizeAccountingText(input.accountingNotes, 1_000),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function postAccountingDocumentAction(input: {
  documentId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const document = await getPrisma().accountingDocument.findUnique({
    where: { id: input.documentId },
    select: { status: true },
  });
  if (!document) return { ok: false, error: "El documento no existe." };
  if (document.status !== "REVISADO") {
    return {
      ok: false,
      error: "Contabilizar requiere que el documento esté revisado.",
    };
  }

  await getPrisma().accountingDocument.update({
    where: { id: input.documentId },
    data: {
      status: "CONTABILIZADO",
      postedByUserId: auth.actor.userId,
      postedAt: new Date(),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

/** "Conciliar requiere contabilización previa". */
export async function reconcileAccountingDocumentAction(input: {
  documentId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const document = await getPrisma().accountingDocument.findUnique({
    where: { id: input.documentId },
    select: { status: true },
  });
  if (!document) return { ok: false, error: "El documento no existe." };
  if (document.status !== "CONTABILIZADO") {
    return {
      ok: false,
      error: "Conciliar requiere que el documento esté contabilizado.",
    };
  }

  await getPrisma().accountingDocument.update({
    where: { id: input.documentId },
    data: {
      status: "CONCILIADO",
      reconciledByUserId: auth.actor.userId,
      reconciledAt: new Date(),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

/** Internal cancellation requiring a reason. Never a fiscal annulment. */
export async function cancelAccountingDocumentAction(input: {
  documentId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const document = await getPrisma().accountingDocument.findUnique({
    where: { id: input.documentId },
    select: { status: true },
  });
  if (!document) return { ok: false, error: "El documento no existe." };
  if (document.status === "ANULADO") {
    return { ok: false, error: "El documento ya está anulado." };
  }
  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  await getPrisma().accountingDocument.update({
    where: { id: input.documentId },
    data: {
      status: "ANULADO",
      cancelledByUserId: auth.actor.userId,
      cancelledAt: new Date(),
      cancelReason: reason,
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Journal entries -----------------------------------------------------

type JournalLineInput = {
  accountId: string;
  concept?: string | null;
  debit?: number | null;
  credit?: number | null;
  position?: number;
};

async function normalizeJournalLine(line: JournalLineInput, fallbackPosition: number) {
  const amounts = money(line.debit, line.credit);
  if (!amounts) return { ok: false as const, error: INVALID_MONEY };
  const [debit, credit] = amounts;
  if (debit === 0 && credit === 0) {
    return { ok: false as const, error: "Cada línea necesita un debe o un haber." };
  }
  if (debit > 0 && credit > 0) {
    return {
      ok: false as const,
      error: "Una línea no puede tener debe y haber a la vez.",
    };
  }
  if (!(await accountExists(line.accountId)) || !line.accountId) {
    return { ok: false as const, error: NO_ACCOUNT };
  }
  return {
    ok: true as const,
    data: {
      accountId: line.accountId,
      concept: sanitizeAccountingText(line.concept, 300),
      credit: toDecimal(credit),
      debit: toDecimal(debit),
      position: line.position ?? fallbackPosition,
    },
  };
}

export async function createJournalEntryAction(input: {
  entryNumber?: string | null;
  entryDate?: string | null;
  branchCode?: string | null;
  source?: string | null;
  accountingDocumentId?: string | null;
  invoiceNumber?: string | null;
  customerCode?: string | null;
  supplier?: string | null;
  taxId?: string | null;
  taxBase?: number | null;
  bank?: string | null;
  bankPaymentReference?: string | null;
  reconciliation?: string | null;
  retention?: string | null;
  retentionDate?: string | null;
  refund?: string | null;
  notes?: string | null;
  lines?: JournalLineInput[];
}): Promise<{ ok: true; entryId: string } | { ok: false; error: string }> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  // The journal has no branch scope today, so a branch is optional here.
  let branchId: string | null = null;
  if (input.branchCode) {
    branchId = await resolveAccountingBranchId(input.branchCode);
    if (!branchId) return { ok: false, error: NO_BRANCH };
  }

  const source = input.source ?? "MANUAL";
  if (!isJournalEntrySourceValue(source)) {
    return { ok: false, error: "El origen del asiento no es válido." };
  }
  const entryDate = input.entryDate
    ? parseAccountingDate(input.entryDate)
    : new Date();
  if (!entryDate) return { ok: false, error: INVALID_DATE };

  const retentionDate = input.retentionDate
    ? parseAccountingDate(input.retentionDate)
    : null;
  if (input.retentionDate && !retentionDate) {
    return { ok: false, error: INVALID_DATE };
  }

  const taxBase = sanitizeAccountingMoney(input.taxBase ?? 0);
  if (taxBase === null) return { ok: false, error: INVALID_MONEY };

  const lineInputs = input.lines ?? [];
  const normalized = [];
  for (const [index, line] of lineInputs.entries()) {
    const result = await normalizeJournalLine(line, index);
    if (!result.ok) return result;
    normalized.push(result.data);
  }

  try {
    const created = await getPrisma().journalEntry.create({
      data: {
        branchId,
        accountingDocumentId: input.accountingDocumentId ?? null,
        createdByUserId: auth.actor.userId,
        entryNumber: requiredText(input.entryNumber, 60) ?? generateNumber("AS"),
        entryDate,
        // A new asiento is always a draft; posting is a separate, checked step.
        status: "BORRADOR",
        source,
        invoiceNumber: sanitizeAccountingText(input.invoiceNumber, 60),
        customerCode: sanitizeAccountingText(input.customerCode, 60),
        supplier: sanitizeAccountingText(input.supplier, 200),
        taxId: sanitizeAccountingText(input.taxId, 40),
        taxBase: toDecimal(taxBase),
        bank: sanitizeAccountingText(input.bank, 120),
        bankPaymentReference: sanitizeAccountingText(
          input.bankPaymentReference,
          120,
        ),
        reconciliation: sanitizeAccountingText(input.reconciliation, 120),
        retention: sanitizeAccountingText(input.retention, 120),
        retentionDate,
        refund: sanitizeAccountingText(input.refund, 120),
        notes: sanitizeAccountingText(input.notes),
        lines: { create: normalized },
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true, entryId: created.id };
  } catch {
    return { ok: false, error: "Ya existe un asiento con ese número." };
  }
}

/** Only a draft asiento is editable; posted/reconciled/cancelled are frozen. */
async function requireDraftEntry(entryId: string) {
  const entry = await getPrisma().journalEntry.findUnique({
    where: { id: entryId },
    select: { id: true, status: true },
  });
  if (!entry) return { ok: false as const, error: "El asiento no existe." };
  if (entry.status !== "BORRADOR") {
    return {
      ok: false as const,
      error: "Solo puedes modificar un asiento en borrador.",
    };
  }
  return { ok: true as const, entry };
}

export async function updateJournalEntryAction(input: {
  entryId: string;
  entryDate?: string | null;
  invoiceNumber?: string | null;
  customerCode?: string | null;
  supplier?: string | null;
  taxId?: string | null;
  taxBase?: number | null;
  bank?: string | null;
  bankPaymentReference?: string | null;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;
  const draft = await requireDraftEntry(input.entryId);
  if (!draft.ok) return draft;

  const entryDate = input.entryDate ? parseAccountingDate(input.entryDate) : undefined;
  if (input.entryDate && !entryDate) return { ok: false, error: INVALID_DATE };

  const taxBase =
    input.taxBase === undefined || input.taxBase === null
      ? undefined
      : sanitizeAccountingMoney(input.taxBase);
  if (input.taxBase !== undefined && input.taxBase !== null && taxBase === null) {
    return { ok: false, error: INVALID_MONEY };
  }

  await getPrisma().journalEntry.update({
    where: { id: input.entryId },
    data: {
      entryDate: entryDate ?? undefined,
      invoiceNumber:
        input.invoiceNumber === undefined
          ? undefined
          : sanitizeAccountingText(input.invoiceNumber, 60),
      customerCode:
        input.customerCode === undefined
          ? undefined
          : sanitizeAccountingText(input.customerCode, 60),
      supplier:
        input.supplier === undefined
          ? undefined
          : sanitizeAccountingText(input.supplier, 200),
      taxId:
        input.taxId === undefined
          ? undefined
          : sanitizeAccountingText(input.taxId, 40),
      taxBase: taxBase == null ? undefined : toDecimal(taxBase),
      bank:
        input.bank === undefined
          ? undefined
          : sanitizeAccountingText(input.bank, 120),
      bankPaymentReference:
        input.bankPaymentReference === undefined
          ? undefined
          : sanitizeAccountingText(input.bankPaymentReference, 120),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function addJournalEntryLineAction(
  input: JournalLineInput & { entryId: string },
): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;
  const draft = await requireDraftEntry(input.entryId);
  if (!draft.ok) return draft;

  const lineCount = await getPrisma().journalEntryLine.count({
    where: { entryId: input.entryId },
  });
  const normalized = await normalizeJournalLine(input, lineCount);
  if (!normalized.ok) return normalized;

  await getPrisma().journalEntryLine.create({
    data: { ...normalized.data, entryId: input.entryId },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function updateJournalEntryLineAction(
  input: JournalLineInput & { lineId: string },
): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const line = await getPrisma().journalEntryLine.findUnique({
    where: { id: input.lineId },
    select: { entryId: true, position: true },
  });
  if (!line) return { ok: false, error: "La línea no existe." };
  const draft = await requireDraftEntry(line.entryId);
  if (!draft.ok) return draft;

  const normalized = await normalizeJournalLine(
    { ...input, position: input.position ?? line.position },
    line.position,
  );
  if (!normalized.ok) return normalized;

  await getPrisma().journalEntryLine.update({
    where: { id: input.lineId },
    data: normalized.data,
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function removeJournalEntryLineAction(input: {
  lineId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const line = await getPrisma().journalEntryLine.findUnique({
    where: { id: input.lineId },
    select: { entryId: true },
  });
  if (!line) return { ok: false, error: "La línea no existe." };
  const draft = await requireDraftEntry(line.entryId);
  if (!draft.ok) return draft;

  await getPrisma().journalEntryLine.delete({ where: { id: input.lineId } });
  revalidateContabilidadRoutes();
  return { ok: true };
}

/**
 * Posting demands a balanced asiento. Drafts may stay unbalanced, mirroring the
 * current panel, which flags an unbalanced row but never blocks saving it.
 */
export async function postJournalEntryAction(input: {
  entryId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const entry = await getPrisma().journalEntry.findUnique({
    where: { id: input.entryId },
    select: {
      status: true,
      lines: { select: { debit: true, credit: true } },
    },
  });
  if (!entry) return { ok: false, error: "El asiento no existe." };
  if (entry.status !== "BORRADOR") {
    return { ok: false, error: "Solo puedes contabilizar un asiento en borrador." };
  }
  if (!entry.lines.length) {
    return { ok: false, error: "El asiento necesita al menos una línea." };
  }

  const debit = entry.lines.reduce(
    (sum, line) => sum.plus(line.debit),
    new Prisma.Decimal(0),
  );
  const credit = entry.lines.reduce(
    (sum, line) => sum.plus(line.credit),
    new Prisma.Decimal(0),
  );
  if (!debit.equals(credit)) {
    return {
      ok: false,
      error: "El asiento no cuadra: el debe y el haber deben ser iguales.",
    };
  }

  await getPrisma().journalEntry.update({
    where: { id: input.entryId },
    data: {
      status: "CONTABILIZADO",
      postedByUserId: auth.actor.userId,
      postedAt: new Date(),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function reconcileJournalEntryAction(input: {
  entryId: string;
  reconciliation?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const entry = await getPrisma().journalEntry.findUnique({
    where: { id: input.entryId },
    select: { status: true },
  });
  if (!entry) return { ok: false, error: "El asiento no existe." };
  if (entry.status !== "CONTABILIZADO") {
    return {
      ok: false,
      error: "Conciliar requiere que el asiento esté contabilizado.",
    };
  }

  await getPrisma().journalEntry.update({
    where: { id: input.entryId },
    data: {
      status: "CONCILIADO",
      reconciliation:
        input.reconciliation === undefined
          ? undefined
          : sanitizeAccountingText(input.reconciliation, 120),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function cancelJournalEntryAction(input: {
  entryId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const entry = await getPrisma().journalEntry.findUnique({
    where: { id: input.entryId },
    select: { status: true, notes: true },
  });
  if (!entry) return { ok: false, error: "El asiento no existe." };
  if (entry.status === "ANULADO") {
    return { ok: false, error: "El asiento ya está anulado." };
  }
  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  await getPrisma().journalEntry.update({
    where: { id: input.entryId },
    data: { status: "ANULADO", notes: reason },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Vouchers ------------------------------------------------------------

export async function createAccountingVoucherAction(input: {
  branchCode: string;
  type: string;
  voucherNumber?: string | null;
  voucherDate?: string | null;
  beneficiary: string;
  concept: string;
  accountId?: string | null;
  bank?: string | null;
  reference?: string | null;
  amount: number;
  debit?: number | null;
  credit?: number | null;
  currency?: string | null;
  notes?: string | null;
}): Promise<{ ok: true; voucherId: string } | { ok: false; error: string }> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };
  if (!isVoucherTypeValue(input.type)) {
    return { ok: false, error: "El tipo de comprobante no es válido." };
  }
  const beneficiary = requiredText(input.beneficiary, 200);
  const concept = requiredText(input.concept, 500);
  if (!beneficiary) return { ok: false, error: "El beneficiario es obligatorio." };
  if (!concept) return { ok: false, error: "El concepto es obligatorio." };
  if (!(await accountExists(input.accountId))) {
    return { ok: false, error: NO_ACCOUNT };
  }

  const amounts = money(input.amount, input.debit, input.credit);
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [amount, debit, credit] = amounts;
  if (amount <= 0) return { ok: false, error: "El monto debe ser mayor que cero." };

  const currency = sanitizeAccountingCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }
  const voucherDate = input.voucherDate
    ? parseAccountingDate(input.voucherDate)
    : new Date();
  if (!voucherDate) return { ok: false, error: INVALID_DATE };

  try {
    const created = await getPrisma().accountingVoucher.create({
      data: {
        branchId,
        accountId: input.accountId ?? null,
        createdByUserId: auth.actor.userId,
        type: input.type,
        status: "REGISTRADO",
        voucherNumber:
          requiredText(input.voucherNumber, 60) ?? generateNumber("CMP"),
        voucherDate,
        beneficiary,
        concept,
        bank: sanitizeAccountingText(input.bank, 120),
        reference: sanitizeAccountingText(input.reference, 120),
        amount: toDecimal(amount),
        debit: toDecimal(debit),
        credit: toDecimal(credit),
        total: toDecimal(amount),
        currency,
        notes: sanitizeAccountingText(input.notes),
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true, voucherId: created.id };
  } catch {
    return { ok: false, error: "Ya existe un comprobante con ese número." };
  }
}

export async function updateAccountingVoucherAction(input: {
  voucherId: string;
  beneficiary?: string;
  concept?: string;
  bank?: string | null;
  reference?: string | null;
  amount?: number;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const voucher = await getPrisma().accountingVoucher.findUnique({
    where: { id: input.voucherId },
    select: { status: true },
  });
  if (!voucher) return { ok: false, error: "El comprobante no existe." };
  if (voucher.status !== "REGISTRADO") {
    return {
      ok: false,
      error: "Solo puedes editar un comprobante registrado.",
    };
  }

  const beneficiary =
    input.beneficiary === undefined
      ? undefined
      : requiredText(input.beneficiary, 200);
  if (input.beneficiary !== undefined && !beneficiary) {
    return { ok: false, error: "El beneficiario es obligatorio." };
  }
  const concept =
    input.concept === undefined ? undefined : requiredText(input.concept, 500);
  if (input.concept !== undefined && !concept) {
    return { ok: false, error: "El concepto es obligatorio." };
  }

  let amount: number | undefined;
  if (input.amount !== undefined) {
    const parsed = sanitizeAccountingMoney(input.amount);
    if (parsed === null || parsed <= 0) return { ok: false, error: INVALID_MONEY };
    amount = parsed;
  }

  await getPrisma().accountingVoucher.update({
    where: { id: input.voucherId },
    data: {
      beneficiary: beneficiary ?? undefined,
      concept: concept ?? undefined,
      bank:
        input.bank === undefined
          ? undefined
          : sanitizeAccountingText(input.bank, 120),
      reference:
        input.reference === undefined
          ? undefined
          : sanitizeAccountingText(input.reference, 120),
      amount: amount === undefined ? undefined : toDecimal(amount),
      total: amount === undefined ? undefined : toDecimal(amount),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function reconcileAccountingVoucherAction(input: {
  voucherId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const voucher = await getPrisma().accountingVoucher.findUnique({
    where: { id: input.voucherId },
    select: { status: true },
  });
  if (!voucher) return { ok: false, error: "El comprobante no existe." };
  if (voucher.status !== "REGISTRADO") {
    return { ok: false, error: "Solo puedes conciliar un comprobante registrado." };
  }

  await getPrisma().accountingVoucher.update({
    where: { id: input.voucherId },
    data: { status: "CONCILIADO" },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function cancelAccountingVoucherAction(input: {
  voucherId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const voucher = await getPrisma().accountingVoucher.findUnique({
    where: { id: input.voucherId },
    select: { status: true },
  });
  if (!voucher) return { ok: false, error: "El comprobante no existe." };
  if (voucher.status === "ANULADO") {
    return { ok: false, error: "El comprobante ya está anulado." };
  }
  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  await getPrisma().accountingVoucher.update({
    where: { id: input.voucherId },
    data: { status: "ANULADO", notes: reason },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Expenses ------------------------------------------------------------

export async function createExpenseAction(input: {
  branchCode: string;
  category: string;
  expenseDate?: string | null;
  supplier: string;
  concept: string;
  accountId?: string | null;
  voucherId?: string | null;
  taxId?: string | null;
  invoiceNumber?: string | null;
  subtotal: number;
  tax?: number | null;
  retention1?: number | null;
  retention2?: number | null;
  currency?: string | null;
  bank?: string | null;
  reference?: string | null;
  notes?: string | null;
}): Promise<{ ok: true; expenseId: string } | { ok: false; error: string }> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };
  if (!isExpenseCategoryValue(input.category)) {
    return { ok: false, error: "La categoría de gasto no es válida." };
  }
  const supplier = requiredText(input.supplier, 200);
  const concept = requiredText(input.concept, 500);
  if (!supplier) return { ok: false, error: "El proveedor es obligatorio." };
  if (!concept) return { ok: false, error: "El concepto es obligatorio." };
  if (!(await accountExists(input.accountId))) {
    return { ok: false, error: NO_ACCOUNT };
  }

  const amounts = money(
    input.subtotal,
    input.tax,
    input.retention1,
    input.retention2,
  );
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [subtotal, tax, retention1, retention2] = amounts;

  const currency = sanitizeAccountingCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }
  const expenseDate = input.expenseDate
    ? parseAccountingDate(input.expenseDate)
    : new Date();
  if (!expenseDate) return { ok: false, error: INVALID_DATE };

  const total = calculateExpenseTotal({ retention1, retention2, subtotal, tax });

  const created = await getPrisma().expense.create({
    data: {
      branchId,
      accountId: input.accountId ?? null,
      voucherId: input.voucherId ?? null,
      createdByUserId: auth.actor.userId,
      category: input.category,
      status: "REGISTRADO",
      expenseDate,
      supplier,
      concept,
      taxId: sanitizeAccountingText(input.taxId, 40),
      invoiceNumber: sanitizeAccountingText(input.invoiceNumber, 60),
      amount: toDecimal(subtotal),
      subtotal: toDecimal(subtotal),
      tax: toDecimal(tax),
      retention1: toDecimal(retention1),
      retention2: toDecimal(retention2),
      total: toDecimal(total),
      currency,
      bank: sanitizeAccountingText(input.bank, 120),
      reference: sanitizeAccountingText(input.reference, 120),
      notes: sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true, expenseId: created.id };
}

export async function updateExpenseAction(input: {
  expenseId: string;
  supplier?: string;
  concept?: string;
  subtotal?: number;
  tax?: number;
  retention1?: number;
  retention2?: number;
  bank?: string | null;
  reference?: string | null;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const expense = await getPrisma().expense.findUnique({
    where: { id: input.expenseId },
  });
  if (!expense) return { ok: false, error: "El gasto no existe." };
  if (expense.status !== "REGISTRADO") {
    return { ok: false, error: "Solo puedes editar un gasto registrado." };
  }

  const supplier =
    input.supplier === undefined ? undefined : requiredText(input.supplier, 200);
  if (input.supplier !== undefined && !supplier) {
    return { ok: false, error: "El proveedor es obligatorio." };
  }
  const concept =
    input.concept === undefined ? undefined : requiredText(input.concept, 500);
  if (input.concept !== undefined && !concept) {
    return { ok: false, error: "El concepto es obligatorio." };
  }

  const amounts = money(
    input.subtotal ?? expense.subtotal.toNumber(),
    input.tax ?? expense.tax.toNumber(),
    input.retention1 ?? expense.retention1.toNumber(),
    input.retention2 ?? expense.retention2.toNumber(),
  );
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [subtotal, tax, retention1, retention2] = amounts;

  await getPrisma().expense.update({
    where: { id: input.expenseId },
    data: {
      supplier: supplier ?? undefined,
      concept: concept ?? undefined,
      amount: toDecimal(subtotal),
      subtotal: toDecimal(subtotal),
      tax: toDecimal(tax),
      retention1: toDecimal(retention1),
      retention2: toDecimal(retention2),
      total: toDecimal(
        calculateExpenseTotal({ retention1, retention2, subtotal, tax }),
      ),
      bank:
        input.bank === undefined
          ? undefined
          : sanitizeAccountingText(input.bank, 120),
      reference:
        input.reference === undefined
          ? undefined
          : sanitizeAccountingText(input.reference, 120),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function reviewExpenseAction(input: {
  expenseId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const expense = await getPrisma().expense.findUnique({
    where: { id: input.expenseId },
    select: { status: true },
  });
  if (!expense) return { ok: false, error: "El gasto no existe." };
  if (expense.status !== "REGISTRADO") {
    return { ok: false, error: "El gasto ya fue revisado." };
  }

  await getPrisma().expense.update({
    where: { id: input.expenseId },
    data: {
      status: "REVISADO",
      reviewedByUserId: auth.actor.userId,
      reviewedAt: new Date(),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Payroll -------------------------------------------------------------

export async function createPayrollRecordAction(input: {
  branchCode: string;
  employeeName: string;
  position?: string | null;
  period: string;
  baseSalary: number;
  commissions?: number | null;
  bonuses?: number | null;
  deductions?: number | null;
  advances?: number | null;
  currency?: string | null;
  notes?: string | null;
}): Promise<
  { ok: true; payrollRecordId: string } | { ok: false; error: string }
> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };

  const employeeName = requiredText(input.employeeName, 200);
  if (!employeeName) return { ok: false, error: "El empleado es obligatorio." };
  const period = sanitizeAccountingPeriod(input.period);
  if (!period) return { ok: false, error: INVALID_PERIOD };

  const amounts = money(
    input.baseSalary,
    input.commissions,
    input.bonuses,
    input.deductions,
    input.advances,
  );
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [baseSalary, commissions, bonuses, deductions, advances] = amounts;

  const currency = sanitizeAccountingCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }

  // Every amount is captured manually; no payroll tax rule is applied.
  const netPay = calculatePayrollNetPay({
    advances,
    baseSalary,
    bonuses,
    commissions,
    deductions,
  });

  try {
    const created = await getPrisma().payrollRecord.create({
      data: {
        branchId,
        createdByUserId: auth.actor.userId,
        employeeName,
        position: sanitizeAccountingText(input.position, 120),
        period,
        status: "BORRADOR",
        baseSalary: toDecimal(baseSalary),
        commissions: toDecimal(commissions),
        bonuses: toDecimal(bonuses),
        deductions: toDecimal(deductions),
        advances: toDecimal(advances),
        netPay: toDecimal(netPay),
        currency,
        notes: sanitizeAccountingText(input.notes),
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true, payrollRecordId: created.id };
  } catch {
    return {
      ok: false,
      error: "Ya existe una planilla para ese empleado y periodo.",
    };
  }
}

export async function updatePayrollRecordAction(input: {
  payrollRecordId: string;
  position?: string | null;
  baseSalary?: number;
  commissions?: number;
  bonuses?: number;
  deductions?: number;
  advances?: number;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const record = await getPrisma().payrollRecord.findUnique({
    where: { id: input.payrollRecordId },
  });
  if (!record) return { ok: false, error: "La planilla no existe." };
  if (record.status !== "BORRADOR") {
    return { ok: false, error: "Solo puedes editar una planilla en borrador." };
  }

  const amounts = money(
    input.baseSalary ?? record.baseSalary.toNumber(),
    input.commissions ?? record.commissions.toNumber(),
    input.bonuses ?? record.bonuses.toNumber(),
    input.deductions ?? record.deductions.toNumber(),
    input.advances ?? record.advances.toNumber(),
  );
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [baseSalary, commissions, bonuses, deductions, advances] = amounts;

  await getPrisma().payrollRecord.update({
    where: { id: input.payrollRecordId },
    data: {
      position:
        input.position === undefined
          ? undefined
          : sanitizeAccountingText(input.position, 120),
      baseSalary: toDecimal(baseSalary),
      commissions: toDecimal(commissions),
      bonuses: toDecimal(bonuses),
      deductions: toDecimal(deductions),
      advances: toDecimal(advances),
      netPay: toDecimal(
        calculatePayrollNetPay({
          advances,
          baseSalary,
          bonuses,
          commissions,
          deductions,
        }),
      ),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function preparePayrollRecordAction(input: {
  payrollRecordId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const record = await getPrisma().payrollRecord.findUnique({
    where: { id: input.payrollRecordId },
    select: { status: true },
  });
  if (!record) return { ok: false, error: "La planilla no existe." };
  if (record.status !== "BORRADOR") {
    return { ok: false, error: "Solo puedes preparar una planilla en borrador." };
  }

  await getPrisma().payrollRecord.update({
    where: { id: input.payrollRecordId },
    data: { status: "PREPARADA" },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function markPayrollRecordPaidAction(input: {
  payrollRecordId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const record = await getPrisma().payrollRecord.findUnique({
    where: { id: input.payrollRecordId },
    select: { status: true },
  });
  if (!record) return { ok: false, error: "La planilla no existe." };
  if (record.status !== "PREPARADA") {
    return { ok: false, error: "Solo puedes pagar una planilla preparada." };
  }

  await getPrisma().payrollRecord.update({
    where: { id: input.payrollRecordId },
    data: { status: "PAGADA" },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Accounting inventory costs (Admin/Contador only) --------------------

export async function createAccountingInventoryCostAction(input: {
  branchCode: string;
  modelSlug: string;
  modelName: string;
  catalogModelId?: string | null;
  unitCost: number;
  minimumStock?: number | null;
  currency?: string | null;
}): Promise<{ ok: true; costId: string } | { ok: false; error: string }> {
  // "costs" demands cost visibility AND write access: Admin or Contador.
  const auth = await authorizeContabilidad("costs");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };

  const modelSlug = requiredText(input.modelSlug, 120);
  const modelName = requiredText(input.modelName, 200);
  if (!modelSlug || !modelName) {
    return { ok: false, error: "El modelo es obligatorio." };
  }

  const unitCost = sanitizeAccountingMoney(input.unitCost);
  if (unitCost === null) return { ok: false, error: INVALID_MONEY };
  const minimumStock = sanitizeMinimumStock(input.minimumStock ?? 0);
  if (minimumStock === null) {
    return { ok: false, error: "El saldo mínimo no es válido." };
  }
  const currency = sanitizeAccountingCurrency(input.currency);
  if (input.currency && !currency) {
    return { ok: false, error: "La moneda no es válida." };
  }

  try {
    const created = await getPrisma().accountingInventoryCost.create({
      data: {
        branchId,
        catalogModelId: input.catalogModelId ?? null,
        modelSlug,
        modelName,
        unitCost: toDecimal(unitCost),
        minimumStock,
        currency,
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true, costId: created.id };
  } catch {
    return {
      ok: false,
      error: "Ya existe un costo para ese modelo en esa sucursal.",
    };
  }
}

export async function updateAccountingInventoryCostAction(input: {
  costId: string;
  unitCost?: number;
  minimumStock?: number;
  currency?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("costs");
  if (!auth.ok) return auth;

  const row = await getPrisma().accountingInventoryCost.findUnique({
    where: { id: input.costId },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "El costo no existe." };

  let unitCost: number | undefined;
  if (input.unitCost !== undefined) {
    const parsed = sanitizeAccountingMoney(input.unitCost);
    if (parsed === null) return { ok: false, error: INVALID_MONEY };
    unitCost = parsed;
  }
  let minimumStock: number | undefined;
  if (input.minimumStock !== undefined) {
    const parsed = sanitizeMinimumStock(input.minimumStock);
    if (parsed === null) return { ok: false, error: "El saldo mínimo no es válido." };
    minimumStock = parsed;
  }

  await getPrisma().accountingInventoryCost.update({
    where: { id: input.costId },
    data: {
      unitCost: unitCost === undefined ? undefined : toDecimal(unitCost),
      minimumStock,
      currency:
        input.currency === undefined
          ? undefined
          : sanitizeAccountingCurrency(input.currency),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Bank accounts -------------------------------------------------------

export async function createBankAccountAction(input: {
  branchCode: string;
  bankName: string;
  accountNumber: string;
  currency?: string | null;
  balance?: number | null;
  notes?: string | null;
}): Promise<{ ok: true; bankAccountId: string } | { ok: false; error: string }> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };

  const bankName = requiredText(input.bankName, 120);
  const accountNumber = requiredText(input.accountNumber, 60);
  if (!bankName) return { ok: false, error: "El banco es obligatorio." };
  if (!accountNumber) {
    return { ok: false, error: "El número de cuenta es obligatorio." };
  }

  // Balances are maintained manually; there is no banking integration.
  const balance = sanitizeAccountingMoney(input.balance ?? 0);
  if (balance === null) return { ok: false, error: INVALID_MONEY };
  const currency = sanitizeAccountingCurrency(input.currency) ?? "NIO";

  try {
    const created = await getPrisma().bankAccount.create({
      data: {
        branchId,
        bankName,
        accountNumber,
        currency,
        balance: toDecimal(balance),
        notes: sanitizeAccountingText(input.notes),
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true, bankAccountId: created.id };
  } catch {
    return { ok: false, error: "Ya existe esa cuenta bancaria." };
  }
}

export async function updateBankAccountAction(input: {
  bankAccountId: string;
  bankName?: string;
  balance?: number;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const row = await getPrisma().bankAccount.findUnique({
    where: { id: input.bankAccountId },
    select: { id: true },
  });
  if (!row) return { ok: false, error: "La cuenta bancaria no existe." };

  const bankName =
    input.bankName === undefined ? undefined : requiredText(input.bankName, 120);
  if (input.bankName !== undefined && !bankName) {
    return { ok: false, error: "El banco es obligatorio." };
  }
  let balance: number | undefined;
  if (input.balance !== undefined) {
    const parsed = sanitizeAccountingMoney(input.balance);
    if (parsed === null) return { ok: false, error: INVALID_MONEY };
    balance = parsed;
  }

  await getPrisma().bankAccount.update({
    where: { id: input.bankAccountId },
    data: {
      bankName: bankName ?? undefined,
      balance: balance === undefined ? undefined : toDecimal(balance),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function deactivateBankAccountAction(input: {
  bankAccountId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const row = await getPrisma().bankAccount.findUnique({
    where: { id: input.bankAccountId },
    select: { isActive: true },
  });
  if (!row) return { ok: false, error: "La cuenta bancaria no existe." };
  if (!row.isActive) return { ok: false, error: "La cuenta ya está inactiva." };

  await getPrisma().bankAccount.update({
    where: { id: input.bankAccountId },
    data: { isActive: false },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Bank reconciliation -------------------------------------------------

export async function createBankReconciliationAction(input: {
  branchCode: string;
  bankAccountId: string;
  movementDate?: string | null;
  amount: number;
  accountingDocumentId?: string | null;
  relatedDocument?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  currency?: string | null;
  notes?: string | null;
}): Promise<
  { ok: true; reconciliationId: string } | { ok: false; error: string }
> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };

  const bankAccount = await getPrisma().bankAccount.findUnique({
    where: { id: input.bankAccountId },
    select: { branchId: true, isActive: true },
  });
  if (!bankAccount) return { ok: false, error: "La cuenta bancaria no existe." };
  if (!bankAccount.isActive) {
    return { ok: false, error: "La cuenta bancaria está inactiva." };
  }
  if (bankAccount.branchId !== branchId) {
    return {
      ok: false,
      error: "La cuenta bancaria no pertenece a esa sucursal.",
    };
  }

  const amount = sanitizeAccountingMoney(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: INVALID_MONEY };

  const movementDate = input.movementDate
    ? parseAccountingDate(input.movementDate)
    : new Date();
  if (!movementDate) return { ok: false, error: INVALID_DATE };

  if (input.accountingDocumentId) {
    const document = await getPrisma().accountingDocument.findUnique({
      where: { id: input.accountingDocumentId },
      select: { branchId: true },
    });
    if (!document || document.branchId !== branchId) {
      return {
        ok: false,
        error: "El documento contable no pertenece a esa sucursal.",
      };
    }
  }

  const created = await getPrisma().bankReconciliation.create({
    data: {
      branchId,
      bankAccountId: input.bankAccountId,
      accountingDocumentId: input.accountingDocumentId ?? null,
      status: "PENDIENTE",
      movementDate,
      amount: toDecimal(amount),
      relatedDocument: sanitizeAccountingText(input.relatedDocument, 120),
      paymentMethod: sanitizeAccountingText(input.paymentMethod, 60),
      reference: sanitizeAccountingText(input.reference, 120),
      currency: sanitizeAccountingCurrency(input.currency),
      notes: sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true, reconciliationId: created.id };
}

export async function updateBankReconciliationAction(input: {
  reconciliationId: string;
  amount?: number;
  relatedDocument?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const row = await getPrisma().bankReconciliation.findUnique({
    where: { id: input.reconciliationId },
    select: { status: true },
  });
  if (!row) return { ok: false, error: "El movimiento no existe." };
  if (row.status !== "PENDIENTE") {
    return { ok: false, error: "Solo puedes editar un movimiento pendiente." };
  }

  let amount: number | undefined;
  if (input.amount !== undefined) {
    const parsed = sanitizeAccountingMoney(input.amount);
    if (parsed === null || parsed <= 0) return { ok: false, error: INVALID_MONEY };
    amount = parsed;
  }

  await getPrisma().bankReconciliation.update({
    where: { id: input.reconciliationId },
    data: {
      amount: amount === undefined ? undefined : toDecimal(amount),
      relatedDocument:
        input.relatedDocument === undefined
          ? undefined
          : sanitizeAccountingText(input.relatedDocument, 120),
      paymentMethod:
        input.paymentMethod === undefined
          ? undefined
          : sanitizeAccountingText(input.paymentMethod, 60),
      reference:
        input.reference === undefined
          ? undefined
          : sanitizeAccountingText(input.reference, 120),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

/**
 * The resulting status is derived, never client-supplied: a movement matching
 * its linked document total is CONCILIADO, otherwise DIFERENCIA. An unlinked
 * movement has no derivable difference and is simply marked CONCILIADO.
 */
export async function reviewBankReconciliationAction(input: {
  reconciliationId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const row = await getPrisma().bankReconciliation.findUnique({
    where: { id: input.reconciliationId },
    select: {
      status: true,
      amount: true,
      accountingDocument: { select: { total: true } },
    },
  });
  if (!row) return { ok: false, error: "El movimiento no existe." };
  if (row.status !== "PENDIENTE") {
    return { ok: false, error: "Solo puedes conciliar un movimiento pendiente." };
  }

  const difference = calculateReconciliationDifference(
    row.amount.toNumber(),
    row.accountingDocument ? row.accountingDocument.total.toNumber() : null,
  );

  await getPrisma().bankReconciliation.update({
    where: { id: input.reconciliationId },
    data: {
      status: reconciliationStatusForDifference(difference),
      reconciledByUserId: auth.actor.userId,
      reconciledAt: new Date(),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function cancelBankReconciliationAction(input: {
  reconciliationId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const row = await getPrisma().bankReconciliation.findUnique({
    where: { id: input.reconciliationId },
    select: { status: true },
  });
  if (!row) return { ok: false, error: "El movimiento no existe." };
  if (row.status === "ANULADO") {
    return { ok: false, error: "El movimiento ya está anulado." };
  }
  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  await getPrisma().bankReconciliation.update({
    where: { id: input.reconciliationId },
    data: { status: "ANULADO", notes: reason },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

// --- Accounting closings -------------------------------------------------

/**
 * Totals are captured, not auto-computed from the ledger: the current panel
 * stores them on the closing record. The difference is derived (cash minus
 * income) so it can never disagree with its own inputs. Nothing closes a period
 * automatically.
 */
export async function createAccountingClosingAction(input: {
  branchCode: string;
  period: string;
  incomeTotal?: number | null;
  expenseTotal?: number | null;
  retentionTotal?: number | null;
  appliedTotal?: number | null;
  cashTotal?: number | null;
  currency?: string | null;
  notes?: string | null;
}): Promise<{ ok: true; closingId: string } | { ok: false; error: string }> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const branchId = await resolveAccountingBranchId(input.branchCode);
  if (!branchId) return { ok: false, error: NO_BRANCH };
  const period = sanitizeAccountingPeriod(input.period);
  if (!period) return { ok: false, error: INVALID_PERIOD };

  const amounts = money(
    input.incomeTotal,
    input.expenseTotal,
    input.retentionTotal,
    input.appliedTotal,
    input.cashTotal,
  );
  if (!amounts) return { ok: false, error: INVALID_MONEY };
  const [incomeTotal, expenseTotal, retentionTotal, appliedTotal, cashTotal] =
    amounts;

  const difference = sanitizeSignedAccountingMoney(
    calculateAccountingClosingDifference({ cashTotal, incomeTotal }),
  );
  if (difference === null) return { ok: false, error: INVALID_MONEY };

  try {
    const created = await getPrisma().accountingClosing.create({
      data: {
        branchId,
        period,
        status: "ABIERTO",
        incomeTotal: toDecimal(incomeTotal),
        expenseTotal: toDecimal(expenseTotal),
        retentionTotal: toDecimal(retentionTotal),
        appliedTotal: toDecimal(appliedTotal),
        cashTotal: toDecimal(cashTotal),
        difference: toDecimal(difference),
        currency: sanitizeAccountingCurrency(input.currency),
        notes: sanitizeAccountingText(input.notes),
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true, closingId: created.id };
  } catch {
    return {
      ok: false,
      error: "Ya existe un cierre para esa sucursal y periodo.",
    };
  }
}

export async function reviewAccountingClosingAction(input: {
  closingId: string;
  notes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const closing = await getPrisma().accountingClosing.findUnique({
    where: { id: input.closingId },
    select: { status: true },
  });
  if (!closing) return { ok: false, error: "El cierre no existe." };
  if (closing.status !== "ABIERTO" && closing.status !== "REABIERTO") {
    return { ok: false, error: "Solo puedes revisar un cierre abierto." };
  }

  await getPrisma().accountingClosing.update({
    where: { id: input.closingId },
    data: {
      status: "EN_REVISION",
      reviewedByUserId: auth.actor.userId,
      reviewedAt: new Date(),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes, 1_000),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

/** A closed period is frozen until it is explicitly reopened. */
export async function closeAccountingClosingAction(input: {
  closingId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const closing = await getPrisma().accountingClosing.findUnique({
    where: { id: input.closingId },
    select: { status: true },
  });
  if (!closing) return { ok: false, error: "El cierre no existe." };
  if (closing.status !== "EN_REVISION") {
    return { ok: false, error: "Cerrar requiere que el cierre esté en revisión." };
  }

  await getPrisma().accountingClosing.update({
    where: { id: input.closingId },
    data: {
      status: "CERRADO",
      closedByUserId: auth.actor.userId,
      closedAt: new Date(),
    },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}

export async function reopenAccountingClosingAction(input: {
  closingId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const closing = await getPrisma().accountingClosing.findUnique({
    where: { id: input.closingId },
    select: { status: true },
  });
  if (!closing) return { ok: false, error: "El cierre no existe." };
  if (closing.status !== "CERRADO") {
    return { ok: false, error: "Solo puedes reabrir un cierre cerrado." };
  }
  const reason = requiredText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la reapertura." };

  await getPrisma().accountingClosing.update({
    where: { id: input.closingId },
    data: { status: "REABIERTO", reopenedAt: new Date(), notes: reason },
  });
  revalidateContabilidadRoutes();
  return { ok: true };
}
