import { catalogModelLabel, isPendingBrand } from "@/server/catalog/shared";

/**
 * Patch CRM-INT2 — ¿a qué modelo del catálogo pertenece una unidad histórica?
 *
 * Las unidades registradas antes de CRM-INT1 nunca guardaron su modelo del
 * catálogo: sólo marca y modelo en texto. Esto **sugiere**; no enlaza. Enlazar
 * lo hace un Administrador, y una sugerencia sólo se puede aplicar en bloque si
 * es exacta.
 *
 * ## Cuándo es exacta
 *
 * Un único modelo del catálogo cuyo nombre coincide con el de la unidad
 * (normalizado: sin acentos, mayúsculas ni signos), **con la misma marca** y un
 * año compatible (el mismo, o el catálogo sin año). Todo lo demás —varios
 * candidatos, marca pendiente en el catálogo, año distinto— es «posible» y
 * exige que alguien elija.
 *
 * Nada de coincidencias parciales ni «el más parecido»: una unidad con el
 * modelo equivocado cuenta existencias de un modelo que no las tiene.
 */

export type UnitSuggestionConfidence = "EXACTA" | "POSIBLE" | "NINGUNA";

export type UnitCatalogSuggestion = {
  confidence: UnitSuggestionConfidence;
  /** Candidatos, del más probable al menos. Uno solo si es exacta. */
  candidates: Array<{ id: string; label: string; reason: string }>;
};

type CatalogRow = {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  year: number | null;
  isActive: boolean;
};

function norm(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function suggestCatalogModel(
  unit: { brand: string; model: string; year: number | null },
  catalog: CatalogRow[],
): UnitCatalogSuggestion {
  const unitModel = norm(unit.model);
  const unitBrand = norm(unit.brand);
  if (!unitModel) return { confidence: "NINGUNA", candidates: [] };

  const sameModel = catalog.filter((row) => {
    const model = norm(row.model);
    const withVersion = norm(`${row.model}${row.version ?? ""}`);
    return model === unitModel || withVersion === unitModel;
  });
  if (!sameModel.length) return { confidence: "NINGUNA", candidates: [] };

  const scored = sameModel.map((row) => {
    const brandKnown = !isPendingBrand(row.brand);
    const brandMatches = brandKnown && norm(row.brand) === unitBrand;
    const yearMatches = row.year === null || unit.year === null || row.year === unit.year;
    const reason = [
      brandMatches ? "misma marca" : brandKnown ? "marca distinta" : "marca pendiente en el catálogo",
      row.year === null ? "catálogo sin año" : yearMatches ? "mismo año" : `año ${row.year}`,
      row.isActive ? null : "dado de baja",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      row,
      exact: brandMatches && yearMatches,
      score: (brandMatches ? 2 : brandKnown ? 0 : 1) + (yearMatches ? 1 : 0),
      reason,
    };
  });
  scored.sort((a, b) => b.score - a.score);

  const exact = scored.filter((item) => item.exact);
  const candidates = scored.map((item) => ({
    id: item.row.id,
    label: catalogModelLabel(item.row),
    reason: item.reason,
  }));
  if (exact.length === 1 && scored.length >= 1) {
    const only = exact[0];
    return {
      confidence: "EXACTA",
      candidates: [{ id: only.row.id, label: catalogModelLabel(only.row), reason: only.reason }],
    };
  }
  return { confidence: "POSIBLE", candidates };
}
