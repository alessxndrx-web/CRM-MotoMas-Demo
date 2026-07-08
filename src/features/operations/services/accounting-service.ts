"use client";

import {
  ACCOUNTING_DOCUMENTS_STORAGE_KEY,
  ACCOUNTING_EXPENSES_STORAGE_KEY,
  ACCOUNTING_BANKS_STORAGE_KEY,
  ACCOUNTING_CHART_ACCOUNTS_STORAGE_KEY,
  ACCOUNTING_CLOSURES_STORAGE_KEY,
  ACCOUNTING_INVENTORY_COSTS_STORAGE_KEY,
  ACCOUNTING_JOURNAL_ENTRIES_STORAGE_KEY,
  ACCOUNTING_PAYROLL_STORAGE_KEY,
  ACCOUNTING_RECONCILIATIONS_STORAGE_KEY,
  ACCOUNTING_THIRD_PARTIES_STORAGE_KEY,
  ACCOUNTING_VOUCHERS_STORAGE_KEY,
  createDemoAccountingDocuments,
  createDemoAccountingClosures,
  createDemoBankAccounts,
  createDemoChartAccounts,
  createDemoExpenses,
  createDemoInventoryCosts,
  createDemoJournalEntries,
  createDemoPayroll,
  createDemoReconciliations,
  createDemoThirdParties,
  createDemoVouchers,
  isAccountNature,
  isAccountingAccountType,
  isAccountingClosureStatus,
  isAccountingDocumentOrigin,
  isAccountingDocumentType,
  isAccountingDocumentState,
  isBankReconciliationStatus,
  isExpenseCategory,
  isJournalEntryStatus,
  isPayrollStatus,
  isThirdPartyType,
  isVoucherType,
  normalizeNumber,
  normalizeString,
  type AccountingBankAccount,
  type AccountingChartAccount,
  type AccountingClosure,
  type AccountingDocument,
  type AccountingExpense,
  type AccountingInventoryCost,
  type AccountingJournalEntry,
  type AccountingPayrollRecord,
  type AccountingReconciliation,
  type AccountingThirdParty,
  type AccountingVoucher,
} from "@/data/operations/accounting";
import { desiredBranches, type DesiredBranchId } from "@/data/operations/leads";
import { isDemoDataEnabled } from "@/shared/lib/demo-mode";

export function readJournalEntries() {
  return readRecords(
    ACCOUNTING_JOURNAL_ENTRIES_STORAGE_KEY,
    createDemoJournalEntries,
    normalizeJournalEntry,
  );
}

export function writeJournalEntries(entries: AccountingJournalEntry[]) {
  writeRecords(ACCOUNTING_JOURNAL_ENTRIES_STORAGE_KEY, entries);
}

export function addJournalEntry(
  entries: AccountingJournalEntry[],
  input: Omit<AccountingJournalEntry, "id">,
) {
  const nextEntry: AccountingJournalEntry = {
    ...input,
    id: `JRN-${Date.now()}`,
  };
  const nextEntries = [nextEntry, ...entries];
  writeJournalEntries(nextEntries);
  return nextEntries;
}

export function readVouchers() {
  return readRecords(
    ACCOUNTING_VOUCHERS_STORAGE_KEY,
    createDemoVouchers,
    normalizeVoucher,
  );
}

export function writeVouchers(vouchers: AccountingVoucher[]) {
  writeRecords(ACCOUNTING_VOUCHERS_STORAGE_KEY, vouchers);
}

export function addVoucher(
  vouchers: AccountingVoucher[],
  input: Omit<AccountingVoucher, "id">,
) {
  const nextVoucher: AccountingVoucher = { ...input, id: `VCH-${Date.now()}` };
  const nextVouchers = [nextVoucher, ...vouchers];
  writeVouchers(nextVouchers);
  return nextVouchers;
}

export function readAccountingDocuments() {
  return readRecords(
    ACCOUNTING_DOCUMENTS_STORAGE_KEY,
    createDemoAccountingDocuments,
    normalizeAccountingDocument,
  );
}

export function writeAccountingDocuments(documents: AccountingDocument[]) {
  writeRecords(ACCOUNTING_DOCUMENTS_STORAGE_KEY, documents);
}

export function addAccountingDocument(
  documents: AccountingDocument[],
  input: Omit<AccountingDocument, "id">,
) {
  const nextDocument: AccountingDocument = { ...input, id: `DOC-${Date.now()}` };
  const nextDocuments = [nextDocument, ...documents];
  writeAccountingDocuments(nextDocuments);
  return nextDocuments;
}

