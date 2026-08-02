import type { Prisma } from "@prisma/client";

import type { ContabilidadScope } from "@/server/auth/access";
import {
  accountingClosingStatusLabels,
  accountingDocumentOriginLabels,
  accountingDocumentStatusLabels,
  accountingDocumentTypeLabels,
  bankReconciliationStatusLabels,
  calculateJournalCreditTotal,
  calculateJournalDebitTotal,
  calculateJournalDifference,
  calculateReconciliationDifference,
  dateToISOString,
  decimalToNumber,
  expenseCategoryLabels,
  expenseStatusLabels,
  isJournalEntryBalanced,
  journalEntrySourceLabels,
  journalEntryStatusLabels,
  payrollStatusLabels,
  roundAccountingMoney,
  thirdPartyTypeLabels,
  voucherStatusLabels,
  voucherTypeLabels,
  type AccountingClosingDTO,
  type AccountingClosingStatusValue,
  type AccountingDocumentDTO,
  type AccountingDocumentOriginValue,
  type AccountingDocumentStatusValue,
  type AccountingDocumentTypeValue,
  type AccountingInventoryCostDTO,
  type AccountingVoucherDTO,
  type BankAccountDTO,
  type BankReconciliationDTO,
  type BankReconciliationStatusValue,
  type ContabilidadDashboardSummaryDTO,
  type ExpenseCategoryValue,
  type ExpenseDTO,
  type ExpenseStatusValue,
  type JournalEntryDTO,
  type JournalEntryDetailDTO,
  type JournalEntryLineDTO,
  type JournalEntrySourceValue,
  type JournalEntryStatusValue,
  type PayrollRecordDTO,
  type PayrollStatusValue,
  type ThirdPartyDTO,
  type ThirdPartyTypeValue,
  type VoucherStatusValue,
  type VoucherTypeValue,
} from "@/server/contabilidad/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  findAccountWithRelations,
  listAccounts,
} from "@/server/finance/chart-of-accounts/repository";
import {
  toChartAccountDTO,
  type ChartAccountDTO,
  type ChartAccountFilters,
} from "@/server/finance/chart-of-accounts/shared";

/**
 * Role-scoped Contabilidad reads (Patch 3.5B).
 *
 * Two gates, never one:
 *
 *  - `ledgerEnabled(scope)` — the accounting ledger (chart of accounts,
 *    journals, vouchers, documents, expenses, payroll, banks, reconciliations,
 *    closings, third parties) is `global` only. A Manager's `branchReadOnly`
 *    scope reads NONE of it, per ROLES.md: "los diarios, comprobantes y
 *    documentos globales quedan reservados para Contador y Administrador".
 *  - `branchConstraint(scope)` — valued inventory and the dashboard summary
 *    accept a Manager, filtered to their own branch.
 *
 * Every optional client filter is ANDed with the server-derived scope; an
 * unknown branch or a blocked scope yields no rows, never an unfiltered query.
 * The cost-bearing inventory queries additionally require the caller to have
 * passed `canViewAccountingCosts` — they take an explicit `allowCosts` flag so
 * the decision cannot be forgotten at the call site.
 */

const LIST_LIMIT = 200;

// --- Scope plumbing ------------------------------------------------------

/** The ledger is Accountant/Admin territory. */
function ledgerEnabled(scope: ContabilidadScope): boolean {
  return isDatabaseConfigured() && scope.level === "global";
}

async function resolveBranchIdByCode(branchCode: string): Promise<string | null> {
  const branch = await getPrisma().branch.findUnique({
    where: { code: branchCode },
    select: { id: true },
  });
  return branch?.id ?? null;
}

/**
 * `undefined` -> no branch constraint (global). `null` -> impossible constraint
 * (unknown branch or blocked scope): the caller must return an empty result.
 */
async function branchConstraint(
  scope: ContabilidadScope,
  requestedBranchCode?: string,
): Promise<string | null | undefined> {
  if (!isDatabaseConfigured()) return null;
  if (scope.level === "none") return null;

  if (scope.level === "branchReadOnly") {
    // A branch-scoped reader may never widen past their own branch.
    if (requestedBranchCode && requestedBranchCode !== scope.branchCode) {
      return null;
    }
    return resolveBranchIdByCode(scope.branchCode);
  }

  if (!requestedBranchCode) return undefined;
  return resolveBranchIdByCode(requestedBranchCode);
}

// --- Includes and row types ----------------------------------------------

const thirdPartyInclude = {
  branch: true,
  _count: { select: { accountingDocuments: true } },
} satisfies Prisma.ThirdPartyInclude;

