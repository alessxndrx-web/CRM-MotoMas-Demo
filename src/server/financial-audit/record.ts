import { Prisma, type FinancialAuditDomain } from "@prisma/client";

import {
  financialAuditFieldLabels,
  isFinancialAuditAction,
  isFinancialAuditActionForDomain,
  isFinancialAuditDomain,
  isFinancialAuditEntityType,
  isFinancialAuditEntityTypeForDomain,
  type FinancialAuditAction,
  type FinancialAuditActor,
  type FinancialAuditEntityType,
  type FinancialAuditField,
  type FinancialAuditMetadataInput,
} from "@/server/financial-audit/shared";
import { sanitizeTicketText } from "@/server/tickets/sanitize";

const EMPTY_VALUE = "[SIN_VALOR]";

type AuditSnapshot = Record<string, unknown>;
type MutableJsonObject = Record<string, Prisma.InputJsonValue | null>;

type FinancialAuditChangeSet = {
  beforeData: Prisma.InputJsonObject | undefined;
  afterData: Prisma.InputJsonObject | undefined;
  changedFields: FinancialAuditField[];
};

export type RecordFinancialAuditEventInput = {
  domain: FinancialAuditDomain;
  entityType: FinancialAuditEntityType;
  entityId: string;
  entityCode?: string | null;
  action: FinancialAuditAction;
  actor: FinancialAuditActor;
  branchId?: string | null;
  reason?: string | null;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
  metadata?: FinancialAuditMetadataInput | null;
};

function normalizeAuditScalar(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === null) return EMPTY_VALUE;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === "string") return sanitizeTicketText(value, 1_000);
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value;

  // Arrays, nested objects and complete Prisma rows are deliberately rejected.
  return undefined;
}

function normalizeSnapshot(
  snapshot: AuditSnapshot | null | undefined,
): MutableJsonObject {
  if (!snapshot) return {};

  const result: MutableJsonObject = {};
  for (const field of Object.keys(
    financialAuditFieldLabels,
  ) as FinancialAuditField[]) {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field)) continue;
    const normalized = normalizeAuditScalar(snapshot[field]);
    if (normalized !== undefined) result[field] = normalized;
  }
  return result;
}

function sameAuditValue(
  left: Prisma.InputJsonValue | null | undefined,
  right: Prisma.InputJsonValue | null | undefined,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Converts two intentionally small snapshots into allowlisted changed fields.
 * Callers should pass snapshots with the same shape for updates. A missing
 * entire side represents create/remove; nested data and unlisted keys vanish.
 */
export function buildFinancialAuditChangeSet(
  before: AuditSnapshot | null | undefined,
  after: AuditSnapshot | null | undefined,
): FinancialAuditChangeSet {
  const normalizedBefore = normalizeSnapshot(before);
  const normalizedAfter = normalizeSnapshot(after);
  const fields = new Set<FinancialAuditField>([
    ...(Object.keys(normalizedBefore) as FinancialAuditField[]),
    ...(Object.keys(normalizedAfter) as FinancialAuditField[]),
  ]);

  const changedFields: FinancialAuditField[] = [];
  const beforeData: MutableJsonObject = {};
  const afterData: MutableJsonObject = {};

  for (const field of fields) {
    const beforeValue = normalizedBefore[field];
    const afterValue = normalizedAfter[field];
    if (sameAuditValue(beforeValue, afterValue)) continue;

    changedFields.push(field);
    if (beforeValue !== undefined) beforeData[field] = beforeValue;
    if (afterValue !== undefined) afterData[field] = afterValue;
  }

  return {
    beforeData: Object.keys(beforeData).length
      ? (beforeData as Prisma.InputJsonObject)
      : undefined,
    afterData: Object.keys(afterData).length
      ? (afterData as Prisma.InputJsonObject)
      : undefined,
    changedFields,
  };
}

function normalizeCount(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) {
    return undefined;
  }
  return Math.min(value, 100_000);
}

function buildMetadata(
  metadata: FinancialAuditMetadataInput | null | undefined,
  changedFields: FinancialAuditField[],
): Prisma.InputJsonObject | undefined {
  const result: MutableJsonObject = {};
  if (metadata?.component) result.component = metadata.component;
  if (metadata?.operation) result.operation = metadata.operation;

  const itemCount = normalizeCount(metadata?.itemCount);
  const paymentCount = normalizeCount(metadata?.paymentCount);
  const lineCount = normalizeCount(metadata?.lineCount);
  if (itemCount !== undefined) result.itemCount = itemCount;
  if (paymentCount !== undefined) result.paymentCount = paymentCount;
  if (lineCount !== undefined) result.lineCount = lineCount;
  if (metadata?.isBalanced !== undefined) {
    result.isBalanced = metadata.isBalanced;
  }
  if (changedFields.length) result.changedFields = changedFields;

  return Object.keys(result).length
    ? (result as Prisma.InputJsonObject)
    : undefined;
}

/**
 * Sole writer for financial audit history. It deliberately accepts a Prisma
 * TransactionClient so the event can only commit with its financial mutation.
 * It never updates/deletes history and lets write failures abort the caller's
 * transaction.
 */
export async function recordFinancialAuditEvent(
  tx: Prisma.TransactionClient,
  input: RecordFinancialAuditEventInput,
): Promise<{ created: boolean }> {
  if (!isFinancialAuditDomain(String(input.domain))) {
    throw new Error("Dominio de auditoría financiera no válido.");
  }
  if (!isFinancialAuditAction(String(input.action))) {
    throw new Error("Acción de auditoría financiera no válida.");
  }
  if (!isFinancialAuditEntityType(String(input.entityType))) {
    throw new Error("Entidad de auditoría financiera no válida.");
  }
  if (!isFinancialAuditActionForDomain(input.action, input.domain)) {
    throw new Error("La acción no corresponde al dominio financiero.");
  }
  if (!isFinancialAuditEntityTypeForDomain(input.entityType, input.domain)) {
    throw new Error("La entidad no corresponde al dominio financiero.");
  }

  const entityId = String(input.entityId).trim().slice(0, 200);
  if (!entityId) throw new Error("La entidad financiera es obligatoria.");

  const changeSet = buildFinancialAuditChangeSet(input.before, input.after);
  // Both sides mean an update. If no allowlisted value changed, there was no
  // committed business change worth duplicating in the immutable history.
  if (input.before && input.after && !changeSet.changedFields.length) {
    return { created: false };
  }

  const entityCode = input.entityCode
    ? sanitizeTicketText(input.entityCode, 160) || null
    : null;
  const reason = input.reason
    ? sanitizeTicketText(input.reason, 500) || null
    : null;
  const metadata = buildMetadata(input.metadata, changeSet.changedFields);

  await tx.financialAuditEvent.create({
    data: {
      domain: input.domain,
      entityType: input.entityType,
      entityId,
      entityCode,
      action: input.action,
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      branchId: input.branchId ?? null,
      reason,
      beforeData: changeSet.beforeData,
      afterData: changeSet.afterData,
      metadata,
    },
  });

  return { created: true };
}
