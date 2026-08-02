/**
 * Client-safe Contabilidad DTOs, enum values, labels and pure
 * validation/calculation helpers (Patch 3.5B). No Prisma import belongs here:
 * Decimal values are serialized before crossing the server boundary.
 *
 * Cost exposure: `AccountingInventoryCostDTO` is the only DTO carrying an
 * acquisition cost. It is built exclusively by `toAccountingInventoryCostDTO`,
 * which the queries call only after `canViewAccountingCosts` passes. Every
 * other DTO here is cost-free by construction.
 *
 * Nothing in this module implements fiscal/DGI numbering, electronic invoicing,
 * a banking integration or payroll tax law — the Contabilidad module models
 * none of those today.
 *
 * Patch FF1.1 moved the chart-of-accounts vocabulary (type, nature, origin and
 * `ChartAccountDTO`) down to `@/server/finance/chart-of-accounts/shared`, which
 * is the base layer both Contabilidad and the finance services read. It is
 * re-exported here so every existing import keeps working and there is still
 * exactly one definition. The code sanitizer moved with it and is now called
 * `sanitizeChartAccountCode`; the catalogue service is its only caller, so it
 * is not re-exported.
 */

// The calculation helpers below round through the canonical implementation; the
// alias keeps their bodies unchanged (Patch TD-01).
import { roundFinancialMoney as roundAccountingMoney } from "@/server/finance/money";
import { sanitizeFinancialText } from "@/server/finance/text";

export {
  accountNatureLabels,
  accountNatureValues,
  accountTypeLabels,
  accountTypeValues,
  chartAccountOriginLabels,
  chartAccountOriginValues,
  defaultNatureForType,
  isAccountNatureValue,
  isAccountTypeValue,
  isChartAccountOriginValue,
} from "@/server/finance/chart-of-accounts/shared";

export type {
  AccountNatureValue,
  AccountTypeValue,
  ChartAccountDTO,
  ChartAccountFilters,
  ChartAccountOriginValue,
} from "@/server/finance/chart-of-accounts/shared";

// --- Enum values, guards and labels --------------------------------------

export type AccountingDocumentTypeValue =
  | "FACTURA"
  | "NOTA_DEBITO"
  | "NOTA_CREDITO"
  | "RECIBO_OFICIAL_CAJA";

export const accountingDocumentTypeValues: AccountingDocumentTypeValue[] = [
  "FACTURA",
  "NOTA_DEBITO",
  "NOTA_CREDITO",
  "RECIBO_OFICIAL_CAJA",
];

export const accountingDocumentTypeLabels: Record<
  AccountingDocumentTypeValue,
  string
> = {
  FACTURA: "Factura",
  NOTA_DEBITO: "Nota de débito",
  NOTA_CREDITO: "Nota de crédito",
  RECIBO_OFICIAL_CAJA: "Recibo oficial de caja",
};

export type AccountingDocumentStatusValue =
  | "BORRADOR"
  | "EMITIDO"
  | "REVISADO"
  | "CONTABILIZADO"
  | "CONCILIADO"
  | "ANULADO";

export const accountingDocumentStatusValues: AccountingDocumentStatusValue[] = [
  "BORRADOR",
  "EMITIDO",
  "REVISADO",
  "CONTABILIZADO",
  "CONCILIADO",
  "ANULADO",
];

export const accountingDocumentStatusLabels: Record<
  AccountingDocumentStatusValue,
  string
> = {
  BORRADOR: "Borrador",
  EMITIDO: "Emitido",
  REVISADO: "Revisado",
  CONTABILIZADO: "Contabilizado",
  CONCILIADO: "Conciliado",
  ANULADO: "Anulado",
};

export type AccountingDocumentOriginValue = "CAJA" | "CONTABILIDAD";

export const accountingDocumentOriginValues: AccountingDocumentOriginValue[] = [
  "CAJA",
  "CONTABILIDAD",
];

export const accountingDocumentOriginLabels: Record<
  AccountingDocumentOriginValue,
  string
> = {
  CAJA: "Caja",
  CONTABILIDAD: "Contabilidad",
};

export type JournalEntryStatusValue =
  | "BORRADOR"
  | "CONTABILIZADO"
  | "CONCILIADO"
  | "ANULADO";

export const journalEntryStatusValues: JournalEntryStatusValue[] = [
  "BORRADOR",
  "CONTABILIZADO",
  "CONCILIADO",
  "ANULADO",
];

export const journalEntryStatusLabels: Record<
  JournalEntryStatusValue,
  string
