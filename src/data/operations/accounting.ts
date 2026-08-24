import { motorcycles } from "@/data/catalog/motorcycles";
import {
  desiredBranches,
  type DesiredBranchId,
} from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const ACCOUNTING_JOURNAL_ENTRIES_STORAGE_KEY =
  storageKeys.accountingJournalEntries;
export const ACCOUNTING_VOUCHERS_STORAGE_KEY = storageKeys.accountingVouchers;
export const ACCOUNTING_DOCUMENTS_STORAGE_KEY = storageKeys.accountingDocuments;
export const ACCOUNTING_EXPENSES_STORAGE_KEY = storageKeys.accountingExpenses;
export const ACCOUNTING_PAYROLL_STORAGE_KEY = storageKeys.accountingPayroll;
export const ACCOUNTING_INVENTORY_COSTS_STORAGE_KEY =
  storageKeys.accountingInventoryCosts;
export const ACCOUNTING_CHART_ACCOUNTS_STORAGE_KEY =
  storageKeys.accountingChartAccounts;
export const ACCOUNTING_BANKS_STORAGE_KEY = storageKeys.accountingBanks;
export const ACCOUNTING_RECONCILIATIONS_STORAGE_KEY =
  storageKeys.accountingReconciliations;
export const ACCOUNTING_CLOSURES_STORAGE_KEY = storageKeys.accountingClosures;
export const ACCOUNTING_THIRD_PARTIES_STORAGE_KEY =
  storageKeys.accountingThirdParties;

export const voucherTypes = [
  "Ingreso",
  "Egreso",
  "Cheque",
  "Transferencia",
  "Reembolso",
  "Ajuste",
] as const;

export const expenseCategories = [
  "Combustible",
  "Compras varias",
  "Servicios básicos",
  "Mantenimiento",
  "Papelería",
  "Viáticos",
  "Repuestos internos",
  "Gastos administrativos",
  "Otros",
] as const;

export const accountingDocumentTypes = [
  "Factura",
  "Nota de Débito",
  "Nota de Crédito",
  "Recibo Oficial de Caja",
] as const;

export const accountingDocumentStates = [
  "Borrador",
  "Emitido",
  "Revisado",
  "Contabilizado",
  "Conciliado",
  "Anulado",
] as const;

export const accountingDocumentOrigins = ["Caja", "Contabilidad"] as const;

export const payrollStatuses = ["Borrador", "Preparada", "Pagada"] as const;

export const accountingAccountTypes = [
  "Activo",
  "Pasivo",
  "Patrimonio",
  "Ingreso",
  "Gasto",
  "Costo",
] as const;

export const accountNatures = ["Deudora", "Acreedora"] as const;

export const journalEntryStatuses = [
  "Borrador",
  "Contabilizado",
  "Conciliado",
  "Anulado",
] as const;

export const bankReconciliationStatuses = [
  "Pendiente",
  "Conciliado",
  "Diferencia",
  "Anulado",
] as const;

export const accountingClosureStatuses = [
  "Abierto",
  "En revision",
  "Cerrado",
  "Reabierto",
] as const;

export const thirdPartyTypes = ["Cliente", "Proveedor", "Empleado"] as const;

export type VoucherType = (typeof voucherTypes)[number];
export type ExpenseCategory = (typeof expenseCategories)[number];
export type AccountingDocumentType = (typeof accountingDocumentTypes)[number];
export type AccountingDocumentState = (typeof accountingDocumentStates)[number];
export type AccountingDocumentOrigin = (typeof accountingDocumentOrigins)[number];
export type PayrollStatus = (typeof payrollStatuses)[number];
export type AccountingAccountType = (typeof accountingAccountTypes)[number];
export type AccountNature = (typeof accountNatures)[number];
export type JournalEntryStatus = (typeof journalEntryStatuses)[number];
export type BankReconciliationStatus =
  (typeof bankReconciliationStatuses)[number];
