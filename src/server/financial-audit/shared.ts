import type { FinancialAuditDomain } from "@prisma/client";

import type { UserRoleEnum } from "@/server/auth/roles";

/**
 * Financial audit actions intentionally live in one runtime allowlist instead
 * of a database enum. New workflows therefore require an explicit code change
 * without forcing an enum migration for every future financial operation.
 */
export const financialAuditActions = [
  "CASH_SESSION_OPENED",
  "CASH_SESSION_STATUS_CHANGED",
  "CASH_DOCUMENT_CREATED",
  "CASH_DOCUMENT_UPDATED",
  "CASH_DOCUMENT_ISSUED",
  "CASH_DOCUMENT_CANCELLED",
  "CASH_DOCUMENT_ITEM_ADDED",
  "CASH_DOCUMENT_ITEM_UPDATED",
  "CASH_DOCUMENT_ITEM_REMOVED",
  "CASH_PAYMENT_ADDED",
  "CASH_PAYMENT_UPDATED",
  "CASH_PAYMENT_REMOVED",
  "CASH_CLOSING_CREATED",
  "CASH_CLOSING_SUBMITTED",
  "CASH_CLOSING_REVIEWED",
  "CHART_ACCOUNT_CREATED",
  "CHART_ACCOUNT_UPDATED",
  "CHART_ACCOUNT_STATUS_CHANGED",
  "THIRD_PARTY_CREATED",
  "THIRD_PARTY_UPDATED",
  "THIRD_PARTY_STATUS_CHANGED",
  "ACCOUNTING_DOCUMENT_CREATED",
  "ACCOUNTING_DOCUMENT_UPDATED",
  "ACCOUNTING_DOCUMENT_STATUS_CHANGED",
  "ACCOUNTING_DOCUMENT_CANCELLED",
  "JOURNAL_ENTRY_CREATED",
  "JOURNAL_ENTRY_UPDATED",
  "JOURNAL_ENTRY_POSTED",
  "JOURNAL_ENTRY_REVERSED",
  "JOURNAL_ENTRY_STATUS_CHANGED",
  "JOURNAL_ENTRY_CANCELLED",
  "JOURNAL_LINE_ADDED",
  "JOURNAL_LINE_UPDATED",
  "JOURNAL_LINE_REMOVED",
  "VOUCHER_CREATED",
  "VOUCHER_UPDATED",
  "VOUCHER_STATUS_CHANGED",
  "VOUCHER_CANCELLED",
  "EXPENSE_CREATED",
  "EXPENSE_UPDATED",
  "EXPENSE_STATUS_CHANGED",
  "PAYROLL_RECORD_CREATED",
  "PAYROLL_RECORD_UPDATED",
  "PAYROLL_RECORD_STATUS_CHANGED",
  "ACCOUNTING_INVENTORY_COST_CREATED",
  "ACCOUNTING_INVENTORY_COST_UPDATED",
  "BANK_ACCOUNT_CREATED",
  "BANK_ACCOUNT_UPDATED",
  "BANK_ACCOUNT_STATUS_CHANGED",
  "BANK_RECONCILIATION_CREATED",
  "BANK_RECONCILIATION_UPDATED",
  "BANK_RECONCILIATION_STATUS_CHANGED",
  "BANK_RECONCILIATION_CANCELLED",
  "ACCOUNTING_CLOSING_CREATED",
  "ACCOUNTING_CLOSING_STATUS_CHANGED",
] as const;

export type FinancialAuditAction = (typeof financialAuditActions)[number];

const financialAuditActionSet = new Set<string>(financialAuditActions);

export function isFinancialAuditAction(
  value: string,
): value is FinancialAuditAction {
  return financialAuditActionSet.has(value);
}

export const financialAuditEntityTypes = [
  "CASH_SESSION",
  "CASH_DOCUMENT",
  "CASH_CLOSING",
  "CHART_ACCOUNT",
  "THIRD_PARTY",
  "ACCOUNTING_DOCUMENT",
  "JOURNAL_ENTRY",
  "ACCOUNTING_VOUCHER",
  "EXPENSE",
  "PAYROLL_RECORD",
  "ACCOUNTING_INVENTORY_COST",
  "BANK_ACCOUNT",
  "BANK_RECONCILIATION",
  "ACCOUNTING_CLOSING",
] as const;

export type FinancialAuditEntityType =
  (typeof financialAuditEntityTypes)[number];

const financialAuditEntityTypeSet = new Set<string>(
  financialAuditEntityTypes,
);

export function isFinancialAuditEntityType(
  value: string,
): value is FinancialAuditEntityType {
  return financialAuditEntityTypeSet.has(value);
}

const cajaEntityTypes = new Set<FinancialAuditEntityType>([
  "CASH_SESSION",
  "CASH_DOCUMENT",
  "CASH_CLOSING",
]);

