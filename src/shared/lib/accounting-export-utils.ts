"use client";

/**
 * Accounting-specific export builders on top of the generic CSV/PDF helpers
 * in `export-utils.ts`. Every function here is demo-safe: no fiscal
 * numbering, no DGI, no bank integration — just Excel-compatible CSV and a
 * print-ready PDF view of data already visible on screen.
 */

import type {
  AccountingBankAccount,
  AccountingDocument,
  AccountingExpense,
  AccountingJournalEntry,
  AccountingPayrollRecord,
  AccountingReconciliation,
  AccountingThirdParty,
  AccountingVoucher,
} from "@/data/operations/accounting";
import type {
  CashierClosure,
  CashierInvoice,
  CashierNote,
  CashierReceipt,
} from "@/data/operations/cashier";
import {
  downloadCsv,
  formatCsvNumber,
  formatCurrencyExport,
  formatDateExport,
  openPrintableWindow,
  sanitizeExportText,
  buildPrintableHtml,
  type ExportColumn,
  type ExportContext,
  type PrintableKeyValue,
  type PrintableTotal,
} from "@/shared/lib/export-utils";

function contextMeta(context: ExportContext): PrintableKeyValue[] {
  const meta: PrintableKeyValue[] = [
    { label: "Rol", value: context.role },
    { label: "Alcance", value: context.scope },
  ];
  if (context.userName) meta.push({ label: "Generado por", value: context.userName });
  return meta;
}

/* -------------------------------------------------------------------------- */
/*  Accounting documents (Factura, Recibo, Nota de Débito/Crédito)            */
/* -------------------------------------------------------------------------- */

const documentColumns: ExportColumn<AccountingDocument>[] = [
  { label: "Número", value: (row) => row.numero },
  { label: "Tipo", value: (row) => row.tipo },
  { label: "Fecha", value: (row) => row.fecha },
  { label: "Tercero", value: (row) => sanitizeExportText(row.tercero) },
  { label: "RUC / Cédula", value: (row) => row.ruc },
  { label: "Sucursal", value: (row) => row.sucursalNombre },
  { label: "Origen", value: (row) => row.origen },
  { label: "Estado", value: (row) => row.estado },
  { label: "Forma de pago", value: (row) => row.formaPago },
  { label: "Banco", value: (row) => row.banco },
  { label: "Referencia", value: (row) => row.referencia },
  { label: "Subtotal", value: (row) => formatCsvNumber(row.subtotal) },
  { label: "Abono", value: (row) => formatCsvNumber(row.abono) },
  { label: "Retención 1%", value: (row) => formatCsvNumber(row.retencion1) },
  { label: "Retención 2%", value: (row) => formatCsvNumber(row.retencion2) },
  { label: "Total", value: (row) => formatCsvNumber(row.total) },
  { label: "Revisado por", value: (row) => sanitizeExportText(row.revisadoPor) },
  { label: "Contabilizado por", value: (row) => sanitizeExportText(row.contabilizadoPor) },
  { label: "Conciliado por", value: (row) => sanitizeExportText(row.conciliadoPor) },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observaciones) },
];

export function exportAccountingDocumentsToCsv(documents: AccountingDocument[]) {
  return downloadCsv("documentos-contables", documents, documentColumns);
}

