import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const CUSTOMER_FILE_DOCUMENTS_STORAGE_KEY = storageKeys.expedientDocuments;

export const customerFileDocumentTypes = [
  "Cedula",
  "Comprobante de ingresos",
  "Recibo de servicios",
  "Constancia laboral",
  "Licencia",
  "Referencia personal",
  "Documento adicional",
] as const;

export const suggestedCustomerFileDocumentTypes = [
  "Cedula",
  "Comprobante de ingresos",
  "Recibo de servicios",
  "Constancia laboral",
  "Referencia personal",
] as const;

export const customerFileDocumentStatuses = [
  "Pendiente",
  "Recibido",
  "Revisado",
  "Rechazado",
] as const;

export type CustomerFileDocumentType = (typeof customerFileDocumentTypes)[number];
export type CustomerFileDocumentStatus = (typeof customerFileDocumentStatuses)[number];

export type CustomerFileDocumentRecord = {
  id: string;
  expedienteId: string;
  customerId: string | null;
  leadId: string | null;
  tipo: CustomerFileDocumentType;
  estado: CustomerFileDocumentStatus;
  observaciones: string | null;
  fechaRegistro: string;
  fechaActualizacion: string;
  registradoPor: string;
  vendedorId: string;
  vendedorNombre: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
};

export type CustomerFileDocumentProgress = {
  baseTotal: number;
  revisados: number;
  pendientes: number;
  recibidos: number;
  rechazados: number;
  listo: boolean;
};

export function isCustomerFileDocumentType(value: string): value is CustomerFileDocumentType {
  return customerFileDocumentTypes.some((type) => type === value);
}

export function isCustomerFileDocumentStatus(value: string): value is CustomerFileDocumentStatus {
  return customerFileDocumentStatuses.some((status) => status === value);
}

export function normalizeCustomerFileDocument(value: unknown): CustomerFileDocumentRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CustomerFileDocumentRecord>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.expedienteId !== "string" ||
    !(typeof candidate.customerId === "string" || candidate.customerId === null) ||
    !(typeof candidate.leadId === "string" || candidate.leadId === null) ||
    !(typeof candidate.tipo === "string" && isCustomerFileDocumentType(candidate.tipo)) ||
    !(typeof candidate.estado === "string" && isCustomerFileDocumentStatus(candidate.estado)) ||
    !(typeof candidate.observaciones === "string" || candidate.observaciones === null) ||
    typeof candidate.fechaRegistro !== "string" ||
    typeof candidate.fechaActualizacion !== "string" ||
    typeof candidate.registradoPor !== "string" ||
    typeof candidate.vendedorId !== "string" ||
    typeof candidate.vendedorNombre !== "string" ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    expedienteId: candidate.expedienteId,
    customerId: candidate.customerId,
    leadId: candidate.leadId,
    tipo: candidate.tipo,
    estado: candidate.estado,
    observaciones: candidate.observaciones,
    fechaRegistro: candidate.fechaRegistro,
    fechaActualizacion: candidate.fechaActualizacion,
    registradoPor: candidate.registradoPor,
    vendedorId: candidate.vendedorId,
    vendedorNombre: candidate.vendedorNombre,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
  };
}

export function getCustomerFileDocumentProgress(
  documents: CustomerFileDocumentRecord[],
): CustomerFileDocumentProgress {
  const baseDocuments = suggestedCustomerFileDocumentTypes.map((type) =>
    documents.find((document) => document.tipo === type) ?? null,
  );
  const revisados = baseDocuments.filter(
    (document) => document?.estado === "Revisado",
  ).length;
  const pendientes = documents.filter((document) => document.estado === "Pendiente").length;
  const recibidos = documents.filter((document) => document.estado === "Recibido").length;
  const rechazados = documents.filter((document) => document.estado === "Rechazado").length;

  return {
    baseTotal: suggestedCustomerFileDocumentTypes.length,
    revisados,
    pendientes,
    recibidos,
    rechazados,
    listo:
      revisados === suggestedCustomerFileDocumentTypes.length &&
      rechazados === 0,
  };
}