> = {
  BORRADOR: "Borrador",
  CONTABILIZADO: "Contabilizado",
  CONCILIADO: "Conciliado",
  ANULADO: "Anulado",
};

export type JournalEntrySourceValue = "MANUAL" | "DOCUMENTO" | "CAJA";

export const journalEntrySourceValues: JournalEntrySourceValue[] = [
  "MANUAL",
  "DOCUMENTO",
  "CAJA",
];

export const journalEntrySourceLabels: Record<JournalEntrySourceValue, string> =
  {
    MANUAL: "Manual",
    DOCUMENTO: "Documento",
    CAJA: "Caja",
  };

export type VoucherTypeValue =
  | "INGRESO"
  | "EGRESO"
  | "CHEQUE"
  | "TRANSFERENCIA"
  | "REEMBOLSO"
  | "AJUSTE";

export const voucherTypeValues: VoucherTypeValue[] = [
  "INGRESO",
  "EGRESO",
  "CHEQUE",
  "TRANSFERENCIA",
  "REEMBOLSO",
  "AJUSTE",
];

export const voucherTypeLabels: Record<VoucherTypeValue, string> = {
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  CHEQUE: "Cheque",
  TRANSFERENCIA: "Transferencia",
  REEMBOLSO: "Reembolso",
  AJUSTE: "Ajuste",
};

export type VoucherStatusValue = "REGISTRADO" | "CONCILIADO" | "ANULADO";

export const voucherStatusValues: VoucherStatusValue[] = [
  "REGISTRADO",
  "CONCILIADO",
  "ANULADO",
];

export const voucherStatusLabels: Record<VoucherStatusValue, string> = {
  REGISTRADO: "Registrado",
  CONCILIADO: "Conciliado",
  ANULADO: "Anulado",
};

export type ExpenseCategoryValue =
  | "COMBUSTIBLE"
  | "COMPRAS_VARIAS"
  | "SERVICIOS_BASICOS"
  | "MANTENIMIENTO"
  | "PAPELERIA"
  | "VIATICOS"
  | "REPUESTOS_INTERNOS"
  | "GASTOS_ADMINISTRATIVOS"
  | "OTROS";

export const expenseCategoryValues: ExpenseCategoryValue[] = [
  "COMBUSTIBLE",
  "COMPRAS_VARIAS",
  "SERVICIOS_BASICOS",
  "MANTENIMIENTO",
  "PAPELERIA",
  "VIATICOS",
  "REPUESTOS_INTERNOS",
  "GASTOS_ADMINISTRATIVOS",
  "OTROS",
];

export const expenseCategoryLabels: Record<ExpenseCategoryValue, string> = {
  COMBUSTIBLE: "Combustible",
  COMPRAS_VARIAS: "Compras varias",
  SERVICIOS_BASICOS: "Servicios básicos",
  MANTENIMIENTO: "Mantenimiento",
  PAPELERIA: "Papelería",
  VIATICOS: "Viáticos",
  REPUESTOS_INTERNOS: "Repuestos internos",
  GASTOS_ADMINISTRATIVOS: "Gastos administrativos",
  OTROS: "Otros",
};

export type ExpenseStatusValue = "REGISTRADO" | "REVISADO";

export const expenseStatusValues: ExpenseStatusValue[] = [
  "REGISTRADO",
  "REVISADO",
];

export const expenseStatusLabels: Record<ExpenseStatusValue, string> = {
  REGISTRADO: "Registrado",
  REVISADO: "Revisado",
};

export type BankReconciliationStatusValue =
  | "PENDIENTE"
  | "CONCILIADO"
  | "DIFERENCIA"
  | "ANULADO";

export const bankReconciliationStatusValues: BankReconciliationStatusValue[] = [
  "PENDIENTE",
  "CONCILIADO",
  "DIFERENCIA",
  "ANULADO",
];

export const bankReconciliationStatusLabels: Record<
  BankReconciliationStatusValue,
  string
> = {
  PENDIENTE: "Pendiente",
  CONCILIADO: "Conciliado",
  DIFERENCIA: "Diferencia",
  ANULADO: "Anulado",
};

export type AccountingClosingStatusValue =
  | "ABIERTO"
  | "EN_REVISION"
  | "CERRADO"
  | "REABIERTO";

export const accountingClosingStatusValues: AccountingClosingStatusValue[] = [
  "ABIERTO",
  "EN_REVISION",
  "CERRADO",
  "REABIERTO",
];

export const accountingClosingStatusLabels: Record<
  AccountingClosingStatusValue,
  string
> = {
  ABIERTO: "Abierto",
  EN_REVISION: "En revisión",
  CERRADO: "Cerrado",
  REABIERTO: "Reabierto",
};

