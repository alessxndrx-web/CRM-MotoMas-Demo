import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const QUOTES_STORAGE_KEY = storageKeys.quotes;

export const quoteStatuses = [
  "Borrador",
  "Emitida",
  "Aceptada",
  "Vencida",
  "Cancelada",
] as const;
export const quoteSaleTypes = ["Contado", "Financiamiento externo"] as const;
export const quoteCurrencies = ["USD", "NIO"] as const;

export type QuoteStatus = (typeof quoteStatuses)[number];
export type QuoteSaleType = (typeof quoteSaleTypes)[number];
export type QuoteCurrency = (typeof quoteCurrencies)[number];

export type QuoteRecord = {
  id: string;
  numeroProforma: string;
  leadId: string | null;
  customerId: string | null;
  expedienteId: string;
  modeloId: string | null;
  modeloNombre: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  vendedorId: string;
  vendedorNombre: string;
  tipoVenta: QuoteSaleType;
  precioReferencial: number | null;
  prima: number | null;
  plazoMeses: number | null;
  cuotaEstimada: number | null;
  moneda: QuoteCurrency;
  estado: QuoteStatus;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  observaciones: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
};

export function isQuoteStatus(value: string): value is QuoteStatus {
  return quoteStatuses.some((status) => status === value);
}

export function isQuoteSaleType(value: string): value is QuoteSaleType {
  return quoteSaleTypes.some((type) => type === value);
}

export function isQuoteCurrency(value: string): value is QuoteCurrency {
  return quoteCurrencies.some((currency) => currency === value);
}

export function normalizeQuote(value: unknown): QuoteRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<QuoteRecord>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.numeroProforma !== "string" ||
    !(typeof candidate.leadId === "string" || candidate.leadId === null) ||
    !(typeof candidate.customerId === "string" || candidate.customerId === null) ||
    typeof candidate.expedienteId !== "string" ||
    !(typeof candidate.modeloId === "string" || candidate.modeloId === null) ||
    typeof candidate.modeloNombre !== "string" ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string" ||
    typeof candidate.vendedorId !== "string" ||
    typeof candidate.vendedorNombre !== "string" ||
    !(typeof candidate.tipoVenta === "string" && isQuoteSaleType(candidate.tipoVenta)) ||
    !isOptionalAmount(candidate.precioReferencial) ||
    !isOptionalAmount(candidate.prima) ||
    !isOptionalAmount(candidate.plazoMeses) ||
    !isOptionalAmount(candidate.cuotaEstimada) ||
    !(typeof candidate.moneda === "string" && isQuoteCurrency(candidate.moneda)) ||
    !(typeof candidate.estado === "string" && isQuoteStatus(candidate.estado)) ||
    !(typeof candidate.fechaEmision === "string" || candidate.fechaEmision === null) ||
    !(
      typeof candidate.fechaVencimiento === "string" ||
      candidate.fechaVencimiento === null
    ) ||
    !(typeof candidate.observaciones === "string" || candidate.observaciones === null) ||
    typeof candidate.fechaCreacion !== "string" ||
    typeof candidate.fechaActualizacion !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    numeroProforma: candidate.numeroProforma,
    leadId: candidate.leadId,
    customerId: candidate.customerId,
    expedienteId: candidate.expedienteId,
    modeloId: candidate.modeloId,
    modeloNombre: candidate.modeloNombre,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
    vendedorId: candidate.vendedorId,
    vendedorNombre: candidate.vendedorNombre,
    tipoVenta: candidate.tipoVenta,
    precioReferencial: candidate.precioReferencial,
    prima: candidate.prima,
    plazoMeses: candidate.plazoMeses,
    cuotaEstimada: candidate.cuotaEstimada,
    moneda: candidate.moneda,
    estado: candidate.estado,
    fechaEmision: candidate.fechaEmision,
    fechaVencimiento: candidate.fechaVencimiento,
    observaciones: candidate.observaciones,
    fechaCreacion: candidate.fechaCreacion,
    fechaActualizacion: candidate.fechaActualizacion,
  };
}

function isOptionalAmount(value: unknown): value is number | null {
  return (typeof value === "number" && Number.isFinite(value)) || value === null;
}