export function updateAccountingDocuments(documents: AccountingDocument[]) {
  writeAccountingDocuments(documents);
  return documents;
}

export function readExpenses() {
  return readRecords(
    ACCOUNTING_EXPENSES_STORAGE_KEY,
    createDemoExpenses,
    normalizeExpense,
  );
}

export function writeExpenses(expenses: AccountingExpense[]) {
  writeRecords(ACCOUNTING_EXPENSES_STORAGE_KEY, expenses);
}

export function addExpense(
  expenses: AccountingExpense[],
  input: Omit<AccountingExpense, "id">,
) {
  const nextExpense: AccountingExpense = { ...input, id: `EXP-${Date.now()}` };
  const nextExpenses = [nextExpense, ...expenses];
  writeExpenses(nextExpenses);
  return nextExpenses;
}

export function readPayrollRecords() {
  return readRecords(
    ACCOUNTING_PAYROLL_STORAGE_KEY,
    createDemoPayroll,
    normalizePayrollRecord,
  );
}

export function writePayrollRecords(records: AccountingPayrollRecord[]) {
  writeRecords(ACCOUNTING_PAYROLL_STORAGE_KEY, records);
}

export function addPayrollRecord(
  records: AccountingPayrollRecord[],
  input: Omit<AccountingPayrollRecord, "id" | "netoPagar">,
) {
  const nextRecord: AccountingPayrollRecord = {
    ...input,
    id: `PAY-${Date.now()}`,
    netoPagar:
      input.salarioBase +
      input.comisiones +
      input.bonos -
      input.deducciones -
      input.anticipos,
  };
  const nextRecords = [nextRecord, ...records];
  writePayrollRecords(nextRecords);
  return nextRecords;
}

export function readInventoryCosts() {
  return readRecords(
    ACCOUNTING_INVENTORY_COSTS_STORAGE_KEY,
    createDemoInventoryCosts,
    normalizeInventoryCost,
  );
}

export function writeInventoryCosts(costs: AccountingInventoryCost[]) {
  writeRecords(ACCOUNTING_INVENTORY_COSTS_STORAGE_KEY, costs);
}

export function readChartAccounts() {
  return readRecords(
    ACCOUNTING_CHART_ACCOUNTS_STORAGE_KEY,
    createDemoChartAccounts,
    normalizeChartAccount,
  );
}

export function writeChartAccounts(accounts: AccountingChartAccount[]) {
  writeRecords(ACCOUNTING_CHART_ACCOUNTS_STORAGE_KEY, accounts);
}

export function readBankAccounts() {
  return readRecords(
    ACCOUNTING_BANKS_STORAGE_KEY,
    createDemoBankAccounts,
    normalizeBankAccount,
  );
}

export function writeBankAccounts(accounts: AccountingBankAccount[]) {
  writeRecords(ACCOUNTING_BANKS_STORAGE_KEY, accounts);
}

export function readReconciliations() {
  return readRecords(
    ACCOUNTING_RECONCILIATIONS_STORAGE_KEY,
    createDemoReconciliations,
    normalizeReconciliation,
  );
}

export function writeReconciliations(records: AccountingReconciliation[]) {
  writeRecords(ACCOUNTING_RECONCILIATIONS_STORAGE_KEY, records);
}

export function readAccountingClosures() {
  return readRecords(
    ACCOUNTING_CLOSURES_STORAGE_KEY,
    createDemoAccountingClosures,
    normalizeAccountingClosure,
  );
}

export function writeAccountingClosures(closures: AccountingClosure[]) {
  writeRecords(ACCOUNTING_CLOSURES_STORAGE_KEY, closures);
}

export function readThirdParties() {
  return readRecords(
    ACCOUNTING_THIRD_PARTIES_STORAGE_KEY,
    createDemoThirdParties,
    normalizeThirdParty,
  );
}

export function writeThirdParties(parties: AccountingThirdParty[]) {
  writeRecords(ACCOUNTING_THIRD_PARTIES_STORAGE_KEY, parties);
}

function readRecords<T>(
  key: string,
  seed: () => T[],
  normalize: (value: unknown) => T | null,
) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      if (!isDemoDataEnabled()) return [];
      const seedRecords = seed();
      writeRecords(key, seedRecords);
      return seedRecords;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return isDemoDataEnabled() ? resetRecords(key, seed) : [];
    const records = parsed
      .map((record) => normalize(record))
      .filter((record): record is T => Boolean(record));

    if (!records.length) return isDemoDataEnabled() ? resetRecords(key, seed) : [];
    return records;
  } catch {
    return isDemoDataEnabled() ? resetRecords(key, seed) : [];
  }
}

