"use server";

import { revalidatePath } from "next/cache";

import {
  canRegisterMotorcycleEgress,
  canRegisterMotorcycleIngress,
} from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { isPendingBrand } from "@/server/catalog/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { egressReasonConfig } from "@/server/inventory/shared";

export type InventoryActionResult = { ok: true } | { ok: false; error: string };

const DB_REQUIRED =
  "El registro de inventario requiere una base de datos configurada (DATABASE_URL).";

export type IngressInput = {
  /**
   * Patch CRM-INT1 — el modelo del catálogo general al que pertenece la unidad.
   *
   * Hasta este parche el alta nunca lo escribía, así que ninguna unidad
   * quedaba enlazada a su modelo y la ficha del lead contaba siempre «sin
   * unidades disponibles». Marca y modelo se toman del catálogo para que no
   * puedan contradecirlo.
   *
   * Patch CRM-INT2 — **obligatorio.** CRM-INT1 lo dejó opcional y cada alta sin
   * él fabricaba otra unidad que la conciliación del catálogo tendría que
   * enlazar a mano. Si el modelo no está en el catálogo, lo da de alta el
   * Administrador antes de registrar la unidad. No hay restricción en la base
   * (las unidades históricas siguen sin modelo hasta conciliarlas): la regla
   * vive aquí, que es el único sitio del código que crea unidades.
   */
  catalogModelId: string;
  name: string;
  brand: string;
  model: string;
  year: string;
  chassisNumber: string;
  engineNumber: string;
  color: string;
  branchCode: string;
  entryDate: string;
  notes: string;
};

export async function registerIngress(
  input: IngressInput,
): Promise<InventoryActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: "Sesión no válida." };
  if (!canRegisterMotorcycleIngress(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para registrar ingresos." };
  }

  let name = input.name.trim();
  let brand = input.brand.trim();
  let model = input.model.trim();
  if (!input.catalogModelId?.trim()) {
    return {
      ok: false,
      error:
        "Elige el modelo del catálogo. Si no aparece, pide al Administrador que lo dé de alta en Catálogo de motos.",
    };
  }
  const catalog = await getPrisma().motorcycleCatalogModel.findUnique({
    where: { id: input.catalogModelId.trim() },
  });
  if (!catalog || !catalog.isActive) {
    return { ok: false, error: "El modelo del catálogo no está disponible." };
  }
  const catalogModelId = catalog.id;
  // La marca de relleno del seed no es una marca: si el catálogo aún no la
  // tiene, se respeta la que escribió quien registra la unidad.
  brand = isPendingBrand(catalog.brand) ? brand : catalog.brand;
  model = catalog.model;
  name = name || [brand, catalog.model, catalog.version].filter(Boolean).join(" ");
  const chassisNumber = input.chassisNumber.trim().toUpperCase();
  const year = Number(input.year);
  const branchCode = input.branchCode.trim();

  if (!name || !brand || !model || !chassisNumber || !branchCode) {
    return { ok: false, error: "Completa nombre, marca, modelo, chasis y sucursal." };
  }
  if (!Number.isInteger(year) || year < 1990 || year > 2100) {
    return { ok: false, error: "El año no es válido." };
  }

  // Manager can only register ingress for their own branch.
  if (session.roleEnum === "GERENTE" && branchCode !== session.branchId) {
    return { ok: false, error: "Solo puedes registrar ingresos en tu sucursal." };
  }

  const entryDate = input.entryDate ? new Date(input.entryDate) : new Date();
  if (Number.isNaN(entryDate.getTime())) {
    return { ok: false, error: "La fecha de ingreso no es válida." };
  }

  try {
    const prisma = getPrisma();

    const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
    if (!branch) {
      return { ok: false, error: "La sucursal seleccionada no existe en la base de datos." };
    }

    const duplicate = await prisma.motorcycleUnit.findUnique({
      where: { chassisNumber },
    });
    if (duplicate) {
      return {
        ok: false,
        error: `Ya existe una unidad con el chasis ${chassisNumber}.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      const unit = await tx.motorcycleUnit.create({
        data: {
          branchId: branch.id,
          catalogModelId,
          name,
          brand,
          model,
          year,
          chassisNumber,
          engineNumber: input.engineNumber.trim() || null,
          color: input.color.trim() || null,
          entryDate,
          status: "AVAILABLE",
        },
      });
      await tx.inventoryMovement.create({
        data: {
          motorcycleUnitId: unit.id,
          branchId: branch.id,
          type: "INGRESO",
          reason: "Ingreso de unidad al inventario",
          notes: input.notes.trim() || null,
          createdByUserId: session.uid,
          date: entryDate,
        },
      });
    });

    revalidatePath("/panel/inventario/movimientos");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "No se pudo registrar el ingreso. Revisa la conexión a la base de datos.",
    };
  }
}

export type EgressInput = {
  unitId: string;
  reason: string;
  exitDate: string;
  notes: string;
};

export async function registerEgress(
  input: EgressInput,
): Promise<InventoryActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await getCurrentUserSession();
  if (!session) return { ok: false, error: "Sesión no válida." };
  if (!canRegisterMotorcycleEgress(session.roleEnum)) {
    return { ok: false, error: "No tienes permiso para registrar egresos." };
  }

  const reasonConfig = egressReasonConfig(input.reason);
  if (!reasonConfig) return { ok: false, error: "Motivo de egreso no válido." };

  const exitDate = input.exitDate ? new Date(input.exitDate) : new Date();
  if (Number.isNaN(exitDate.getTime())) {
    return { ok: false, error: "La fecha de egreso no es válida." };
  }

  try {
    const prisma = getPrisma();

    const unit = await prisma.motorcycleUnit.findUnique({
      where: { id: input.unitId },
      include: { branch: true },
    });
    if (!unit) return { ok: false, error: "La unidad no existe." };

    // Manager can only operate units in their own branch.
    if (session.roleEnum === "GERENTE" && unit.branch?.code !== session.branchId) {
      return { ok: false, error: "Solo puedes dar de baja unidades de tu sucursal." };
    }

    const alreadyOut =
      unit.exitDate !== null ||
      ["EXITED", "SOLD", "DELIVERED", "CANCELLED"].includes(unit.status);
    if (alreadyOut) {
      return {
        ok: false,
        error: "Esta unidad ya tiene una salida registrada y no puede darse de baja de nuevo.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.motorcycleUnit.update({
        where: { id: unit.id },
        data: {
          status: reasonConfig.status,
          exitDate,
        },
      });
      await tx.inventoryMovement.create({
        data: {
          motorcycleUnitId: unit.id,
          branchId: unit.branchId,
          type: reasonConfig.movement,
          reason: `Egreso: ${reasonConfig.label}`,
          notes: input.notes.trim() || null,
          createdByUserId: session.uid,
          date: exitDate,
        },
      });
    });

    revalidatePath("/panel/inventario/movimientos");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "No se pudo registrar el egreso. Revisa la conexión a la base de datos.",
    };
  }
}