export type ThirdPartyTypeValue = "CLIENTE" | "PROVEEDOR" | "EMPLEADO";

export const thirdPartyTypeValues: ThirdPartyTypeValue[] = [
  "CLIENTE",
  "PROVEEDOR",
  "EMPLEADO",
];

export const thirdPartyTypeLabels: Record<ThirdPartyTypeValue, string> = {
  CLIENTE: "Cliente",
  PROVEEDOR: "Proveedor",
  EMPLEADO: "Empleado",
};

export type PayrollStatusValue = "BORRADOR" | "PREPARADA" | "PAGADA";

export const payrollStatusValues: PayrollStatusValue[] = [
  "BORRADOR",
  "PREPARADA",
  "PAGADA",
];

export const payrollStatusLabels: Record<PayrollStatusValue, string> = {
  BORRADOR: "Borrador",
  PREPARADA: "Preparada",
  PAGADA: "Pagada",
};

function guard<T extends string>(values: T[]) {
  return (value: string): value is T => values.includes(value as T);
}

export const isAccountingDocumentTypeValue = guard(accountingDocumentTypeValues);
export const isAccountingDocumentStatusValue = guard(
  accountingDocumentStatusValues,
);
export const isAccountingDocumentOriginValue = guard(
  accountingDocumentOriginValues,
);
export const isJournalEntryStatusValue = guard(journalEntryStatusValues);
export const isJournalEntrySourceValue = guard(journalEntrySourceValues);
export const isVoucherTypeValue = guard(voucherTypeValues);
export const isVoucherStatusValue = guard(voucherStatusValues);
export const isExpenseCategoryValue = guard(expenseCategoryValues);
export const isExpenseStatusValue = guard(expenseStatusValues);
export const isBankReconciliationStatusValue = guard(
  bankReconciliationStatusValues,
);
export const isAccountingClosingStatusValue = guard(
  accountingClosingStatusValues,
);
export const isThirdPartyTypeValue = guard(thirdPartyTypeValues);
export const isPayrollStatusValue = guard(payrollStatusValues);

// --- DTOs ----------------------------------------------------------------