function writeRecords<T>(key: string, records: T[]) {
  window.localStorage.setItem(key, JSON.stringify(records));
}

function resetRecords<T>(key: string, seed: () => T[]) {
  const seedRecords = seed();
  writeRecords(key, seedRecords);
  return seedRecords;
}

function normalizeJournalEntry(value: unknown): AccountingJournalEntry | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingJournalEntry>;

  if (typeof candidate.id !== "string") return null;

  return {
    id: candidate.id,
    factura: normalizeString(candidate.factura),
    fecha: normalizeString(candidate.fecha),
    codigoCliente: normalizeString(candidate.codigoCliente),
    proveedor: normalizeString(candidate.proveedor),
    ruc: normalizeString(candidate.ruc),
    asiento: normalizeString(candidate.asiento),
    cuentaContable: normalizeString(candidate.cuentaContable),
    conceptoContable: normalizeString(candidate.conceptoContable),
    debe: normalizeNumber(candidate.debe),
    haber: normalizeNumber(candidate.haber),
    refPagoBanco: normalizeString(candidate.refPagoBanco),
    conciliacion: normalizeString(candidate.conciliacion),
    banco: normalizeString(candidate.banco),
    retencion: normalizeString(candidate.retencion),
    fechaRetencion: normalizeString(candidate.fechaRetencion),
    reembolso: normalizeString(candidate.reembolso),
    observaciones: normalizeString(candidate.observaciones),
    baseImpositiva: normalizeNumber(candidate.baseImpositiva),
    estado:
      typeof candidate.estado === "string" && isJournalEntryStatus(candidate.estado)
        ? candidate.estado
        : "Borrador",
  };
}

function normalizeVoucher(value: unknown): AccountingVoucher | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingVoucher>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.tipo !== "string" ||
    !isVoucherType(candidate.tipo)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    tipo: candidate.tipo,
    numero: normalizeString(candidate.numero),
    fecha: normalizeString(candidate.fecha),
    beneficiario: normalizeString(candidate.beneficiario),
    concepto: normalizeString(candidate.concepto),
    banco: normalizeString(candidate.banco),
    referencia: normalizeString(candidate.referencia),
    monto: normalizeNumber(candidate.monto),
    cuentaContable: normalizeString(candidate.cuentaContable),
    debe: normalizeNumber(candidate.debe || candidate.monto),
    haber: normalizeNumber(candidate.haber || candidate.monto),
    total: normalizeNumber(candidate.total || candidate.monto),
    creadoPor: normalizeString(candidate.creadoPor) || "Contador General",
    fechaCreacion: normalizeString(candidate.fechaCreacion || candidate.fecha),
    estado:
      candidate.estado === "Conciliado" || candidate.estado === "Anulado"
        ? candidate.estado
        : "Registrado",
    observaciones: normalizeString(candidate.observaciones),
  };
}

function normalizeExpense(value: unknown): AccountingExpense | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingExpense>;
  const branch = getBranch(candidate.sucursalId);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.categoria !== "string" ||
    !isExpenseCategory(candidate.categoria) ||
    !branch
  ) {
    return null;
  }

  return {
    id: candidate.id,
    categoria: candidate.categoria,
    fecha: normalizeString(candidate.fecha),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    proveedor: normalizeString(candidate.proveedor),
    concepto: normalizeString(candidate.concepto),
    monto: normalizeNumber(candidate.monto || candidate.total || candidate.subtotal),
    ruc: normalizeString(candidate.ruc),
    factura: normalizeString(candidate.factura),
    subtotal: normalizeNumber(candidate.subtotal || candidate.monto),
    iva: normalizeNumber(candidate.iva),
    retencion1: normalizeNumber(candidate.retencion1),
    retencion2: normalizeNumber(candidate.retencion2),
    total: normalizeNumber(candidate.total || candidate.monto),
    banco: normalizeString(candidate.banco),
    referencia: normalizeString(candidate.referencia),
    cuentaContable: normalizeString(candidate.cuentaContable),
    comprobante: normalizeString(candidate.comprobante),
    estado: candidate.estado === "Revisado" ? "Revisado" : "Registrado",
    observaciones: normalizeString(candidate.observaciones),
  };
}

