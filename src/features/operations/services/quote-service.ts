"use client";

import {
  QUOTES_STORAGE_KEY,
  isQuoteCurrency,
  isQuoteSaleType,
  normalizeQuote,
  type QuoteCurrency,
  type QuoteRecord,
  type QuoteSaleType,
  type QuoteStatus,
} from "@/data/operations/quotes";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import type { DemoSession } from "@/features/operations/types";
import { completeActivity, createActivity } from "@/features/operations/services/activity-service";

export type QuoteInput = {
  modeloId: string | null;
  modeloNombre: string;
  tipoVenta: QuoteSaleType;
  precioReferencial: number | null;
  prima: number | null;
  plazoMeses: number | null;
  cuotaEstimada: number | null;
  moneda: QuoteCurrency;
  fechaVencimiento: string | null;
  observaciones: string;
};

export function readQuotes() {
  try {
    const raw = window.localStorage.getItem(QUOTES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((quote) => normalizeQuote(quote))
      .filter((quote): quote is QuoteRecord => Boolean(quote))
      .sort((left, right) => right.fechaActualizacion.localeCompare(left.fechaActualizacion));
  } catch {
    return [];
  }
}

export function writeQuotes(quotes: QuoteRecord[]) {
  window.localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes));
}

export function getQuoteByCustomerFileId(quotes: QuoteRecord[], expedienteId: string) {
  return quotes.find((quote) => quote.expedienteId === expedienteId) ?? null;
}

export function createQuote(
  file: CustomerFileRecord,
  input: QuoteInput,
  session: DemoSession,
  initialStatus: Extract<QuoteStatus, "Borrador" | "Emitida">,
) {
  const quotes = readQuotes();
  const validation = validateQuoteInput(input);
  if (!validation.ok) return validation;
  if (!canManageQuoteFile(file, session)) {
    return quoteError("Solo el Vendedor responsable puede crear la proforma de este expediente.");
  }
  if (getQuoteByCustomerFileId(quotes, file.id)) {
    return quoteError("Este expediente ya tiene una proforma comercial.");
  }

  const now = new Date().toISOString();
  const quote: QuoteRecord = {
    id: createId("PRO"),
    numeroProforma: createQuoteNumber(),
    leadId: file.leadId,
    customerId: file.clienteId,
    expedienteId: file.id,
    modeloId: input.modeloId,
    modeloNombre: validation.modeloNombre,
    sucursalId: file.sucursalId,
    sucursalNombre: file.sucursalNombre,
    vendedorId: session.userId,
    vendedorNombre: session.userName,
    tipoVenta: input.tipoVenta,
    precioReferencial: input.precioReferencial,
    prima: input.prima,
    plazoMeses: input.plazoMeses,
    cuotaEstimada: input.cuotaEstimada,
    moneda: input.moneda,
    estado: initialStatus,
    fechaEmision: initialStatus === "Emitida" ? now : null,
    fechaVencimiento: validation.fechaVencimiento,
    observaciones: validation.observaciones,
    fechaCreacion: now,
    fechaActualizacion: now,
  };
  const nextQuotes = [quote, ...quotes];

  writeQuotes(nextQuotes);
  registerQuoteActivity(quote, file, session, initialStatus === "Emitida" ? "emitida" : "creada");

  return { ok: true as const, quote, quotes: nextQuotes };
}

export function updateQuote(
  quoteId: string,
  file: CustomerFileRecord,
  input: QuoteInput,
  session: DemoSession,
) {
  const quotes = readQuotes();
  const quote = quotes.find((item) => item.id === quoteId);
  const validation = validateQuoteInput(input);
  if (!quote) return quoteError("Proforma no encontrada.");
  if (!validation.ok) return validation;
  if (!canManageQuote(quote, file, session)) {
    return quoteError("Solo el Vendedor responsable puede editar esta proforma.");
  }
  if (quote.estado === "Cancelada") {
    return quoteError("La proforma cancelada no se puede editar.");
  }

  const nextQuote: QuoteRecord = {
    ...quote,
    modeloId: input.modeloId,
    modeloNombre: validation.modeloNombre,
    tipoVenta: input.tipoVenta,
    precioReferencial: input.precioReferencial,
    prima: input.prima,
    plazoMeses: input.plazoMeses,
    cuotaEstimada: input.cuotaEstimada,
    moneda: input.moneda,
    fechaVencimiento: validation.fechaVencimiento,
    observaciones: validation.observaciones,
    fechaActualizacion: new Date().toISOString(),
  };
  const nextQuotes = quotes.map((item) => (item.id === quoteId ? nextQuote : item));

  writeQuotes(nextQuotes);
  return { ok: true as const, quote: nextQuote, quotes: nextQuotes };
}

