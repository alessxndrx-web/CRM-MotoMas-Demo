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
import { recordFinancialAuditEvent } from "@/server/financial-audit/record";
import type {
  FinancialAuditAction,
  FinancialAuditEntityType,
  FinancialAuditField,
  FinancialAuditMetadataInput,
} from "@/server/financial-audit/shared";

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
const POSTED_IMMUTABLE =
  "El registro contabilizado no puede editarse ni anularse directamente. Debe generarse una reversión.";

export type ContabilidadActionResult =
  | { ok: true }
  | { ok: false; error: string };

type ContabilidadActor = {
  userId: string;
  role: UserRoleEnum;
  scope: ContabilidadScope;
};

type AuditSnapshot = Partial<Record<FinancialAuditField, unknown>>;

type AuditInput = {
  action: FinancialAuditAction;
  entityType: FinancialAuditEntityType;
  entityId: string;
  entityCode?: string | null;
  branchId?: string | null;
  reason?: string | null;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
  metadata?: FinancialAuditMetadataInput | null;
};

function auditValue(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(auditValue);
  return value;
}

function comparableAuditValue(value: unknown): string {
  return JSON.stringify(auditValue(value));
}

function changedDataFields<T extends object>(
  current: T,
  data: Partial<Record<keyof T, unknown>>,
): Array<keyof T> {
  return (Object.keys(data) as Array<keyof T>).filter((field) => {
    const next = data[field];
    return (
      next !== undefined &&
      comparableAuditValue(current[field]) !== comparableAuditValue(next)
    );
  });
}

async function recordContabilidadAudit(
  tx: Prisma.TransactionClient,
  actor: ContabilidadActor,
  input: AuditInput,
) {
  await recordFinancialAuditEvent(tx, {
    domain: "CONTABILIDAD",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    entityCode: input.entityCode ?? null,
    actor: { userId: actor.userId, role: actor.role },
    branchId: input.branchId ?? null,
    reason: input.reason ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? null,
  });
}

function documentAuditSnapshot(document: {
  type: string;
  status: string;
  origin: string;
  documentNumber: string;
  documentDate: Date;
  concept: string;
  subtotal: Prisma.Decimal;
  retention1: Prisma.Decimal;
  retention2: Prisma.Decimal;
  appliedPayment: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string | null;
  paymentMethod: string | null;
  notes: string | null;
  accountingNotes: string | null;
  reviewedAt: Date | null;
  postedAt: Date | null;
  reconciledAt: Date | null;
  cancelledAt: Date | null;
}): AuditSnapshot {
  return {
    type: document.type,
    status: document.status,
    origin: document.origin,
    documentNumber: document.documentNumber,
    documentDate: document.documentDate,
    concept: document.concept,
    subtotal: document.subtotal,
    retention1: document.retention1,
    retention2: document.retention2,
    appliedPayment: document.appliedPayment,
    total: document.total,
    currency: document.currency,
    paymentMethod: document.paymentMethod,
    notes: document.notes,
    accountingNotes: document.accountingNotes,
    reviewedAt: document.reviewedAt,
    postedAt: document.postedAt,
    reconciledAt: document.reconciledAt,
    cancelledAt: document.cancelledAt,
  };
}

function journalAuditSnapshot(entry: {
  entryNumber: string;
  entryDate: Date;
  status: string;
  source: string;
  taxBase: Prisma.Decimal;
  notes: string | null;
  postedAt: Date | null;
}): AuditSnapshot {
  return {
    entryNumber: entry.entryNumber,
    entryDate: entry.entryDate,
    status: entry.status,
    source: entry.source,
    taxBase: entry.taxBase,
    notes: entry.notes,
    postedAt: entry.postedAt,
  };
}

function lineAuditSnapshot(line: {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  concept: string | null;
  position: number;
}): AuditSnapshot {
  return {
    debit: line.debit,
    credit: line.credit,
    concept: line.concept,
    position: line.position,
  };
}

function voucherAuditSnapshot(row: {
  type: string;
  status: string;
  voucherNumber: string;
  voucherDate: Date;
  concept: string;
  amount: Prisma.Decimal;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string | null;
  notes: string | null;
}): AuditSnapshot {
  return {
    type: row.type,
    status: row.status,
    voucherNumber: row.voucherNumber,
    voucherDate: row.voucherDate,
    concept: row.concept,
    amount: row.amount,
    debit: row.debit,
    credit: row.credit,
    total: row.total,
    currency: row.currency,
    notes: row.notes,
  };
}

function expenseAuditSnapshot(row: {
  category: string;
  status: string;
  expenseDate: Date;
  concept: string;
  amount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  tax: Prisma.Decimal;
  retention1: Prisma.Decimal;
  retention2: Prisma.Decimal;
  total: Prisma.Decimal;
  currency: string | null;
  notes: string | null;
  reviewedAt: Date | null;
}): AuditSnapshot {
  return {
    category: row.category,
    status: row.status,
    expenseDate: row.expenseDate,
    concept: row.concept,
    amount: row.amount,
    subtotal: row.subtotal,
    tax: row.tax,
    retention1: row.retention1,
    retention2: row.retention2,
    total: row.total,
    currency: row.currency,
    notes: row.notes,
    reviewedAt: row.reviewedAt,
  };
}

function payrollAuditSnapshot(row: {
  period: string;
  status: string;
  baseSalary: Prisma.Decimal;
  commissions: Prisma.Decimal;
  bonuses: Prisma.Decimal;
  deductions: Prisma.Decimal;
  advances: Prisma.Decimal;
  netPay: Prisma.Decimal;
  currency: string | null;
  notes: string | null;
}): AuditSnapshot {
  return {
    period: row.period,
    status: row.status,
    baseSalary: row.baseSalary,
    commissions: row.commissions,
    bonuses: row.bonuses,
    deductions: row.deductions,
    advances: row.advances,
    netPay: row.netPay,
    currency: row.currency,
    notes: row.notes,
  };
}

function inventoryCostAuditSnapshot(row: {
  modelSlug: string;
  modelName: string;
  unitCost: Prisma.Decimal;
  minimumStock: number;
  currency: string | null;
}): AuditSnapshot {
  return {
    modelSlug: row.modelSlug,
    modelName: row.modelName,
    unitCost: row.unitCost,
    minimumStock: row.minimumStock,
    currency: row.currency,
  };
}

function bankAccountAuditSnapshot(row: {
  bankName: string;
  balance: Prisma.Decimal;
  currency: string;
  notes: string | null;
  isActive: boolean;
}): AuditSnapshot {
  return {
    bankName: row.bankName,
    balance: row.balance,
    currency: row.currency,
    notes: row.notes,
    isActive: row.isActive,
  };
}

function reconciliationAuditSnapshot(row: {
  status: string;
  movementDate: Date;
  amount: Prisma.Decimal;
  paymentMethod: string | null;
  currency: string | null;
  notes: string | null;
  reconciledAt: Date | null;
}): AuditSnapshot {
  return {
    status: row.status,
    movementDate: row.movementDate,
    amount: row.amount,
    paymentMethod: row.paymentMethod,
    currency: row.currency,
    notes: row.notes,
    reconciledAt: row.reconciledAt,
  };
}