export type AccountingClosureStatus = (typeof accountingClosureStatuses)[number];
export type ThirdPartyType = (typeof thirdPartyTypes)[number];

export type AccountingChartAccount = {
  id: string;
  codigo: string;
  nombre: string;
  tipo: AccountingAccountType;
  naturaleza: AccountNature;
  cuentaPadre: string;
  estado: "Activa" | "Inactiva";
  descripcion: string;
};

export type AccountingJournalEntry = {
  id: string;
  factura: string;
  fecha: string;
  codigoCliente: string;
  proveedor: string;
  ruc: string;
  asiento: string;
  cuentaContable: string;
  conceptoContable: string;
  debe: number;
  haber: number;
  refPagoBanco: string;
  conciliacion: string;
  banco: string;
  retencion: string;
  fechaRetencion: string;
  reembolso: string;
  observaciones: string;
  baseImpositiva: number;
  estado: JournalEntryStatus;
};

export type AccountingVoucher = {
  id: string;
  tipo: VoucherType;
  numero: string;
  fecha: string;
  beneficiario: string;
  concepto: string;
  banco: string;
  referencia: string;
  monto: number;
  cuentaContable: string;
  debe: number;
  haber: number;
  total: number;
  creadoPor: string;
  fechaCreacion: string;
  estado: "Registrado" | "Conciliado" | "Anulado";
  observaciones: string;
};

export type AccountingExpense = {
  id: string;
  categoria: ExpenseCategory;
  fecha: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  proveedor: string;
  concepto: string;
  monto: number;
  ruc: string;
  factura: string;
  subtotal: number;
  iva: number;
  retencion1: number;
  retencion2: number;
  total: number;
  banco: string;
  referencia: string;
  cuentaContable: string;
  comprobante: string;
  estado: "Registrado" | "Revisado";
  observaciones: string;
};

export type AccountingDocument = {
  id: string;
  tipo: AccountingDocumentType;
  numero: string;
  fecha: string;
  tercero: string;
  ruc: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  concepto: string;
  documentoOrigen: string;
  subtotal: number;
  retencion1: number;
  retencion2: number;
  abono: number;
  total: number;
  estado: AccountingDocumentState;
  observaciones: string;
  creadoPor: string;
  revisadoPor: string;
  fechaRevision: string;
  motivoAnulacion: string;
  formaPago: string;
  banco: string;
  referencia: string;
  descripcionMoto: string[];
  origen: AccountingDocumentOrigin;
  fechaCreacion: string;
  contabilizadoPor: string;
  fechaContabilizacion: string;
  conciliadoPor: string;
  fechaConciliacion: string;
  anuladoPor: string;
  fechaAnulacion: string;
  observacionesContables: string;
};

export type AccountingPayrollRecord = {
  id: string;
  empleado: string;
  cargo: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  salarioBase: number;
  comisiones: number;
  bonos: number;
  deducciones: number;
  anticipos: number;
  netoPagar: number;
  periodo: string;
  estado: PayrollStatus;
  observaciones: string;
};

export type AccountingInventoryCost = {
  id: string;
  modeloSlug: string;
  modelo: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  costoUnitario: number;
  saldoMinimo: number;
  fechaActualizacion: string;
};

export type AccountingBankAccount = {
  id: string;
  banco: string;
  cuentaBancaria: string;
  moneda: "USD" | "NIO";
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  saldoDemo: number;
  estado: "Activa" | "Inactiva";
  observaciones: string;
};

export type AccountingReconciliation = {
  id: string;
  banco: string;
  cuentaBancaria: string;
  referencia: string;
  formaPago: string;
  documentoRelacionado: string;
  monto: number;
  estado: BankReconciliationStatus;
  observacion: string;
  fecha: string;
  fechaConciliacion: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
};