function normalizeAccountingDocument(value: unknown): AccountingDocument | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingDocument>;
  const branch = getBranch(candidate.sucursalId);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.tipo !== "string" ||
    !isAccountingDocumentType(candidate.tipo)
  ) {
    return null;
  }

  const subtotal = normalizeNumber(candidate.subtotal || (candidate as { monto?: number }).monto);
  const retencion1 = normalizeNumber(candidate.retencion1);
  const retencion2 = normalizeNumber(candidate.retencion2);
  const abono = normalizeNumber(candidate.abono);
  const total =
    normalizeNumber(candidate.total) ||
    Math.max(subtotal - abono - retencion1 - retencion2, 0);

  return {
    id: candidate.id,
    tipo: candidate.tipo,
    numero: normalizeString(candidate.numero),
    fecha: normalizeString(candidate.fecha),
    tercero: normalizeString(candidate.tercero),
    ruc: normalizeString(candidate.ruc),
    sucursalId: branch?.id ?? "central",
    sucursalNombre: branch?.name ?? "Central",
    concepto: normalizeString(candidate.concepto || (candidate as { descripcion?: string }).descripcion),
    documentoOrigen: normalizeString(candidate.documentoOrigen),
    subtotal,
    retencion1,
    retencion2,
    abono,
    total,
    estado: normalizeAccountingDocumentState(candidate.estado),
    observaciones: normalizeString(candidate.observaciones),
    creadoPor: normalizeString(candidate.creadoPor) || "Contador General",
    revisadoPor: normalizeString(candidate.revisadoPor),
    fechaRevision: normalizeString(candidate.fechaRevision),
    motivoAnulacion: normalizeString(candidate.motivoAnulacion),
    formaPago: normalizeString(candidate.formaPago),
    banco: normalizeString(candidate.banco),
    referencia: normalizeString(candidate.referencia),
    descripcionMoto: Array.isArray(candidate.descripcionMoto)
      ? candidate.descripcionMoto.filter(
          (line): line is string => typeof line === "string",
        )
      : [],
    origen: normalizeAccountingDocumentOrigin(candidate),
    fechaCreacion: normalizeString(candidate.fechaCreacion) || normalizeString(candidate.fecha),
    contabilizadoPor: normalizeString(candidate.contabilizadoPor),
    fechaContabilizacion: normalizeString(candidate.fechaContabilizacion),
    conciliadoPor: normalizeString(candidate.conciliadoPor),
    fechaConciliacion: normalizeString(candidate.fechaConciliacion),
    anuladoPor: normalizeString(candidate.anuladoPor),
    fechaAnulacion: normalizeString(candidate.fechaAnulacion),
    observacionesContables: normalizeString(candidate.observacionesContables),
  };
}

function normalizeAccountingDocumentState(value: unknown): AccountingDocument["estado"] {
  if (typeof value === "string" && isAccountingDocumentState(value)) {
    return value;
  }

  if (value === "Pendiente") return "Borrador";
  if (value === "Registrado") return "Emitido";
  if (value === "Revisado") return "Revisado";
  return "Borrador";
}

function normalizeAccountingDocumentOrigin(
  candidate: Partial<AccountingDocument>,
): AccountingDocument["origen"] {
  if (
    typeof candidate.origen === "string" &&
    isAccountingDocumentOrigin(candidate.origen)
  ) {
    return candidate.origen;
  }

  const originText = `${candidate.id ?? ""} ${candidate.documentoOrigen ?? ""}`;
  return originText.includes("DOC-CASH") || originText.includes("Caja /")
    ? "Caja"
    : "Contabilidad demo";
}

function normalizePayrollRecord(value: unknown): AccountingPayrollRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingPayrollRecord>;
  const branch = getBranch(candidate.sucursalId);

  if (typeof candidate.id !== "string" || !branch) return null;

  const salarioBase = normalizeNumber(candidate.salarioBase);
  const comisiones = normalizeNumber(candidate.comisiones);
  const bonos = normalizeNumber(candidate.bonos);
  const deducciones = normalizeNumber(candidate.deducciones);
  const anticipos = normalizeNumber(candidate.anticipos);

  return {
    id: candidate.id,
    empleado: normalizeString(candidate.empleado),
    cargo: normalizeString(candidate.cargo),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    salarioBase,
    comisiones,
    bonos,
    deducciones,
    anticipos,
    netoPagar: salarioBase + comisiones + bonos - deducciones - anticipos,
    periodo: normalizeString(candidate.periodo),
    estado:
      typeof candidate.estado === "string" && isPayrollStatus(candidate.estado)
        ? candidate.estado
        : "Borrador",
    observaciones: normalizeString(candidate.observaciones),
  };
}

