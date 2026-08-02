import type {
  AccountMappingSetStatus,
  AccountingEventComponent,
  AccountingEventType,
} from "@prisma/client";

/**
 * Patch FF1.0 — client-safe contracts for the account-mapping catalogue.
 *
 * A mapping answers one question the posting engine (FF1.4) will ask: "for this
 * economic event and this monetary component, which account is debited and
 * which is credited?". FF1.0 only stores and validates the answers; nothing
 * here builds, posts or previews a journal entry.
 *
 * Pure values and types: no Prisma client, no session, no database access.
 */

export type AccountingEventTypeValue = AccountingEventType;
export type AccountingEventComponentValue = AccountingEventComponent;
export type AccountMappingSetStatusValue = AccountMappingSetStatus;

/**
 * Total `Record`s over the Prisma enums: adding an event or component to the
 * schema fails compilation until it is labelled, so the runtime lists can never
 * drift from the database.
 */
export const accountingEventTypeLabels: Record<
  AccountingEventTypeValue,
  string
> = {
  CAJA_FACTURA: "Caja — Factura emitida",
  CAJA_RECIBO: "Caja — Recibo oficial",
  CAJA_NOTA_DEBITO: "Caja — Nota de débito",
  CAJA_NOTA_CREDITO: "Caja — Nota de crédito",
  CAJA_CIERRE: "Caja — Cierre de turno",
  DOCUMENTO_FACTURA: "Contabilidad — Factura",
  DOCUMENTO_NOTA_DEBITO: "Contabilidad — Nota de débito",
  DOCUMENTO_NOTA_CREDITO: "Contabilidad — Nota de crédito",
  DOCUMENTO_RECIBO_OFICIAL_CAJA: "Contabilidad — Recibo oficial de caja",
  GASTO: "Gasto",
  COMPROBANTE_INGRESO: "Comprobante de ingreso",
  COMPROBANTE_EGRESO: "Comprobante de egreso",
  COMPROBANTE_CHEQUE: "Comprobante de cheque",
  COMPROBANTE_TRANSFERENCIA: "Comprobante de transferencia",
  COMPROBANTE_REEMBOLSO: "Comprobante de reembolso",
  COMPROBANTE_AJUSTE: "Comprobante de ajuste",
  PLANILLA: "Planilla",
};

export const accountingEventComponentLabels: Record<
  AccountingEventComponentValue,
  string
> = {
  SUBTOTAL: "Subtotal",
  RETENCION_1: "Retención 1",
  RETENCION_2: "Retención 2",
  ABONO_APLICADO: "Abono aplicado",
  TOTAL: "Total",
  PAGO_EFECTIVO: "Pago en efectivo",
  PAGO_TRANSFERENCIA: "Pago por transferencia",
  PAGO_CHEQUE: "Pago con cheque",
  PAGO_TARJETA: "Pago con tarjeta",
  DIFERENCIA_SOBRANTE: "Diferencia — sobrante",
  DIFERENCIA_FALTANTE: "Diferencia — faltante",
  PLANILLA_NETO: "Planilla — neto a pagar",
  PLANILLA_DEDUCCIONES: "Planilla — deducciones",
};

export const accountMappingSetStatusLabels: Record<
  AccountMappingSetStatusValue,
  string
> = {
  BORRADOR: "Borrador",
  ACTIVO: "Activo",
  ARCHIVADO: "Archivado",
};

export const accountingEventTypeValues = Object.keys(
  accountingEventTypeLabels,
) as AccountingEventTypeValue[];

export const accountingEventComponentValues = Object.keys(
  accountingEventComponentLabels,
) as AccountingEventComponentValue[];

const eventTypeSet = new Set<string>(accountingEventTypeValues);
const eventComponentSet = new Set<string>(accountingEventComponentValues);

export function isAccountingEventTypeValue(
  value: string,
): value is AccountingEventTypeValue {
  return eventTypeSet.has(value);
}

export function isAccountingEventComponentValue(
  value: string,
): value is AccountingEventComponentValue {
  return eventComponentSet.has(value);
}

/**
 * Components each event can legitimately carry. The engine will never ask for a
 * pair outside this table, so rules that could never fire are rejected at
 * configuration time instead of failing silently at posting time.
 */
const eventComponentMatrix: Record<
  AccountingEventTypeValue,
  readonly AccountingEventComponentValue[]