const documentInclude = {
  branch: true,
  createdBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
  postedBy: { select: { name: true } },
  reconciledBy: { select: { name: true } },
  cancelledBy: { select: { name: true } },
  customer: { select: { name: true } },
  sale: { select: { saleNumber: true } },
  reservation: { select: { reservationNumber: true } },
  cashDocument: { select: { documentNumber: true } },
} satisfies Prisma.AccountingDocumentInclude;

const journalLineInclude = {
  account: { select: { code: true, name: true } },
} satisfies Prisma.JournalEntryLineInclude;

const journalEntryInclude = {
  branch: true,
  createdBy: { select: { name: true } },
  postedBy: { select: { name: true } },
  accountingDocument: { select: { documentNumber: true } },
  reversalOf: { select: { id: true, entryNumber: true } },
  reversal: { select: { id: true, entryNumber: true } },
  lines: { include: journalLineInclude, orderBy: [{ position: "asc" }] },
} satisfies Prisma.JournalEntryInclude;

const voucherInclude = {
  branch: true,
  account: { select: { code: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.AccountingVoucherInclude;

const expenseInclude = {
  branch: true,
  account: { select: { code: true } },
  voucher: { select: { voucherNumber: true } },
  createdBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.ExpenseInclude;

const payrollInclude = {
  branch: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.PayrollRecordInclude;

const inventoryCostInclude = {
  branch: true,
} satisfies Prisma.AccountingInventoryCostInclude;

const bankAccountInclude = {
  branch: true,
  _count: { select: { reconciliations: true } },
} satisfies Prisma.BankAccountInclude;

const reconciliationInclude = {
  branch: true,
  bankAccount: { select: { bankName: true, accountNumber: true } },
  accountingDocument: { select: { documentNumber: true, total: true } },
  reconciledBy: { select: { name: true } },
} satisfies Prisma.BankReconciliationInclude;

const closingInclude = {
  branch: true,
  closedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
} satisfies Prisma.AccountingClosingInclude;

type ThirdPartyRow = Prisma.ThirdPartyGetPayload<{ include: typeof thirdPartyInclude }>;
type DocumentRow = Prisma.AccountingDocumentGetPayload<{ include: typeof documentInclude }>;
type JournalEntryRow = Prisma.JournalEntryGetPayload<{ include: typeof journalEntryInclude }>;
type JournalLineRow = Prisma.JournalEntryLineGetPayload<{ include: typeof journalLineInclude }>;
type VoucherRow = Prisma.AccountingVoucherGetPayload<{ include: typeof voucherInclude }>;
type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;
type PayrollRow = Prisma.PayrollRecordGetPayload<{ include: typeof payrollInclude }>;
type InventoryCostRow = Prisma.AccountingInventoryCostGetPayload<{ include: typeof inventoryCostInclude }>;
type BankAccountRow = Prisma.BankAccountGetPayload<{ include: typeof bankAccountInclude }>;
type ReconciliationRow = Prisma.BankReconciliationGetPayload<{ include: typeof reconciliationInclude }>;
type ClosingRow = Prisma.AccountingClosingGetPayload<{ include: typeof closingInclude }>;

// --- Filters -------------------------------------------------------------

export type { ChartAccountFilters };

export type ThirdPartyFilters = {
  type?: ThirdPartyTypeValue;
  branchCode?: string;
  isActive?: boolean;
};

export type AccountingDocumentFilters = {
  type?: AccountingDocumentTypeValue;
  status?: AccountingDocumentStatusValue;
  origin?: AccountingDocumentOriginValue;
  branchCode?: string;
  thirdPartyId?: string;
  /** Caja-origin documents only, for the hand-off review screens. */
  linkedToCaja?: boolean;
};

export type JournalEntryFilters = {
  status?: JournalEntryStatusValue;
  source?: JournalEntrySourceValue;
  branchCode?: string;
  accountingDocumentId?: string;
};

export type AccountingVoucherFilters = {
  type?: VoucherTypeValue;
  status?: VoucherStatusValue;
  branchCode?: string;
};

export type ExpenseFilters = {
  category?: ExpenseCategoryValue;
  status?: ExpenseStatusValue;
  branchCode?: string;
};

export type PayrollRecordFilters = {
  status?: PayrollStatusValue;
  branchCode?: string;
  period?: string;
};

export type AccountingInventoryCostFilters = {
  branchCode?: string;
  catalogModelId?: string;
};

export type BankAccountFilters = {
  branchCode?: string;
  isActive?: boolean;
};

export type BankReconciliationFilters = {
  status?: BankReconciliationStatusValue;
  branchCode?: string;
  bankAccountId?: string;
};

export type AccountingClosingFilters = {
  status?: AccountingClosingStatusValue;
  branchCode?: string;
  period?: string;
};

// --- Access probes (used by the actions) ---------------------------------

export async function canAccessAccountingDocument(
  scope: ContabilidadScope,
  documentId: string,
): Promise<boolean> {
  if (!ledgerEnabled(scope)) return false;
  const row = await getPrisma().accountingDocument.findUnique({
    where: { id: documentId },
    select: { id: true },
  });
  return Boolean(row);
}

export async function canAccessJournalEntry(
  scope: ContabilidadScope,
  entryId: string,
): Promise<boolean> {
  if (!ledgerEnabled(scope)) return false;
  const row = await getPrisma().journalEntry.findUnique({
    where: { id: entryId },
    select: { id: true },
  });
  return Boolean(row);
}

// --- Chart of accounts ---------------------------------------------------

/**
 * A full chart of accounts is a few hundred rows and is read as a tree, so the
 * 200-row `LIST_LIMIT` used by transactional lists would silently truncate the
 * catalogue and hide whole branches. It gets its own, larger ceiling.
 */
const CHART_ACCOUNT_LIST_LIMIT = 1_000;

export async function listChartAccounts(
  scope: ContabilidadScope,
  filters: ChartAccountFilters = {},
): Promise<ChartAccountDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const rows = await listAccounts(
    getPrisma(),
    filters,
    CHART_ACCOUNT_LIST_LIMIT,
  );
  const now = new Date();
  return rows.map((row) => toChartAccountDTO(row, now));
}

export async function getChartAccountDetail(
  scope: ContabilidadScope,
  accountId: string,
): Promise<ChartAccountDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await findAccountWithRelations(getPrisma(), accountId);
  return row ? toChartAccountDTO(row) : null;
}

// --- Third parties -------------------------------------------------------

export async function listThirdParties(
  scope: ContabilidadScope,
  filters: ThirdPartyFilters = {},
): Promise<ThirdPartyDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().thirdParty.findMany({
    where: { branchId, type: filters.type, isActive: filters.isActive },
    include: thirdPartyInclude,
    orderBy: { name: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapThirdParty);
}

export async function getThirdPartyDetail(
  scope: ContabilidadScope,
  thirdPartyId: string,
): Promise<ThirdPartyDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().thirdParty.findUnique({
    where: { id: thirdPartyId },
    include: thirdPartyInclude,
  });
  return row ? mapThirdParty(row) : null;
}

// --- Accounting documents ------------------------------------------------

export async function listAccountingDocuments(
  scope: ContabilidadScope,
  filters: AccountingDocumentFilters = {},
): Promise<AccountingDocumentDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().accountingDocument.findMany({
    where: {
      branchId,
      type: filters.type,
      status: filters.status,
      origin: filters.origin,
      thirdPartyId: filters.thirdPartyId,
      ...(filters.linkedToCaja ? { cashDocumentId: { not: null } } : {}),
    },
    include: documentInclude,
    orderBy: { documentDate: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapDocument);
}

export async function getAccountingDocumentDetail(
  scope: ContabilidadScope,
  documentId: string,
): Promise<AccountingDocumentDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().accountingDocument.findUnique({
    where: { id: documentId },
    include: documentInclude,
  });
  return row ? mapDocument(row) : null;
}

/**
 * Caja integration readiness: the accounting documents that already reference a
 * Caja/CRM record. Read-only — nothing here imports or transforms a Caja row.
 */
export async function listCajaLinkedAccountingDocuments(
  scope: ContabilidadScope,
): Promise<AccountingDocumentDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const rows = await getPrisma().accountingDocument.findMany({
    where: {
      OR: [
        { cashDocumentId: { not: null } },
        { cashClosingId: { not: null } },
        { saleId: { not: null } },
        { reservationId: { not: null } },
        { customerId: { not: null } },
      ],
    },
    include: documentInclude,
    orderBy: { documentDate: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapDocument);
}

// --- Journal entries -----------------------------------------------------

export async function listJournalEntries(
  scope: ContabilidadScope,
  filters: JournalEntryFilters = {},
): Promise<JournalEntryDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().journalEntry.findMany({
    where: {
      branchId,
      status: filters.status,
      source: filters.source,
      accountingDocumentId: filters.accountingDocumentId,
    },
    include: journalEntryInclude,
    orderBy: { entryDate: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapJournalEntry);
}

export async function getJournalEntryDetail(
  scope: ContabilidadScope,
  entryId: string,
): Promise<JournalEntryDetailDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().journalEntry.findUnique({
    where: { id: entryId },
    include: journalEntryInclude,
  });
  if (!row) return null;
  return { ...mapJournalEntry(row), lines: row.lines.map(mapJournalLine) };
}

// --- Vouchers ------------------------------------------------------------

export async function listAccountingVouchers(
  scope: ContabilidadScope,
  filters: AccountingVoucherFilters = {},
): Promise<AccountingVoucherDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().accountingVoucher.findMany({
    where: { branchId, type: filters.type, status: filters.status },
    include: voucherInclude,
    orderBy: { voucherDate: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapVoucher);
}

export async function getAccountingVoucherDetail(
  scope: ContabilidadScope,
  voucherId: string,
): Promise<AccountingVoucherDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().accountingVoucher.findUnique({
    where: { id: voucherId },
    include: voucherInclude,
  });
  return row ? mapVoucher(row) : null;
}

// --- Expenses ------------------------------------------------------------

export async function listExpenses(
  scope: ContabilidadScope,
  filters: ExpenseFilters = {},
): Promise<ExpenseDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().expense.findMany({
    where: { branchId, category: filters.category, status: filters.status },
    include: expenseInclude,
    orderBy: { expenseDate: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapExpense);
}

export async function getExpenseDetail(
  scope: ContabilidadScope,
  expenseId: string,
): Promise<ExpenseDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().expense.findUnique({
    where: { id: expenseId },
    include: expenseInclude,
  });
  return row ? mapExpense(row) : null;
}

// --- Payroll -------------------------------------------------------------

export async function listPayrollRecords(
  scope: ContabilidadScope,
  filters: PayrollRecordFilters = {},
): Promise<PayrollRecordDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().payrollRecord.findMany({
    where: { branchId, status: filters.status, period: filters.period },
    include: payrollInclude,
    orderBy: [{ period: "desc" }, { employeeName: "asc" }],
    take: LIST_LIMIT,
  });
  return rows.map(mapPayroll);
}

export async function getPayrollRecordDetail(
  scope: ContabilidadScope,
  payrollRecordId: string,
): Promise<PayrollRecordDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().payrollRecord.findUnique({
    where: { id: payrollRecordId },
    include: payrollInclude,
  });
  return row ? mapPayroll(row) : null;
}

// --- Accounting inventory costs (cost-bearing) ---------------------------

/**
 * `allowCosts` must come from `canViewAccountingCosts(role)`. Admin and
 * Contador read globally; a Gerente reads their own branch only, which the
 * scope already enforces. A false flag returns no rows at all — the cost never
 * leaves the server.
 */
export async function listAccountingInventoryCosts(
  scope: ContabilidadScope,
  allowCosts: boolean,
  filters: AccountingInventoryCostFilters = {},
): Promise<AccountingInventoryCostDTO[]> {
  if (!allowCosts || !isDatabaseConfigured()) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().accountingInventoryCost.findMany({
    where: { branchId, catalogModelId: filters.catalogModelId },
    include: inventoryCostInclude,
    orderBy: { modelName: "asc" },
    take: LIST_LIMIT,
  });
  return rows.map(toAccountingInventoryCostDTO);
}

export async function getAccountingInventoryCostDetail(
  scope: ContabilidadScope,
  allowCosts: boolean,
  costId: string,
): Promise<AccountingInventoryCostDTO | null> {
  if (!allowCosts || !isDatabaseConfigured()) return null;
  const branchId = await branchConstraint(scope);
  if (branchId === null) return null;

  const row = await getPrisma().accountingInventoryCost.findFirst({
    where: { id: costId, branchId },
    include: inventoryCostInclude,
  });
  return row ? toAccountingInventoryCostDTO(row) : null;
}

// --- Banks and reconciliations -------------------------------------------

export async function listBankAccounts(
  scope: ContabilidadScope,
  filters: BankAccountFilters = {},
): Promise<BankAccountDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().bankAccount.findMany({
    where: { branchId, isActive: filters.isActive },
    include: bankAccountInclude,
    orderBy: [{ bankName: "asc" }, { accountNumber: "asc" }],
    take: LIST_LIMIT,
  });
  return rows.map(mapBankAccount);
}

export async function getBankAccountDetail(
  scope: ContabilidadScope,
  bankAccountId: string,
): Promise<BankAccountDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().bankAccount.findUnique({
    where: { id: bankAccountId },
    include: bankAccountInclude,
  });
  return row ? mapBankAccount(row) : null;
}