export function exportAccountingDocumentsToPdf(
  documents: AccountingDocument[],
  context: ExportContext,
  filterSummary: string,
) {
  const totals: PrintableTotal[] = [
    { label: "Subtotal", value: formatCurrencyExport(sum(documents, (row) => row.subtotal)) },
    { label: "Abonos", value: formatCurrencyExport(sum(documents, (row) => row.abono)) },
    { label: "Retención 1%", value: formatCurrencyExport(sum(documents, (row) => row.retencion1)) },
    { label: "Retención 2%", value: formatCurrencyExport(sum(documents, (row) => row.retencion2)) },
    {
      label: "Total final",
      value: formatCurrencyExport(sum(documents, (row) => row.total)),
      strong: true,
    },
  ];

  const statusCounts = countBy(documents, (row) => row.estado);

  const html = buildPrintableHtml({
    documentTitle: "Documentos contables",
    subtitle: filterSummary,
    meta: [...contextMeta(context), { label: "Documentos", value: `${documents.length}` }],
    sections: [
      {
        heading: "Totales por estado",
        rows: Object.entries(statusCounts).map(([label, value]) => ({
          label,
          value: `${value}`,
        })),
      },
    ],
    table: {
      columns: [
        "Número",
        "Tipo",
        "Fecha",
        "Tercero",
        "Sucursal",
        "Origen",
        "Estado",
        "Subtotal",
        "Retenciones",
        "Total",
      ],
      rows: documents.map((row) => [
        row.numero,
        row.tipo,
        formatDateExport(row.fecha),
        sanitizeExportText(row.tercero),
        row.sucursalNombre,
        row.origen,
        row.estado,
        formatCurrencyExport(row.subtotal),
        formatCurrencyExport(row.retencion1 + row.retencion2),
        formatCurrencyExport(row.total),
      ]),
    },
    totals,
  });

  return openPrintableWindow(html);
}