export function isFinancialAuditEntityTypeForDomain(
  entityType: FinancialAuditEntityType,
  domain: FinancialAuditDomain,
): boolean {
  return domain === "CAJA"
    ? cajaEntityTypes.has(entityType)
    : !cajaEntityTypes.has(entityType);
}

export function isFinancialAuditActionForDomain(
  action: FinancialAuditAction,
  domain: FinancialAuditDomain,
): boolean {
  return domain === "CAJA"
    ? action.startsWith("CASH_")
    : !action.startsWith("CASH_");
}

export const financialAuditDomainValues = ["CAJA", "CONTABILIDAD"] as const;

export function isFinancialAuditDomain(
  value: string,
): value is FinancialAuditDomain {
  return financialAuditDomainValues.includes(
    value as (typeof financialAuditDomainValues)[number],
  );
}

export const financialAuditActionLabels: Record<
  FinancialAuditAction,
  string
> = {
  CASH_SESSION_OPENED: "Turno de caja abierto",
  CASH_SESSION_STATUS_CHANGED: "Estado del turno actualizado",
  CASH_DOCUMENT_CREATED: "Documento de caja creado",
  CASH_DOCUMENT_UPDATED: "Documento de caja actualizado",
  CASH_DOCUMENT_ISSUED: "Documento de caja emitido",
  CASH_DOCUMENT_CANCELLED: "Documento de caja anulado",
  CASH_DOCUMENT_ITEM_ADDED: "Ítem agregado al documento",
  CASH_DOCUMENT_ITEM_UPDATED: "Ítem del documento actualizado",
  CASH_DOCUMENT_ITEM_REMOVED: "Ítem retirado del documento",
  CASH_PAYMENT_ADDED: "Pago de borrador agregado",
  CASH_PAYMENT_UPDATED: "Pago de borrador actualizado",
  CASH_PAYMENT_REMOVED: "Pago de borrador retirado",
  CASH_CLOSING_CREATED: "Cierre de caja preparado",
  CASH_CLOSING_SUBMITTED: "Cierre de caja enviado",
  CASH_CLOSING_REVIEWED: "Cierre de caja revisado",
  CHART_ACCOUNT_CREATED: "Cuenta contable creada",
  CHART_ACCOUNT_UPDATED: "Cuenta contable actualizada",
  CHART_ACCOUNT_STATUS_CHANGED: "Estado de la cuenta actualizado",
  THIRD_PARTY_CREATED: "Tercero creado",
  THIRD_PARTY_UPDATED: "Tercero actualizado",
  THIRD_PARTY_STATUS_CHANGED: "Estado del tercero actualizado",
  ACCOUNTING_DOCUMENT_CREATED: "Documento contable creado",
  ACCOUNTING_DOCUMENT_UPDATED: "Documento contable actualizado",
  ACCOUNTING_DOCUMENT_STATUS_CHANGED: "Estado del documento actualizado",
  ACCOUNTING_DOCUMENT_CANCELLED: "Documento contable anulado",
  JOURNAL_ENTRY_CREATED: "Asiento contable creado",
  JOURNAL_ENTRY_UPDATED: "Asiento contable actualizado",
  JOURNAL_ENTRY_POSTED: "Asiento contabilizado",
  JOURNAL_ENTRY_REVERSED: "Asiento revertido",
  JOURNAL_ENTRY_STATUS_CHANGED: "Estado del asiento actualizado",
  JOURNAL_ENTRY_CANCELLED: "Asiento borrador anulado",
  JOURNAL_LINE_ADDED: "Línea de asiento agregada",
  JOURNAL_LINE_UPDATED: "Línea de asiento actualizada",
  JOURNAL_LINE_REMOVED: "Línea de asiento retirada",
  VOUCHER_CREATED: "Comprobante creado",
  VOUCHER_UPDATED: "Comprobante actualizado",
  VOUCHER_STATUS_CHANGED: "Estado del comprobante actualizado",
  VOUCHER_CANCELLED: "Comprobante anulado",
  EXPENSE_CREATED: "Gasto creado",
  EXPENSE_UPDATED: "Gasto actualizado",
  EXPENSE_STATUS_CHANGED: "Estado del gasto actualizado",
  PAYROLL_RECORD_CREATED: "Registro de planilla creado",
  PAYROLL_RECORD_UPDATED: "Registro de planilla actualizado",
  PAYROLL_RECORD_STATUS_CHANGED: "Estado de planilla actualizado",
  ACCOUNTING_INVENTORY_COST_CREATED: "Costo de inventario creado",
  ACCOUNTING_INVENTORY_COST_UPDATED: "Costo de inventario actualizado",
  BANK_ACCOUNT_CREATED: "Cuenta bancaria creada",
  BANK_ACCOUNT_UPDATED: "Cuenta bancaria actualizada",
  BANK_ACCOUNT_STATUS_CHANGED: "Estado de la cuenta bancaria actualizado",
  BANK_RECONCILIATION_CREATED: "Conciliación bancaria creada",
  BANK_RECONCILIATION_UPDATED: "Conciliación bancaria actualizada",
  BANK_RECONCILIATION_STATUS_CHANGED: "Estado de conciliación actualizado",
  BANK_RECONCILIATION_CANCELLED: "Conciliación bancaria anulada",
  ACCOUNTING_CLOSING_CREATED: "Cierre contable creado",
  ACCOUNTING_CLOSING_STATUS_CHANGED: "Estado del cierre actualizado",
};

