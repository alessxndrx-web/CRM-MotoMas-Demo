"use client";

import {
  CASHIER_CLOSURES_STORAGE_KEY,
  CASHIER_INVOICES_STORAGE_KEY,
  CASHIER_NOTES_STORAGE_KEY,
  CASHIER_RECEIPTS_STORAGE_KEY,
  createDemoCashierClosures,
  createDemoCashierInvoices,
  createDemoCashierNotes,
  createDemoCashierReceipts,
  normalizeCashierClosure,
  normalizeCashierInvoice,
  normalizeCashierNote,
  normalizeCashierReceipt,
  toCashierAccountingPayload,
  type CashierClosure,
  type CashierInvoice,
  type CashierNote,
  type CashierReceipt,
} from "@/data/operations/cashier";
import {
  readAccountingDocuments,
  writeAccountingDocuments,
} from "@/features/operations/services/accounting-service";
import { isDemoDataEnabled } from "@/shared/lib/demo-mode";

export function readCashierInvoices() {
  return readRecords(
    CASHIER_INVOICES_STORAGE_KEY,
    createDemoCashierInvoices,
    normalizeCashierInvoice,
  );
}

export function writeCashierInvoices(invoices: CashierInvoice[]) {
  writeRecords(CASHIER_INVOICES_STORAGE_KEY, invoices);
}

export function addCashierInvoice(
  invoices: CashierInvoice[],
  input: Omit<CashierInvoice, "id" | "numero"> & { numero?: string },
) {
  const nextInvoice: CashierInvoice = {
    ...input,
    id: `CINV-${Date.now()}`,
    numero: input.numero || `FAC-CJA-${Date.now().toString().slice(-6)}`,
  };
  const nextInvoices = [nextInvoice, ...invoices];
  writeCashierInvoices(nextInvoices);
  syncCashierDocumentToAccounting(nextInvoice);
  return nextInvoices;
}

export function readCashierReceipts() {
  return readRecords(
    CASHIER_RECEIPTS_STORAGE_KEY,
    createDemoCashierReceipts,
    normalizeCashierReceipt,
  );
}

export function writeCashierReceipts(receipts: CashierReceipt[]) {
  writeRecords(CASHIER_RECEIPTS_STORAGE_KEY, receipts);
}

export function addCashierReceipt(
  receipts: CashierReceipt[],
  input: Omit<CashierReceipt, "id" | "numero"> & { numero?: string },
) {
  const nextReceipt: CashierReceipt = {
    ...input,
    id: `CREC-${Date.now()}`,
    numero: input.numero || `ROC-CJA-${Date.now().toString().slice(-6)}`,
  };
  const nextReceipts = [nextReceipt, ...receipts];
  writeCashierReceipts(nextReceipts);
  syncCashierDocumentToAccounting(nextReceipt);
  return nextReceipts;
}

export function readCashierNotes() {
  return readRecords(
    CASHIER_NOTES_STORAGE_KEY,
    createDemoCashierNotes,
    normalizeCashierNote,
  );
}

export function writeCashierNotes(notes: CashierNote[]) {
  writeRecords(CASHIER_NOTES_STORAGE_KEY, notes);
}

export function addCashierNote(
  notes: CashierNote[],
  input: Omit<CashierNote, "id" | "numero"> & { numero?: string },
) {
  const prefix = input.tipo === "Nota de Crédito" ? "NC-CJA" : "ND-CJA";
  const nextNote: CashierNote = {
    ...input,
    id: `CNOT-${Date.now()}`,
    numero: input.numero || `${prefix}-${Date.now().toString().slice(-6)}`,
  };
  const nextNotes = [nextNote, ...notes];
  writeCashierNotes(nextNotes);
  syncCashierDocumentToAccounting(nextNote);
  return nextNotes;
}

export function readCashierClosures() {
  return readRecords(
    CASHIER_CLOSURES_STORAGE_KEY,
    createDemoCashierClosures,
    normalizeCashierClosure,
  );
}

export function writeCashierClosures(closures: CashierClosure[]) {
  writeRecords(CASHIER_CLOSURES_STORAGE_KEY, closures);
}

export function updateCashierClosures(closures: CashierClosure[]) {
  writeCashierClosures(closures);
  return closures;
}

export function addCashierClosure(
  closures: CashierClosure[],
  input: Omit<CashierClosure, "id">,
) {
  const nextClosure: CashierClosure = {
    ...input,
    id: `CCLO-${Date.now()}`,
  };
  const nextClosures = [nextClosure, ...closures];
  writeCashierClosures(nextClosures);
  return nextClosures;
}

function syncCashierDocumentToAccounting(
  document: CashierInvoice | CashierReceipt | CashierNote,
) {
  const payload = toCashierAccountingPayload(document);
  const documents = readAccountingDocuments();
  const nextDocuments = [
    {
      id: `DOC-CASH-${payload.id}`,
      tipo: payload.tipo,
      numero: payload.numero,
      fecha: payload.fecha,
      tercero: payload.tercero,
      ruc: payload.ruc,
      sucursalId: payload.sucursalId,
      sucursalNombre: payload.sucursalNombre,
      concepto: payload.concepto,
      documentoOrigen: `Caja / ${payload.documentoOrigen || payload.numero}`,
      subtotal: payload.subtotal,
      retencion1: payload.retencion1,
      retencion2: payload.retencion2,
      abono: payload.abono,
      total: payload.total,
      estado: "Emitido" as const,
      observaciones: payload.observaciones,
      creadoPor: payload.creadoPor,
      revisadoPor: "",
      fechaRevision: "",
      motivoAnulacion: "",
      formaPago: payload.formaPago,
      banco: payload.banco,
      referencia: payload.referencia,
      descripcionMoto: payload.descripcionMoto,
      origen: "Caja" as const,
      fechaCreacion: new Date().toISOString().slice(0, 10),
      contabilizadoPor: "",
      fechaContabilizacion: "",
      conciliadoPor: "",
      fechaConciliacion: "",
      anuladoPor: "",
      fechaAnulacion: "",
      observacionesContables: "",
    },
    ...documents.filter(
      (documentItem) => documentItem.id !== `DOC-CASH-${payload.id}`,
    ),
  ];

  writeAccountingDocuments(nextDocuments);
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