export async function listBankReconciliations(
  scope: ContabilidadScope,
  filters: BankReconciliationFilters = {},
): Promise<BankReconciliationDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().bankReconciliation.findMany({
    where: {
      branchId,
      status: filters.status,
      bankAccountId: filters.bankAccountId,
    },
    include: reconciliationInclude,
    orderBy: { movementDate: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapReconciliation);
}

export async function getBankReconciliationDetail(
  scope: ContabilidadScope,
  reconciliationId: string,
): Promise<BankReconciliationDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().bankReconciliation.findUnique({
    where: { id: reconciliationId },
    include: reconciliationInclude,
  });
  return row ? mapReconciliation(row) : null;
}

// --- Closings ------------------------------------------------------------

export async function listAccountingClosings(
  scope: ContabilidadScope,
  filters: AccountingClosingFilters = {},
): Promise<AccountingClosingDTO[]> {
  if (!ledgerEnabled(scope)) return [];
  const branchId = await branchConstraint(scope, filters.branchCode);
  if (branchId === null) return [];

  const rows = await getPrisma().accountingClosing.findMany({
    where: { branchId, status: filters.status, period: filters.period },
    include: closingInclude,
    orderBy: { period: "desc" },
    take: LIST_LIMIT,
  });
  return rows.map(mapClosing);
}

