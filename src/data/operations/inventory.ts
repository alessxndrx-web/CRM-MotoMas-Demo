import { motorcycles } from "@/data/catalog/motorcycles";
import {
  desiredBranches,
  type DesiredBranchId,
} from "@/data/operations/leads";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const INVENTORY_UNITS_STORAGE_KEY = storageKeys.inventoryUnits;

export const inventoryUnitStatuses = [
  "Disponible",
  "Reservada",
  "Vendida",
  "En tránsito",
  "Entregada",
] as const;

export type InventoryUnitStatus = (typeof inventoryUnitStatuses)[number];

export type InventoryMovement = {
  id: string;
  fecha: string;
  tipo:
    | "Alta inicial"
    | "Cambio de estado"
    | "Traslado"
    | "Reserva"
    | "Venta"
    | "Entrega";
  sucursalOrigenId: DesiredBranchId | null;
  sucursalOrigenNombre: string | null;
  sucursalDestinoId: DesiredBranchId;
  sucursalDestinoNombre: string;
  estado: InventoryUnitStatus;
  referencia: string | null;
  notas: string;
};

export type InventoryUnit = {
  id: string;
  modeloSlug: string;
  modelo: string;
  vin: string;
  chasis: string;
  motor: string;
  color: string | null;
  sucursalActualId: DesiredBranchId;
  sucursalActual: string;
  estado: InventoryUnitStatus;
  historialMovimientos: InventoryMovement[];
  fechaActualizacion: string;
};

export type InventoryModelSummary = {
  modeloSlug: string;
  modelo: string;
  total: number;
  disponible: number;
  porSucursal: {
    sucursalId: DesiredBranchId;
    sucursalNombre: string;
    total: number;
    disponible: number;
  }[];
};

export function createDemoInventoryUnits() {
  const units: InventoryUnit[] = [];
  const seedDate = "2026-06-15T08:00:00.000Z";

  motorcycles.forEach((motorcycle, motorcycleIndex) => {
    desiredBranches.forEach((branch, branchIndex) => {
      const quantity = getSeedQuantity(motorcycleIndex, branchIndex);

      for (let index = 0; index < quantity; index += 1) {
        const sequence = units.length + 1;
        const status = getSeedStatus(sequence, branchIndex);
        const unitId = `UNIT-${String(sequence).padStart(4, "0")}`;

        units.push({
          id: unitId,
          modeloSlug: motorcycle.slug,
          modelo: motorcycle.name,
          vin: `VIN-MTMS-${String(sequence).padStart(6, "0")}`,
          chasis: `CHS-${motorcycle.slug.toUpperCase().slice(0, 8)}-${String(
            sequence,
          ).padStart(5, "0")}`,
          motor: `MTR-${motorcycle.slug.toUpperCase().slice(0, 8)}-${String(
            sequence,
          ).padStart(5, "0")}`,
          color: motorcycle.colors[index % motorcycle.colors.length] ?? null,
          sucursalActualId: branch.id,
          sucursalActual: branch.name,
          estado: status,
          historialMovimientos: [
            {
              id: `MOV-${String(sequence).padStart(5, "0")}-001`,
              fecha: seedDate,
              tipo: "Alta inicial",
              sucursalOrigenId: null,
              sucursalOrigenNombre: null,
              sucursalDestinoId: branch.id,
              sucursalDestinoNombre: branch.name,
              estado: status,
              referencia: null,
              notas:
                "Unidad demo creada para inventario inicial por sucursal.",
            },
          ],
          fechaActualizacion: seedDate,
        });
      }
    });
  });

  return units;
}

