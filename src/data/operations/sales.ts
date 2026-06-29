import type { DesiredBranchId } from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const SALES_STORAGE_KEY = storageKeys.sales;

export const SALE_COMPLETED_STATUS = "Completada";
export const SALE_DELIVERED_STATUS = "Entregada";

export const saleTypes = ["Contado", "Financiamiento externo"] as const;
export const saleStatuses = [SALE_COMPLETED_STATUS, SALE_DELIVERED_STATUS] as const;

export type SaleType = (typeof saleTypes)[number];
export type SaleStatus = (typeof saleStatuses)[number];

export type SaleRecord = {
  id: string;
  numeroVenta: string;
  clienteId: string;
  clienteNombre: string;
  expedienteId: string | null;
  numeroExpediente: string | null;
  reservaId: string | null;
  numeroReserva: string | null;
  unidadId: string;
  modeloSlug: string;
  modelo: string;
  vin: string;
  sucursalId: DesiredBranchId;
  sucursalNombre: string;
  vendedorId: string;
  vendedorNombre: string;
  tipoVenta: SaleType;
  estado: SaleStatus;
  fechaVenta: string;
  fechaEntrega: string | null;
  observaciones: string | null;
};

export function isSaleType(value: string): value is SaleType {
  return saleTypes.some((type) => type === value);
}

export function isSaleStatus(value: string): value is SaleStatus {
  return saleStatuses.some((status) => status === value);
}

export function normalizeSale(value: unknown): SaleRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<SaleRecord>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.numeroVenta !== "string" ||
    typeof candidate.clienteId !== "string" ||
    typeof candidate.clienteNombre !== "string" ||
    !(
      typeof candidate.expedienteId === "string" ||
      candidate.expedienteId === null
    ) ||
    !(
      typeof candidate.numeroExpediente === "string" ||
      candidate.numeroExpediente === null
    ) ||
    !(typeof candidate.reservaId === "string" || candidate.reservaId === null) ||
    !(
      typeof candidate.numeroReserva === "string" ||
      candidate.numeroReserva === null
    ) ||
    typeof candidate.unidadId !== "string" ||
    typeof candidate.modeloSlug !== "string" ||
    typeof candidate.modelo !== "string" ||
    typeof candidate.vin !== "string" ||
    typeof candidate.sucursalId !== "string" ||
    typeof candidate.sucursalNombre !== "string" ||
    typeof candidate.vendedorId !== "string" ||
    typeof candidate.vendedorNombre !== "string" ||
    !(typeof candidate.tipoVenta === "string" && isSaleType(candidate.tipoVenta)) ||
    !(
      typeof candidate.estado === "string" &&
      isSaleStatus(candidate.estado)
    ) ||
    typeof candidate.fechaVenta !== "string" ||
    !(
      typeof candidate.fechaEntrega === "string" ||
      candidate.fechaEntrega === null ||
      typeof candidate.fechaEntrega === "undefined"
    ) ||
    !(
      typeof candidate.observaciones === "string" ||
      candidate.observaciones === null
    )
  ) {
    return null;
  }

  return {
    id: candidate.id,
    numeroVenta: candidate.numeroVenta,
    clienteId: candidate.clienteId,
    clienteNombre: candidate.clienteNombre,
    expedienteId: candidate.expedienteId,
    numeroExpediente: candidate.numeroExpediente,
    reservaId: candidate.reservaId,
    numeroReserva: candidate.numeroReserva,
    unidadId: candidate.unidadId,
    modeloSlug: candidate.modeloSlug,
    modelo: candidate.modelo,
    vin: candidate.vin,
    sucursalId: candidate.sucursalId as DesiredBranchId,
    sucursalNombre: candidate.sucursalNombre,
    vendedorId: candidate.vendedorId,
    vendedorNombre: candidate.vendedorNombre,
    tipoVenta: candidate.tipoVenta,
    estado: candidate.estado,
    fechaVenta: candidate.fechaVenta,
    fechaEntrega: candidate.fechaEntrega ?? null,
    observaciones: candidate.observaciones,
  };
}