export async function getAccountingClosingDetail(
  scope: ContabilidadScope,
  closingId: string,
): Promise<AccountingClosingDTO | null> {
  if (!ledgerEnabled(scope)) return null;
  const row = await getPrisma().accountingClosing.findUnique({
    where: { id: closingId },
    include: closingInclude,
  });
  return row ? mapClosing(row) : null;
}

// --- Dashboard -----------------------------------------------------------

const emptySummary: ContabilidadDashboardSummaryDTO = {
  documentCount: 0,
  draftDocumentCount: 0,
  pendingReviewCount: 0,
  pendingPostingCount: 0,
  pendingReconciliationCount: 0,
  cancelledDocumentCount: 0,
  documentTotal: 0,
  retentionTotal: 0,
  journalEntryCount: 0,
  unbalancedDraftEntryCount: 0,
  journalDebitTotal: 0,
  journalCreditTotal: 0,
  journalDifference: 0,
  voucherCount: 0,
  expenseCount: 0,
  expenseTotal: 0,
  pendingExpenseReviewCount: 0,
  payrollNetTotal: 0,
  bankBalanceTotal: 0,
  pendingReconciliationItems: 0,
  openClosingCount: 0,
  inventoryUnitCostTotal: null,
};

/**
 * Every figure is derived from persisted records; no report entity exists.
 *
 * A Manager reaches this with `branchReadOnly` scope and therefore sees only
 * the inventory valuation of their own branch — the ledger counters stay zero,
 * matching ROLES.md.
 */
