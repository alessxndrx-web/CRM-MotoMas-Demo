import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const CUSTOMERS_STORAGE_KEY = storageKeys.customers;
export const CUSTOMER_FILES_STORAGE_KEY = storageKeys.customerFiles;
export const CUSTOMER_FILE_CREATED_STATUS = "Expediente creado";

export type CustomerInteraction = {
  id: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  leadId: string | null;
  expedienteId: string | null;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  vendedor: string | null;
};

export type CustomerRecord = {
  id: string;
  nombre: string;
  telefono: string;
  cedula?: string | null;
  correo: string | null;
  sucursalOrigenId: DesiredBranchId;
  sucursalOrigenNombre: string;
  origenLeadId: string;
  historialInteracciones: CustomerInteraction[];
  fechaCreacion: string;
  fechaActualizacion: string;
};

export type CustomerFileRecord = {
  id: string;
  numeroExpediente: string;
  clienteId: string;
  leadId: string;
  motoInteres: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  vendedor: string;
  estado: typeof CUSTOMER_FILE_CREATED_STATUS;
  fechaCreacion: string;
  observaciones: string | null;
};

export function normalizeCustomer(value: unknown): CustomerRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CustomerRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.nombre !== "string" ||
    typeof candidate.telefono !== "string" ||
    !(
      typeof candidate.cedula === "string" ||
      candidate.cedula === null ||
      typeof candidate.cedula === "undefined"
    ) ||
    !(typeof candidate.correo === "string" || candidate.correo === null) ||
    typeof candidate.sucursalOrigenId !== "string" ||
    typeof candidate.sucursalOrigenNombre !== "string" ||
    typeof candidate.origenLeadId !== "string" ||
    typeof candidate.fechaCreacion !== "string" ||
    typeof candidate.fechaActualizacion !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    nombre: candidate.nombre,
    telefono: candidate.telefono,
    cedula: candidate.cedula ?? null,
    correo: candidate.correo,
    sucursalOrigenId: candidate.sucursalOrigenId as DesiredBranchId,
    sucursalOrigenNombre: candidate.sucursalOrigenNombre,
    origenLeadId: candidate.origenLeadId,
    historialInteracciones: Array.isArray(candidate.historialInteracciones)
      ? candidate.historialInteracciones
          .map((interaction) => normalizeCustomerInteraction(interaction))
          .filter(
            (interaction): interaction is CustomerInteraction =>
              Boolean(interaction),
          )
      : [],
    fechaCreacion: candidate.fechaCreacion,
    fechaActualizacion: candidate.fechaActualizacion,
  };
}

export function normalizeCustomerFile(value: unknown): CustomerFileRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CustomerFileRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.numeroExpediente !== "string" ||
    typeof candidate.clienteId !== "string" ||
    typeof candidate.leadId !== "string" ||
    typeof candidate.motoInteres !== "string" ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string" ||
    typeof candidate.vendedor !== "string" ||
    candidate.estado !== CUSTOMER_FILE_CREATED_STATUS ||
    typeof candidate.fechaCreacion !== "string" ||
    !(
      typeof candidate.observaciones === "string" ||
      candidate.observaciones === null
    )
  ) {
    return null;
  }

  return {
    id: candidate.id,
    numeroExpediente: candidate.numeroExpediente,
    clienteId: candidate.clienteId,
    leadId: candidate.leadId,
    motoInteres: candidate.motoInteres,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
    vendedor: candidate.vendedor,
    estado: candidate.estado,
    fechaCreacion: candidate.fechaCreacion,
    observaciones: candidate.observaciones,
  };
}

function normalizeCustomerInteraction(
  value: unknown,
): CustomerInteraction | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CustomerInteraction>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fecha !== "string" ||
    typeof candidate.tipo !== "string" ||
    typeof candidate.descripcion !== "string" ||
    !(typeof candidate.leadId === "string" || candidate.leadId === null) ||
    !(
      typeof candidate.expedienteId === "string" ||
      candidate.expedienteId === null
    ) ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string" ||
    !(typeof candidate.vendedor === "string" || candidate.vendedor === null)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    fecha: candidate.fecha,
    tipo: candidate.tipo,
    descripcion: candidate.descripcion,
    leadId: candidate.leadId,
    expedienteId: candidate.expedienteId,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
    vendedor: candidate.vendedor,
  };
}