export function changeQuoteStatus(
  quoteId: string,
  file: CustomerFileRecord,
  status: Extract<QuoteStatus, "Emitida" | "Aceptada" | "Cancelada">,
  session: DemoSession,
) {
  const quotes = readQuotes();
  const quote = quotes.find((item) => item.id === quoteId);
  if (!quote) return quoteError("Proforma no encontrada.");
  if (!canManageQuote(quote, file, session)) {
    return quoteError("Solo el Vendedor responsable puede actualizar esta proforma.");
  }
  if (!canTransition(quote.estado, status)) {
    return quoteError("Ese cambio de estado no esta disponible para la proforma.");
  }

  const now = new Date().toISOString();
  const nextQuote: QuoteRecord = {
    ...quote,
    estado: status,
    fechaEmision: status === "Emitida" ? quote.fechaEmision ?? now : quote.fechaEmision,
    fechaActualizacion: now,
  };
  const nextQuotes = quotes.map((item) => (item.id === quoteId ? nextQuote : item));

  writeQuotes(nextQuotes);
  if (status === "Emitida") registerQuoteActivity(nextQuote, file, session, "emitida");

  return { ok: true as const, quote: nextQuote, quotes: nextQuotes };
}

export function isQuoteExpired(quote: QuoteRecord, now = new Date()) {
  if (quote.estado !== "Emitida" || !quote.fechaVencimiento) return false;
  const expiresAt = new Date(`${quote.fechaVencimiento}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return !Number.isNaN(expiresAt.getTime()) && expiresAt < today;
}

function validateQuoteInput(input: QuoteInput) {
  const modeloNombre = normalizeText(input.modeloNombre);
  const observaciones = normalizeText(input.observaciones);
  if (!modeloNombre) return quoteError("Selecciona la motocicleta cotizada.");
  if (!isQuoteSaleType(input.tipoVenta) || !isQuoteCurrency(input.moneda)) {
    return quoteError("Selecciona la forma de pago y moneda.");
  }
  if (!areValidAmounts([input.precioReferencial, input.prima, input.plazoMeses, input.cuotaEstimada])) {
    return quoteError("Precio, prima, plazo y cuota deben ser valores numericos no negativos.");
  }
  if (input.plazoMeses !== null && !Number.isInteger(input.plazoMeses)) {
    return quoteError("El plazo debe indicarse en meses completos.");
  }
  if (observaciones.length > 300) {
    return quoteError("Las observaciones permiten hasta 300 caracteres.");
  }
  if (input.fechaVencimiento) {
    const date = new Date(`${input.fechaVencimiento}T00:00:00`);
    if (Number.isNaN(date.getTime())) return quoteError("Indica una fecha de vencimiento valida.");
  }

  return {
    ok: true as const,
    modeloNombre,
    observaciones: observaciones || null,
    fechaVencimiento: input.fechaVencimiento || null,
  };
}

function canManageQuoteFile(file: CustomerFileRecord, session: DemoSession) {
  return session.role === "Vendedor" && file.vendedor === session.userName;
}

function canManageQuote(quote: QuoteRecord, file: CustomerFileRecord, session: DemoSession) {
  return canManageQuoteFile(file, session) && quote.vendedorId === session.userId;
}

function canTransition(current: QuoteStatus, next: QuoteStatus) {
  if (next === "Cancelada") return current !== "Cancelada" && current !== "Aceptada";
  if (next === "Emitida") return current === "Borrador";
  return current === "Emitida";
}

function registerQuoteActivity(
  quote: QuoteRecord,
  file: CustomerFileRecord,
  session: DemoSession,
  action: "creada" | "emitida",
) {
  const created = createActivity(
    {
      tipo: action === "emitida" ? "Seguimiento" : "Nota",
      prioridad: "Media",
      titulo: `Proforma ${action}`,
      descripcion: `Proforma ${quote.numeroProforma} para ${quote.modeloNombre}.`,
      fechaProgramada: null,
      leadId: quote.leadId,
      customerId: quote.customerId,
      expedienteId: quote.expedienteId,
      sucursalId: quote.sucursalId,
      sucursalNombre: quote.sucursalNombre,
    },
    session,
  );

  if (created.ok) completeActivity(created.activity.id, "", session);
}

function areValidAmounts(values: Array<number | null>) {
  return values.every((value) => value === null || (Number.isFinite(value) && value >= 0));
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function quoteError(message: string) {
  return { ok: false as const, message };
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

function createQuoteNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PRO-${date}-${createId("Q").slice(-6)}`;
}