> = {
  CAJA_FACTURA: [
    "SUBTOTAL",
    "RETENCION_1",
    "RETENCION_2",
    "ABONO_APLICADO",
    "TOTAL",
    "PAGO_EFECTIVO",
    "PAGO_TRANSFERENCIA",
    "PAGO_CHEQUE",
    "PAGO_TARJETA",
  ],
  CAJA_RECIBO: [
    "TOTAL",
    "PAGO_EFECTIVO",
    "PAGO_TRANSFERENCIA",
    "PAGO_CHEQUE",
    "PAGO_TARJETA",
  ],
  CAJA_NOTA_DEBITO: ["SUBTOTAL", "TOTAL"],
  CAJA_NOTA_CREDITO: ["SUBTOTAL", "TOTAL"],
  CAJA_CIERRE: ["DIFERENCIA_SOBRANTE", "DIFERENCIA_FALTANTE"],
  DOCUMENTO_FACTURA: [
    "SUBTOTAL",
    "RETENCION_1",
    "RETENCION_2",
    "ABONO_APLICADO",
    "TOTAL",
  ],
  DOCUMENTO_NOTA_DEBITO: ["SUBTOTAL", "TOTAL"],
  DOCUMENTO_NOTA_CREDITO: ["SUBTOTAL", "TOTAL"],
  DOCUMENTO_RECIBO_OFICIAL_CAJA: ["TOTAL"],
  GASTO: ["SUBTOTAL", "RETENCION_1", "RETENCION_2", "TOTAL"],
  COMPROBANTE_INGRESO: ["TOTAL"],
  COMPROBANTE_EGRESO: ["TOTAL"],
  COMPROBANTE_CHEQUE: ["TOTAL"],
  COMPROBANTE_TRANSFERENCIA: ["TOTAL"],
  COMPROBANTE_REEMBOLSO: ["TOTAL"],
  COMPROBANTE_AJUSTE: ["TOTAL"],
  PLANILLA: ["PLANILLA_NETO", "PLANILLA_DEDUCCIONES"],
};

export function componentsForEvent(
  event: AccountingEventTypeValue,
): readonly AccountingEventComponentValue[] {
  return eventComponentMatrix[event];
}

export function isComponentAllowedForEvent(
  event: AccountingEventTypeValue,
  component: AccountingEventComponentValue,
): boolean {
  return eventComponentMatrix[event].includes(component);
}

/** Corporate (branch-less) mapping scope; mirrors the numbering sentinel. */
export const CORPORATE_MAPPING_BRANCH_KEY = "__CORPORATIVO__";

export function mappingBranchKey(branchId: string | null): string {
  return branchId ?? CORPORATE_MAPPING_BRANCH_KEY;
}

export type AccountMappingRuleDTO = {
  id: string;
  event: AccountingEventTypeValue;
  eventLabel: string;
  component: AccountingEventComponentValue;
  componentLabel: string;
  debitAccountCode: string;
  debitAccountName: string;
  debitAccountIsActive: boolean;
  creditAccountCode: string;
  creditAccountName: string;
  creditAccountIsActive: boolean;
  description: string | null;
};

export type AccountMappingSetDTO = {
  id: string;
  code: string;
  version: number;
  name: string;
  description: string | null;
  status: AccountMappingSetStatusValue;
  statusLabel: string;
  /** Branch code, or null for a corporate set. */
  branchCode: string | null;
  effectiveFrom: string;
  activatedAt: string | null;
  archivedAt: string | null;
  ruleCount: number;
};

export type AccountMappingSetDetailDTO = AccountMappingSetDTO & {
  rules: AccountMappingRuleDTO[];
};

export type AccountMappingIssueDTO = {
  /** Rule the problem belongs to, or null for a set-level problem. */
  ruleId: string | null;
  message: string;
};

export type AccountMappingValidationDTO = {
  valid: boolean;
  ruleCount: number;
  issues: AccountMappingIssueDTO[];
};

/** What the posting engine will read once FF1.4 exists. */
export type ResolvedAccountMappingDTO = {
  setId: string;
  setCode: string;
  setVersion: number;
  event: AccountingEventTypeValue;
  component: AccountingEventComponentValue;
  debitAccountId: string;
  debitAccountCode: string;
  creditAccountId: string;
  creditAccountCode: string;
};
