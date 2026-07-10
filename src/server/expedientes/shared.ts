/**
 * Pure, client-safe expediente-support types, enum unions, label maps and
 * validators (Patch 3.3B). No database import here so client components can
 * reuse the DTO shapes. Enforcement lives in queries.ts / actions.ts.
 *
 * These mirror the Prisma enums for the expediente support layer: proforma
 * (Quote), document checklist (ExpedienteDocument) and manual credit follow-up
 * (CreditApplication). Money is exposed as `number | null` — never a Prisma
 * Decimal — and no cost fields exist on any of these records.
 */

// --- Quote / Proforma ----------------------------------------------------

export type QuoteStatusValue =
  | "BORRADOR"
  | "EMITIDA"
  | "ACEPTADA"
  | "VENCIDA"
  | "CANCELADA";

export const quoteStatusValues: QuoteStatusValue[] = [
  "BORRADOR",
  "EMITIDA",
  "ACEPTADA",
  "VENCIDA",
  "CANCELADA",
];

export const quoteStatusLabels: Record<QuoteStatusValue, string> = {
  BORRADOR: "Borrador",
  EMITIDA: "Emitida",
  ACEPTADA: "Aceptada",
  VENCIDA: "Vencida",
  CANCELADA: "Cancelada",
};

export function isQuoteStatusValue(value: string): value is QuoteStatusValue {
  return quoteStatusValues.includes(value as QuoteStatusValue);
}

/**
 * Allowed proforma transitions. A quote is created as BORRADOR or EMITIDA and
 * only moves forward; terminal states accept no further change. Mirrors the
 * current follow-up rules exactly.
 */
const quoteTransitions: Record<QuoteStatusValue, QuoteStatusValue[]> = {
  BORRADOR: ["EMITIDA", "CANCELADA"],
  EMITIDA: ["ACEPTADA", "VENCIDA", "CANCELADA"],
  ACEPTADA: [],
  VENCIDA: [],
  CANCELADA: [],
};

export function canTransitionQuote(
  current: QuoteStatusValue,
  next: QuoteStatusValue,
): boolean {
  return quoteTransitions[current].includes(next);
}

export type QuoteSaleTypeValue = "CONTADO" | "FINANCIAMIENTO_EXTERNO";

export const quoteSaleTypeValues: QuoteSaleTypeValue[] = [
  "CONTADO",
  "FINANCIAMIENTO_EXTERNO",
];

export function isQuoteSaleTypeValue(
  value: string,
): value is QuoteSaleTypeValue {
  return quoteSaleTypeValues.includes(value as QuoteSaleTypeValue);
}