/** Printable PDF for a single selected document/invoice preview. */
export function exportAccountingDocumentToPdf(
  document: AccountingDocument,
  context: ExportContext,
) {
  const isReceipt = document.tipo === "Recibo Oficial de Caja";

  const html = buildPrintableHtml({
    documentTitle: document.tipo,
    subtitle: `${document.numero} · ${formatDateExport(document.fecha)}`,
    meta: [...contextMeta(context), { label: "Estado", value: document.estado }],
    sections: [
      {
        heading: isReceipt ? "Recibimos de" : "Cliente / proveedor",
        rows: [
          { label: isReceipt ? "Recibimos de" : "Tercero", value: sanitizeExportText(document.tercero) },
          { label: "RUC / cédula", value: document.ruc || "No registrado" },
          { label: "Sucursal", value: document.sucursalNombre },
          { label: "Documento origen", value: document.documentoOrigen || "No aplica" },
        ],
      },
      {
        heading: "Concepto",
        rows: [{ label: "Concepto", value: sanitizeExportText(document.concepto) }],
      },
      {
        heading: "Pago",
        rows: [
          { label: "Forma de pago", value: document.formaPago || "No registrada" },
          { label: "Banco", value: document.banco || "No aplica" },
          { label: "Referencia", value: document.referencia || "No registrada" },
        ],
      },
      {
        heading: "Trazabilidad",
        rows: [
          { label: "Creado por", value: document.creadoPor || "No registrado" },
          { label: "Revisado por", value: document.revisadoPor || "Pendiente" },
          { label: "Contabilizado por", value: document.contabilizadoPor || "Pendiente" },
          { label: "Conciliado por", value: document.conciliadoPor || "Pendiente" },
        ],
      },
    ],
    descripcionMoto: document.descripcionMoto,
    totals: [
      { label: "Subtotal", value: formatCurrencyExport(document.subtotal) },
      { label: "Abono", value: formatCurrencyExport(document.abono) },
      { label: "Retención 1%", value: formatCurrencyExport(document.retencion1) },
      { label: "Retención 2%", value: formatCurrencyExport(document.retencion2) },
      {
        label: isReceipt ? "Total aplicado" : "Total",
        value: formatCurrencyExport(document.total),
        strong: true,
      },
    ],
    observations: [
      { label: "Observaciones", value: document.observaciones },
      { label: "Observaciones contables", value: document.observacionesContables },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Journal entries                                                            */
/* -------------------------------------------------------------------------- */

const journalColumns: ExportColumn<AccountingJournalEntry>[] = [
  { label: "Fecha", value: (row) => row.fecha },
  { label: "Número de asiento", value: (row) => row.asiento },
  { label: "Cuenta contable", value: (row) => row.cuentaContable },
  { label: "Concepto", value: (row) => sanitizeExportText(row.conceptoContable) },
  { label: "Debe", value: (row) => formatCsvNumber(row.debe) },
  { label: "Haber", value: (row) => formatCsvNumber(row.haber) },
  { label: "Banco", value: (row) => row.banco },
  { label: "Referencia", value: (row) => row.refPagoBanco },
  { label: "Conciliación", value: (row) => row.conciliacion },
  { label: "Estado", value: (row) => row.estado },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observaciones) },
];

export function exportJournalEntriesToCsv(entries: AccountingJournalEntry[]) {
  return downloadCsv("asientos-contables", entries, journalColumns);
}

export function exportJournalEntriesToPdf(
  entries: AccountingJournalEntry[],
  context: ExportContext,
  filterSummary: string,
) {
  const totalDebe = sum(entries, (row) => row.debe);
  const totalHaber = sum(entries, (row) => row.haber);
  const difference = totalDebe - totalHaber;
  const balanced = Math.abs(difference) <= 0.01;

  const html = buildPrintableHtml({
    documentTitle: "Asientos contables",
    subtitle: filterSummary,
    meta: [...contextMeta(context), { label: "Asientos", value: `${entries.length}` }],
    table: {
      columns: [
        "Fecha",
        "Asiento",
        "Cuenta contable",
        "Concepto",
        "Debe",
        "Haber",
        "Banco",
        "Estado",
      ],
      rows: entries.map((row) => [
        formatDateExport(row.fecha),
        row.asiento,
        row.cuentaContable,
        sanitizeExportText(row.conceptoContable),
        formatCurrencyExport(row.debe),
        formatCurrencyExport(row.haber),
        row.banco,
        row.estado,
      ]),
    },
    totals: [
      { label: "Total debe", value: formatCurrencyExport(totalDebe) },
      { label: "Total haber", value: formatCurrencyExport(totalHaber) },
      { label: "Diferencia", value: formatCurrencyExport(difference) },
      { label: "Balance", value: balanced ? "Cuadrado" : "Descuadrado", strong: true },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Vouchers                                                                   */
/* -------------------------------------------------------------------------- */

const voucherColumns: ExportColumn<AccountingVoucher>[] = [
  { label: "Número", value: (row) => row.numero },
  { label: "Tipo", value: (row) => row.tipo },
  { label: "Fecha", value: (row) => row.fecha },
  { label: "Beneficiario / tercero", value: (row) => sanitizeExportText(row.beneficiario) },
  { label: "Cuenta contable", value: (row) => row.cuentaContable },
  { label: "Concepto", value: (row) => sanitizeExportText(row.concepto) },
  { label: "Banco", value: (row) => row.banco },
  { label: "Referencia", value: (row) => row.referencia },
  { label: "Debe", value: (row) => formatCsvNumber(row.debe) },
  { label: "Haber", value: (row) => formatCsvNumber(row.haber) },
  { label: "Total", value: (row) => formatCsvNumber(row.total) },
  { label: "Estado", value: (row) => row.estado },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observaciones) },
];

export function exportVouchersToCsv(vouchers: AccountingVoucher[]) {
  return downloadCsv("comprobantes-contables", vouchers, voucherColumns);
}

export function exportVouchersToPdf(vouchers: AccountingVoucher[], context: ExportContext) {
  const html = buildPrintableHtml({
    documentTitle: "Comprobantes",
    meta: [...contextMeta(context), { label: "Comprobantes", value: `${vouchers.length}` }],
    table: {
      columns: ["Número", "Tipo", "Fecha", "Beneficiario", "Cuenta contable", "Total", "Estado"],
      rows: vouchers.map((row) => [
        row.numero,
        row.tipo,
        formatDateExport(row.fecha),
        sanitizeExportText(row.beneficiario),
        row.cuentaContable,
        formatCurrencyExport(row.total),
        row.estado,
      ]),
    },
    totals: [
      { label: "Total debe", value: formatCurrencyExport(sum(vouchers, (row) => row.debe)) },
      { label: "Total haber", value: formatCurrencyExport(sum(vouchers, (row) => row.haber)) },
      {
        label: "Total comprobantes",
        value: formatCurrencyExport(sum(vouchers, (row) => row.total)),
        strong: true,
      },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Expenses                                                                   */
/* -------------------------------------------------------------------------- */

const expenseColumns: ExportColumn<AccountingExpense>[] = [
  { label: "Fecha", value: (row) => row.fecha },
  { label: "Proveedor", value: (row) => sanitizeExportText(row.proveedor) },
  { label: "RUC / Cédula", value: (row) => row.ruc },
  { label: "Factura / referencia", value: (row) => row.factura },
  { label: "Categoría", value: (row) => row.categoria },
  { label: "Cuenta contable", value: (row) => row.cuentaContable },
  { label: "Subtotal", value: (row) => formatCsvNumber(row.subtotal) },
  { label: "Retención 1%", value: (row) => formatCsvNumber(row.retencion1) },
  { label: "Retención 2%", value: (row) => formatCsvNumber(row.retencion2) },
  { label: "Total", value: (row) => formatCsvNumber(row.total) },
  { label: "Banco", value: (row) => row.banco },
  { label: "Referencia", value: (row) => row.referencia },
  { label: "Estado", value: (row) => row.estado },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observaciones) },
];

export function exportExpensesToCsv(expenses: AccountingExpense[]) {
  return downloadCsv("gastos-contables", expenses, expenseColumns);
}

export function exportExpensesToPdf(expenses: AccountingExpense[], context: ExportContext) {
  const html = buildPrintableHtml({
    documentTitle: "Gastos",
    meta: [...contextMeta(context), { label: "Gastos", value: `${expenses.length}` }],
    table: {
      columns: ["Fecha", "Proveedor", "Categoría", "Subtotal", "Retenciones", "Total", "Estado"],
      rows: expenses.map((row) => [
        formatDateExport(row.fecha),
        sanitizeExportText(row.proveedor),
        row.categoria,
        formatCurrencyExport(row.subtotal),
        formatCurrencyExport(row.retencion1 + row.retencion2),
        formatCurrencyExport(row.total),
        row.estado,
      ]),
    },
    totals: [
      { label: "Subtotal", value: formatCurrencyExport(sum(expenses, (row) => row.subtotal)) },
      {
        label: "Retenciones",
        value: formatCurrencyExport(sum(expenses, (row) => row.retencion1 + row.retencion2)),
      },
      {
        label: "Total gastos",
        value: formatCurrencyExport(sum(expenses, (row) => row.total)),
        strong: true,
      },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Inventory accounting                                                       */
/* -------------------------------------------------------------------------- */

export type AccountingInventoryExportRow = {
  modelo: string;
  sucursalNombre: string;
  cantidad: number;
  costoUnitario: number;
  costoTotal: number;
  saldoMinimo: number;
  estadoSaldo: string;
  ultimoMovimiento: string;
};

function inventoryColumns(canSeeCost: boolean): ExportColumn<AccountingInventoryExportRow>[] {
  return [
    { label: "Modelo", value: (row) => row.modelo },
    { label: "Sucursal", value: (row) => row.sucursalNombre },
    { label: "Unidades", value: (row) => `${row.cantidad}` },
    {
      label: "Costo unitario",
      value: (row) => (canSeeCost ? formatCsvNumber(row.costoUnitario) : "Restringido"),
    },
    {
      label: "Costo total",
      value: (row) => (canSeeCost ? formatCsvNumber(row.costoTotal) : "Restringido"),
    },
    { label: "Stock mínimo", value: (row) => `${row.saldoMinimo}` },
    { label: "Estado", value: (row) => row.estadoSaldo },
    { label: "Último movimiento", value: (row) => row.ultimoMovimiento },
  ];
}

export function exportInventoryToCsv(
  rows: AccountingInventoryExportRow[],
  canSeeCost: boolean,
) {
  return downloadCsv("inventario-contable", rows, inventoryColumns(canSeeCost));
}

export function exportInventoryToPdf(
  rows: AccountingInventoryExportRow[],
  context: ExportContext,
  canSeeCost: boolean,
) {
  const html = buildPrintableHtml({
    documentTitle: "Inventario contable",
    meta: [...contextMeta(context), { label: "Ítems", value: `${rows.length}` }],
    table: {
      columns: [
        "Modelo",
        "Sucursal",
        "Unidades",
        "Costo unitario",
        "Costo total",
        "Stock mínimo",
        "Estado",
        "Último movimiento",
      ],
      rows: rows.map((row) => [
        row.modelo,
        row.sucursalNombre,
        `${row.cantidad}`,
        canSeeCost ? formatCurrencyExport(row.costoUnitario) : "Restringido",
        canSeeCost ? formatCurrencyExport(row.costoTotal) : "Restringido",
        `${row.saldoMinimo}`,
        row.estadoSaldo,
        row.ultimoMovimiento,
      ]),
    },
    totals: canSeeCost
      ? [
          {
            label: "Costo total de inventario",
            value: formatCurrencyExport(sum(rows, (row) => row.costoTotal)),
            strong: true,
          },
        ]
      : [{ label: "Costo total de inventario", value: "Restringido", strong: true }],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Payroll                                                                    */
/* -------------------------------------------------------------------------- */

const payrollColumns: ExportColumn<AccountingPayrollRecord>[] = [
  { label: "Período", value: (row) => row.periodo },
  { label: "Empleado", value: (row) => sanitizeExportText(row.empleado) },
  { label: "Sucursal", value: (row) => row.sucursalNombre },
  { label: "Salario base", value: (row) => formatCsvNumber(row.salarioBase) },
  { label: "Ingresos", value: (row) => formatCsvNumber(row.comisiones + row.bonos) },
  { label: "Deducciones", value: (row) => formatCsvNumber(row.deducciones) },
  { label: "Anticipos", value: (row) => formatCsvNumber(row.anticipos) },
  { label: "Neto a pagar", value: (row) => formatCsvNumber(row.netoPagar) },
  { label: "Estado", value: (row) => row.estado },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observaciones) },
];

export function exportPayrollToCsv(records: AccountingPayrollRecord[]) {
  return downloadCsv("planilla", records, payrollColumns);
}

export function exportPayrollToPdf(records: AccountingPayrollRecord[], context: ExportContext) {
  const html = buildPrintableHtml({
    documentTitle: "Planilla",
    meta: [...contextMeta(context), { label: "Empleados", value: `${records.length}` }],
    table: {
      columns: ["Período", "Empleado", "Sucursal", "Salario base", "Ingresos", "Neto a pagar", "Estado"],
      rows: records.map((row) => [
        row.periodo,
        sanitizeExportText(row.empleado),
        row.sucursalNombre,
        formatCurrencyExport(row.salarioBase),
        formatCurrencyExport(row.comisiones + row.bonos),
        formatCurrencyExport(row.netoPagar),
        row.estado,
      ]),
    },
    totals: [
      {
        label: "Neto total a pagar",
        value: formatCurrencyExport(sum(records, (row) => row.netoPagar)),
        strong: true,
      },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Banks                                                                      */
/* -------------------------------------------------------------------------- */

const bankAccountColumns: ExportColumn<AccountingBankAccount>[] = [
  { label: "Banco", value: (row) => row.banco },
  { label: "Cuenta bancaria", value: (row) => row.cuentaBancaria },
  { label: "Moneda", value: (row) => row.moneda },
  { label: "Sucursal", value: (row) => row.sucursalNombre },
  { label: "Saldo demo", value: (row) => formatCsvNumber(row.saldoDemo) },
  { label: "Estado", value: (row) => row.estado },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observaciones) },
];

export function exportBankAccountsToCsv(accounts: AccountingBankAccount[]) {
  return downloadCsv("bancos", accounts, bankAccountColumns);
}

export function exportBankAccountsToPdf(accounts: AccountingBankAccount[], context: ExportContext) {
  const html = buildPrintableHtml({
    documentTitle: "Bancos y cuentas",
    meta: [...contextMeta(context), { label: "Cuentas", value: `${accounts.length}` }],
    table: {
      columns: ["Banco", "Cuenta bancaria", "Moneda", "Sucursal", "Saldo demo", "Estado"],
      rows: accounts.map((row) => [
        row.banco,
        row.cuentaBancaria,
        row.moneda,
        row.sucursalNombre,
        formatCurrencyExport(row.saldoDemo),
        row.estado,
      ]),
    },
    totals: [
      {
        label: "Saldo demo total",
        value: formatCurrencyExport(sum(accounts, (row) => row.saldoDemo)),
        strong: true,
      },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Reconciliation                                                             */
/* -------------------------------------------------------------------------- */

const reconciliationColumns: ExportColumn<AccountingReconciliation>[] = [
  { label: "Fecha", value: (row) => row.fecha },
  { label: "Banco", value: (row) => row.banco },
  { label: "Cuenta", value: (row) => row.cuentaBancaria },
  { label: "Documento", value: (row) => row.documentoRelacionado },
  { label: "Tercero", value: () => "No registrado" },
  { label: "Forma de pago", value: (row) => row.formaPago },
  { label: "Referencia", value: (row) => row.referencia },
  { label: "Monto", value: (row) => formatCsvNumber(row.monto) },
  { label: "Estado", value: (row) => row.estado },
  { label: "Diferencia", value: () => "No aplica" },
  { label: "Fecha conciliación", value: (row) => row.fechaConciliacion || "Pendiente" },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observacion) },
];

export function exportReconciliationToCsv(records: AccountingReconciliation[]) {
  return downloadCsv("conciliacion-bancaria", records, reconciliationColumns);
}

export function exportReconciliationToPdf(
  records: AccountingReconciliation[],
  context: ExportContext,
) {
  const html = buildPrintableHtml({
    documentTitle: "Conciliación bancaria",
    subtitle: "Conciliación interna de demo. No integra bancos reales.",
    meta: [...contextMeta(context), { label: "Registros", value: `${records.length}` }],
    table: {
      columns: ["Fecha", "Banco", "Documento", "Forma de pago", "Monto", "Estado", "Fecha conciliación"],
      rows: records.map((row) => [
        formatDateExport(row.fecha),
        row.banco,
        row.documentoRelacionado,
        row.formaPago,
        formatCurrencyExport(row.monto),
        row.estado,
        row.fechaConciliacion ? formatDateExport(row.fechaConciliacion) : "Pendiente",
      ]),
    },
    totals: [
      { label: "Monto total", value: formatCurrencyExport(sum(records, (row) => row.monto)), strong: true },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Cash closures (Caja -> Contabilidad)                                       */
/* -------------------------------------------------------------------------- */

export type CashierClosureExportRow = {
  fecha: string;
  sucursalNombre: string;
  cajero: string;
  estadoCierre: string;
  estadoRevisionContable: string;
  facturas: number;
  recibos: number;
  notas: number;
  efectivo: number;
  transferencias: number;
  tarjetas: number;
  cheques: number;
  retencion1: number;
  retencion2: number;
  totalRecibido: number;
  diferencias: number;
  observaciones: string;
};

/**
 * Derives closure export rows by matching the cashier documents issued the
 * same day/branch as each closure — the same date+branch pairing already
 * used by the Cashier module's own closure detail view.
 */
export function buildCashierClosureExportRows(
  closures: CashierClosure[],
  invoices: CashierInvoice[],
  receipts: CashierReceipt[],
  notes: CashierNote[],
): CashierClosureExportRow[] {
  return closures.map((closure) => {
    const dayInvoices = invoices.filter(
      (invoice) => invoice.fecha === closure.fecha && invoice.sucursalId === closure.sucursalId,
    );
    const dayReceipts = receipts.filter(
      (receipt) => receipt.fecha === closure.fecha && receipt.sucursalId === closure.sucursalId,
    );
    const dayNotes = notes.filter(
      (note) => note.fecha === closure.fecha && note.sucursalId === closure.sucursalId,
    );
    const retencion1 =
      sum(dayInvoices, (row) => row.retencion1) +
      sum(dayReceipts, (row) => row.retencion1) +
      sum(dayNotes, (row) => row.retencion1);
    const retencion2 =
      sum(dayInvoices, (row) => row.retencion2) +
      sum(dayReceipts, (row) => row.retencion2) +
      sum(dayNotes, (row) => row.retencion2);
    const reviewed = closure.estado === "Revisado por Contabilidad";

    return {
      fecha: closure.fecha,
      sucursalNombre: closure.sucursalNombre,
      cajero: closure.cajero,
      estadoCierre: reviewed ? "Cerrado" : closure.estado,
      estadoRevisionContable:
        closure.estado === "Abierto" ? "No aplica" : reviewed ? "Revisado" : "Pendiente",
      facturas: dayInvoices.length,
      recibos: dayReceipts.length,
      notas: dayNotes.length,
      efectivo: closure.efectivo,
      transferencias: closure.transferencias,
      tarjetas: closure.tarjetas,
      cheques: closure.cheques,
      retencion1,
      retencion2,
      totalRecibido: closure.totalRecibido,
      diferencias: closure.diferencias,
      observaciones: closure.observaciones,
    };
  });
}

const cashierClosureColumns: ExportColumn<CashierClosureExportRow>[] = [
  { label: "Fecha", value: (row) => row.fecha },
  { label: "Sucursal", value: (row) => row.sucursalNombre },
  { label: "Cajero", value: (row) => sanitizeExportText(row.cajero) },
  { label: "Estado de cierre", value: (row) => row.estadoCierre },
  { label: "Estado revisión contable", value: (row) => row.estadoRevisionContable },
  { label: "Facturas", value: (row) => `${row.facturas}` },
  { label: "Recibos", value: (row) => `${row.recibos}` },
  { label: "Notas", value: (row) => `${row.notas}` },
  { label: "Efectivo", value: (row) => formatCsvNumber(row.efectivo) },
  { label: "Transferencia", value: (row) => formatCsvNumber(row.transferencias) },
  { label: "Tarjeta", value: (row) => formatCsvNumber(row.tarjetas) },
  { label: "Cheque", value: (row) => formatCsvNumber(row.cheques) },
  { label: "Retención 1%", value: (row) => formatCsvNumber(row.retencion1) },
  { label: "Retención 2%", value: (row) => formatCsvNumber(row.retencion2) },
  { label: "Total recibido", value: (row) => formatCsvNumber(row.totalRecibido) },
  { label: "Diferencia", value: (row) => formatCsvNumber(row.diferencias) },
  { label: "Observaciones", value: (row) => sanitizeExportText(row.observaciones) },
];

export function exportCashClosuresToCsv(rows: CashierClosureExportRow[]) {
  return downloadCsv("cierres-de-caja", rows, cashierClosureColumns);
}

export function exportCashClosuresToPdf(rows: CashierClosureExportRow[], context: ExportContext) {
  const html = buildPrintableHtml({
    documentTitle: "Cierres de caja",
    subtitle: "Caja prepara y cierra. Contabilidad revisa cierres cerrados.",
    meta: [...contextMeta(context), { label: "Cierres", value: `${rows.length}` }],
    table: {
      columns: [
        "Fecha",
        "Sucursal",
        "Cajero",
        "Estado",
        "Revisión",
        "Facturas",
        "Recibos",
        "Notas",
        "Total recibido",
        "Diferencia",
      ],
      rows: rows.map((row) => [
        formatDateExport(row.fecha),
        row.sucursalNombre,
        sanitizeExportText(row.cajero),
        row.estadoCierre,
        row.estadoRevisionContable,
        `${row.facturas}`,
        `${row.recibos}`,
        `${row.notas}`,
        formatCurrencyExport(row.totalRecibido),
        formatCurrencyExport(row.diferencias),
      ]),
    },
    totals: [
      { label: "Total recibido", value: formatCurrencyExport(sum(rows, (row) => row.totalRecibido)) },
      {
        label: "Retenciones",
        value: formatCurrencyExport(sum(rows, (row) => row.retencion1 + row.retencion2)),
      },
      {
        label: "Diferencias",
        value: formatCurrencyExport(sum(rows, (row) => row.diferencias)),
        strong: true,
      },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Third parties                                                              */
/* -------------------------------------------------------------------------- */

const thirdPartyColumns: ExportColumn<AccountingThirdParty>[] = [
  { label: "Tipo", value: (row) => row.tipo },
  { label: "Nombre", value: (row) => sanitizeExportText(row.nombre) },
  { label: "RUC / Cédula", value: (row) => row.rucCedula },
  { label: "Teléfono", value: (row) => row.telefono },
  { label: "Correo", value: (row) => row.correo },
  { label: "Sucursal", value: (row) => row.sucursalNombre },
  { label: "Saldo relacionado", value: (row) => formatCsvNumber(row.saldoRelacionado) },
  { label: "Documentos asociados", value: (row) => `${row.documentosAsociados}` },
];

export function exportThirdPartiesToCsv(parties: AccountingThirdParty[]) {
  return downloadCsv("terceros-contables", parties, thirdPartyColumns);
}

export function exportThirdPartiesToPdf(parties: AccountingThirdParty[], context: ExportContext) {
  const html = buildPrintableHtml({
    documentTitle: "Terceros contables",
    meta: [...contextMeta(context), { label: "Terceros", value: `${parties.length}` }],
    table: {
      columns: ["Tipo", "Nombre", "RUC / Cédula", "Sucursal", "Saldo relacionado", "Documentos"],
      rows: parties.map((row) => [
        row.tipo,
        sanitizeExportText(row.nombre),
        row.rucCedula,
        row.sucursalNombre,
        formatCurrencyExport(row.saldoRelacionado),
        `${row.documentosAsociados}`,
      ]),
    },
    totals: [
      {
        label: "Saldo relacionado total",
        value: formatCurrencyExport(sum(parties, (row) => row.saldoRelacionado)),
        strong: true,
      },
    ],
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                    */
/* -------------------------------------------------------------------------- */

export type AccountingReportCardExport = { title: string; description: string; value: string };

const reportCardColumns: ExportColumn<AccountingReportCardExport>[] = [
  { label: "Título", value: (row) => row.title },
  { label: "Descripción", value: (row) => row.description },
  { label: "Valor", value: (row) => row.value },
];

export function exportAccountingReportsToCsv(cards: AccountingReportCardExport[]) {
  return downloadCsv("reportes-contables", cards, reportCardColumns);
}

export function exportAccountingReportsToPdf(
  cards: AccountingReportCardExport[],
  context: ExportContext,
  keyMetrics: PrintableKeyValue[],
) {
  const html = buildPrintableHtml({
    documentTitle: "Reportes contables",
    subtitle: `Alcance: ${context.scope}`,
    meta: contextMeta(context),
    sections: keyMetrics.length ? [{ heading: "Métricas clave", rows: keyMetrics }] : [],
    table: {
      title: "Catálogo de reportes",
      columns: ["Título", "Descripción", "Valor"],
      rows: cards.map((card) => [card.title, card.description, card.value]),
    },
  });

  return openPrintableWindow(html);
}

/* -------------------------------------------------------------------------- */
/*  Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function sum<T>(rows: T[], value: (row: T) => number) {
  return rows.reduce((total, row) => total + value(row), 0);
}

function countBy<T>(rows: T[], key: (row: T) => string) {
  return rows.reduce<Record<string, number>>((accumulator, row) => {
    const label = key(row) || "Sin dato";
    accumulator[label] = (accumulator[label] ?? 0) + 1;
    return accumulator;
  }, {});
}
