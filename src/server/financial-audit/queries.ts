import { Prisma } from "@prisma/client";

import {
  canAccessCaja,
  canViewAccountingLedger,
  getCajaScopeForUser,
  type CajaScope,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import type { SessionPayload } from "@/server/auth/session";
import {
  canAccessCashClosing,
  canAccessCashDocument,
  canAccessCashSession,
} from "@/server/caja/queries";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  financialAuditActionLabels,
  financialAuditFieldLabels,
  isFinancialAuditAction,
  isFinancialAuditDomain,
  isFinancialAuditEntityTypeForDomain,
  type FinancialAuditChangeDTO,
  type FinancialAuditEntityType,
  type FinancialAuditEventDTO,
  type FinancialAuditField,
  type FinancialAuditHistoryInput,
} from "@/server/financial-audit/shared";
import { sanitizeTicketText } from "@/server/tickets/sanitize";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const EMPTY_VALUE = "[SIN_VALOR]";

const auditSelect = {
  action: true,
  entityType: true,
  entityCode: true,
  reason: true,
  beforeData: true,
  afterData: true,
  createdAt: true,
  actor: { select: { name: true } },
} satisfies Prisma.FinancialAuditEventSelect;

type AuditRow = Prisma.FinancialAuditEventGetPayload<{
  select: typeof auditSelect;
}>;

const entityTypeLabels: Record<FinancialAuditEntityType, string> = {
  CASH_SESSION: "Turno de caja",
  CASH_DOCUMENT: "Documento de caja",
  CASH_CLOSING: "Cierre de caja",
  CHART_ACCOUNT: "Cuenta contable",
  THIRD_PARTY: "Tercero",
  ACCOUNTING_DOCUMENT: "Documento contable",
  JOURNAL_ENTRY: "Asiento contable",
  ACCOUNTING_VOUCHER: "Comprobante",
  EXPENSE: "Gasto",
  PAYROLL_RECORD: "Registro de planilla",
  ACCOUNTING_INVENTORY_COST: "Costo de inventario",
  BANK_ACCOUNT: "Cuenta bancaria",
  BANK_RECONCILIATION: "Conciliación bancaria",
  ACCOUNTING_CLOSING: "Cierre contable",
};

const enumValueLabels: Record<string, string> = {
  BORRADOR: "Borrador",
  EMITIDO: "Emitido",
  ANULADO: "Anulado",
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
  REVISADO: "Revisado",
  REVISADO_CONTABILIDAD: "Revisado por Contabilidad",
  CONTABILIZADO: "Contabilizado",
  CONCILIADO: "Conciliado",
  REABIERTO: "Reabierto",
  REGISTRADO: "Registrado",
  PENDIENTE: "Pendiente",
  DIFERENCIA: "Con diferencia",
  EN_REVISION: "En revisión",
  PREPARADA: "Preparada",
  PAGADA: "Pagada",
  FACTURA: "Factura",
  RECIBO: "Recibo",
  RECIBO_OFICIAL_CAJA: "Recibo oficial de caja",
  NOTA_DEBITO: "Nota de débito",
  NOTA_CREDITO: "Nota de crédito",
  CAJA: "Caja",
  CONTABILIDAD: "Contabilidad",
  MANUAL: "Manual",
  DOCUMENTO: "Documento",
  ACTIVO: "Activo",
  PASIVO: "Pasivo",
  PATRIMONIO: "Patrimonio",
  INGRESO: "Ingreso",
  GASTO: "Gasto",
  COSTO: "Costo",
  DEUDORA: "Deudora",
  ACREEDORA: "Acreedora",
};

function boundedLimit(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || !value || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, Prisma.JsonValue>;
}

function titleCaseEnum(value: string): string {
  const lower = value.toLocaleLowerCase("es").replace(/_/g, " ");
  return lower ? `${lower[0].toLocaleUpperCase("es")}${lower.slice(1)}` : lower;
}

function displayAuditValue(
  field: FinancialAuditField,
  value: Prisma.JsonValue | undefined,
): string | null {
  if (value === undefined || value === null || value === EMPTY_VALUE) return null;
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;

  if (field === "currency") return sanitizeTicketText(value, 20);
  if (enumValueLabels[value]) return enumValueLabels[value];
  if (/^[A-Z][A-Z0-9_]*$/.test(value)) return titleCaseEnum(value);
  return sanitizeTicketText(value, 1_000) || null;
}

function toChanges(row: AuditRow): FinancialAuditChangeDTO[] {
  const before = jsonObject(row.beforeData);
  const after = jsonObject(row.afterData);
  const fields = new Set<FinancialAuditField>([
    ...(Object.keys(before).filter((field) =>
      Object.prototype.hasOwnProperty.call(financialAuditFieldLabels, field),
    ) as FinancialAuditField[]),
    ...(Object.keys(after).filter((field) =>
      Object.prototype.hasOwnProperty.call(financialAuditFieldLabels, field),
    ) as FinancialAuditField[]),
  ]);

  return [...fields].map((field) => ({
    fieldLabel: financialAuditFieldLabels[field],
    before: displayAuditValue(field, before[field]),
    after: displayAuditValue(field, after[field]),
  }));
}