function closingAuditSnapshot(row: {
  period: string;
  status: string;
  incomeTotal: Prisma.Decimal;
  expenseTotal: Prisma.Decimal;
  retentionTotal: Prisma.Decimal;
  appliedTotal: Prisma.Decimal;
  cashTotal: Prisma.Decimal;
  difference: Prisma.Decimal;
  currency: string | null;
  notes: string | null;
  closedAt: Date | null;
  reviewedAt: Date | null;
  reopenedAt: Date | null;
}): AuditSnapshot {
  return {
    period: row.period,
    status: row.status,
    incomeTotal: row.incomeTotal,
    expenseTotal: row.expenseTotal,
    retentionTotal: row.retentionTotal,
    appliedTotal: row.appliedTotal,
    cashTotal: row.cashTotal,
    difference: row.difference,
    currency: row.currency,
    notes: row.notes,
    closedAt: row.closedAt,
    reviewedAt: row.reviewedAt,
    reopenedAt: row.reopenedAt,
  };
}

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

async function accountExists(
  accountId: string | null | undefined,
  db: Pick<Prisma.TransactionClient, "chartAccount"> = getPrisma(),
) {
  if (!accountId) return true;
  const row = await db.chartAccount.findUnique({
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
  const accountType = input.type;
  const accountNature = input.nature;
  if (!(await accountExists(input.parentId))) {
    return { ok: false, error: "La cuenta padre no existe." };
  }

  try {
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.chartAccount.create({
        data: {
          code,
          name,
          type: accountType,
          nature: accountNature,
          parentId: input.parentId ?? null,
          description: sanitizeAccountingText(input.description),
        },
      });
      await recordContabilidadAudit(tx, auth.actor, {
        action: "CHART_ACCOUNT_CREATED",
        entityType: "CHART_ACCOUNT",
        entityId: row.id,
        entityCode: row.code,
        after: {
          code: row.code,
          type: row.type,
          nature: row.nature,
          description: row.description,
          isActive: row.isActive,
          displayNameChanged: true,
          detailsChanged: Boolean(row.parentId),
        },
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      return row;
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

  if (input.type !== undefined && !isAccountTypeValue(input.type)) {
    return { ok: false, error: "El tipo de cuenta no es válido." };
  }
  if (input.nature !== undefined && !isAccountNatureValue(input.nature)) {
    return { ok: false, error: "La naturaleza de la cuenta no es válida." };
  }
  const accountType = input.type;
  const accountNature = input.nature;
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

  return getPrisma().$transaction(async (tx) => {
    const account = await tx.chartAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account) return { ok: false, error: NO_ACCOUNT };
    const data = {
      name: name ?? undefined,
      type: accountType,
      nature: accountNature,
      parentId: input.parentId,
      description:
        input.description === undefined
          ? undefined
          : sanitizeAccountingText(input.description),
    } satisfies Prisma.ChartAccountUncheckedUpdateInput;
    const changed = changedDataFields(account, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.chartAccount.update({
      where: { id: input.accountId },
      data,
    });
    const changedFields: FinancialAuditField[] = [];
    if (changed.includes("type")) changedFields.push("type");
    if (changed.includes("nature")) changedFields.push("nature");
    if (changed.includes("description")) changedFields.push("description");
    if (changed.includes("name")) changedFields.push("displayNameChanged");
    if (changed.includes("parentId")) changedFields.push("detailsChanged");
    await recordContabilidadAudit(tx, auth.actor, {
      action: "CHART_ACCOUNT_UPDATED",
      entityType: "CHART_ACCOUNT",
      entityId: updated.id,
      entityCode: updated.code,
      before: {
        code: account.code,
        type: account.type,
        nature: account.nature,
        description: account.description,
        displayNameChanged: false,
        detailsChanged: false,
      },
      after: {
        code: updated.code,
        type: updated.type,
        nature: updated.nature,
        description: updated.description,
        displayNameChanged: changed.includes("name"),
        detailsChanged: changed.includes("parentId"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function deactivateChartAccountAction(input: {
  accountId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const account = await tx.chartAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account) return { ok: false, error: NO_ACCOUNT };
    if (!account.isActive) {
      return { ok: false, error: "La cuenta ya está inactiva." };
    }
    const updated = await tx.chartAccount.update({
      where: { id: input.accountId },
      data: { isActive: false },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "CHART_ACCOUNT_STATUS_CHANGED",
      entityType: "CHART_ACCOUNT",
      entityId: updated.id,
      entityCode: updated.code,
      before: { isActive: account.isActive },
      after: { isActive: updated.isActive },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["isActive"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
  const thirdPartyType = input.type;
  const name = requiredText(input.name, 200);
  if (!name) return { ok: false, error: "El nombre del tercero es obligatorio." };

  const created = await getPrisma().$transaction(async (tx) => {
    const row = await tx.thirdParty.create({
      data: {
        branchId,
        type: thirdPartyType,
        name,
        taxId: sanitizeAccountingText(input.taxId, 40),
        phone: sanitizeAccountingText(input.phone, 40),
        email: sanitizeAccountingText(input.email, 120),
        customerId: input.customerId ?? null,
        notes: sanitizeAccountingText(input.notes),
      },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "THIRD_PARTY_CREATED",
      entityType: "THIRD_PARTY",
      entityId: row.id,
      entityCode: null,
      branchId: row.branchId,
      after: {
        type: row.type,
        isActive: row.isActive,
        displayNameChanged: true,
        detailsChanged: Boolean(row.taxId || row.phone || row.email || row.customerId),
        notesChanged: Boolean(row.notes),
      },
      metadata: { component: "HEADER", operation: "CREATE" },
    });
    return row;
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

  if (input.type !== undefined && !isThirdPartyTypeValue(input.type)) {
    return { ok: false, error: "El tipo de tercero no es válido." };
  }
  const thirdPartyType = input.type;
  const name = input.name === undefined ? undefined : requiredText(input.name, 200);
  if (input.name !== undefined && !name) {
    return { ok: false, error: "El nombre del tercero es obligatorio." };
  }

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.thirdParty.findUnique({
      where: { id: input.thirdPartyId },
    });
    if (!row) return { ok: false, error: "El tercero no existe." };
    const data = {
      type: thirdPartyType,
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
    } satisfies Prisma.ThirdPartyUncheckedUpdateInput;
    const changed = changedDataFields(row, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.thirdParty.update({
      where: { id: input.thirdPartyId },
      data,
    });
    const detailsChanged = changed.some((field) =>
      ["taxId", "phone", "email"].includes(String(field)),
    );
    const changedFields: FinancialAuditField[] = [];
    if (changed.includes("type")) changedFields.push("type");
    if (changed.includes("name")) changedFields.push("displayNameChanged");
    if (detailsChanged) changedFields.push("detailsChanged");
    if (changed.includes("notes")) changedFields.push("notesChanged");
    await recordContabilidadAudit(tx, auth.actor, {
      action: "THIRD_PARTY_UPDATED",
      entityType: "THIRD_PARTY",
      entityId: updated.id,
      entityCode: null,
      branchId: updated.branchId,
      before: {
        type: row.type,
        displayNameChanged: false,
        detailsChanged: false,
        notesChanged: false,
      },
      after: {
        type: updated.type,
        displayNameChanged: changed.includes("name"),
        detailsChanged,
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function deactivateThirdPartyAction(input: {
  thirdPartyId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.thirdParty.findUnique({
      where: { id: input.thirdPartyId },
    });
    if (!row) return { ok: false, error: "El tercero no existe." };
    if (!row.isActive) {
      return { ok: false, error: "El tercero ya está inactivo." };
    }
    const updated = await tx.thirdParty.update({
      where: { id: input.thirdPartyId },
      data: { isActive: false },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "THIRD_PARTY_STATUS_CHANGED",
      entityType: "THIRD_PARTY",
      entityId: updated.id,
      entityCode: null,
      branchId: updated.branchId,
      before: { isActive: row.isActive },
      after: { isActive: updated.isActive },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["isActive"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
  const documentType = input.type;

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
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.accountingDocument.create({
        data: {
        branchId,
        createdByUserId: auth.actor.userId,
        type: documentType,
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
      await recordContabilidadAudit(tx, auth.actor, {
        action: "ACCOUNTING_DOCUMENT_CREATED",
        entityType: "ACCOUNTING_DOCUMENT",
        entityId: row.id,
        entityCode: row.documentNumber,
        branchId: row.branchId,
        after: documentAuditSnapshot(row),
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      return row;
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

  return getPrisma().$transaction(async (tx) => {
    const document = await tx.accountingDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) return { ok: false, error: "El documento no existe." };
    if (document.status !== "BORRADOR") {
      return { ok: false, error: POSTED_IMMUTABLE };
    }
    const amounts = money(
      input.subtotal ?? document.subtotal.toNumber(),
      input.retention1 ?? document.retention1.toNumber(),
      input.retention2 ?? document.retention2.toNumber(),
      input.appliedPayment ?? document.appliedPayment.toNumber(),
    );
    if (!amounts) return { ok: false, error: INVALID_MONEY };
    const [subtotal, retention1, retention2, appliedPayment] = amounts;
    const data = {
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
    };
    const changed = changedDataFields(document, data);
    if (!changed.length) return { ok: true };
    const guarded = await tx.accountingDocument.updateMany({
      where: { id: input.documentId, status: "BORRADOR" },
      data,
    });
    if (guarded.count !== 1) return { ok: false, error: POSTED_IMMUTABLE };
    const updated = await tx.accountingDocument.findUniqueOrThrow({
      where: { id: input.documentId },
    });
    const changedFields = changed
      .map((field): FinancialAuditField | null => {
        if (field === "thirdPartyName") return "displayNameChanged";
        if (field === "taxId" || field === "bank" || field === "reference") {
          return "detailsChanged";
        }
        if (field === "notes") return "notesChanged";
        return field in documentAuditSnapshot(updated)
          ? (field as FinancialAuditField)
          : null;
      })
      .filter((field): field is FinancialAuditField => field !== null);
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_DOCUMENT_UPDATED",
      entityType: "ACCOUNTING_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      before: documentAuditSnapshot(document),
      after: {
        ...documentAuditSnapshot(updated),
        displayNameChanged: changed.includes("thirdPartyName"),
        detailsChanged: changed.some((field) =>
          ["taxId", "bank", "reference"].includes(String(field)),
        ),
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function issueAccountingDocumentAction(input: {
  documentId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const document = await tx.accountingDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) return { ok: false, error: "El documento no existe." };
    if (document.status !== "BORRADOR") {
      return { ok: false, error: "Solo puedes emitir un documento en borrador." };
    }
    const guarded = await tx.accountingDocument.updateMany({
      where: { id: input.documentId, status: "BORRADOR" },
      data: { status: "EMITIDO" },
    });
    if (guarded.count !== 1) {
      return { ok: false, error: "Solo puedes emitir un documento en borrador." };
    }
    const updated = await tx.accountingDocument.findUniqueOrThrow({
      where: { id: input.documentId },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_DOCUMENT_STATUS_CHANGED",
      entityType: "ACCOUNTING_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      before: { status: document.status },
      after: { status: updated.status },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

/** Review precedes posting: "Contabilizar requiere revisión previa". */
export async function reviewAccountingDocumentAction(input: {
  documentId: string;
  accountingNotes?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const reviewReason = sanitizeAccountingText(input.accountingNotes, 1_000);
  return getPrisma().$transaction(async (tx) => {
    const document = await tx.accountingDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) return { ok: false, error: "El documento no existe." };
    if (document.status !== "BORRADOR" && document.status !== "EMITIDO") {
      return {
        ok: false,
        error: "Solo puedes revisar un documento en borrador o emitido.",
      };
    }
    const guarded = await tx.accountingDocument.updateMany({
      where: { id: input.documentId, status: { in: ["BORRADOR", "EMITIDO"] } },
      data: {
        status: "REVISADO",
        reviewedByUserId: auth.actor.userId,
        reviewedAt: new Date(),
      },
    });
    if (guarded.count !== 1) {
      return {
        ok: false,
        error: "Solo puedes revisar un documento en borrador o emitido.",
      };
    }
    const updated = await tx.accountingDocument.findUniqueOrThrow({
      where: { id: input.documentId },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_DOCUMENT_STATUS_CHANGED",
      entityType: "ACCOUNTING_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      reason: reviewReason,
      before: { status: document.status, reviewedAt: document.reviewedAt },
      after: { status: updated.status, reviewedAt: updated.reviewedAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "reviewedAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function postAccountingDocumentAction(input: {
  documentId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const document = await tx.accountingDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) return { ok: false, error: "El documento no existe." };
    if (document.status !== "REVISADO") {
      return {
        ok: false,
        error: "Contabilizar requiere que el documento esté revisado.",
      };
    }
    const guarded = await tx.accountingDocument.updateMany({
      where: { id: input.documentId, status: "REVISADO" },
      data: {
        status: "CONTABILIZADO",
        postedByUserId: auth.actor.userId,
        postedAt: new Date(),
      },
    });
    if (guarded.count !== 1) {
      return {
        ok: false,
        error: "Contabilizar requiere que el documento esté revisado.",
      };
    }
    const updated = await tx.accountingDocument.findUniqueOrThrow({
      where: { id: input.documentId },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_DOCUMENT_STATUS_CHANGED",
      entityType: "ACCOUNTING_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      before: { status: document.status, postedAt: document.postedAt },
      after: { status: updated.status, postedAt: updated.postedAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "postedAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

/** "Conciliar requiere contabilización previa". */
export async function reconcileAccountingDocumentAction(input: {
  documentId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const document = await tx.accountingDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) return { ok: false, error: "El documento no existe." };
    if (document.status !== "CONTABILIZADO") {
      return {
        ok: false,
        error: "Conciliar requiere que el documento esté contabilizado.",
      };
    }
    const guarded = await tx.accountingDocument.updateMany({
      where: { id: input.documentId, status: "CONTABILIZADO" },
      data: {
        status: "CONCILIADO",
        reconciledByUserId: auth.actor.userId,
        reconciledAt: new Date(),
      },
    });
    if (guarded.count !== 1) {
      return {
        ok: false,
        error: "Conciliar requiere que el documento esté contabilizado.",
      };
    }
    const updated = await tx.accountingDocument.findUniqueOrThrow({
      where: { id: input.documentId },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_DOCUMENT_STATUS_CHANGED",
      entityType: "ACCOUNTING_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      before: { status: document.status, reconciledAt: document.reconciledAt },
      after: { status: updated.status, reconciledAt: updated.reconciledAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "reconciledAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

/** Internal cancellation requiring a reason. Never a fiscal annulment. */
export async function cancelAccountingDocumentAction(input: {
  documentId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  return getPrisma().$transaction(async (tx) => {
    const document = await tx.accountingDocument.findUnique({
      where: { id: input.documentId },
    });
    if (!document) return { ok: false, error: "El documento no existe." };
    if (document.status === "ANULADO") {
      return { ok: false, error: "El documento ya está anulado." };
    }
    if (document.status === "CONTABILIZADO" || document.status === "CONCILIADO") {
      return { ok: false, error: POSTED_IMMUTABLE };
    }
    const guarded = await tx.accountingDocument.updateMany({
      where: {
        id: input.documentId,
        status: { in: ["BORRADOR", "EMITIDO", "REVISADO"] },
      },
      data: {
        status: "ANULADO",
        cancelledByUserId: auth.actor.userId,
        cancelledAt: new Date(),
      },
    });
    if (guarded.count !== 1) return { ok: false, error: POSTED_IMMUTABLE };
    const updated = await tx.accountingDocument.findUniqueOrThrow({
      where: { id: input.documentId },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_DOCUMENT_CANCELLED",
      entityType: "ACCOUNTING_DOCUMENT",
      entityId: updated.id,
      entityCode: updated.documentNumber,
      branchId: updated.branchId,
      reason,
      before: { status: document.status, cancelledAt: document.cancelledAt },
      after: { status: updated.status, cancelledAt: updated.cancelledAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "cancelledAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

// --- Journal entries -----------------------------------------------------

type JournalLineInput = {
  accountId: string;
  concept?: string | null;
  debit?: number | null;
  credit?: number | null;
  position?: number;
};

async function normalizeJournalLine(
  line: JournalLineInput,
  fallbackPosition: number,
  db: Pick<Prisma.TransactionClient, "chartAccount"> = getPrisma(),
) {
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
  if (!(await accountExists(line.accountId, db)) || !line.accountId) {
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
  const normalized: Array<{
    accountId: string;
    concept: string | null;
    credit: Prisma.Decimal;
    debit: Prisma.Decimal;
    position: number;
  }> = [];
  for (const [index, line] of lineInputs.entries()) {
    const result = await normalizeJournalLine(line, index);
    if (!result.ok) return result;
    normalized.push(result.data);
  }

  try {
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.journalEntry.create({
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
      const debitTotal = normalized.reduce(
        (total, line) => total.plus(line.debit),
        new Prisma.Decimal(0),
      );
      const creditTotal = normalized.reduce(
        (total, line) => total.plus(line.credit),
        new Prisma.Decimal(0),
      );
      await recordContabilidadAudit(tx, auth.actor, {
        action: "JOURNAL_ENTRY_CREATED",
        entityType: "JOURNAL_ENTRY",
        entityId: row.id,
        entityCode: row.entryNumber,
        branchId: row.branchId,
        after: {
          ...journalAuditSnapshot(row),
          lineCount: normalized.length,
          debitTotal,
          creditTotal,
          isBalanced: debitTotal.equals(creditTotal),
        },
        metadata: {
          component: "HEADER",
          operation: "CREATE",
          lineCount: normalized.length,
          isBalanced: debitTotal.equals(creditTotal),
        },
      });
      return row;
    });
    revalidateContabilidadRoutes();
    return { ok: true, entryId: created.id };
  } catch {
    return { ok: false, error: "Ya existe un asiento con ese número." };
  }
}

/** All journal mutations lock the same parent row before checking its state. */
async function lockJournalEntry(
  tx: Prisma.TransactionClient,
  entryId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "journal_entries" WHERE "id" = ${entryId} FOR UPDATE`,
  );
  return tx.journalEntry.findUnique({ where: { id: entryId } });
}

/** Only a draft asiento is editable; posted/reconciled/cancelled are frozen. */
async function requireDraftEntry(
  tx: Prisma.TransactionClient,
  entryId: string,
) {
  const entry = await lockJournalEntry(tx, entryId);
  if (!entry) return { ok: false as const, error: "El asiento no existe." };
  if (entry.status !== "BORRADOR") {
    return { ok: false as const, error: POSTED_IMMUTABLE };
  }
  return { ok: true as const, entry };
}

async function journalTotals(tx: Prisma.TransactionClient, entryId: string) {
  const lines = await tx.journalEntryLine.findMany({
    where: { entryId },
    select: { debit: true, credit: true },
  });
  const debitTotal = lines.reduce(
    (total, line) => total.plus(line.debit),
    new Prisma.Decimal(0),
  );
  const creditTotal = lines.reduce(
    (total, line) => total.plus(line.credit),
    new Prisma.Decimal(0),
  );
  return {
    lineCount: lines.length,
    debitTotal,
    creditTotal,
    isBalanced: debitTotal.equals(creditTotal),
  };
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
  const entryDate = input.entryDate ? parseAccountingDate(input.entryDate) : undefined;
  if (input.entryDate && !entryDate) return { ok: false, error: INVALID_DATE };

  const taxBase =
    input.taxBase === undefined || input.taxBase === null
      ? undefined
      : sanitizeAccountingMoney(input.taxBase);
  if (input.taxBase !== undefined && input.taxBase !== null && taxBase === null) {
    return { ok: false, error: INVALID_MONEY };
  }

  return getPrisma().$transaction(async (tx) => {
    const draft = await requireDraftEntry(tx, input.entryId);
    if (!draft.ok) return draft;
    const data = {
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
    };
    const changed = changedDataFields(draft.entry, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.journalEntry.update({
      where: { id: input.entryId },
      data,
    });
    const detailsChanged = changed.some((field) =>
      [
        "invoiceNumber",
        "customerCode",
        "supplier",
        "taxId",
        "bank",
        "bankPaymentReference",
      ].includes(String(field)),
    );
    const changedFields: FinancialAuditField[] = [];
    if (changed.includes("entryDate")) changedFields.push("entryDate");
    if (changed.includes("taxBase")) changedFields.push("taxBase");
    if (changed.includes("notes")) changedFields.push("notesChanged");
    if (detailsChanged) changedFields.push("detailsChanged");
    await recordContabilidadAudit(tx, auth.actor, {
      action: "JOURNAL_ENTRY_UPDATED",
      entityType: "JOURNAL_ENTRY",
      entityId: updated.id,
      entityCode: updated.entryNumber,
      branchId: updated.branchId,
      before: {
        ...journalAuditSnapshot(draft.entry),
        detailsChanged: false,
        notesChanged: false,
      },
      after: {
        ...journalAuditSnapshot(updated),
        detailsChanged,
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function addJournalEntryLineAction(
  input: JournalLineInput & { entryId: string },
): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;
  return getPrisma().$transaction(async (tx) => {
    const draft = await requireDraftEntry(tx, input.entryId);
    if (!draft.ok) return draft;
    const beforeTotals = await journalTotals(tx, input.entryId);
    const normalized = await normalizeJournalLine(input, beforeTotals.lineCount, tx);
    if (!normalized.ok) return normalized;
    const created = await tx.journalEntryLine.create({
      data: { ...normalized.data, entryId: input.entryId },
    });
    const afterTotals = await journalTotals(tx, input.entryId);
    await recordContabilidadAudit(tx, auth.actor, {
      action: "JOURNAL_LINE_ADDED",
      entityType: "JOURNAL_ENTRY",
      entityId: draft.entry.id,
      entityCode: draft.entry.entryNumber,
      branchId: draft.entry.branchId,
      before: beforeTotals,
      after: { ...afterTotals, ...lineAuditSnapshot(created) },
      metadata: {
        component: "LINE",
        operation: "CREATE",
        lineCount: afterTotals.lineCount,
        isBalanced: afterTotals.isBalanced,
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function updateJournalEntryLineAction(
  input: JournalLineInput & { lineId: string },
): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const candidate = await tx.journalEntryLine.findUnique({
      where: { id: input.lineId },
      select: { entryId: true },
    });
    if (!candidate) return { ok: false, error: "La línea no existe." };
    const draft = await requireDraftEntry(tx, candidate.entryId);
    if (!draft.ok) return draft;
    const line = await tx.journalEntryLine.findUnique({
      where: { id: input.lineId },
    });
    if (!line || line.entryId !== draft.entry.id) {
      return { ok: false, error: "La línea no existe." };
    }
    const normalized = await normalizeJournalLine(
      { ...input, position: input.position ?? line.position },
      line.position,
      tx,
    );
    if (!normalized.ok) return normalized;
    const changed = changedDataFields(line, normalized.data);
    if (!changed.length) return { ok: true };
    const beforeTotals = await journalTotals(tx, line.entryId);
    const updated = await tx.journalEntryLine.update({
      where: { id: input.lineId },
      data: normalized.data,
    });
    const afterTotals = await journalTotals(tx, line.entryId);
    const changedFields = changed
      .map((field) => String(field))
      .filter((field): field is FinancialAuditField =>
        ["concept", "debit", "credit", "position"].includes(field),
      );
    await recordContabilidadAudit(tx, auth.actor, {
      action: "JOURNAL_LINE_UPDATED",
      entityType: "JOURNAL_ENTRY",
      entityId: draft.entry.id,
      entityCode: draft.entry.entryNumber,
      branchId: draft.entry.branchId,
      before: { ...beforeTotals, ...lineAuditSnapshot(line) },
      after: { ...afterTotals, ...lineAuditSnapshot(updated) },
      metadata: {
        component: "LINE",
        operation: "UPDATE",
        changedFields,
        lineCount: afterTotals.lineCount,
        isBalanced: afterTotals.isBalanced,
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function removeJournalEntryLineAction(input: {
  lineId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const candidate = await tx.journalEntryLine.findUnique({
      where: { id: input.lineId },
      select: { entryId: true },
    });
    if (!candidate) return { ok: false, error: "La línea no existe." };
    const draft = await requireDraftEntry(tx, candidate.entryId);
    if (!draft.ok) return draft;
    const line = await tx.journalEntryLine.findUnique({
      where: { id: input.lineId },
    });
    if (!line || line.entryId !== draft.entry.id) {
      return { ok: false, error: "La línea no existe." };
    }
    const beforeTotals = await journalTotals(tx, line.entryId);
    await tx.journalEntryLine.delete({ where: { id: input.lineId } });
    const afterTotals = await journalTotals(tx, line.entryId);
    await recordContabilidadAudit(tx, auth.actor, {
      action: "JOURNAL_LINE_REMOVED",
      entityType: "JOURNAL_ENTRY",
      entityId: draft.entry.id,
      entityCode: draft.entry.entryNumber,
      branchId: draft.entry.branchId,
      before: { ...beforeTotals, ...lineAuditSnapshot(line) },
      after: afterTotals,
      metadata: {
        component: "LINE",
        operation: "REMOVE",
        lineCount: afterTotals.lineCount,
        isBalanced: afterTotals.isBalanced,
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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

  return getPrisma().$transaction(async (tx) => {
    const draft = await requireDraftEntry(tx, input.entryId);
    if (!draft.ok) return draft;
    const totals = await journalTotals(tx, input.entryId);
    if (!totals.lineCount) {
      return { ok: false, error: "El asiento necesita al menos una línea." };
    }
    if (!totals.isBalanced) {
      return {
        ok: false,
        error: "El asiento no cuadra: el debe y el haber deben ser iguales.",
      };
    }
    const updated = await tx.journalEntry.update({
      where: { id: input.entryId },
      data: {
        status: "CONTABILIZADO",
        postedByUserId: auth.actor.userId,
        postedAt: new Date(),
      },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "JOURNAL_ENTRY_POSTED",
      entityType: "JOURNAL_ENTRY",
      entityId: updated.id,
      entityCode: updated.entryNumber,
      branchId: updated.branchId,
      before: {
        status: draft.entry.status,
        postedAt: draft.entry.postedAt,
        ...totals,
      },
      after: { status: updated.status, postedAt: updated.postedAt, ...totals },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "postedAt"],
        lineCount: totals.lineCount,
        isBalanced: totals.isBalanced,
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function reconcileJournalEntryAction(input: {
  entryId: string;
  reconciliation?: string | null;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const entry = await lockJournalEntry(tx, input.entryId);
    if (!entry) return { ok: false, error: "El asiento no existe." };
    if (entry.status !== "CONTABILIZADO") {
      return {
        ok: false,
        error: "Conciliar requiere que el asiento esté contabilizado.",
      };
    }
    const reconciliation =
      input.reconciliation === undefined
        ? undefined
        : sanitizeAccountingText(input.reconciliation, 120);
    const updated = await tx.journalEntry.update({
      where: { id: input.entryId },
      data: { status: "CONCILIADO", reconciliation },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "JOURNAL_ENTRY_STATUS_CHANGED",
      entityType: "JOURNAL_ENTRY",
      entityId: updated.id,
      entityCode: updated.entryNumber,
      branchId: updated.branchId,
      before: { status: entry.status, detailsChanged: false },
      after: {
        status: updated.status,
        detailsChanged:
          reconciliation !== undefined && reconciliation !== entry.reconciliation,
      },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields:
          reconciliation !== undefined && reconciliation !== entry.reconciliation
            ? ["status", "detailsChanged"]
            : ["status"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function cancelJournalEntryAction(input: {
  entryId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  return getPrisma().$transaction(async (tx) => {
    const entry = await lockJournalEntry(tx, input.entryId);
    if (!entry) return { ok: false, error: "El asiento no existe." };
    if (entry.status === "ANULADO") {
      return { ok: false, error: "El asiento ya está anulado." };
    }
    if (entry.status !== "BORRADOR") {
      return { ok: false, error: POSTED_IMMUTABLE };
    }
    const updated = await tx.journalEntry.update({
      where: { id: input.entryId },
      data: { status: "ANULADO" },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "JOURNAL_ENTRY_CANCELLED",
      entityType: "JOURNAL_ENTRY",
      entityId: updated.id,
      entityCode: updated.entryNumber,
      branchId: updated.branchId,
      reason,
      before: { status: entry.status },
      after: { status: updated.status },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
  const voucherType = input.type;
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
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.accountingVoucher.create({
        data: {
        branchId,
        accountId: input.accountId ?? null,
        createdByUserId: auth.actor.userId,
        type: voucherType,
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
      await recordContabilidadAudit(tx, auth.actor, {
        action: "VOUCHER_CREATED",
        entityType: "ACCOUNTING_VOUCHER",
        entityId: row.id,
        entityCode: row.voucherNumber,
        branchId: row.branchId,
        after: voucherAuditSnapshot(row),
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      return row;
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

  return getPrisma().$transaction(async (tx) => {
    const voucher = await tx.accountingVoucher.findUnique({
      where: { id: input.voucherId },
    });
    if (!voucher) return { ok: false, error: "El comprobante no existe." };
    if (voucher.status !== "REGISTRADO") {
      return {
        ok: false,
        error: "Solo puedes editar un comprobante registrado.",
      };
    }
    const data = {
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
    };
    const changed = changedDataFields(voucher, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.accountingVoucher.update({
      where: { id: input.voucherId },
      data,
    });
    const changedFields: FinancialAuditField[] = [];
    if (changed.includes("concept")) changedFields.push("concept");
    if (changed.includes("amount")) changedFields.push("amount", "total");
    if (changed.includes("notes")) changedFields.push("notesChanged");
    if (changed.some((field) => ["beneficiary", "bank", "reference"].includes(String(field)))) {
      changedFields.push("detailsChanged");
    }
    await recordContabilidadAudit(tx, auth.actor, {
      action: "VOUCHER_UPDATED",
      entityType: "ACCOUNTING_VOUCHER",
      entityId: updated.id,
      entityCode: updated.voucherNumber,
      branchId: updated.branchId,
      before: voucherAuditSnapshot(voucher),
      after: {
        ...voucherAuditSnapshot(updated),
        detailsChanged: changed.some((field) =>
          ["beneficiary", "bank", "reference"].includes(String(field)),
        ),
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function reconcileAccountingVoucherAction(input: {
  voucherId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const voucher = await tx.accountingVoucher.findUnique({
      where: { id: input.voucherId },
    });
    if (!voucher) return { ok: false, error: "El comprobante no existe." };
    if (voucher.status !== "REGISTRADO") {
      return { ok: false, error: "Solo puedes conciliar un comprobante registrado." };
    }
    const guarded = await tx.accountingVoucher.updateMany({
      where: { id: input.voucherId, status: "REGISTRADO" },
      data: { status: "CONCILIADO" },
    });
    if (guarded.count !== 1) {
      return { ok: false, error: "Solo puedes conciliar un comprobante registrado." };
    }
    const updated = await tx.accountingVoucher.findUniqueOrThrow({
      where: { id: input.voucherId },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "VOUCHER_STATUS_CHANGED",
      entityType: "ACCOUNTING_VOUCHER",
      entityId: updated.id,
      entityCode: updated.voucherNumber,
      branchId: updated.branchId,
      before: { status: voucher.status },
      after: { status: updated.status },
      metadata: { component: "STATUS", operation: "STATUS_CHANGE", changedFields: ["status"] },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function cancelAccountingVoucherAction(input: {
  voucherId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  return getPrisma().$transaction(async (tx) => {
    const voucher = await tx.accountingVoucher.findUnique({
      where: { id: input.voucherId },
    });
    if (!voucher) return { ok: false, error: "El comprobante no existe." };
    if (voucher.status === "ANULADO") {
      return { ok: false, error: "El comprobante ya está anulado." };
    }
    const updated = await tx.accountingVoucher.update({
      where: { id: input.voucherId },
      data: { status: "ANULADO" },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "VOUCHER_CANCELLED",
      entityType: "ACCOUNTING_VOUCHER",
      entityId: updated.id,
      entityCode: updated.voucherNumber,
      branchId: updated.branchId,
      reason,
      before: { status: voucher.status },
      after: { status: updated.status },
      metadata: { component: "STATUS", operation: "STATUS_CHANGE", changedFields: ["status"] },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
  const expenseCategory = input.category;
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

  const created = await getPrisma().$transaction(async (tx) => {
    const row = await tx.expense.create({
      data: {
      branchId,
      accountId: input.accountId ?? null,
      voucherId: input.voucherId ?? null,
      createdByUserId: auth.actor.userId,
      category: expenseCategory,
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
    await recordContabilidadAudit(tx, auth.actor, {
      action: "EXPENSE_CREATED",
      entityType: "EXPENSE",
      entityId: row.id,
      entityCode: row.invoiceNumber,
      branchId: row.branchId,
      after: expenseAuditSnapshot(row),
      metadata: { component: "HEADER", operation: "CREATE" },
    });
    return row;
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

  return getPrisma().$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id: input.expenseId } });
    if (!expense) return { ok: false, error: "El gasto no existe." };
    if (expense.status !== "REGISTRADO") {
      return { ok: false, error: "Solo puedes editar un gasto registrado." };
    }
    const amounts = money(
      input.subtotal ?? expense.subtotal.toNumber(),
      input.tax ?? expense.tax.toNumber(),
      input.retention1 ?? expense.retention1.toNumber(),
      input.retention2 ?? expense.retention2.toNumber(),
    );
    if (!amounts) return { ok: false, error: INVALID_MONEY };
    const [subtotal, tax, retention1, retention2] = amounts;
    const data = {
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
    };
    const changed = changedDataFields(expense, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.expense.update({ where: { id: input.expenseId }, data });
    const changedFields = changed
      .map((field): FinancialAuditField | null => {
        if (field === "supplier" || field === "bank" || field === "reference") {
          return "detailsChanged";
        }
        if (field === "notes") return "notesChanged";
        return field in expenseAuditSnapshot(updated)
          ? (field as FinancialAuditField)
          : null;
      })
      .filter((field): field is FinancialAuditField => field !== null);
    await recordContabilidadAudit(tx, auth.actor, {
      action: "EXPENSE_UPDATED",
      entityType: "EXPENSE",
      entityId: updated.id,
      entityCode: updated.invoiceNumber,
      branchId: updated.branchId,
      before: expenseAuditSnapshot(expense),
      after: {
        ...expenseAuditSnapshot(updated),
        detailsChanged: changed.some((field) =>
          ["supplier", "bank", "reference"].includes(String(field)),
        ),
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function reviewExpenseAction(input: {
  expenseId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const expense = await tx.expense.findUnique({ where: { id: input.expenseId } });
    if (!expense) return { ok: false, error: "El gasto no existe." };
    if (expense.status !== "REGISTRADO") {
      return { ok: false, error: "El gasto ya fue revisado." };
    }
    const guarded = await tx.expense.updateMany({
      where: { id: input.expenseId, status: "REGISTRADO" },
      data: {
        status: "REVISADO",
        reviewedByUserId: auth.actor.userId,
        reviewedAt: new Date(),
      },
    });
    if (guarded.count !== 1) return { ok: false, error: "El gasto ya fue revisado." };
    const updated = await tx.expense.findUniqueOrThrow({ where: { id: input.expenseId } });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "EXPENSE_STATUS_CHANGED",
      entityType: "EXPENSE",
      entityId: updated.id,
      entityCode: updated.invoiceNumber,
      branchId: updated.branchId,
      before: { status: expense.status, reviewedAt: expense.reviewedAt },
      after: { status: updated.status, reviewedAt: updated.reviewedAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "reviewedAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.payrollRecord.create({
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
      await recordContabilidadAudit(tx, auth.actor, {
        action: "PAYROLL_RECORD_CREATED",
        entityType: "PAYROLL_RECORD",
        entityId: row.id,
        entityCode: row.period,
        branchId: row.branchId,
        after: payrollAuditSnapshot(row),
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      return row;
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

  return getPrisma().$transaction(async (tx) => {
    const record = await tx.payrollRecord.findUnique({
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
    const data = {
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
    };
    const changed = changedDataFields(record, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.payrollRecord.update({
      where: { id: input.payrollRecordId },
      data,
    });
    const changedFields = changed
      .map((field): FinancialAuditField | null => {
        if (field === "position") return "detailsChanged";
        if (field === "notes") return "notesChanged";
        return field in payrollAuditSnapshot(updated)
          ? (field as FinancialAuditField)
          : null;
      })
      .filter((field): field is FinancialAuditField => field !== null);
    await recordContabilidadAudit(tx, auth.actor, {
      action: "PAYROLL_RECORD_UPDATED",
      entityType: "PAYROLL_RECORD",
      entityId: updated.id,
      entityCode: updated.period,
      branchId: updated.branchId,
      before: payrollAuditSnapshot(record),
      after: {
        ...payrollAuditSnapshot(updated),
        detailsChanged: changed.includes("position"),
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function preparePayrollRecordAction(input: {
  payrollRecordId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const record = await tx.payrollRecord.findUnique({ where: { id: input.payrollRecordId } });
    if (!record) return { ok: false, error: "La planilla no existe." };
    if (record.status !== "BORRADOR") {
      return { ok: false, error: "Solo puedes preparar una planilla en borrador." };
    }
    const guarded = await tx.payrollRecord.updateMany({
      where: { id: input.payrollRecordId, status: "BORRADOR" },
      data: { status: "PREPARADA" },
    });
    if (guarded.count !== 1) {
      return { ok: false, error: "Solo puedes preparar una planilla en borrador." };
    }
    const updated = await tx.payrollRecord.findUniqueOrThrow({ where: { id: input.payrollRecordId } });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "PAYROLL_RECORD_STATUS_CHANGED",
      entityType: "PAYROLL_RECORD",
      entityId: updated.id,
      entityCode: updated.period,
      branchId: updated.branchId,
      before: { status: record.status },
      after: { status: updated.status },
      metadata: { component: "STATUS", operation: "STATUS_CHANGE", changedFields: ["status"] },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function markPayrollRecordPaidAction(input: {
  payrollRecordId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const record = await tx.payrollRecord.findUnique({ where: { id: input.payrollRecordId } });
    if (!record) return { ok: false, error: "La planilla no existe." };
    if (record.status !== "PREPARADA") {
      return { ok: false, error: "Solo puedes pagar una planilla preparada." };
    }
    const guarded = await tx.payrollRecord.updateMany({
      where: { id: input.payrollRecordId, status: "PREPARADA" },
      data: { status: "PAGADA" },
    });
    if (guarded.count !== 1) {
      return { ok: false, error: "Solo puedes pagar una planilla preparada." };
    }
    const updated = await tx.payrollRecord.findUniqueOrThrow({ where: { id: input.payrollRecordId } });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "PAYROLL_RECORD_STATUS_CHANGED",
      entityType: "PAYROLL_RECORD",
      entityId: updated.id,
      entityCode: updated.period,
      branchId: updated.branchId,
      before: { status: record.status },
      after: { status: updated.status },
      metadata: { component: "STATUS", operation: "STATUS_CHANGE", changedFields: ["status"] },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.accountingInventoryCost.create({
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
      await recordContabilidadAudit(tx, auth.actor, {
        action: "ACCOUNTING_INVENTORY_COST_CREATED",
        entityType: "ACCOUNTING_INVENTORY_COST",
        entityId: row.id,
        entityCode: row.modelSlug,
        branchId: row.branchId,
        after: inventoryCostAuditSnapshot(row),
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      return row;
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

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.accountingInventoryCost.findUnique({ where: { id: input.costId } });
    if (!row) return { ok: false, error: "El costo no existe." };
    const data = {
      unitCost: unitCost === undefined ? undefined : toDecimal(unitCost),
      minimumStock,
      currency:
        input.currency === undefined
          ? undefined
          : sanitizeAccountingCurrency(input.currency),
    };
    const changed = changedDataFields(row, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.accountingInventoryCost.update({ where: { id: input.costId }, data });
    const changedFields = changed
      .map((field) => String(field))
      .filter((field): field is FinancialAuditField =>
        ["unitCost", "minimumStock", "currency"].includes(field),
      );
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_INVENTORY_COST_UPDATED",
      entityType: "ACCOUNTING_INVENTORY_COST",
      entityId: updated.id,
      entityCode: updated.modelSlug,
      branchId: updated.branchId,
      before: inventoryCostAuditSnapshot(row),
      after: inventoryCostAuditSnapshot(updated),
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.bankAccount.create({
        data: {
        branchId,
        bankName,
        accountNumber,
        currency,
        balance: toDecimal(balance),
          notes: sanitizeAccountingText(input.notes),
        },
      });
      await recordContabilidadAudit(tx, auth.actor, {
        action: "BANK_ACCOUNT_CREATED",
        entityType: "BANK_ACCOUNT",
        entityId: row.id,
        entityCode: null,
        branchId: row.branchId,
        after: bankAccountAuditSnapshot(row),
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      return row;
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

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } });
    if (!row) return { ok: false, error: "La cuenta bancaria no existe." };
    const data = {
      bankName: bankName ?? undefined,
      balance: balance === undefined ? undefined : toDecimal(balance),
      notes:
        input.notes === undefined
          ? undefined
          : sanitizeAccountingText(input.notes),
    };
    const changed = changedDataFields(row, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.bankAccount.update({ where: { id: input.bankAccountId }, data });
    const changedFields: FinancialAuditField[] = [];
    if (changed.includes("bankName")) changedFields.push("bankName");
    if (changed.includes("balance")) changedFields.push("balance");
    if (changed.includes("notes")) changedFields.push("notesChanged");
    await recordContabilidadAudit(tx, auth.actor, {
      action: "BANK_ACCOUNT_UPDATED",
      entityType: "BANK_ACCOUNT",
      entityId: updated.id,
      entityCode: null,
      branchId: updated.branchId,
      before: bankAccountAuditSnapshot(row),
      after: {
        ...bankAccountAuditSnapshot(updated),
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function deactivateBankAccountAction(input: {
  bankAccountId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } });
    if (!row) return { ok: false, error: "La cuenta bancaria no existe." };
    if (!row.isActive) return { ok: false, error: "La cuenta ya está inactiva." };
    const updated = await tx.bankAccount.update({
      where: { id: input.bankAccountId },
      data: { isActive: false },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "BANK_ACCOUNT_STATUS_CHANGED",
      entityType: "BANK_ACCOUNT",
      entityId: updated.id,
      entityCode: null,
      branchId: updated.branchId,
      before: { isActive: row.isActive },
      after: { isActive: updated.isActive },
      metadata: { component: "STATUS", operation: "STATUS_CHANGE", changedFields: ["isActive"] },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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

  const created = await getPrisma().$transaction(async (tx) => {
    const row = await tx.bankReconciliation.create({
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
    await recordContabilidadAudit(tx, auth.actor, {
      action: "BANK_RECONCILIATION_CREATED",
      entityType: "BANK_RECONCILIATION",
      entityId: row.id,
      entityCode: null,
      branchId: row.branchId,
      after: reconciliationAuditSnapshot(row),
      metadata: { component: "HEADER", operation: "CREATE" },
    });
    return row;
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

  let amount: number | undefined;
  if (input.amount !== undefined) {
    const parsed = sanitizeAccountingMoney(input.amount);
    if (parsed === null || parsed <= 0) return { ok: false, error: INVALID_MONEY };
    amount = parsed;
  }

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.bankReconciliation.findUnique({ where: { id: input.reconciliationId } });
    if (!row) return { ok: false, error: "El movimiento no existe." };
    if (row.status !== "PENDIENTE") {
      return { ok: false, error: "Solo puedes editar un movimiento pendiente." };
    }
    const data = {
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
    };
    const changed = changedDataFields(row, data);
    if (!changed.length) return { ok: true };
    const updated = await tx.bankReconciliation.update({ where: { id: input.reconciliationId }, data });
    const changedFields: FinancialAuditField[] = [];
    if (changed.includes("amount")) changedFields.push("amount");
    if (changed.includes("paymentMethod")) changedFields.push("paymentMethod");
    if (changed.includes("notes")) changedFields.push("notesChanged");
    if (changed.some((field) => ["relatedDocument", "reference"].includes(String(field)))) {
      changedFields.push("detailsChanged");
    }
    await recordContabilidadAudit(tx, auth.actor, {
      action: "BANK_RECONCILIATION_UPDATED",
      entityType: "BANK_RECONCILIATION",
      entityId: updated.id,
      entityCode: null,
      branchId: updated.branchId,
      before: reconciliationAuditSnapshot(row),
      after: {
        ...reconciliationAuditSnapshot(updated),
        detailsChanged: changed.some((field) =>
          ["relatedDocument", "reference"].includes(String(field)),
        ),
        notesChanged: changed.includes("notes"),
      },
      metadata: { component: "HEADER", operation: "UPDATE", changedFields },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.bankReconciliation.findUnique({
      where: { id: input.reconciliationId },
      include: { accountingDocument: { select: { total: true } } },
    });
    if (!row) return { ok: false, error: "El movimiento no existe." };
    if (row.status !== "PENDIENTE") {
      return { ok: false, error: "Solo puedes conciliar un movimiento pendiente." };
    }
    const difference = calculateReconciliationDifference(
      row.amount.toNumber(),
      row.accountingDocument ? row.accountingDocument.total.toNumber() : null,
    );
    const guarded = await tx.bankReconciliation.updateMany({
      where: { id: input.reconciliationId, status: "PENDIENTE" },
      data: {
        status: reconciliationStatusForDifference(difference),
        reconciledByUserId: auth.actor.userId,
        reconciledAt: new Date(),
      },
    });
    if (guarded.count !== 1) {
      return { ok: false, error: "Solo puedes conciliar un movimiento pendiente." };
    }
    const updated = await tx.bankReconciliation.findUniqueOrThrow({ where: { id: input.reconciliationId } });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "BANK_RECONCILIATION_STATUS_CHANGED",
      entityType: "BANK_RECONCILIATION",
      entityId: updated.id,
      entityCode: null,
      branchId: updated.branchId,
      before: { status: row.status, reconciledAt: row.reconciledAt },
      after: { status: updated.status, reconciledAt: updated.reconciledAt, difference },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "reconciledAt", "difference"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function cancelBankReconciliationAction(input: {
  reconciliationId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("operate");
  if (!auth.ok) return auth;

  const reason = requiredText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo de la anulación interna." };
  }

  return getPrisma().$transaction(async (tx) => {
    const row = await tx.bankReconciliation.findUnique({ where: { id: input.reconciliationId } });
    if (!row) return { ok: false, error: "El movimiento no existe." };
    if (row.status === "ANULADO") {
      return { ok: false, error: "El movimiento ya está anulado." };
    }
    const updated = await tx.bankReconciliation.update({
      where: { id: input.reconciliationId },
      data: { status: "ANULADO" },
    });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "BANK_RECONCILIATION_CANCELLED",
      entityType: "BANK_RECONCILIATION",
      entityId: updated.id,
      entityCode: null,
      branchId: updated.branchId,
      reason,
      before: { status: row.status },
      after: { status: updated.status },
      metadata: { component: "STATUS", operation: "STATUS_CHANGE", changedFields: ["status"] },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
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
    const created = await getPrisma().$transaction(async (tx) => {
      const row = await tx.accountingClosing.create({
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
      await recordContabilidadAudit(tx, auth.actor, {
        action: "ACCOUNTING_CLOSING_CREATED",
        entityType: "ACCOUNTING_CLOSING",
        entityId: row.id,
        entityCode: row.period,
        branchId: row.branchId,
        after: closingAuditSnapshot(row),
        metadata: { component: "HEADER", operation: "CREATE" },
      });
      return row;
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

  const reviewReason = sanitizeAccountingText(input.notes, 1_000);
  return getPrisma().$transaction(async (tx) => {
    const closing = await tx.accountingClosing.findUnique({ where: { id: input.closingId } });
    if (!closing) return { ok: false, error: "El cierre no existe." };
    if (closing.status !== "ABIERTO" && closing.status !== "REABIERTO") {
      return { ok: false, error: "Solo puedes revisar un cierre abierto." };
    }
    const guarded = await tx.accountingClosing.updateMany({
      where: { id: input.closingId, status: { in: ["ABIERTO", "REABIERTO"] } },
      data: {
        status: "EN_REVISION",
        reviewedByUserId: auth.actor.userId,
        reviewedAt: new Date(),
      },
    });
    if (guarded.count !== 1) return { ok: false, error: "Solo puedes revisar un cierre abierto." };
    const updated = await tx.accountingClosing.findUniqueOrThrow({ where: { id: input.closingId } });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_CLOSING_STATUS_CHANGED",
      entityType: "ACCOUNTING_CLOSING",
      entityId: updated.id,
      entityCode: updated.period,
      branchId: updated.branchId,
      reason: reviewReason,
      before: { status: closing.status, reviewedAt: closing.reviewedAt },
      after: { status: updated.status, reviewedAt: updated.reviewedAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "reviewedAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

/** A closed period is frozen until it is explicitly reopened. */
export async function closeAccountingClosingAction(input: {
  closingId: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  return getPrisma().$transaction(async (tx) => {
    const closing = await tx.accountingClosing.findUnique({ where: { id: input.closingId } });
    if (!closing) return { ok: false, error: "El cierre no existe." };
    if (closing.status !== "EN_REVISION") {
      return { ok: false, error: "Cerrar requiere que el cierre esté en revisión." };
    }
    const guarded = await tx.accountingClosing.updateMany({
      where: { id: input.closingId, status: "EN_REVISION" },
      data: {
        status: "CERRADO",
        closedByUserId: auth.actor.userId,
        closedAt: new Date(),
      },
    });
    if (guarded.count !== 1) {
      return { ok: false, error: "Cerrar requiere que el cierre esté en revisión." };
    }
    const updated = await tx.accountingClosing.findUniqueOrThrow({ where: { id: input.closingId } });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_CLOSING_STATUS_CHANGED",
      entityType: "ACCOUNTING_CLOSING",
      entityId: updated.id,
      entityCode: updated.period,
      branchId: updated.branchId,
      before: { status: closing.status, closedAt: closing.closedAt },
      after: { status: updated.status, closedAt: updated.closedAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "closedAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}

export async function reopenAccountingClosingAction(input: {
  closingId: string;
  reason: string;
}): Promise<ContabilidadActionResult> {
  const auth = await authorizeContabilidad("review");
  if (!auth.ok) return auth;

  const reason = requiredText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la reapertura." };

  return getPrisma().$transaction(async (tx) => {
    const closing = await tx.accountingClosing.findUnique({ where: { id: input.closingId } });
    if (!closing) return { ok: false, error: "El cierre no existe." };
    if (closing.status !== "CERRADO") {
      return { ok: false, error: "Solo puedes reabrir un cierre cerrado." };
    }
    const guarded = await tx.accountingClosing.updateMany({
      where: { id: input.closingId, status: "CERRADO" },
      data: { status: "REABIERTO", reopenedAt: new Date() },
    });
    if (guarded.count !== 1) {
      return { ok: false, error: "Solo puedes reabrir un cierre cerrado." };
    }
    const updated = await tx.accountingClosing.findUniqueOrThrow({ where: { id: input.closingId } });
    await recordContabilidadAudit(tx, auth.actor, {
      action: "ACCOUNTING_CLOSING_STATUS_CHANGED",
      entityType: "ACCOUNTING_CLOSING",
      entityId: updated.id,
      entityCode: updated.period,
      branchId: updated.branchId,
      reason,
      before: { status: closing.status, reopenedAt: closing.reopenedAt },
      after: { status: updated.status, reopenedAt: updated.reopenedAt },
      metadata: {
        component: "STATUS",
        operation: "STATUS_CHANGE",
        changedFields: ["status", "reopenedAt"],
      },
    });
    revalidateContabilidadRoutes();
    return { ok: true };
  });
}