/** Only these scalar fields may reach before/after JSON. */
export const financialAuditFieldLabels = {
  status: "Estado",
  type: "Tipo",
  origin: "Origen",
  source: "Origen del asiento",
  isActive: "Activo",
  branchCode: "Sucursal",
  code: "Código",
  parentCode: "Cuenta padre",
  accountCode: "Cuenta contable",
  nature: "Naturaleza",
  category: "Categoría",
  documentNumber: "Número de documento",
  entryNumber: "Número de asiento",
  reversalEntryNumber: "Asiento de reversión",
  reversalOfEntryNumber: "Reversión del asiento",
  voucherNumber: "Número de comprobante",
  period: "Periodo",
  documentDate: "Fecha del documento",
  entryDate: "Fecha del asiento",
  voucherDate: "Fecha del comprobante",
  expenseDate: "Fecha del gasto",
  movementDate: "Fecha del movimiento",
  openedAt: "Fecha de apertura",
  issuedAt: "Fecha de emisión",
  preparedAt: "Fecha de preparación",
  paidAt: "Fecha del pago",
  postedAt: "Fecha de contabilización",
  closedAt: "Fecha de cierre",
  reviewedAt: "Fecha de revisión",
  reconciledAt: "Fecha de conciliación",
  cancelledAt: "Fecha de anulación",
  reopenedAt: "Fecha de reapertura",
  description: "Descripción",
  concept: "Concepto",
  notes: "Notas",
  accountingNotes: "Notas contables",
  notesChanged: "Notas modificadas",
  displayNameChanged: "Nombre modificado",
  detailsChanged: "Datos descriptivos modificados",
  subtotal: "Subtotal",
  appliedPayment: "Pago aplicado",
  retention1: "Retención 1",
  retention2: "Retención 2",
  total: "Total",
  amount: "Monto",
  debit: "Debe",
  credit: "Haber",
  debitTotal: "Total debe",
  creditTotal: "Total haber",
  tax: "Impuesto",
  taxBase: "Base imponible",
  baseSalary: "Salario base",
  commissions: "Comisiones",
  bonuses: "Bonificaciones",
  deductions: "Deducciones",
  advances: "Adelantos",
  netPay: "Pago neto",
  unitCost: "Costo unitario",
  minimumStock: "Stock mínimo",
  balance: "Saldo",
  cashAmount: "Efectivo contado",
  transferAmount: "Transferencias contadas",
  checkAmount: "Cheques contados",
  cardAmount: "Tarjetas contadas",
  invoicedTotal: "Total facturado",
  receivedTotal: "Total recibido",
  retentionTotal: "Total retenido",
  incomeTotal: "Total de ingresos",
  expenseTotal: "Total de gastos",
  appliedTotal: "Total aplicado",
  cashTotal: "Total de caja",
  difference: "Diferencia",
  currency: "Moneda",
  paymentMethod: "Método de pago",
  method: "Método de pago",
  quantity: "Cantidad",
  unitPrice: "Precio unitario",
  position: "Posición",
  lineCount: "Cantidad de líneas",
  itemCount: "Cantidad de ítems",
  paymentCount: "Cantidad de pagos",
  isBalanced: "Asiento cuadrado",
  modelSlug: "Código de modelo",
  modelName: "Modelo",
  bankName: "Banco",
} as const;

export type FinancialAuditField = keyof typeof financialAuditFieldLabels;

export type FinancialAuditActor = {
  userId: string;
  role: UserRoleEnum;
};

export type FinancialAuditMetadataInput = {
  component?: "HEADER" | "ITEM" | "PAYMENT" | "LINE" | "STATUS";
  operation?: "CREATE" | "UPDATE" | "REMOVE" | "STATUS_CHANGE";
  changedFields?: FinancialAuditField[];
  itemCount?: number;
  paymentCount?: number;
  lineCount?: number;
  isBalanced?: boolean;
};

export type FinancialAuditChangeDTO = {
  fieldLabel: string;
  before: string | null;
  after: string | null;
};

export type FinancialAuditEventDTO = {
  actionLabel: string;
  actorLabel: string;
  reason: string | null;
  changes: FinancialAuditChangeDTO[];
  timestamp: string;
  entityCode: string;
};

export type FinancialAuditHistoryInput = {
  domain: FinancialAuditDomain;
  entityType?: FinancialAuditEntityType;
  /** Internal server-only lookup value. It is never included in the DTO. */
  entityId?: string;
  entityCode?: string;
  limit?: number;
};
