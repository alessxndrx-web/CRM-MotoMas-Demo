/**
 * Patch CRM-INT1 — el catálogo general de motocicletas, tipos y etiquetas.
 *
 * Puro y sin base de datos, para que los selectores del navegador pinten el
 * modelo exactamente igual que el servidor lo describe en un error o un aviso.
 */

/**
 * La marca que el seed puso a los modelos cuya marca **no se proporcionó**
 * (Patch 3.0.2A: «no se inventó la marca»).
 *
 * Se guarda en la columna porque `brand` es obligatoria, pero **no es una
 * marca**. Pintarla como tal producía opciones como «Información pendiente de
 * completar Boxer 150» en todos los selectores, que es lo que se reportó como
 * «información incorrecta». Las etiquetas la omiten y el catálogo la señala
 * como pendiente para que un Administrador la complete.
 */
export const PENDING_BRAND = "Información pendiente de completar";

export function isPendingBrand(brand: string | null | undefined): boolean {
  return !brand || brand.trim() === "" || brand === PENDING_BRAND;
}

type CatalogLabelInput = {
  brand: string | null;
  model: string;
  version?: string | null;
  year?: number | null;
};

/** «Bajaj Pulsar NS200 UG (2026)», sin marca de relleno. */
export function catalogModelLabel(model: CatalogLabelInput): string {
  const parts = [
    isPendingBrand(model.brand) ? null : model.brand,
    model.model,
    model.version || null,
  ].filter(Boolean);
  const base = parts.join(" ");
  return model.year ? `${base} (${model.year})` : base;
}

/** Un modelo tal y como lo ofrece un selector. */
export type CatalogOptionDTO = {
  id: string;
  slug: string;
  label: string;
  brand: string | null;
  model: string;
  version: string | null;
  year: number | null;
};

/**
 * Un modelo en la pantalla de catálogo. `availableUnits` cuenta unidades
 * AVAILABLE de todas las sucursales y `unitsByBranch` las reparte: el catálogo
 * dice qué se vende, el inventario dice qué hay. Las dos cosas se muestran
 * juntas precisamente para que no se confundan.
 */
export type CatalogAdminDTO = CatalogOptionDTO & {
  rawBrand: string;
  brandPending: boolean;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  availableUnits: number;
  unitsByBranch: Array<{ branchName: string; count: number }>;
  leads: number;
  campaigns: number;
  updatedAt: string;
};

export const CATALOG_TEXT_MAX = 80;
export const CATALOG_MIN_YEAR = 1990;
export const CATALOG_MAX_YEAR = 2100;

/**
 * Patch CRM-INT2 — una unidad del inventario sin modelo del catálogo, con la
 * sugerencia calculada. `suggestion` es una propuesta: nada está enlazado
 * hasta que un Administrador lo confirma.
 */
export type UnlinkedUnitDTO = {
  id: string;
  name: string;
  brand: string;
  model: string;
  year: number;
  chassisNumber: string;
  color: string | null;
  status: string;
  entryDate: string;
  branchName: string;
  suggestion: {
    confidence: "EXACTA" | "POSIBLE" | "NINGUNA";
    candidates: Array<{ id: string; label: string; reason: string }>;
  };
};
