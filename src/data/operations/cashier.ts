import {
  buildMotorcycleInvoiceDescription,
  normalizeNumber,
  normalizeString,
  type AccountingDocumentType,
} from "@/data/operations/accounting";
import {
  desiredBranches,
  getDesiredBranch,
  type DesiredBranchId,
} from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const CASHIER_INVOICES_STORAGE_KEY = storageKeys.cashierInvoices;
export const CASHIER_RECEIPTS_STORAGE_KEY = storageKeys.cashierReceipts;
export const CASHIER_NOTES_STORAGE_KEY = storageKeys.cashierNotes;
export const CASHIER_CLOSURES_STORAGE_KEY = storageKeys.cashierClosures;

export const cashierDocumentStates = ["Borrador", "Emitido", "Anulado"] as const;
export const cashierClosureStates = [
  "Abierto",
  "Cerrado",
  "Revisado por Contabilidad",
  "Anulado",
] as const;
export const cashierPaymentMethods = [
  "Efectivo",
  "Transferencia",
  "Cheque",
  "Tarjeta",
] as const;
export const cashierNoteTypes = ["Nota de Débito", "Nota de Crédito"] as const;

export type CashierDocumentState = (typeof cashierDocumentStates)[number];
export type CashierClosureState = (typeof cashierClosureStates)[number];
export type CashierPaymentMethod = (typeof cashierPaymentMethods)[number];
export type CashierNoteType = (typeof cashierNoteTypes)[number];

export type CashierDocumentItem = {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
};

export type CashierInvoice = {
  id: string;
  numero: string;
  fecha: string;
  cliente: string;
  rucCedula: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  items: CashierDocumentItem[];
  descripcion: string;
  subtotal: number;
  abono: number;
  retencion1: number;
  retencion2: number;
  total: number;
  formaPago: CashierPaymentMethod;
  banco: string;
  referencia: string;
  estado: CashierDocumentState;
  elaboradoPor: string;
  observaciones: string;
  descripcionMoto: string[];
};

export type CashierReceipt = {
  id: string;
  numero: string;
  fecha: string;
  recibimosDe: string;
  rucCedula: string;
  concepto: string;
  facturaRelacionada: string;
  formaPago: CashierPaymentMethod;
  banco: string;
  referencia: string;
  montoRecibido: number;
  abono: number;
  retencion1: number;
  retencion2: number;
  totalAplicado: number;
  elaboradoPor: string;
  estado: CashierDocumentState;
  observaciones: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
};

export type CashierNote = {
  id: string;
  tipo: CashierNoteType;
  numero: string;
  fecha: string;
  cliente: string;
  rucCedula: string;
  facturaRelacionada: string;
  concepto: string;
  monto: number;
  retencion1: number;
  retencion2: number;
  total: number;
  estado: CashierDocumentState;
  elaboradoPor: string;
  observaciones: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
};

export type CashierClosure = {
  id: string;
  fecha: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  cajero: string;
  efectivo: number;
  transferencias: number;
  cheques: number;
  tarjetas: number;
  totalFacturado: number;
  totalRecibido: number;
  totalRetenciones: number;
  diferencias: number;
  estado: CashierClosureState;
  observaciones: string;
};

export type CashierAccountingPayload = {
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
  observaciones: string;
  creadoPor: string;
  formaPago: string;
  banco: string;
  referencia: string;
  descripcionMoto: string[];
};

export function createDemoCashierInvoices(): CashierInvoice[] {
  return [
    normalizeCashierInvoice({
      id: "CINV-202606-001",
      numero: "FAC-CJA-0001",
      fecha: "2026-06-18",
      cliente: "Cliente demo",
      rucCedula: "0010101010000A",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      items: [
        {
          id: "CINV-ITEM-001",
          descripcion: "Motocicleta Bajaj demo",
          cantidad: 1,
          precioUnitario: 1850,
          total: 1850,
        },
      ],
      descripcion: "Factura operativa demo de motocicleta.",
      subtotal: 1850,
      abono: 500,
      retencion1: 18.5,
      retencion2: 0,
      total: 1331.5,
      formaPago: "Transferencia",
      banco: "Banco demo",
      referencia: "TRX-CJA-001",
      estado: "Emitido",
      elaboradoPor: "Cajero Plaza Inter",
      observaciones: "Documento operativo demo disponible para revisión contable.",
      descripcionMoto: buildMotorcycleInvoiceDescription(),
    }),
  ].filter((invoice): invoice is CashierInvoice => Boolean(invoice));
}

