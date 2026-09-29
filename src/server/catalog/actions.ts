"use server";

import { revalidatePath } from "next/cache";

import { canManageMotorcycleCatalog } from "@/server/auth/access";
import { getCurrentUserSession } from "@/server/auth/context";
import { suggestCatalogModel } from "@/server/catalog/reconciliation";
import { uniqueCatalogSlug } from "@/server/catalog/service";
import {
  CATALOG_MAX_YEAR,
  CATALOG_MIN_YEAR,
  CATALOG_TEXT_MAX,
  PENDING_BRAND,
  catalogModelLabel,
} from "@/server/catalog/shared";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch CRM-INT1 — mantenimiento del catálogo general de motocicletas.
 *
 * Hasta este parche el catálogo sólo cambiaba editando `prisma/seed.mjs`, y el
 * seed además **reescribía marca, año y estado en cada ejecución**: un modelo
 * dado de baja volvía a aparecer en el siguiente despliegue. Ahora el seed sólo
 * crea lo que falta y esto es lo que lo mantiene.
 *
 * Reglas:
 *
 * - **Nunca se borra un modelo.** Leads, unidades, campañas y costos contables
 *   apuntan a él. Darlo de baja lo saca de los selectores y conserva todo lo
 *   que ya lo usa.
 * - **El slug no cambia.** Es la clave que guardaron leads y campañas antiguas
 *   como texto; cambiarlo los dejaría apuntando a nada.
 * - **Un modelo no se repite.** Misma marca, modelo, versión y año que otro
 *   —activo o no— se rechaza, con el nombre del existente.
 * - Dar de alta un modelo **no crea existencias**: las unidades entran por el
 *   ingreso de inventario, nunca desde aquí.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";

export type CatalogActionResult = { ok: true; id: string } | { ok: false; error: string };

type CatalogInput = {
  brand: string;
  model: string;
  version?: string | null;
  year?: number | string | null;
  description?: string | null;
};

type ValidCatalog = {
  brand: string;
  model: string;
  version: string | null;
  year: number | null;
  description: string | null;
};

function validate(input: CatalogInput): { ok: true; data: ValidCatalog } | { ok: false; error: string } {
  const brand = sanitizeText(input.brand ?? "");
  const model = sanitizeText(input.model ?? "");
  const version = sanitizeText(input.version ?? "") || null;
  if (!brand) return { ok: false, error: "La marca es obligatoria." };
  if (!model) return { ok: false, error: "El modelo es obligatorio." };
  if (brand === PENDING_BRAND) {
    return { ok: false, error: "Escribe la marca real del modelo." };
  }
  if (
    brand.length > CATALOG_TEXT_MAX ||
    model.length > CATALOG_TEXT_MAX ||
    (version?.length ?? 0) > CATALOG_TEXT_MAX
  ) {
    return { ok: false, error: `Marca, modelo y versión admiten hasta ${CATALOG_TEXT_MAX} caracteres.` };
  }

  let year: number | null = null;
  if (input.year !== null && input.year !== undefined && String(input.year).trim() !== "") {
    year = Number(input.year);
    if (!Number.isInteger(year) || year < CATALOG_MIN_YEAR || year > CATALOG_MAX_YEAR) {
      return { ok: false, error: `El año debe estar entre ${CATALOG_MIN_YEAR} y ${CATALOG_MAX_YEAR}.` };
    }
  }

  const description = sanitizeText(input.description ?? "").slice(0, 500) || null;
  return { ok: true, data: { brand, model, version, year, description } };
}

async function authorize() {
  if (!isDatabaseConfigured()) return { ok: false as const, error: DB_REQUIRED };
  const session = await getCurrentUserSession();
  if (!session) return { ok: false as const, error: "Sesión no válida." };
  if (!canManageMotorcycleCatalog(session.roleEnum)) {
    return { ok: false as const, error: "Sólo el Administrador mantiene el catálogo de motocicletas." };
  }
  return { ok: true as const, session };
}

/** El mismo modelo ya registrado, comparando sin mayúsculas ni espacios. */
async function findDuplicate(data: ValidCatalog, exceptId?: string) {
  return getPrisma().motorcycleCatalogModel.findFirst({
    where: {
      id: exceptId ? { not: exceptId } : undefined,
      brand: { equals: data.brand, mode: "insensitive" },
      model: { equals: data.model, mode: "insensitive" },
      version: data.version ? { equals: data.version, mode: "insensitive" } : null,
      year: data.year,
    },
    select: { brand: true, model: true, version: true, year: true, isActive: true },
  });
}

function revalidateCatalogRoutes() {
  revalidatePath("/panel/catalogo-motos");
  revalidatePath("/panel/inventario");
  revalidatePath("/panel/leads");
  revalidatePath("/panel/marketing");
}