export async function getContabilidadDashboardSummary(
  scope: ContabilidadScope,
  allowCosts: boolean,
): Promise<ContabilidadDashboardSummaryDTO> {
  if (!isDatabaseConfigured() || scope.level === "none") return emptySummary;

  const branchId = await branchConstraint(scope);
  if (branchId === null) return emptySummary;

  const prisma = getPrisma();

  const inventoryUnitCostTotal = allowCosts
    ? await prisma.accountingInventoryCost
        .aggregate({ where: { branchId }, _sum: { unitCost: true } })
        .then((result) => decimalToNumber(result._sum.unitCost))
    : null;

  if (!ledgerEnabled(scope)) {
    return { ...emptySummary, inventoryUnitCostTotal };
  }

  const [
    documentGroups,
    documentTotals,
    entries,
    voucherCount,
    expenseGroups,
    expenseTotals,
    payrollTotals,
    bankTotals,
    pendingReconciliationItems,
    openClosingCount,
  ] = await Promise.all([
    prisma.accountingDocument.groupBy({
      by: ["status"],
      where: { branchId },
      _count: { _all: true },
    }),
    prisma.accountingDocument.aggregate({
      where: { branchId, status: { not: "ANULADO" } },
      _sum: { total: true, retention1: true, retention2: true },
    }),
    prisma.journalEntry.findMany({
      where: { branchId },
      select: {
        status: true,
        lines: { select: { debit: true, credit: true } },
      },
      take: LIST_LIMIT,
    }),
    prisma.accountingVoucher.count({ where: { branchId } }),
    prisma.expense.groupBy({
      by: ["status"],
      where: { branchId },
      _count: { _all: true },
    }),
    prisma.expense.aggregate({ where: { branchId }, _sum: { total: true } }),
    prisma.payrollRecord.aggregate({
      where: { branchId },
      _sum: { netPay: true },
    }),
    prisma.bankAccount.aggregate({
      where: { branchId, isActive: true },
      _sum: { balance: true },
    }),
    prisma.bankReconciliation.count({
      where: { branchId, status: "PENDIENTE" },
    }),
    prisma.accountingClosing.count({
      where: { branchId, status: { in: ["ABIERTO", "EN_REVISION"] } },
    }),
  ]);

  const documentsFor = (status: AccountingDocumentStatusValue) =>
    documentGroups.find((group) => group.status === status)?._count._all ?? 0;
  const expensesFor = (status: ExpenseStatusValue) =>
    expenseGroups.find((group) => group.status === status)?._count._all ?? 0;

  const entryLines = entries.flatMap((entry) =>
    entry.lines.map((line) => ({
      credit: decimalToNumber(line.credit),
      debit: decimalToNumber(line.debit),
    })),
  );
  const unbalancedDraftEntryCount = entries.filter(
    (entry) =>
      entry.status === "BORRADOR" &&
      !isJournalEntryBalanced(
        entry.lines.map((line) => ({
          credit: decimalToNumber(line.credit),
          debit: decimalToNumber(line.debit),
        })),
      ),
  ).length;

  return {
    documentCount: documentGroups.reduce(
      (sum, group) => sum + group._count._all,
      0,
    ),
    draftDocumentCount: documentsFor("BORRADOR"),
    pendingReviewCount: documentsFor("EMITIDO"),
    pendingPostingCount: documentsFor("REVISADO"),
    pendingReconciliationCount: documentsFor("CONTABILIZADO"),
    cancelledDocumentCount: documentsFor("ANULADO"),
    documentTotal: decimalToNumber(documentTotals._sum.total),
    retentionTotal: roundAccountingMoney(
      decimalToNumber(documentTotals._sum.retention1) +
        decimalToNumber(documentTotals._sum.retention2),
    ),
    journalEntryCount: entries.length,
    unbalancedDraftEntryCount,
    journalDebitTotal: calculateJournalDebitTotal(entryLines),
    journalCreditTotal: calculateJournalCreditTotal(entryLines),
    journalDifference: calculateJournalDifference(entryLines),
    voucherCount,
    expenseCount: expenseGroups.reduce(
      (sum, group) => sum + group._count._all,
      0,
    ),
    expenseTotal: decimalToNumber(expenseTotals._sum.total),
    pendingExpenseReviewCount: expensesFor("REGISTRADO"),
    payrollNetTotal: decimalToNumber(payrollTotals._sum.netPay),
    bankBalanceTotal: decimalToNumber(bankTotals._sum.balance),
    pendingReconciliationItems,
    openClosingCount,
    inventoryUnitCostTotal,
  };
}