export function createDemoCashierReceipts(): CashierReceipt[] {
  return [
    normalizeCashierReceipt({
      id: "CREC-202606-001",
      numero: "ROC-CJA-0001",
      fecha: "2026-06-18",
      recibimosDe: "Cliente demo",
      rucCedula: "0010101010000A",
      concepto: "Abono recibido por factura operativa demo.",
      facturaRelacionada: "FAC-CJA-0001",
      formaPago: "Transferencia",
      banco: "Banco demo",
      referencia: "TRX-CJA-001",
      montoRecibido: 500,
      abono: 0,
      retencion1: 0,
      retencion2: 0,
      totalAplicado: 500,
      elaboradoPor: "Cajero Plaza Inter",
      estado: "Emitido",
      observaciones: "Recibo demo sin PDF ni efecto fiscal.",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
    }),
  ].filter((receipt): receipt is CashierReceipt => Boolean(receipt));
}

export function createDemoCashierNotes(): CashierNote[] {
  return [
    normalizeCashierNote({
      id: "CNOT-202606-001",
      tipo: "Nota de Débito",
      numero: "ND-CJA-0001",
      fecha: "2026-06-19",
      cliente: "Cliente demo",
      rucCedula: "0010101010000A",
      facturaRelacionada: "FAC-CJA-0001",
      concepto: "Ajuste operativo demo.",
      monto: 45,
      retencion1: 0,
      retencion2: 0,
      total: 45,
      estado: "Emitido",
      elaboradoPor: "Cajero Plaza Inter",
      observaciones: "Nota demo disponible para revisión contable.",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
    }),
  ].filter((note): note is CashierNote => Boolean(note));
}

export function createDemoCashierClosures(): CashierClosure[] {
  return [
    normalizeCashierClosure({
      id: "CCLO-202606-001",
      fecha: "2026-06-19",
      sucursalId: "plaza-inter",
      sucursalNombre: "Plaza Inter",
      cajero: "Cajero Plaza Inter",
      efectivo: 0,
      transferencias: 500,
      cheques: 0,
      tarjetas: 0,
      totalFacturado: 1850,
      totalRecibido: 500,
      totalRetenciones: 18.5,
      diferencias: -1350,
      estado: "Abierto",
      observaciones: "Cierre demo pendiente de revisión.",
    }),
  ].filter((closure): closure is CashierClosure => Boolean(closure));
}

export function calculateRetention(subtotal: number, rate: 0.01 | 0.02) {
  return roundMoney(subtotal * rate);
}

export function calculateCashierTotal(
  subtotal: number,
  abono: number,
  retencion1: number,
  retencion2: number,
) {
  return roundMoney(Math.max(subtotal - abono - retencion1 - retencion2, 0));
}

export function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function toCashierAccountingPayload(
  document: CashierInvoice | CashierReceipt | CashierNote,
): CashierAccountingPayload {
  if ("items" in document) {
    return {
      id: document.id,
      tipo: "Factura",
      numero: document.numero,
      fecha: document.fecha,
      tercero: document.cliente,
      ruc: document.rucCedula,
      sucursalId: document.sucursalId,
      sucursalNombre: document.sucursalNombre,
      concepto: document.descripcion,
      documentoOrigen: document.numero,
      subtotal: document.subtotal,
      retencion1: document.retencion1,
      retencion2: document.retencion2,
      abono: document.abono,
      total: document.total,
      observaciones: document.observaciones,
      creadoPor: document.elaboradoPor,
      formaPago: document.formaPago,
      banco: document.banco,
      referencia: document.referencia,
      descripcionMoto: document.descripcionMoto,
    };
  }

  if ("recibimosDe" in document) {
    return {
      id: document.id,
      tipo: "Recibo Oficial de Caja",
      numero: document.numero,
      fecha: document.fecha,
      tercero: document.recibimosDe,
      ruc: document.rucCedula,
      sucursalId: document.sucursalId,
      sucursalNombre: document.sucursalNombre,
      concepto: document.concepto,
      documentoOrigen: document.facturaRelacionada,
      subtotal: document.montoRecibido,
      retencion1: document.retencion1,
      retencion2: document.retencion2,
      abono: document.abono,
      total: document.totalAplicado,
      observaciones: document.observaciones,
      creadoPor: document.elaboradoPor,
      formaPago: document.formaPago,
      banco: document.banco,
      referencia: document.referencia,
      descripcionMoto: [],
    };
  }

  return {
    id: document.id,
    tipo: document.tipo,
    numero: document.numero,
    fecha: document.fecha,
    tercero: document.cliente,
    ruc: document.rucCedula,
    sucursalId: document.sucursalId,
    sucursalNombre: document.sucursalNombre,
    concepto: document.concepto,
    documentoOrigen: document.facturaRelacionada,
    subtotal: document.monto,
    retencion1: document.retencion1,
    retencion2: document.retencion2,
    abono: 0,
    total: document.total,
    observaciones: document.observaciones,
    creadoPor: document.elaboradoPor,
    formaPago: "",
    banco: "",
    referencia: "",
    descripcionMoto: [],
  };
}