export async function createCatalogModelAction(
  input: CatalogInput,
): Promise<CatalogActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const valid = validate(input);
  if (!valid.ok) return valid;
  const data = valid.data;

  const duplicate = await findDuplicate(data);
  if (duplicate) {
    return {
      ok: false,
      error: `Ya existe «${catalogModelLabel(duplicate)}»${duplicate.isActive ? "" : " (dado de baja: reactívalo)"}.`,
    };
  }

  const prisma = getPrisma();
  try {
    const created = await prisma.$transaction(async (tx) => {
      const slug = await uniqueCatalogSlug(
        tx,
        [data.brand, data.model, data.version, data.year].filter(Boolean).join(" "),
      );
      const model = await tx.motorcycleCatalogModel.create({
        data: { ...data, slug, isActive: true },
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.session.uid,
          action: "CATALOG_MODEL_CREATED",
          targetType: "MotorcycleCatalogModel",
          targetId: model.id,
          description: `Alta del modelo ${catalogModelLabel(model)} (${slug}).`,
        },
      });
      return model;
    });
    revalidateCatalogRoutes();
    return { ok: true, id: created.id };
  } catch {
    return { ok: false, error: "No se pudo registrar el modelo." };
  }
}

/**
 * Dar de baja o reactivar, sin tocar ningún otro dato. Va aparte de la edición
 * para que un modelo sembrado con la marca pendiente se pueda dar de baja sin
 * obligar a inventarle una marca primero.
 */
export async function setCatalogModelActiveAction(input: {
  id: string;
  isActive: boolean;
}): Promise<CatalogActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const prisma = getPrisma();
  const current = await prisma.motorcycleCatalogModel.findUnique({
    where: { id: input.id },
  });
  if (!current) return { ok: false, error: "El modelo no existe." };
  if (current.isActive === input.isActive) return { ok: true, id: current.id };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.motorcycleCatalogModel.update({
        where: { id: current.id },
        data: { isActive: input.isActive },
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.session.uid,
          action: input.isActive ? "CATALOG_MODEL_REACTIVATED" : "CATALOG_MODEL_DEACTIVATED",
          targetType: "MotorcycleCatalogModel",
          targetId: current.id,
          description: `${catalogModelLabel(current)} (${current.slug}) ${
            input.isActive ? "reactivado" : "dado de baja"
          }.`,
        },
      });
    });
    revalidateCatalogRoutes();
    return { ok: true, id: current.id };
  } catch {
    return { ok: false, error: "No se pudo cambiar el estado del modelo." };
  }
}

export async function updateCatalogModelAction(
  input: CatalogInput & { id: string },
): Promise<CatalogActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const valid = validate(input);
  if (!valid.ok) return valid;
  const data = valid.data;

  const prisma = getPrisma();
  const current = await prisma.motorcycleCatalogModel.findUnique({
    where: { id: input.id },
  });
  if (!current) return { ok: false, error: "El modelo no existe." };

  const duplicate = await findDuplicate(data, current.id);
  if (duplicate) {
    return { ok: false, error: `Ya existe «${catalogModelLabel(duplicate)}».` };
  }

  const changes: string[] = [];
  if (data.brand !== current.brand) changes.push(`marca «${current.brand}» → «${data.brand}»`);
  if (data.model !== current.model) changes.push(`modelo «${current.model}» → «${data.model}»`);
  if (data.version !== current.version) changes.push(`versión → «${data.version ?? "—"}»`);
  if (data.year !== current.year) changes.push(`año ${current.year ?? "—"} → ${data.year ?? "—"}`);
  if (data.description !== current.description) changes.push("descripción");
  if (!changes.length) return { ok: true, id: current.id };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.motorcycleCatalogModel.update({
        where: { id: current.id },
        data,
      });
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.session.uid,
          action: "CATALOG_MODEL_UPDATED",
          targetType: "MotorcycleCatalogModel",
          targetId: current.id,
          description: `${current.slug}: ${changes.join(", ")}.`,
        },
      });
    });
    revalidateCatalogRoutes();
    return { ok: true, id: current.id };
  } catch {
    return { ok: false, error: "No se pudo actualizar el modelo." };
  }
}

/**
 * Patch CRM-INT2 — conciliación de las unidades históricas con el catálogo.
 *
 * - Sólo se enlaza una unidad **sin** modelo. Una unidad ya enlazada no se
 *   reescribe desde aquí: corregir un enlace equivocado es otra decisión y
 *   merece su propio flujo, no un efecto lateral de la conciliación.
 * - La condición `catalogModelId: null` va en el `updateMany`, no en una
 *   lectura previa: dos Administradores conciliando a la vez no se pisan; el
 *   segundo recibe «ya estaba enlazada».
 * - Enlazar no toca estado, sucursal, marca ni modelo de la unidad. El texto
 *   con que se registró se conserva y queda en la auditoría junto al modelo
 *   elegido, para poder revisar la decisión después.
 * - Se admite un modelo dado de baja: las unidades vendidas de un modelo que
 *   ya no se ofrece siguen siendo de ese modelo.
 */
export type UnitLinkResult = { ok: true; linked: number; skipped: number } | { ok: false; error: string };

const BULK_LINK_MAX = 200;