export type AccountingClosure = {
  id: string;
  periodo: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  totalIngresos: number;
  totalEgresos: number;
  totalRetenciones: number;
  totalAbonos: number;
  totalCaja: number;
  diferencias: number;
  estado: AccountingClosureStatus;
  observaciones: string;
};

export type AccountingThirdParty = {
  id: string;
  tipo: ThirdPartyType;
  nombre: string;
  rucCedula: string;
  telefono: string;
  correo: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  saldoRelacionado: number;
  documentosAsociados: number;
};

export const motorcycleInvoiceDescriptionFields = [
  "MARCA:",
  "MODELO:",
  "CHASIS:",
  "MOTOR:",
  "COLOR:",
  "AÑO:",
  "CASCO:",
  "PÓLIZA:",
  "CILINDRAJE:",
] as const;

export type MotorcycleInvoiceDescriptionField =
  (typeof motorcycleInvoiceDescriptionFields)[number];

export function buildMotorcycleInvoiceDescription(
  values: Partial<Record<MotorcycleInvoiceDescriptionField, string>> = {},
) {
  return motorcycleInvoiceDescriptionFields.map((field) => {
    const value = values[field]?.trim();
    return value ? `${field} ${value}` : field;
  });
}

export function createDemoJournalEntries(): AccountingJournalEntry[] {
  return [
    {
      id: "JRN-202606-001",
      factura: "FAC-001245",
      fecha: "2026-06-05",
      codigoCliente: "CLI-DEMO-001",
      proveedor: "MotoMas Central",
      ruc: "J0310000000000",
      asiento: "AS-202606-001",
      cuentaContable: "1101-01 Caja general",
      conceptoContable: "Registro demo de ingreso por venta",
      debe: 0,
      haber: 1850,
      refPagoBanco: "BAN-001",
      conciliacion: "Pendiente",
      banco: "Banco demo",
      retencion: "",
      fechaRetencion: "",
      reembolso: "",
      observaciones: "Asiento demo para validar estructura contable.",
      baseImpositiva: 1850,
      estado: "Borrador",
    },
  ];
}

export function createDemoVouchers(): AccountingVoucher[] {
  return [
    {
      id: "VCH-202606-001",
      tipo: "Ingreso",
      numero: "ING-0001",
      fecha: "2026-06-05",
      beneficiario: "Cliente demo",
      concepto: "Abono recibido por proceso comercial",
      banco: "Banco demo",
      referencia: "DEP-001",
      monto: 500,
      cuentaContable: "1101-01 Caja general",
      debe: 500,
      haber: 500,
      total: 500,
      creadoPor: "Contador General",
      fechaCreacion: "2026-06-05",
      estado: "Registrado",
      observaciones: "Comprobante demo sin efecto fiscal.",
    },
  ];
}

export function createDemoExpenses(): AccountingExpense[] {
  return [
    {
      id: "EXP-202606-001",
      categoria: "Combustible",
      fecha: "2026-06-07",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      proveedor: "Proveedor demo",
      concepto: "Combustible para gestiones operativas",
      monto: 120,
      ruc: "J0310000000000",
      factura: "FAC-GTO-0001",
      subtotal: 120,
      iva: 0,
      retencion1: 1.2,
      retencion2: 0,
      total: 118.8,
      banco: "Banco demo",
      referencia: "TRX-GTO-001",
      cuentaContable: "6101-01 Combustible",
      comprobante: "REC-0001",
      estado: "Registrado",
      observaciones: "Gasto demo para validacion.",
    },
  ];
}

