import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const CREDIT_APPLICATIONS_STORAGE_KEY = storageKeys.creditApplications;

export const creditFinancingTypes = [
  "Financiera externa",
  "Credito interno",
  "Otro",
] as const;

export const creditApplicationStatuses = [
  "No iniciado",
  "En revision",
  "Documentacion pendiente",
  "Preaprobado",
  "Aprobado",
  "Rechazado",
  "Cancelado",
] as const;

export const creditCurrencies = ["USD", "NIO"] as const;

export type CreditFinancingType = (typeof creditFinancingTypes)[number];
export type CreditApplicationStatus = (typeof creditApplicationStatuses)[number];
export type CreditCurrency = (typeof creditCurrencies)[number];

export type CreditApplicationRecord = {
  id: string;
  expedienteId: string;
  customerId: string | null;
  leadId: string | null;
  proformaId: string | null;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  vendedorId: string;
  vendedorNombre: string;
  financiera: string | null;
  tipoFinanciamiento: CreditFinancingType;
  estado: CreditApplicationStatus;
  montoSolicitado: number | null;
  prima: number | null;
  plazoMeses: number | null;
  cuotaEstimada: number | null;
  moneda: CreditCurrency;
  documentosPendientes: string | null;
  observaciones: string | null;
  fechaSolicitud: string | null;
  fechaResolucion: string | null;
  fechaCreacion: string;
  fechaActualizacion: string;
};

export function isCreditFinancingType(value: string): value is CreditFinancingType {
  return creditFinancingTypes.some((type) => type === value);
}

export function isCreditApplicationStatus(value: string): value is CreditApplicationStatus {
  return creditApplicationStatuses.some((status) => status === value);
}

export function isCreditCurrency(value: string): value is CreditCurrency {
  return creditCurrencies.some((currency) => currency === value);
}

export function normalizeCreditApplication(value: unknown): CreditApplicationRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CreditApplicationRecord>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.expedienteId !== "string" ||
    !isNullableString(candidate.customerId) ||
    !isNullableString(candidate.leadId) ||
    !isNullableString(candidate.proformaId) ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string" ||
    typeof candidate.vendedorId !== "string" ||
    typeof candidate.vendedorNombre !== "string" ||
    !isNullableString(candidate.financiera) ||
    !(typeof candidate.tipoFinanciamiento === "string" && isCreditFinancingType(candidate.tipoFinanciamiento)) ||
    !(typeof candidate.estado === "string" && isCreditApplicationStatus(candidate.estado)) ||
    !isOptionalNumber(candidate.montoSolicitado) ||
    !isOptionalNumber(candidate.prima) ||
    !isOptionalNumber(candidate.plazoMeses) ||
    !isOptionalNumber(candidate.cuotaEstimada) ||
    !(typeof candidate.moneda === "string" && isCreditCurrency(candidate.moneda)) ||
    !isNullableString(candidate.documentosPendientes) ||
    !isNullableString(candidate.observaciones) ||
    !isNullableString(candidate.fechaSolicitud) ||
    !isNullableString(candidate.fechaResolucion) ||
    typeof candidate.fechaCreacion !== "string" ||
    typeof candidate.fechaActualizacion !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    expedienteId: candidate.expedienteId,
    customerId: candidate.customerId,
    leadId: candidate.leadId,
    proformaId: candidate.proformaId,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
    vendedorId: candidate.vendedorId,
    vendedorNombre: candidate.vendedorNombre,
    financiera: candidate.financiera,
    tipoFinanciamiento: candidate.tipoFinanciamiento,
    estado: candidate.estado,
    montoSolicitado: candidate.montoSolicitado,
    prima: candidate.prima,
    plazoMeses: candidate.plazoMeses,
    cuotaEstimada: candidate.cuotaEstimada,
    moneda: candidate.moneda,
    documentosPendientes: candidate.documentosPendientes,
    observaciones: candidate.observaciones,
    fechaSolicitud: candidate.fechaSolicitud,
    fechaResolucion: candidate.fechaResolucion,
    fechaCreacion: candidate.fechaCreacion,
    fechaActualizacion: candidate.fechaActualizacion,
  };
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isOptionalNumber(value: unknown): value is number | null {
  return (typeof value === "number" && Number.isFinite(value)) || value === null;
}