export async function linkUnitToCatalogModelAction(input: {
  unitId: string;
  catalogModelId: string;
}): Promise<UnitLinkResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;

  const prisma = getPrisma();
  const [unit, model, catalog] = await Promise.all([
    prisma.motorcycleUnit.findUnique({
      where: { id: input.unitId },
      select: { id: true, brand: true, model: true, year: true, chassisNumber: true, catalogModelId: true },
    }),
    prisma.motorcycleCatalogModel.findUnique({ where: { id: input.catalogModelId } }),
    prisma.motorcycleCatalogModel.findMany({
      select: { id: true, brand: true, model: true, version: true, year: true, isActive: true },
    }),
  ]);
  if (!unit) return { ok: false, error: "La unidad no existe." };
  if (!model) return { ok: false, error: "El modelo del catálogo no existe." };
  if (unit.catalogModelId) return { ok: false, error: "La unidad ya estaba enlazada a un modelo." };

  // La auditoría dice si el Administrador confirmó la sugerencia exacta,
  // eligió entre varias posibles o enlazó contra lo que decía el texto.
  const suggestion = suggestCatalogModel(unit, catalog);
  const basis =
    suggestion.confidence === "EXACTA" && suggestion.candidates[0]?.id === model.id
      ? "sugerencia exacta confirmada"
      : suggestion.candidates.some((candidate) => candidate.id === model.id)
        ? "elegido entre sugerencias posibles"
        : "elección manual, sin sugerencia que la respalde";

  try {
    const linked = await prisma.$transaction(async (tx) => {
      const updated = await tx.motorcycleUnit.updateMany({
        where: { id: unit.id, catalogModelId: null },
        data: { catalogModelId: model.id },
      });
      if (updated.count !== 1) return false;
      await tx.userAuditLog.create({
        data: {
          actorUserId: auth.session.uid,
          action: "UNIT_CATALOG_LINKED",
          targetType: "MotorcycleUnit",
          targetId: unit.id,
          description: `Chasis ${unit.chassisNumber} («${unit.brand} ${unit.model} ${unit.year}») enlazado a ${catalogModelLabel(model)} (${model.slug}); ${basis}.`,
        },
      });
      return true;
    });
    if (!linked) return { ok: false, error: "La unidad ya estaba enlazada a un modelo." };
    revalidateCatalogRoutes();
    return { ok: true, linked: 1, skipped: 0 };
  } catch {
    return { ok: false, error: "No se pudo enlazar la unidad." };
  }
}

/**
 * Enlace en bloque, **sólo de sugerencias exactas**. La sugerencia se vuelve a
 * calcular aquí con el catálogo de este momento: lo que el navegador marcó
 * como exacto no cuenta. Las unidades cuya sugerencia ya no es exacta —o que
 * otro Administrador enlazó entretanto— se omiten y se informan como tales.
 */
export async function bulkLinkExactUnitsAction(input: {
  unitIds: string[];
}): Promise<UnitLinkResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const unitIds = [...new Set(input.unitIds ?? [])];
  if (!unitIds.length) return { ok: false, error: "Selecciona al menos una unidad." };
  if (unitIds.length > BULK_LINK_MAX) {
    return { ok: false, error: `Como máximo ${BULK_LINK_MAX} unidades por vez.` };
  }

  const prisma = getPrisma();
  const [units, catalog] = await Promise.all([
    prisma.motorcycleUnit.findMany({
      where: { id: { in: unitIds }, catalogModelId: null },
      select: { id: true, brand: true, model: true, year: true, chassisNumber: true },
    }),
    prisma.motorcycleCatalogModel.findMany({
      select: { id: true, slug: true, brand: true, model: true, version: true, year: true, isActive: true },
    }),
  ]);
  const byId = new Map(catalog.map((row) => [row.id, row]));

  const plan = units.flatMap((unit) => {
    const suggestion = suggestCatalogModel(unit, catalog);
    const target = suggestion.confidence === "EXACTA" ? byId.get(suggestion.candidates[0].id) : undefined;
    return target ? [{ unit, target }] : [];
  });

  try {
    const linked = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const { unit, target } of plan) {
        const updated = await tx.motorcycleUnit.updateMany({
          where: { id: unit.id, catalogModelId: null },
          data: { catalogModelId: target.id },
        });
        if (updated.count !== 1) continue;
        count += 1;
        await tx.userAuditLog.create({
          data: {
            actorUserId: auth.session.uid,
            action: "UNIT_CATALOG_LINKED",
            targetType: "MotorcycleUnit",
            targetId: unit.id,
            description: `Chasis ${unit.chassisNumber} («${unit.brand} ${unit.model} ${unit.year}») enlazado a ${catalogModelLabel(target)} (${target.slug}); conciliación en bloque de sugerencias exactas.`,
          },
        });
      }
      return count;
    });
    revalidateCatalogRoutes();
    return { ok: true, linked, skipped: unitIds.length - linked };
  } catch {
    return { ok: false, error: "No se pudo completar la conciliación." };
  }
}