export function createDemoAccountingDocuments(): AccountingDocument[] {
  return [
    {
      id: "DOC-202606-001",
      tipo: "Factura",
      numero: "FAC-DEMO-001",
      fecha: "2026-06-08",
      tercero: "Cliente demo",
      ruc: "0010101010000A",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      concepto: "Factura demo de motocicleta para revisión contable.",
      documentoOrigen: "EXP-DEMO-001",
      subtotal: 1850,
      retencion1: 0,
      retencion2: 0,
      abono: 500,
      total: 1350,
      estado: "Borrador",
      observaciones: "Documento demo sin emisión fiscal ni PDF.",
      creadoPor: "Contador General",
      revisadoPor: "",
      fechaRevision: "",
      motivoAnulacion: "",
      formaPago: "Transferencia",
      banco: "Banco demo",
      referencia: "DEP-001",
      descripcionMoto: buildMotorcycleInvoiceDescription({
        "MARCA:": "Bajaj",
        "MODELO:": "Pulsar NS200",
        "CHASIS:": "CHASIS-DEMO-001",
        "MOTOR:": "MOTOR-DEMO-001",
        "COLOR:": "Negro",
        "AÑO:": "2026",
        "CASCO:": "Pendiente",
        "PÓLIZA:": "Pendiente",
        "CILINDRAJE:": "200 cc",
      }),
      origen: "Contabilidad",
      fechaCreacion: "2026-06-08",
      contabilizadoPor: "",
      fechaContabilizacion: "",
      conciliadoPor: "",
      fechaConciliacion: "",
      anuladoPor: "",
      fechaAnulacion: "",
      observacionesContables: "",
    },
    {
      id: "DOC-202606-002",
      tipo: "Nota de Débito",
      numero: "ND-DEMO-001",
      fecha: "2026-06-09",
      tercero: "Cliente demo",
      ruc: "0010101010000A",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      concepto: "Ajuste demo relacionado con factura.",
      documentoOrigen: "FAC-DEMO-001",
      subtotal: 75,
      retencion1: 0,
      retencion2: 0,
      abono: 0,
      total: 75,
      estado: "Emitido",
      observaciones: "Nota de débito base para revisión.",
      creadoPor: "Contador General",
      revisadoPor: "",
      fechaRevision: "",
      motivoAnulacion: "",
      formaPago: "",
      banco: "",
      referencia: "",
      descripcionMoto: [],
      origen: "Contabilidad",
      fechaCreacion: "2026-06-09",
      contabilizadoPor: "",
      fechaContabilizacion: "",
      conciliadoPor: "",
      fechaConciliacion: "",
      anuladoPor: "",
      fechaAnulacion: "",
      observacionesContables: "",
    },
    {
      id: "DOC-202606-003",
      tipo: "Nota de Crédito",
      numero: "NC-DEMO-001",
      fecha: "2026-06-10",
      tercero: "Cliente demo",
      ruc: "0010101010000A",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      concepto: "Crédito demo relacionado con factura.",
      documentoOrigen: "FAC-DEMO-001",
      subtotal: 50,
      retencion1: 0,
      retencion2: 0,
      abono: 0,
      total: 50,
      estado: "Revisado",
      observaciones: "Nota de crédito base para revisión.",
      creadoPor: "Contador General",
      revisadoPor: "Administrador General",
      fechaRevision: "2026-06-11",
      motivoAnulacion: "",
      formaPago: "",
      banco: "",
      referencia: "",
      descripcionMoto: [],
      origen: "Contabilidad",
      fechaCreacion: "2026-06-10",
      contabilizadoPor: "",
      fechaContabilizacion: "",
      conciliadoPor: "",
      fechaConciliacion: "",
      anuladoPor: "",
      fechaAnulacion: "",
      observacionesContables: "",
    },
    {
      id: "DOC-202606-004",
      tipo: "Recibo Oficial de Caja",
      numero: "ROC-DEMO-001",
      fecha: "2026-06-11",
      tercero: "Cliente demo",
      ruc: "0010101010000A",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      concepto: "Abono recibido para proceso comercial.",
      documentoOrigen: "FAC-DEMO-001",
      subtotal: 500,
      retencion1: 0,
      retencion2: 0,
      abono: 500,
      total: 500,
      estado: "Contabilizado",
      observaciones: "Recibo demo disponible para revision contable.",
      creadoPor: "Contador General",
      revisadoPor: "Administrador General",
      fechaRevision: "2026-06-12",
      motivoAnulacion: "",
      formaPago: "Transferencia",
      banco: "Banco demo",
      referencia: "TRX-001",
      descripcionMoto: [],
      origen: "Contabilidad",
      fechaCreacion: "2026-06-11",
      contabilizadoPor: "Administrador General",
      fechaContabilizacion: "2026-06-12",
      conciliadoPor: "",
      fechaConciliacion: "",
      anuladoPor: "",
      fechaAnulacion: "",
      observacionesContables: "",
    },
  ];
}

