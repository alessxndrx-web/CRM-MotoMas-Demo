/**
 * Pure, client-safe inventory types and constants. No database import here so
 * client components can use the DTO shapes and the egress reason catalog.
 */

export type MotorcycleUnitStatusValue =
  | "AVAILABLE"
  | "RESERVED"
  | "IN_TRANSFER"
  | "SOLD"
  | "DELIVERED"
  | "EXITED"
  | "CANCELLED";

export const unitStatusLabels: Record<MotorcycleUnitStatusValue, string> = {
  AVAILABLE: "Disponible",
  RESERVED: "Reservada",
  IN_TRANSFER: "En traslado",
  SOLD: "Vendida",
  DELIVERED: "Entregada",
  EXITED: "Dada de baja",
  CANCELLED: "Cancelada",
};

export type InventoryUnitDTO = {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  chassisNumber: string;
  engineNumber: string | null;
  color: string | null;
  status: MotorcycleUnitStatusValue;
  branchCode: string | null;
  branchName: string;
  entryDate: string;
  exitDate: string | null;
};

export type InventoryMovementDTO = {
  id: string;
  type: string;
  typeLabel: string;
  date: string;
  reason: string;
  notes: string | null;
  unitChassis: string;
  unitName: string;
  branchName: string;
  createdByName: string;
};

export const movementTypeLabels: Record<string, string> = {
  INGRESO: "Ingreso",
  EGRESO: "Egreso",
  RESERVA: "Reserva",
  VENTA: "Venta",
  ENTREGA: "Entrega",
  TRASLADO_SALIDA: "Traslado (salida)",
  TRASLADO_ENTRADA: "Traslado (entrada)",
  AJUSTE: "Ajuste",
};

export const egressReasons = [
  { value: "SOLD", label: "Venta", status: "SOLD", movement: "VENTA" },
  { value: "DELIVERED", label: "Entrega", status: "DELIVERED", movement: "ENTREGA" },
  {
    value: "TRANSFERRED_OUT",
    label: "Traslado a otra sucursal",
    status: "EXITED",
    movement: "TRASLADO_SALIDA",
  },
  { value: "ADJUSTMENT", label: "Ajuste de inventario", status: "EXITED", movement: "AJUSTE" },
  { value: "CANCELLED", label: "Cancelación", status: "CANCELLED", movement: "EGRESO" },
  { value: "OTHER", label: "Otro / baja", status: "EXITED", movement: "EGRESO" },
] as const;

export type EgressReasonValue = (typeof egressReasons)[number]["value"];

export function egressReasonConfig(value: string) {
  return egressReasons.find((reason) => reason.value === value) ?? null;
}