export type ThirdPartyDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  customerId: string | null;
  type: ThirdPartyTypeValue;
  typeLabel: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  isActive: boolean;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AccountingDocumentDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  thirdPartyId: string | null;
  cashDocumentId: string | null;
  cashDocumentNumber: string | null;
  cashClosingId: string | null;
  saleId: string | null;
  saleNumber: string | null;
  reservationId: string | null;
  reservationNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  createdByUserId: string;
  createdByName: string;
  reviewedByName: string | null;
  postedByName: string | null;
  reconciledByName: string | null;
  cancelledByName: string | null;
  type: AccountingDocumentTypeValue;
  typeLabel: string;
  status: AccountingDocumentStatusValue;
  statusLabel: string;
  origin: AccountingDocumentOriginValue;
  originLabel: string;
  documentNumber: string;
  documentDate: string;
  thirdPartyName: string;
  taxId: string | null;
  concept: string;
  sourceDocument: string | null;
  subtotal: number;
  retention1: number;
  retention2: number;
  appliedPayment: number;
  total: number;
  currency: string | null;
  paymentMethod: string | null;
  bank: string | null;
  reference: string | null;
  motorcycleDescription: string[];
  notes: string | null;
  accountingNotes: string | null;
  cancelReason: string | null;
  reviewedAt: string | null;
  postedAt: string | null;
  reconciledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JournalEntryLineDTO = {
  id: string;
  entryId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  concept: string | null;
  debit: number;
  credit: number;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type JournalEntryDTO = {
  id: string;
  branchCode: string | null;
  branchName: string | null;
  accountingDocumentId: string | null;
  accountingDocumentNumber: string | null;
  /** Set when this entry reverses a posted entry (Patch 4.0S-C2). */
  reversalOfId: string | null;
  reversalOfEntryNumber: string | null;
  /** Set when a reversal was already generated for this entry. */
  reversalEntryId: string | null;
  reversalEntryNumber: string | null;
  isReversal: boolean;
  hasReversal: boolean;
  createdByUserId: string;
  createdByName: string;
  postedByName: string | null;
  entryNumber: string;
  entryDate: string;
  status: JournalEntryStatusValue;
  statusLabel: string;
  source: JournalEntrySourceValue;
  sourceLabel: string;
  invoiceNumber: string | null;
  customerCode: string | null;
  supplier: string | null;
  taxId: string | null;
  taxBase: number;
  bank: string | null;
  bankPaymentReference: string | null;
  reconciliation: string | null;
  retention: string | null;
  retentionDate: string | null;
  refund: string | null;
  notes: string | null;
  debitTotal: number;
  creditTotal: number;
  difference: number;
  isBalanced: boolean;
  lineCount: number;
  postedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JournalEntryDetailDTO = JournalEntryDTO & {
  lines: JournalEntryLineDTO[];
};

export type AccountingVoucherDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  accountId: string | null;
  accountCode: string | null;
  createdByUserId: string;
  createdByName: string;
  type: VoucherTypeValue;
  typeLabel: string;
  status: VoucherStatusValue;
  statusLabel: string;
  voucherNumber: string;
  voucherDate: string;
  beneficiary: string;
  concept: string;
  bank: string | null;
  reference: string | null;
  amount: number;
  debit: number;
  credit: number;
  total: number;
  currency: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  accountId: string | null;
  accountCode: string | null;
  voucherId: string | null;
  voucherNumber: string | null;
  createdByUserId: string;
  createdByName: string;
  reviewedByName: string | null;
  category: ExpenseCategoryValue;
  categoryLabel: string;
  status: ExpenseStatusValue;
  statusLabel: string;
  expenseDate: string;
  supplier: string;
  concept: string;
  taxId: string | null;
  invoiceNumber: string | null;
  amount: number;
  subtotal: number;
  tax: number;
  retention1: number;
  retention2: number;
  total: number;
  currency: string | null;
  bank: string | null;
  reference: string | null;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PayrollRecordDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  createdByUserId: string;
  createdByName: string;
  employeeName: string;
  position: string | null;
  period: string;
  status: PayrollStatusValue;
  statusLabel: string;
  baseSalary: number;
  commissions: number;
  bonuses: number;
  deductions: number;
  advances: number;
  netPay: number;
  currency: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * The ONLY cost-bearing DTO. Built exclusively by
 * `toAccountingInventoryCostDTO`, and only after the caller passed
 * `canViewAccountingCosts`.
 */
export type AccountingInventoryCostDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  catalogModelId: string | null;
  modelSlug: string;
  modelName: string;
  unitCost: number;
  minimumStock: number;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BankAccountDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  bankName: string;
  accountNumber: string;
  currency: string;
  balance: number;
  notes: string | null;
  isActive: boolean;
  reconciliationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BankReconciliationDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  bankAccountId: string;
  bankName: string;
  accountNumber: string;
  accountingDocumentId: string | null;
  accountingDocumentNumber: string | null;
  accountingDocumentTotal: number | null;
  reconciledByName: string | null;
  status: BankReconciliationStatusValue;
  statusLabel: string;
  movementDate: string;
  relatedDocument: string | null;
  paymentMethod: string | null;
  reference: string | null;
  amount: number;
  /** Derived: movement amount minus the linked document total, when linked. */
  difference: number | null;
  currency: string | null;
  notes: string | null;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountingClosingDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  closedByName: string | null;
  reviewedByName: string | null;
  period: string;
  status: AccountingClosingStatusValue;
  statusLabel: string;
  incomeTotal: number;
  expenseTotal: number;
  retentionTotal: number;
  appliedTotal: number;
  cashTotal: number;
  difference: number;
  currency: string | null;
  notes: string | null;
  closedAt: string | null;
  reviewedAt: string | null;
  reopenedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Reports are always derived from persisted records — there is no report
 * entity.
 *
 * `inventoryUnitCostTotal` is the sum of the registered unit costs, not a stock
 * valuation: the accounting module stores no on-hand quantity. It is `null`
 * unless the caller passed `canViewAccountingCosts`.
 */
export type ContabilidadDashboardSummaryDTO = {
  documentCount: number;
  draftDocumentCount: number;
  pendingReviewCount: number;
  pendingPostingCount: number;
  pendingReconciliationCount: number;
  cancelledDocumentCount: number;
  documentTotal: number;
  retentionTotal: number;
  journalEntryCount: number;
  unbalancedDraftEntryCount: number;
  journalDebitTotal: number;
  journalCreditTotal: number;
  journalDifference: number;
  voucherCount: number;
  expenseCount: number;
  expenseTotal: number;
  pendingExpenseReviewCount: number;
  payrollNetTotal: number;
  bankBalanceTotal: number;
  pendingReconciliationItems: number;
  openClosingCount: number;
  /** Only for Admin, Contador and (own branch) Gerente. */
  inventoryUnitCostTotal: number | null;
};

// --- Serialization and sanitizers ----------------------------------------

/**
 * Patch TD-01: these helpers used to be defined here and, byte for byte, again
 * in Caja. They now live once in `@/server/finance/money` and
 * `@/server/finance/text`, and are re-exported under their historical
 * Contabilidad names, so every call site is unchanged and the behaviour is
 * identical.
 */
export {
  dateToISOString,
  decimalToNumber,
  parseFinancialDate as parseAccountingDate,
  roundFinancialMoney as roundAccountingMoney,
  sanitizeFinancialCurrency as sanitizeAccountingCurrency,
  sanitizeFinancialMoney as sanitizeAccountingMoney,
  sanitizeSignedFinancialMoney as sanitizeSignedAccountingMoney,
} from "@/server/finance/money";
export { sanitizeFinancialText as sanitizeAccountingText } from "@/server/finance/text";

/** Accounting periods are `YYYY-MM`, matching the current closing records. */
export function isValidAccountingPeriod(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

export function sanitizeAccountingPeriod(
  value: string | null | undefined,
): string | null {
  const clean = sanitizeFinancialText(value, 7);
  return clean && isValidAccountingPeriod(clean) ? clean : null;
}

export function sanitizeMinimumStock(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) return null;
  return value;
}

// --- Calculation helpers -------------------------------------------------

export function calculateJournalDebitTotal(
  lines: Array<{ debit: number }>,
): number {
  return roundAccountingMoney(
    lines.reduce((sum, line) => sum + line.debit, 0),
  );
}

export function calculateJournalCreditTotal(
  lines: Array<{ credit: number }>,
): number {
  return roundAccountingMoney(
    lines.reduce((sum, line) => sum + line.credit, 0),
  );
}

/** Positive when debit exceeds credit. Zero means the entry balances. */
export function calculateJournalDifference(
  lines: Array<{ debit: number; credit: number }>,
): number {
  return roundAccountingMoney(
    calculateJournalDebitTotal(lines) - calculateJournalCreditTotal(lines),
  );
}

/**
 * A posted entry must balance. Drafts may be unbalanced, which mirrors the
 * current panel: it flags an unbalanced row but never blocks saving it.
 */
export function isJournalEntryBalanced(
  lines: Array<{ debit: number; credit: number }>,
): boolean {
  return Math.abs(calculateJournalDifference(lines)) < 0.005;
}

/** Mirrors the current expense form: subtotal + tax - retentions, floor 0. */
export function calculateExpenseTotal(input: {
  subtotal: number;
  tax?: number;
  retention1?: number;
  retention2?: number;
}): number {
  return roundAccountingMoney(
    Math.max(
      input.subtotal +
        (input.tax ?? 0) -
        (input.retention1 ?? 0) -
        (input.retention2 ?? 0),
      0,
    ),
  );
}

/** Mirrors the current document form: subtotal - abono - retentions, floor 0. */
export function calculateAccountingDocumentTotal(input: {
  subtotal: number;
  appliedPayment?: number;
  retention1?: number;
  retention2?: number;
}): number {
  return roundAccountingMoney(
    Math.max(
      input.subtotal -
        (input.appliedPayment ?? 0) -
        (input.retention1 ?? 0) -
        (input.retention2 ?? 0),
      0,
    ),
  );
}

export function calculatePayrollNetPay(input: {
  baseSalary: number;
  commissions?: number;
  bonuses?: number;
  deductions?: number;
  advances?: number;
}): number {
  return roundAccountingMoney(
    Math.max(
      input.baseSalary +
        (input.commissions ?? 0) +
        (input.bonuses ?? 0) -
        (input.deductions ?? 0) -
        (input.advances ?? 0),
      0,
    ),
  );
}

/**
 * Reconciliation difference is derived from persisted records: the movement
 * amount against the linked accounting document total. There is no bank
 * statement ledger in this module, so there is no external "bank amount" to
 * compare against — an unlinked movement has no derivable difference.
 */
export function calculateReconciliationDifference(
  amount: number,
  documentTotal: number | null,
): number | null {
  if (documentTotal === null) return null;
  return roundAccountingMoney(amount - documentTotal);
}

export function reconciliationStatusForDifference(
  difference: number | null,
): BankReconciliationStatusValue {
  if (difference === null) return "CONCILIADO";
  return Math.abs(difference) < 0.005 ? "CONCILIADO" : "DIFERENCIA";
}

/** Mirrors the current closing record: received cash against invoiced income. */
export function calculateAccountingClosingDifference(input: {
  cashTotal: number;
  incomeTotal: number;
}): number {
  return roundAccountingMoney(input.cashTotal - input.incomeTotal);
}
