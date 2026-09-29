import type { Prisma, PrismaClient } from "@prisma/client";

import { catalogModelLabel, isPendingBrand } from "@/server/catalog/shared";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Patch CRM-INT1 — minúsculas, sin acentos, sin signos, espacios simples. Es
 * la forma en la que se comparan un texto de interés y un modelo del catálogo.
 */
function normalizeModelText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ResolvedCatalogModel = {
  id: string;
  slug: string;
  label: string;
};

/**
 * Patch CRM-INT1 — ¿a qué modelo del catálogo se refiere este interés?
 *
 * El portal público guarda el slug de **su** catálogo estático y el nombre del
 * modelo; hasta este parche ninguno de los dos se traducía a un modelo de la
 * base, así que todo lead del portal llegaba a la ficha diciendo «no
 * corresponde a un modelo del catálogo» aunque el modelo estuviera ahí.
 *
 * El orden y la regla, que es deliberadamente estrecha:
 *
 * 1. **Slug idéntico** a un modelo activo. Es la misma clave: el seed creó
 *    esos modelos con los slugs del portal.
 * 2. Si no, **texto idéntico** —normalizado— al modelo, a marca + modelo o a la
 *    etiqueta completa, y **sólo si hay exactamente un candidato**. Dos
 *    candidatos es ambigüedad, y la ambigüedad no se resuelve adivinando: el
 *    lead se queda con su texto libre y un vendedor elige en la ficha.
 *
 * No hay coincidencia parcial ni «el más parecido»: esa es la forma de
 * inventar la moto que un cliente quiere.
 */
export async function resolveCatalogModelForInterest(
  db: Db,
  input: { slug?: string | null; text?: string | null },
): Promise<ResolvedCatalogModel | null> {
  const slug = input.slug?.trim().toLowerCase() || null;
  if (slug) {
    const bySlug = await db.motorcycleCatalogModel.findFirst({
      where: { slug, isActive: true },
    });
    if (bySlug) {
      return { id: bySlug.id, slug: bySlug.slug, label: catalogModelLabel(bySlug) };
    }
  }

  const wanted = normalizeModelText(input.text);
  if (!wanted) return null;

  const candidates = await db.motorcycleCatalogModel.findMany({
    where: { isActive: true },
  });
  const matches = candidates.filter((model) => {
    const brand = isPendingBrand(model.brand) ? "" : model.brand;
    const forms = [
      model.model,
      `${brand} ${model.model}`,
      model.year ? `${model.model} ${model.year}` : "",
      model.year ? `${brand} ${model.model} ${model.year}` : "",
      catalogModelLabel(model),
    ].map(normalizeModelText);
    return forms.includes(wanted);
  });

  if (matches.length !== 1) return null;
  const [match] = matches;
  return { id: match.id, slug: match.slug, label: catalogModelLabel(match) };
}

/**
 * Slug de un modelo nuevo. Mismo alfabeto que el seed; si ya existe se le
 * añade un sufijo, porque el slug es la clave estable y nunca se reutiliza.
 */
export async function uniqueCatalogSlug(db: Db, base: string): Promise<string> {
  const root =
    base
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "modelo";
  let candidate = root;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const clash = await db.motorcycleCatalogModel.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${root}-${suffix}`;
  }
  return `${root}-${Date.now()}`;
}