export function normalizeCashierInvoice(value: unknown): CashierInvoice | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CashierInvoice>;
  const branch = getCashierBranch(candidate.sucursalId);
  if (typeof candidate.id !== "string" || typeof candidate.numero !== "string" || !branch) {
    return null;
  }

  const subtotal = normalizeNumber(candidate.subtotal);
  const abono = normalizeNumber(candidate.abono);
  const retencion1 = normalizeNumber(candidate.retencion1);
  const retencion2 = normalizeNumber(candidate.retencion2);
  const items = Array.isArray(candidate.items)
    ? candidate.items.map(normalizeCashierItem).filter((item): item is CashierDocumentItem => Boolean(item))
    : [];

  return {
    id: candidate.id,
    numero: candidate.numero,
    fecha: normalizeString(candidate.fecha),
    cliente: normalizeString(candidate.cliente),
    rucCedula: normalizeString(candidate.rucCedula),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    items,
    descripcion: normalizeString(candidate.descripcion),
    subtotal,
    abono,
    retencion1,
    retencion2,
    total:
      normalizeNumber(candidate.total) ||
      calculateCashierTotal(subtotal, abono, retencion1, retencion2),
    formaPago: normalizeCashierPaymentMethod(candidate.formaPago),
    banco: normalizeString(candidate.banco),
    referencia: normalizeString(candidate.referencia),
    estado: normalizeCashierDocumentState(candidate.estado),
    elaboradoPor: normalizeString(candidate.elaboradoPor),
    observaciones: normalizeString(candidate.observaciones),
    descripcionMoto: Array.isArray(candidate.descripcionMoto)
      ? candidate.descripcionMoto.filter((line): line is string => typeof line === "string")
      : [],
  };
}

export function normalizeCashierReceipt(value: unknown): CashierReceipt | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CashierReceipt>;
  const branch = getCashierBranch(candidate.sucursalId);
  if (typeof candidate.id !== "string" || typeof candidate.numero !== "string" || !branch) {
    return null;
  }

  const montoRecibido = normalizeNumber(candidate.montoRecibido);
  const abono = normalizeNumber(candidate.abono);
  const retencion1 = normalizeNumber(candidate.retencion1);
  const retencion2 = normalizeNumber(candidate.retencion2);

  return {
    id: candidate.id,
    numero: candidate.numero,
    fecha: normalizeString(candidate.fecha),
    recibimosDe: normalizeString(candidate.recibimosDe),
    rucCedula: normalizeString(candidate.rucCedula),
    concepto: normalizeString(candidate.concepto),
    facturaRelacionada: normalizeString(candidate.facturaRelacionada),
    formaPago: normalizeCashierPaymentMethod(candidate.formaPago),
    banco: normalizeString(candidate.banco),
    referencia: normalizeString(candidate.referencia),
    montoRecibido,
    abono,
    retencion1,
    retencion2,
    totalAplicado:
      normalizeNumber(candidate.totalAplicado) ||
      calculateCashierTotal(montoRecibido, abono, retencion1, retencion2),
    elaboradoPor: normalizeString(candidate.elaboradoPor),
    estado: normalizeCashierDocumentState(candidate.estado),
    observaciones: normalizeString(candidate.observaciones),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
  };
}