export function createDemoPayroll(): AccountingPayrollRecord[] {
  return [
    {
      id: "PAY-202606-001",
      empleado: "Roberto",
      cargo: "Vendedor",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      salarioBase: 450,
      comisiones: 120,
      bonos: 40,
      deducciones: 35,
      anticipos: 0,
      netoPagar: 575,
      periodo: "Junio 2026",
      estado: "Borrador",
      observaciones: "Planilla demo básica.",
    },
  ];
}

export function createDemoInventoryCosts(): AccountingInventoryCost[] {
  const now = "2026-06-20T08:00:00.000Z";

  return motorcycles.flatMap((motorcycle, modelIndex) =>
    desiredBranches.map((branch, branchIndex) => ({
      id: `COST-${motorcycle.slug}-${branch.id}`,
      modeloSlug: motorcycle.slug,
      modelo: motorcycle.name,
      sucursalId: branch.id,
      sucursalNombre: branch.name,
      costoUnitario: 1450 + modelIndex * 180 + branchIndex * 35,
      saldoMinimo: 2 + ((modelIndex + branchIndex) % 3),
      fechaActualizacion: now,
    })),
  );
}

export function createDemoChartAccounts(): AccountingChartAccount[] {
  return [
    {
      id: "ACC-1101-01",
      codigo: "1101-01",
      nombre: "Caja general",
      tipo: "Activo",
      naturaleza: "Deudora",
      cuentaPadre: "1101 Efectivo y equivalentes",
      estado: "Activa",
      descripcion: "Cuenta demo para registrar movimientos de caja.",
    },
    {
      id: "ACC-1102-01",
      codigo: "1102-01",
      nombre: "Bancos",
      tipo: "Activo",
      naturaleza: "Deudora",
      cuentaPadre: "1102 Bancos",
      estado: "Activa",
      descripcion: "Cuenta demo para pagos por transferencia, cheque o deposito.",
    },
    {
      id: "ACC-4101-01",
      codigo: "4101-01",
      nombre: "Ingresos por venta de motocicletas",
      tipo: "Ingreso",
      naturaleza: "Acreedora",
      cuentaPadre: "4101 Ingresos operativos",
      estado: "Activa",
      descripcion: "Ingreso demo para documentos de venta revisados.",
    },
    {
      id: "ACC-6101-01",
      codigo: "6101-01",
      nombre: "Combustible y movilidad",
      tipo: "Gasto",
      naturaleza: "Deudora",
      cuentaPadre: "6101 Gastos administrativos",
      estado: "Activa",
      descripcion: "Gastos demo de combustible, viaticos y movilidad.",
    },
  ];
}

export function createDemoBankAccounts(): AccountingBankAccount[] {
  return [
    {
      id: "BANK-001",
      banco: "Banco demo",
      cuentaBancaria: "100-000-001",
      moneda: "USD",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      saldoDemo: 12450,
      estado: "Activa",
      observaciones: "Cuenta bancaria demo para conciliacion interna.",
    },
    {
      id: "BANK-002",
      banco: "Banco demo sucursal",
      cuentaBancaria: "100-000-002",
      moneda: "USD",
      sucursalId: "rubenia",
      sucursalNombre: "Rubenia",
      saldoDemo: 8250,
      estado: "Activa",
      observaciones: "Cuenta demo filtrable por sucursal.",
    },
  ];
}

