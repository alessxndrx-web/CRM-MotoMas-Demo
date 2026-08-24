import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import type { BranchScope } from "@/server/auth/access";
import {
  movementTypeLabels,
  type InventoryMovementDTO,
  type InventoryUnitDTO,
  type MotorcycleUnitStatusValue,
} from "@/server/inventory/shared";

export type InventoryData = {
  units: InventoryUnitDTO[];
  movements: InventoryMovementDTO[];
  branchResolved: boolean;
};

/** Resolves the cuid branch id for a branch code, or null if not seeded. */
async function resolveBranchId(branchCode: string): Promise<string | null> {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  return branch?.id ?? null;
}

export async function getInventoryData(scope: BranchScope): Promise<InventoryData> {
  if (!isDatabaseConfigured()) {
    return { units: [], movements: [], branchResolved: true };
  }

  const prisma = getPrisma();

  let branchId: string | undefined;
  if (!scope.global) {
    const resolved = await resolveBranchId(scope.branchCode);
    if (!resolved) {
      return { units: [], movements: [], branchResolved: false };
    }
    branchId = resolved;
  }

  const unitWhere = branchId ? { branchId } : {};
  const [units, movements] = await Promise.all([
    prisma.motorcycleUnit.findMany({
      where: unitWhere,
      include: { branch: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.inventoryMovement.findMany({
      where: branchId ? { branchId } : {},
      include: { branch: true, motorcycleUnit: true, createdBy: true },
      orderBy: { date: "desc" },
      take: 40,
    }),
  ]);

  return {
    units: units.map(
      (unit): InventoryUnitDTO => ({
        id: unit.id,
        name: unit.name,
        brand: unit.brand,
        model: unit.model,
        year: unit.year,
        chassisNumber: unit.chassisNumber,
        engineNumber: unit.engineNumber,
        color: unit.color,
        status: unit.status as MotorcycleUnitStatusValue,
        branchCode: unit.branch?.code ?? null,
        branchName: unit.branch?.name ?? "Sucursal",
        entryDate: unit.entryDate.toISOString(),
        exitDate: unit.exitDate ? unit.exitDate.toISOString() : null,
      }),
    ),
    movements: movements.map(
      (movement): InventoryMovementDTO => ({
        id: movement.id,
        type: movement.type,
        typeLabel: movementTypeLabels[movement.type] ?? movement.type,
        date: movement.date.toISOString(),
        reason: movement.reason,
        notes: movement.notes,
        unitChassis: movement.motorcycleUnit?.chassisNumber ?? "",
        unitName: movement.motorcycleUnit?.name ?? "",
        branchName: movement.branch?.name ?? "Sucursal",
        createdByName: movement.createdBy?.name ?? "Usuario",
      }),
    ),
    branchResolved: true,
  };
}