export function normalizeCashierNote(value: unknown): CashierNote | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CashierNote>;
  const branch = getCashierBranch(candidate.sucursalId);
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.numero !== "string" ||
    !isCashierNoteType(candidate.tipo) ||
    !branch
  ) {
    return null;
  }

  const monto = normalizeNumber(candidate.monto);
  const retencion1 = normalizeNumber(candidate.retencion1);
  const retencion2 = normalizeNumber(candidate.retencion2);

  return {
    id: candidate.id,
    tipo: candidate.tipo,
    numero: candidate.numero,
    fecha: normalizeString(candidate.fecha),
    cliente: normalizeString(candidate.cliente),
    rucCedula: normalizeString(candidate.rucCedula),
    facturaRelacionada: normalizeString(candidate.facturaRelacionada),
    concepto: normalizeString(candidate.concepto),
    monto,
    retencion1,
    retencion2,
    total: normalizeNumber(candidate.total) || calculateCashierTotal(monto, 0, retencion1, retencion2),
    estado: normalizeCashierDocumentState(candidate.estado),
    elaboradoPor: normalizeString(candidate.elaboradoPor),
    observaciones: normalizeString(candidate.observaciones),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
  };
}

export function normalizeCashierClosure(value: unknown): CashierClosure | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CashierClosure>;
  const branch = getCashierBranch(candidate.sucursalId);
  if (typeof candidate.id !== "string" || !branch) return null;

  const efectivo = normalizeNumber(candidate.efectivo);
  const transferencias = normalizeNumber(candidate.transferencias);
  const cheques = normalizeNumber(candidate.cheques);
  const tarjetas = normalizeNumber(candidate.tarjetas);
  const totalRecibido = efectivo + transferencias + cheques + tarjetas;
  const totalFacturado = normalizeNumber(candidate.totalFacturado);

  return {
    id: candidate.id,
    fecha: normalizeString(candidate.fecha),
    sucursalId: branch.id,
    sucursalNombre: branch.name,
    cajero: normalizeString(candidate.cajero),
    efectivo,
    transferencias,
    cheques,
    tarjetas,
    totalFacturado,
    totalRecibido: normalizeNumber(candidate.totalRecibido) || roundMoney(totalRecibido),
    totalRetenciones: normalizeNumber(candidate.totalRetenciones),
    diferencias:
      normalizeNumber(candidate.diferencias) ||
      roundMoney(totalRecibido - totalFacturado),
    estado: normalizeCashierClosureState(candidate.estado),
    observaciones: normalizeString(candidate.observaciones),
  };
}

export function isCashierNoteType(value: unknown): value is CashierNoteType {
  return typeof value === "string" && cashierNoteTypes.some((type) => type === value);
}

function normalizeCashierItem(value: unknown): CashierDocumentItem | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CashierDocumentItem>;
  if (typeof candidate.id !== "string") return null;

  const cantidad = normalizeNumber(candidate.cantidad) || 1;
  const precioUnitario = normalizeNumber(candidate.precioUnitario);
  return {
    id: candidate.id,
    descripcion: normalizeString(candidate.descripcion),
    cantidad,
    precioUnitario,
    total: normalizeNumber(candidate.total) || roundMoney(cantidad * precioUnitario),
  };
}

function isCashierPaymentMethod(value: unknown): value is CashierPaymentMethod {
  return (
    typeof value === "string" &&
    cashierPaymentMethods.some((method) => method === value)
  );
}

function normalizeCashierPaymentMethod(value: unknown): CashierPaymentMethod {
  return isCashierPaymentMethod(value) ? value : "Efectivo";
}

function isCashierDocumentState(value: unknown): value is CashierDocumentState {
  return (
    typeof value === "string" &&
    cashierDocumentStates.some((state) => state === value)
  );
}

function normalizeCashierDocumentState(value: unknown): CashierDocumentState {
  return isCashierDocumentState(value) ? value : "Borrador";
}

function isCashierClosureState(value: unknown): value is CashierClosureState {
  return (
    typeof value === "string" &&
    cashierClosureStates.some((state) => state === value)
  );
}

function normalizeCashierClosureState(value: unknown): CashierClosureState {
  return isCashierClosureState(value) ? value : "Abierto";
}

function getCashierBranch(branchId: unknown) {
  if (typeof branchId !== "string") return desiredBranches[0] ?? null;
  return getDesiredBranch(branchId) ?? null;
}