export function createDemoReconciliations(): AccountingReconciliation[] {
  return [
    {
      id: "REC-BANK-001",
      banco: "Banco demo",
      cuentaBancaria: "100-000-001",
      referencia: "DEP-001",
      formaPago: "Transferencia",
      documentoRelacionado: "ROC-DEMO-001",
      monto: 500,
      estado: "Pendiente",
      observacion: "Movimiento demo pendiente de conciliacion.",
      fecha: "2026-06-11",
      fechaConciliacion: "",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
    },
    {
      id: "REC-BANK-002",
      banco: "Banco demo",
      cuentaBancaria: "100-000-001",
      referencia: "TRX-GTO-001",
      formaPago: "Transferencia",
      documentoRelacionado: "FAC-GTO-0001",
      monto: 118.8,
      estado: "Conciliado",
      observacion: "Gasto demo conciliado manualmente.",
      fecha: "2026-06-07",
      fechaConciliacion: "2026-06-08",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
    },
  ];
}

export function createDemoAccountingClosures(): AccountingClosure[] {
  return [
    {
      id: "CLOSE-202606-PI",
      periodo: "2026-06",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      totalIngresos: 1850,
      totalEgresos: 120,
      totalRetenciones: 1.2,
      totalAbonos: 500,
      totalCaja: 1728.8,
      diferencias: 0,
      estado: "En revision",
      observaciones: "Cierre contable demo pendiente de validacion.",
    },
  ];
}

export function createDemoThirdParties(): AccountingThirdParty[] {
  return [
    {
      id: "TP-CLI-001",
      tipo: "Cliente",
      nombre: "Cliente demo",
      rucCedula: "0010101010000A",
      telefono: "88880000",
      correo: "cliente@example.com",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      saldoRelacionado: 1350,
      documentosAsociados: 4,
    },
    {
      id: "TP-PRV-001",
      tipo: "Proveedor",
      nombre: "Proveedor demo",
      rucCedula: "J0310000000000",
      telefono: "",
      correo: "",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      saldoRelacionado: 118.8,
      documentosAsociados: 1,
    },
  ];
}

export function isVoucherType(value: string): value is VoucherType {
  return voucherTypes.some((type) => type === value);
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return expenseCategories.some((category) => category === value);
}

export function isAccountingDocumentType(
  value: string,
): value is AccountingDocumentType {
  return accountingDocumentTypes.some((type) => type === value);
}

export function isAccountingDocumentState(
  value: string,
): value is AccountingDocumentState {
  return accountingDocumentStates.some((state) => state === value);
}

export function isAccountingDocumentOrigin(
  value: string,
): value is AccountingDocumentOrigin {
  return accountingDocumentOrigins.some((origin) => origin === value);
}

export function isPayrollStatus(value: string): value is PayrollStatus {
  return payrollStatuses.some((status) => status === value);
}

export function isAccountingAccountType(
  value: string,
): value is AccountingAccountType {
  return accountingAccountTypes.some((type) => type === value);
}

export function isAccountNature(value: string): value is AccountNature {
  return accountNatures.some((nature) => nature === value);
}

export function isJournalEntryStatus(value: string): value is JournalEntryStatus {
  return journalEntryStatuses.some((status) => status === value);
}

export function isBankReconciliationStatus(
  value: string,
): value is BankReconciliationStatus {
  return bankReconciliationStatuses.some((status) => status === value);
}

export function isAccountingClosureStatus(
  value: string,
): value is AccountingClosureStatus {
  return accountingClosureStatuses.some((status) => status === value);
}

export function isThirdPartyType(value: string): value is ThirdPartyType {
  return thirdPartyTypes.some((type) => type === value);
}

export function normalizeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}
