import { canOperateCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { PosProductsPanel } from "@/features/operations/modules/pos/pos-products-panel";
import { searchPosProducts } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS1.0-B — catálogo del punto de venta.
 *
 * La búsqueda vive en la URL y la resuelve el servidor contra SKU, código de
 * barras y nombre. No se filtra en el navegador: el mostrador debe poder teclear
 * un código y encontrar el artículo aunque no esté entre los que ya se cargaron.
 *
 * El catálogo inactivo se muestra también, porque desactivar es la forma de
 * retirar un artículo y hay que poder volver a activarlo.
 */
export default async function PosProductsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const session = await requireAuth();
  const canOperate = canOperateCaja(session.roleEnum);

  const params = await searchParams;
  const raw = params?.q;
  const term = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  const products = await searchPosProducts(term, { includeInactive: true });

  return (
    <section className="space-y-10">
      <PosProductsPanel
        canOperate={canOperate}
        products={products}
        term={term}
      />
    </section>
  );
}
