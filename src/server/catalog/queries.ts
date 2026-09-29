import { suggestCatalogModel } from "@/server/catalog/reconciliation";
import {
  catalogModelLabel,
  isPendingBrand,
  type CatalogAdminDTO,
  type CatalogOptionDTO,
  type UnlinkedUnitDTO,
} from "@/server/catalog/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

/**
 * Patch CRM-INT1 — lecturas del catálogo general.
 *
 * `listCatalogOptions` alimenta **todos** los selectores de modelo del CRM:
 * lead, ficha del lead, expediente, campaña y alta de unidades. Antes cada uno
 * tenía su fuente —el catálogo de la base, el catálogo estático del portal o
 * texto libre— y por eso a unos les faltaban modelos que otros sí mostraban.
 */

function toOption(model: {
  id: string;
  slug: string;
  brand: string;
  model: string;
  version: string | null;
  year: number | null;
}): CatalogOptionDTO {
  return {
    id: model.id,
    slug: model.slug,
    label: catalogModelLabel(model),
    brand: isPendingBrand(model.brand) ? null : model.brand,
    model: model.model,
    version: model.version,
    year: model.year,
  };
}

/** Modelos activos, ordenados como los lee una persona: marca y modelo. */
export async function listCatalogOptions(): Promise<CatalogOptionDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await getPrisma().motorcycleCatalogModel.findMany({
    where: { isActive: true },
    orderBy: [{ model: "asc" }, { year: "desc" }],
    select: {
      id: true,
      slug: true,
      brand: true,
      model: true,
      version: true,
      year: true,
    },
  });
  return rows.map(toOption).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

/** Todo el catálogo, activo o no, con existencias y uso. Sólo administración. */
export async function listCatalogForAdmin(): Promise<CatalogAdminDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();
  const [models, units, branches, leads, campaigns] = await Promise.all([
    prisma.motorcycleCatalogModel.findMany({
      orderBy: [{ isActive: "desc" }, { model: "asc" }],
    }),
    prisma.motorcycleUnit.groupBy({
      by: ["catalogModelId", "branchId"],
      where: { status: "AVAILABLE", catalogModelId: { not: null } },
      _count: { _all: true },
    }),
    prisma.branch.findMany({ select: { id: true, name: true } }),
    prisma.lead.groupBy({
      by: ["catalogModelId"],
      where: { catalogModelId: { not: null } },
      _count: { _all: true },
    }),
    prisma.marketingCampaignModel.groupBy({
      by: ["catalogModelId"],
      _count: { _all: true },
    }),
  ]);

  const branchName = new Map(branches.map((branch) => [branch.id, branch.name]));

  return models.map((model) => {
    const modelUnits = units.filter((row) => row.catalogModelId === model.id);
    return {
      ...toOption(model),
      rawBrand: model.brand,
      brandPending: isPendingBrand(model.brand),
      description: model.description,
      imageUrl: model.imageUrl,
      isActive: model.isActive,
      availableUnits: modelUnits.reduce((sum, row) => sum + row._count._all, 0),
      unitsByBranch: modelUnits
        .map((row) => ({
          branchName: branchName.get(row.branchId) ?? "Sucursal",
          count: row._count._all,
        }))
        .sort((a, b) => a.branchName.localeCompare(b.branchName, "es")),
      leads: leads.find((row) => row.catalogModelId === model.id)?._count._all ?? 0,
      campaigns:
        campaigns.find((row) => row.catalogModelId === model.id)?._count._all ?? 0,
      updatedAt: model.updatedAt.toISOString(),
    };
  });
}

/**
 * Patch CRM-INT2 — las unidades sin modelo del catálogo, con lo que se sabe de
 * ellas y la sugerencia de `suggestCatalogModel`.
 *
 * Se muestran también las vendidas o entregadas: enlazarlas no cambia su
 * estado, y sin su modelo los informes por modelo las pierden. Tope de 200 por
 * página de trabajo; el total real viene aparte para que la pantalla no mienta
 * por omisión.
 */
export async function listUnlinkedUnits(): Promise<{
  total: number;
  units: UnlinkedUnitDTO[];
}> {
  if (!isDatabaseConfigured()) return { total: 0, units: [] };
  const prisma = getPrisma();
  const [total, units, catalog] = await Promise.all([
    prisma.motorcycleUnit.count({ where: { catalogModelId: null } }),
    prisma.motorcycleUnit.findMany({
      where: { catalogModelId: null },
      orderBy: [{ entryDate: "desc" }],
      take: 200,
      select: {
        id: true,
        name: true,
        brand: true,
        model: true,
        year: true,
        chassisNumber: true,
        color: true,
        status: true,
        entryDate: true,
        branch: { select: { name: true } },
      },
    }),
    prisma.motorcycleCatalogModel.findMany({
      select: { id: true, brand: true, model: true, version: true, year: true, isActive: true },
    }),
  ]);
  return {
    total,
    units: units.map((unit) => ({
      id: unit.id,
      name: unit.name,
      brand: unit.brand,
      model: unit.model,
      year: unit.year,
      chassisNumber: unit.chassisNumber,
      color: unit.color,
      status: unit.status,
      entryDate: unit.entryDate.toISOString(),
      branchName: unit.branch.name,
      suggestion: suggestCatalogModel(unit, catalog),
    })),
  };
}