function toAuditDTO(row: AuditRow): FinancialAuditEventDTO {
  const entityType = row.entityType as FinancialAuditEntityType;
  return {
    actionLabel: isFinancialAuditAction(row.action)
      ? financialAuditActionLabels[row.action]
      : "Actividad financiera",
    actorLabel: row.actor?.name
      ? sanitizeTicketText(row.actor.name, 120)
      : "Usuario no disponible",
    reason: row.reason ? sanitizeTicketText(row.reason, 500) || null : null,
    changes: toChanges(row),
    timestamp: row.createdAt.toISOString(),
    entityCode:
      (row.entityCode && sanitizeTicketText(row.entityCode, 160)) ||
      entityTypeLabels[entityType] ||
      "Registro financiero",
  };
}

async function resolveBranchId(branchCode: string): Promise<string | null> {
  const branch = await getPrisma().branch.findUnique({
    where: { code: branchCode },
    select: { id: true },
  });
  return branch?.id ?? null;
}

async function canCashierReadEntity(
  scope: CajaScope,
  entityType: FinancialAuditEntityType,
  entityId: string,
): Promise<boolean> {
  if (entityType === "CASH_SESSION") {
    return canAccessCashSession(scope, entityId);
  }
  if (entityType === "CASH_DOCUMENT") {
    return canAccessCashDocument(scope, entityId);
  }
  if (entityType === "CASH_CLOSING") {
    return canAccessCashClosing(scope, entityId);
  }
  return false;
}

async function cashierEntityIds(
  entityType: FinancialAuditEntityType,
  branchId: string,
  userId: string,
): Promise<string[]> {
  if (entityType === "CASH_SESSION") {
    const rows = await getPrisma().cashSession.findMany({
      where: { branchId, cashierId: userId },
      select: { id: true },
      orderBy: { openedAt: "desc" },
      take: MAX_LIMIT,
    });
    return rows.map((row) => row.id);
  }
  if (entityType === "CASH_DOCUMENT") {
    const rows = await getPrisma().cashDocument.findMany({
      where: {
        branchId,
        OR: [
          { issuedByUserId: userId },
          { cashSession: { is: { cashierId: userId } } },
        ],
      },
      select: { id: true },
      orderBy: { issuedAt: "desc" },
      take: MAX_LIMIT,
    });
    return rows.map((row) => row.id);
  }
  if (entityType === "CASH_CLOSING") {
    const rows = await getPrisma().cashClosing.findMany({
      where: { branchId, cashierId: userId },
      select: { id: true },
      orderBy: { preparedAt: "desc" },
      take: MAX_LIMIT,
    });
    return rows.map((row) => row.id);
  }
  return [];
}

async function authorizationWhere(
  session: SessionPayload,
  input: FinancialAuditHistoryInput,
): Promise<Prisma.FinancialAuditEventWhereInput | null> {
  if (session.roleEnum === "ADMIN") return {};

  if (session.roleEnum === "CONTADOR") {
    return input.domain === "CONTABILIDAD" &&
      canViewAccountingLedger(session.roleEnum)
      ? {}
      : null;
  }

  if (session.roleEnum !== "GERENTE" && session.roleEnum !== "CAJERO") {
    return null;
  }
  if (input.domain !== "CAJA" || !canAccessCaja(session.roleEnum)) return null;

  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  if (!branchCode) return null;
  const branchId = await resolveBranchId(branchCode);
  if (!branchId) return null;

  if (session.roleEnum === "GERENTE") return { branchId };

  // A branch condition alone would let a cashier inspect another cashier's
  // history. A concrete aggregate reuses the existing access predicate; a
  // bounded list first resolves only the cashier's already-authorized IDs.
  if (!input.entityType) return null;
  const scope = getCajaScopeForUser(
    session.roleEnum,
    branchCode,
    session.uid,
  );
  if (input.entityId) {
    if (!(await canCashierReadEntity(scope, input.entityType, input.entityId))) {
      return null;
    }
    return { branchId, entityType: input.entityType, entityId: input.entityId };
  }
  const entityIds = await cashierEntityIds(
    input.entityType,
    branchId,
    session.uid,
  );
  return {
    branchId,
    entityType: input.entityType,
    entityId: { in: entityIds },
  };
}

/**
 * Authorized, bounded, DTO-only financial history. This query derives role and
 * branch/cashier scope from the authenticated session and never returns raw
 * event/entity/user/branch ids or stored JSON payloads.
 */
export async function listFinancialAuditHistory(
  input: FinancialAuditHistoryInput,
): Promise<FinancialAuditEventDTO[]> {
  const session = await requireAuth();
  if (!isDatabaseConfigured()) return [];
  if (!isFinancialAuditDomain(String(input.domain))) return [];
  if (
    input.entityType &&
    !isFinancialAuditEntityTypeForDomain(input.entityType, input.domain)
  ) {
    return [];
  }

  const access = await authorizationWhere(session, input);
  if (!access) return [];

  const entityId = input.entityId?.trim().slice(0, 200);
  if (input.entityId !== undefined && !entityId) return [];
  const entityCode = input.entityCode
    ? sanitizeTicketText(input.entityCode, 160)
    : undefined;

  const rows = await getPrisma().financialAuditEvent.findMany({
    where: {
      AND: [
        { domain: input.domain },
        access,
        input.entityType ? { entityType: input.entityType } : {},
        entityId ? { entityId } : {},
        entityCode ? { entityCode } : {},
      ],
    },
    select: auditSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: boundedLimit(input.limit),
  });

  return rows.map(toAuditDTO);
}