function normalizeInventoryCost(value: unknown): AccountingInventoryCost | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingInventoryCost>;
  const branch = getBranch(candidate.sucursalId);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.modeloSlug !== "string" ||
    typeof candidate.modelo !== "string" ||
    !branch
  ) {
    return null;
  }

  return {
    id: candidate.id,
    modeloSlug: candidate.modeloSlug,
    modelo: candidate.modelo,
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    costoUnitario: normalizeNumber(candidate.costoUnitario),
    saldoMinimo: normalizeNumber(candidate.saldoMinimo),
    fechaActualizacion: normalizeString(candidate.fechaActualizacion),
  };
}

function normalizeChartAccount(value: unknown): AccountingChartAccount | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingChartAccount>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.tipo !== "string" ||
    !isAccountingAccountType(candidate.tipo) ||
    typeof candidate.naturaleza !== "string" ||
    !isAccountNature(candidate.naturaleza)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    codigo: normalizeString(candidate.codigo),
    nombre: normalizeString(candidate.nombre),
    tipo: candidate.tipo,
    naturaleza: candidate.naturaleza,
    cuentaPadre: normalizeString(candidate.cuentaPadre),
    estado: candidate.estado === "Inactiva" ? "Inactiva" : "Activa",
    descripcion: normalizeString(candidate.descripcion),
  };
}

function normalizeBankAccount(value: unknown): AccountingBankAccount | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingBankAccount>;
  const branch = getBranch(candidate.sucursalId);

  if (typeof candidate.id !== "string" || !branch) return null;

  return {
    id: candidate.id,
    banco: normalizeString(candidate.banco),
    cuentaBancaria: normalizeString(candidate.cuentaBancaria),
    moneda: candidate.moneda === "NIO" ? "NIO" : "USD",
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    saldoDemo: normalizeNumber(candidate.saldoDemo),
    estado: candidate.estado === "Inactiva" ? "Inactiva" : "Activa",
    observaciones: normalizeString(candidate.observaciones),
  };
}

function normalizeReconciliation(value: unknown): AccountingReconciliation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingReconciliation>;
  const branch = getBranch(candidate.sucursalId);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.estado !== "string" ||
    !isBankReconciliationStatus(candidate.estado) ||
    !branch
  ) {
    return null;
  }

  return {
    id: candidate.id,
    banco: normalizeString(candidate.banco),
    cuentaBancaria: normalizeString(candidate.cuentaBancaria),
    referencia: normalizeString(candidate.referencia),
    formaPago: normalizeString(candidate.formaPago),
    documentoRelacionado: normalizeString(candidate.documentoRelacionado),
    monto: normalizeNumber(candidate.monto),
    estado: candidate.estado,
    observacion: normalizeString(candidate.observacion),
    fecha: normalizeString(candidate.fecha),
    fechaConciliacion: normalizeString(candidate.fechaConciliacion),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
  };
}

function normalizeAccountingClosure(value: unknown): AccountingClosure | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingClosure>;
  const branch = getBranch(candidate.sucursalId);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.estado !== "string" ||
    !isAccountingClosureStatus(candidate.estado) ||
    !branch
  ) {
    return null;
  }

  return {
    id: candidate.id,
    periodo: normalizeString(candidate.periodo),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    totalIngresos: normalizeNumber(candidate.totalIngresos),
    totalEgresos: normalizeNumber(candidate.totalEgresos),
    totalRetenciones: normalizeNumber(candidate.totalRetenciones),
    totalAbonos: normalizeNumber(candidate.totalAbonos),
    totalCaja: normalizeNumber(candidate.totalCaja),
    diferencias: normalizeNumber(candidate.diferencias),
    estado: candidate.estado,
    observaciones: normalizeString(candidate.observaciones),
  };
}

function normalizeThirdParty(value: unknown): AccountingThirdParty | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<AccountingThirdParty>;
  const branch = getBranch(candidate.sucursalId);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.tipo !== "string" ||
    !isThirdPartyType(candidate.tipo) ||
    !branch
  ) {
    return null;
  }

  return {
    id: candidate.id,
    tipo: candidate.tipo,
    nombre: normalizeString(candidate.nombre),
    rucCedula: normalizeString(candidate.rucCedula),
    telefono: normalizeString(candidate.telefono),
    correo: normalizeString(candidate.correo),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    saldoRelacionado: normalizeNumber(candidate.saldoRelacionado),
    documentosAsociados: normalizeNumber(candidate.documentosAsociados),
  };
}

function getBranch(branchId: unknown) {
  return desiredBranches.find((branch) => branch.id === branchId) ?? null;
}