// --- Mappers -------------------------------------------------------------

function mapThirdParty(row: ThirdPartyRow): ThirdPartyDTO {
  const type = row.type as ThirdPartyTypeValue;
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    customerId: row.customerId,
    type,
    typeLabel: thirdPartyTypeLabels[type] ?? row.type,
    name: row.name,
    taxId: row.taxId,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    isActive: row.isActive,
    documentCount: row._count.accountingDocuments,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapDocument(row: DocumentRow): AccountingDocumentDTO {
  const type = row.type as AccountingDocumentTypeValue;
  const status = row.status as AccountingDocumentStatusValue;
  const origin = row.origin as AccountingDocumentOriginValue;
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    thirdPartyId: row.thirdPartyId,
    cashDocumentId: row.cashDocumentId,
    cashDocumentNumber: row.cashDocument?.documentNumber ?? null,
    cashClosingId: row.cashClosingId,
    saleId: row.saleId,
    saleNumber: row.sale?.saleNumber ?? null,
    reservationId: row.reservationId,
    reservationNumber: row.reservation?.reservationNumber ?? null,
    customerId: row.customerId,
    customerName: row.customer?.name ?? null,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy.name,
    reviewedByName: row.reviewedBy?.name ?? null,
    postedByName: row.postedBy?.name ?? null,
    reconciledByName: row.reconciledBy?.name ?? null,
    cancelledByName: row.cancelledBy?.name ?? null,
    type,
    typeLabel: accountingDocumentTypeLabels[type] ?? row.type,
    status,
    statusLabel: accountingDocumentStatusLabels[status] ?? row.status,
    origin,
    originLabel: accountingDocumentOriginLabels[origin] ?? row.origin,
    documentNumber: row.documentNumber,
    documentDate: row.documentDate.toISOString(),
    thirdPartyName: row.thirdPartyName,
    taxId: row.taxId,
    concept: row.concept,
    sourceDocument: row.sourceDocument,
    subtotal: decimalToNumber(row.subtotal),
    retention1: decimalToNumber(row.retention1),
    retention2: decimalToNumber(row.retention2),
    appliedPayment: decimalToNumber(row.appliedPayment),
    total: decimalToNumber(row.total),
    currency: row.currency,
    paymentMethod: row.paymentMethod,
    bank: row.bank,
    reference: row.reference,
    motorcycleDescription: row.motorcycleDescription,
    notes: row.notes,
    accountingNotes: row.accountingNotes,
    cancelReason: row.cancelReason,
    reviewedAt: dateToISOString(row.reviewedAt),
    postedAt: dateToISOString(row.postedAt),
    reconciledAt: dateToISOString(row.reconciledAt),
    cancelledAt: dateToISOString(row.cancelledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapJournalLine(row: JournalLineRow): JournalEntryLineDTO {
  return {
    id: row.id,
    entryId: row.entryId,
    accountId: row.accountId,
    accountCode: row.account.code,
    accountName: row.account.name,
    concept: row.concept,
    debit: decimalToNumber(row.debit),
    credit: decimalToNumber(row.credit),
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapJournalEntry(row: JournalEntryRow): JournalEntryDTO {
  const status = row.status as JournalEntryStatusValue;
  const source = row.source as JournalEntrySourceValue;
  const lines = row.lines.map((line) => ({
    credit: decimalToNumber(line.credit),
    debit: decimalToNumber(line.debit),
  }));
  return {
    id: row.id,
    branchCode: row.branch?.code ?? null,
    branchName: row.branch?.name ?? null,
    accountingDocumentId: row.accountingDocumentId,
    accountingDocumentNumber: row.accountingDocument?.documentNumber ?? null,
    reversalOfId: row.reversalOfId,
    reversalOfEntryNumber: row.reversalOf?.entryNumber ?? null,
    reversalEntryId: row.reversal?.id ?? null,
    reversalEntryNumber: row.reversal?.entryNumber ?? null,
    isReversal: Boolean(row.reversalOfId),
    hasReversal: Boolean(row.reversal),
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy.name,
    postedByName: row.postedBy?.name ?? null,
    entryNumber: row.entryNumber,
    entryDate: row.entryDate.toISOString(),
    status,
    statusLabel: journalEntryStatusLabels[status] ?? row.status,
    source,
    sourceLabel: journalEntrySourceLabels[source] ?? row.source,
    invoiceNumber: row.invoiceNumber,
    customerCode: row.customerCode,
    supplier: row.supplier,
    taxId: row.taxId,
    taxBase: decimalToNumber(row.taxBase),
    bank: row.bank,
    bankPaymentReference: row.bankPaymentReference,
    reconciliation: row.reconciliation,
    retention: row.retention,
    retentionDate: dateToISOString(row.retentionDate),
    refund: row.refund,
    notes: row.notes,
    debitTotal: calculateJournalDebitTotal(lines),
    creditTotal: calculateJournalCreditTotal(lines),
    difference: calculateJournalDifference(lines),
    isBalanced: isJournalEntryBalanced(lines),
    lineCount: lines.length,
    postedAt: dateToISOString(row.postedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapVoucher(row: VoucherRow): AccountingVoucherDTO {
  const type = row.type as VoucherTypeValue;
  const status = row.status as VoucherStatusValue;
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    accountId: row.accountId,
    accountCode: row.account?.code ?? null,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy.name,
    type,
    typeLabel: voucherTypeLabels[type] ?? row.type,
    status,
    statusLabel: voucherStatusLabels[status] ?? row.status,
    voucherNumber: row.voucherNumber,
    voucherDate: row.voucherDate.toISOString(),
    beneficiary: row.beneficiary,
    concept: row.concept,
    bank: row.bank,
    reference: row.reference,
    amount: decimalToNumber(row.amount),
    debit: decimalToNumber(row.debit),
    credit: decimalToNumber(row.credit),
    total: decimalToNumber(row.total),
    currency: row.currency,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapExpense(row: ExpenseRow): ExpenseDTO {
  const category = row.category as ExpenseCategoryValue;
  const status = row.status as ExpenseStatusValue;
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    accountId: row.accountId,
    accountCode: row.account?.code ?? null,
    voucherId: row.voucherId,
    voucherNumber: row.voucher?.voucherNumber ?? null,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy.name,
    reviewedByName: row.reviewedBy?.name ?? null,
    category,
    categoryLabel: expenseCategoryLabels[category] ?? row.category,
    status,
    statusLabel: expenseStatusLabels[status] ?? row.status,
    expenseDate: row.expenseDate.toISOString(),
    supplier: row.supplier,
    concept: row.concept,
    taxId: row.taxId,
    invoiceNumber: row.invoiceNumber,
    amount: decimalToNumber(row.amount),
    subtotal: decimalToNumber(row.subtotal),
    tax: decimalToNumber(row.tax),
    retention1: decimalToNumber(row.retention1),
    retention2: decimalToNumber(row.retention2),
    total: decimalToNumber(row.total),
    currency: row.currency,
    bank: row.bank,
    reference: row.reference,
    notes: row.notes,
    reviewedAt: dateToISOString(row.reviewedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPayroll(row: PayrollRow): PayrollRecordDTO {
  const status = row.status as PayrollStatusValue;
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy.name,
    employeeName: row.employeeName,
    position: row.position,
    period: row.period,
    status,
    statusLabel: payrollStatusLabels[status] ?? row.status,
    baseSalary: decimalToNumber(row.baseSalary),
    commissions: decimalToNumber(row.commissions),
    bonuses: decimalToNumber(row.bonuses),
    deductions: decimalToNumber(row.deductions),
    advances: decimalToNumber(row.advances),
    netPay: decimalToNumber(row.netPay),
    currency: row.currency,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The single place an acquisition cost is serialized for a client. */
function toAccountingInventoryCostDTO(
  row: InventoryCostRow,
): AccountingInventoryCostDTO {
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    catalogModelId: row.catalogModelId,
    modelSlug: row.modelSlug,
    modelName: row.modelName,
    unitCost: decimalToNumber(row.unitCost),
    minimumStock: row.minimumStock,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapBankAccount(row: BankAccountRow): BankAccountDTO {
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    currency: row.currency,
    balance: decimalToNumber(row.balance),
    notes: row.notes,
    isActive: row.isActive,
    reconciliationCount: row._count.reconciliations,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReconciliation(row: ReconciliationRow): BankReconciliationDTO {
  const status = row.status as BankReconciliationStatusValue;
  const amount = decimalToNumber(row.amount);
  const documentTotal = row.accountingDocument
    ? decimalToNumber(row.accountingDocument.total)
    : null;
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    bankAccountId: row.bankAccountId,
    bankName: row.bankAccount.bankName,
    accountNumber: row.bankAccount.accountNumber,
    accountingDocumentId: row.accountingDocumentId,
    accountingDocumentNumber: row.accountingDocument?.documentNumber ?? null,
    accountingDocumentTotal: documentTotal,
    reconciledByName: row.reconciledBy?.name ?? null,
    status,
    statusLabel: bankReconciliationStatusLabels[status] ?? row.status,
    movementDate: row.movementDate.toISOString(),
    relatedDocument: row.relatedDocument,
    paymentMethod: row.paymentMethod,
    reference: row.reference,
    amount,
    difference: calculateReconciliationDifference(amount, documentTotal),
    currency: row.currency,
    notes: row.notes,
    reconciledAt: dateToISOString(row.reconciledAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapClosing(row: ClosingRow): AccountingClosingDTO {
  const status = row.status as AccountingClosingStatusValue;
  return {
    id: row.id,
    branchCode: row.branch.code,
    branchName: row.branch.name,
    closedByName: row.closedBy?.name ?? null,
    reviewedByName: row.reviewedBy?.name ?? null,
    period: row.period,
    status,
    statusLabel: accountingClosingStatusLabels[status] ?? row.status,
    incomeTotal: decimalToNumber(row.incomeTotal),
    expenseTotal: decimalToNumber(row.expenseTotal),
    retentionTotal: decimalToNumber(row.retentionTotal),
    appliedTotal: decimalToNumber(row.appliedTotal),
    cashTotal: decimalToNumber(row.cashTotal),
    difference: decimalToNumber(row.difference),
    currency: row.currency,
    notes: row.notes,
    closedAt: dateToISOString(row.closedAt),
    reviewedAt: dateToISOString(row.reviewedAt),
    reopenedAt: dateToISOString(row.reopenedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