export function normalizeInventoryUnit(value: unknown): InventoryUnit | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<InventoryUnit>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.modeloSlug !== "string" ||
    typeof candidate.modelo !== "string" ||
    typeof candidate.vin !== "string" ||
    typeof candidate.chasis !== "string" ||
    typeof candidate.motor !== "string" ||
    !(typeof candidate.color === "string" || candidate.color === null) ||
    typeof candidate.sucursalActualId !== "string" ||
    !desiredBranches.some((branch) => branch.id === candidate.sucursalActualId) ||
    typeof candidate.sucursalActual !== "string" ||
    !(
      typeof candidate.estado === "string" &&
      isInventoryUnitStatus(candidate.estado)
    ) ||
    typeof candidate.fechaActualizacion !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    modeloSlug: candidate.modeloSlug,
    modelo: candidate.modelo,
    vin: candidate.vin,
    chasis: candidate.chasis,
    motor: candidate.motor,
    color: candidate.color,
    sucursalActualId: candidate.sucursalActualId as DesiredBranchId,
    sucursalActual: candidate.sucursalActual,
    estado: candidate.estado,
    historialMovimientos: Array.isArray(candidate.historialMovimientos)
      ? candidate.historialMovimientos
          .map((movement) => normalizeInventoryMovement(movement))
          .filter(
            (movement): movement is InventoryMovement => Boolean(movement),
          )
      : [],
    fechaActualizacion: candidate.fechaActualizacion,
  };
}

export function buildInventoryModelSummaries(units: InventoryUnit[]) {
  return motorcycles.map<InventoryModelSummary>((motorcycle) => {
    const modelUnits = units.filter((unit) => unit.modeloSlug === motorcycle.slug);
    const availableUnits = modelUnits.filter(
      (unit) => unit.estado === "Disponible",
    );

    return {
      modeloSlug: motorcycle.slug,
      modelo: motorcycle.name,
      total: modelUnits.length,
      disponible: availableUnits.length,
      porSucursal: desiredBranches.map((branch) => {
        const branchUnits = modelUnits.filter(
          (unit) => unit.sucursalActualId === branch.id,
        );

        return {
          sucursalId: branch.id,
          sucursalNombre: branch.name,
          total: branchUnits.length,
          disponible: branchUnits.filter((unit) => unit.estado === "Disponible")
            .length,
        };
      }),
    };
  });
}

export function isInventoryUnitStatus(
  value: string,
): value is InventoryUnitStatus {
  return inventoryUnitStatuses.some((status) => status === value);
}

function getSeedQuantity(motorcycleIndex: number, branchIndex: number) {
  const base = [4, 3, 2, 2, 1, 1];
  const quantity = base[(motorcycleIndex + branchIndex) % base.length];

  return Math.max(1, quantity);
}

function getSeedStatus(
  sequence: number,
  branchIndex: number,
): InventoryUnitStatus {
  if (sequence % 17 === 0) return "En tránsito";
  if (sequence % 13 === 0) return "Entregada";
  if (sequence % 11 === 0) return "Vendida";
  if ((sequence + branchIndex) % 7 === 0) return "Reservada";
  return "Disponible";
}

function normalizeInventoryMovement(
  value: unknown,
): InventoryMovement | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<InventoryMovement>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.fecha !== "string" ||
    !(
      candidate.tipo === "Alta inicial" ||
      candidate.tipo === "Cambio de estado" ||
      candidate.tipo === "Traslado" ||
      candidate.tipo === "Reserva" ||
      candidate.tipo === "Venta" ||
      candidate.tipo === "Entrega"
    ) ||
    !(
      typeof candidate.sucursalOrigenId === "string" ||
      candidate.sucursalOrigenId === null
    ) ||
    !(
      typeof candidate.sucursalOrigenNombre === "string" ||
      candidate.sucursalOrigenNombre === null
    ) ||
    typeof candidate.sucursalDestinoId !== "string" ||
    typeof candidate.sucursalDestinoNombre !== "string" ||
    !(typeof candidate.estado === "string" &&
      isInventoryUnitStatus(candidate.estado)) ||
    !(
      typeof candidate.referencia === "string" ||
      candidate.referencia === null
    ) ||
    typeof candidate.notas !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    fecha: candidate.fecha,
    tipo: candidate.tipo,
    sucursalOrigenId: candidate.sucursalOrigenId as DesiredBranchId | null,
    sucursalOrigenNombre: candidate.sucursalOrigenNombre,
    sucursalDestinoId: candidate.sucursalDestinoId as DesiredBranchId,
    sucursalDestinoNombre: candidate.sucursalDestinoNombre,
    estado: candidate.estado,
    referencia: candidate.referencia,
    notas: candidate.notas,
  };
}