export type QuoteDTO = {
  id: string;
  quoteNumber: string | null;
  customerFileId: string;
  fileNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  branchCode: string | null;
  branchName: string;
  createdById: string | null;
  createdByName: string | null;
  motorcycleModel: string;
  saleType: QuoteSaleTypeValue | null;
  price: number | null;
  downPayment: number | null;
  termMonths: number | null;
  estimatedPayment: number | null;
  currency: string | null;
  status: QuoteStatusValue;
  statusLabel: string;
  issuedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// --- Expediente document checklist ---------------------------------------

export type ExpedienteDocumentTypeValue =
  | "CEDULA"
  | "INGRESOS"
  | "SERVICIOS"
  | "CONSTANCIA"
  | "LICENCIA"
  | "REFERENCIA"
  | "OTRO";

export const expedienteDocumentTypeValues: ExpedienteDocumentTypeValue[] = [
  "CEDULA",
  "INGRESOS",
  "SERVICIOS",
  "CONSTANCIA",
  "LICENCIA",
  "REFERENCIA",
  "OTRO",
];

export const expedienteDocumentTypeLabels: Record<
  ExpedienteDocumentTypeValue,
  string
> = {
  CEDULA: "Cédula",
  INGRESOS: "Comprobante de ingresos",
  SERVICIOS: "Recibo de servicios",
  CONSTANCIA: "Constancia laboral",
  LICENCIA: "Licencia",
  REFERENCIA: "Referencia personal",
  OTRO: "Documento adicional",
};

/** Checklist rows created when an expediente opens its document review. */
export const defaultExpedienteDocumentTypes: ExpedienteDocumentTypeValue[] = [
  "CEDULA",
  "INGRESOS",
  "SERVICIOS",
  "CONSTANCIA",
  "REFERENCIA",
];

export function isExpedienteDocumentTypeValue(
  value: string,
): value is ExpedienteDocumentTypeValue {
  return expedienteDocumentTypeValues.includes(
    value as ExpedienteDocumentTypeValue,
  );
}

export type ExpedienteDocumentStatusValue =
  | "PENDIENTE"
  | "RECIBIDO"
  | "REVISADO"
  | "RECHAZADO";

export const expedienteDocumentStatusValues: ExpedienteDocumentStatusValue[] = [
  "PENDIENTE",
  "RECIBIDO",
  "REVISADO",
  "RECHAZADO",
];

export const expedienteDocumentStatusLabels: Record<
  ExpedienteDocumentStatusValue,
  string
> = {
  PENDIENTE: "Pendiente",
  RECIBIDO: "Recibido",
  REVISADO: "Revisado",
  RECHAZADO: "Rechazado",
};

export function isExpedienteDocumentStatusValue(
  value: string,
): value is ExpedienteDocumentStatusValue {
  return expedienteDocumentStatusValues.includes(
    value as ExpedienteDocumentStatusValue,
  );
}

export type ExpedienteDocumentDTO = {
  id: string;
  customerFileId: string;
  branchCode: string | null;
  branchName: string;
  documentType: ExpedienteDocumentTypeValue;
  documentTypeLabel: string;
  status: ExpedienteDocumentStatusValue;
  statusLabel: string;
  notes: string | null;
  reviewedById: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExpedienteDocumentProgressDTO = {
  total: number;
  pendientes: number;
  recibidos: number;
  revisados: number;
  rechazados: number;
  /** 0-100, share of checklist rows already reviewed. */
  reviewedPercent: number;
};

export function buildDocumentProgress(
  documents: ExpedienteDocumentDTO[],
): ExpedienteDocumentProgressDTO {
  const count = (status: ExpedienteDocumentStatusValue) =>
    documents.filter((document) => document.status === status).length;
  const total = documents.length;
  const revisados = count("REVISADO");
  return {
    total,
    pendientes: count("PENDIENTE"),
    recibidos: count("RECIBIDO"),
    revisados,
    rechazados: count("RECHAZADO"),
    reviewedPercent: total ? Math.round((revisados / total) * 100) : 0,
  };
}

// --- Manual credit follow-up ---------------------------------------------

export type CreditStatusValue =
  | "PENDIENTE"
  | "EN_REVISION"
  | "DOCUMENTACION_PENDIENTE"
  | "PREAPROBADO"
  | "APROBADO"
  | "RECHAZADO"
  | "CANCELADO";

export const creditStatusValues: CreditStatusValue[] = [
  "PENDIENTE",
  "EN_REVISION",
  "DOCUMENTACION_PENDIENTE",
  "PREAPROBADO",
  "APROBADO",
  "RECHAZADO",
  "CANCELADO",
];

export const creditStatusLabels: Record<CreditStatusValue, string> = {
  PENDIENTE: "No iniciado",
  EN_REVISION: "En revisión",
  DOCUMENTACION_PENDIENTE: "Documentación pendiente",
  PREAPROBADO: "Preaprobado",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  CANCELADO: "Cancelado",
};

export function isCreditStatusValue(value: string): value is CreditStatusValue {
  return creditStatusValues.includes(value as CreditStatusValue);
}

/** Terminal states stamp `resolvedAt`. */
export const resolvedCreditStatuses: CreditStatusValue[] = [
  "APROBADO",
  "RECHAZADO",
  "CANCELADO",
];

export type CreditFinancingTypeValue =
  | "FINANCIERA_EXTERNA"
  | "CREDITO_INTERNO"
  | "OTRO";

export const creditFinancingTypeValues: CreditFinancingTypeValue[] = [
  "FINANCIERA_EXTERNA",
  "CREDITO_INTERNO",
  "OTRO",
];

export const creditFinancingTypeLabels: Record<
  CreditFinancingTypeValue,
  string
> = {
  FINANCIERA_EXTERNA: "Financiera externa",
  CREDITO_INTERNO: "Crédito interno",
  OTRO: "Otro",
};

export function isCreditFinancingTypeValue(
  value: string,
): value is CreditFinancingTypeValue {
  return creditFinancingTypeValues.includes(value as CreditFinancingTypeValue);
}

export type CreditApplicationDTO = {
  id: string;
  customerFileId: string;
  fileNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  branchCode: string | null;
  branchName: string;
  createdById: string | null;
  createdByName: string | null;
  financialInstitution: string | null;
  financingType: CreditFinancingTypeValue | null;
  financingTypeLabel: string | null;
  status: CreditStatusValue;
  statusLabel: string;
  amount: number | null;
  downPayment: number | null;
  termMonths: number | null;
  estimatedPayment: number | null;
  currency: string | null;
  pendingItems: string | null;
  observations: string | null;
  requestedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Everything the expediente support tab needs, in one payload. */
export type ExpedienteSupportDTO = {
  customerFileId: string;
  quote: QuoteDTO | null;
  documents: ExpedienteDocumentDTO[];
  documentProgress: ExpedienteDocumentProgressDTO;
  creditApplication: CreditApplicationDTO | null;
};

// --- Input validation helpers --------------------------------------------

/** Currency is stored as free text; only these two are accepted on write. */
export const supportedCurrencies = ["USD", "NIO"] as const;
export type SupportedCurrency = (typeof supportedCurrencies)[number];

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return supportedCurrencies.includes(value as SupportedCurrency);
}

/**
 * Coerce a client-supplied money value. Rejects negatives, NaN/Infinity and
 * absurd magnitudes so a bad input can never reach the Decimal column.
 */
export function sanitizeMoney(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 99_999_999) return null;
  return Math.round(value * 100) / 100;
}

/** Term in whole months, bounded to a sane range. */
export function sanitizeTermMonths(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value <= 0 || value > 120) return null;
  return value;
}
