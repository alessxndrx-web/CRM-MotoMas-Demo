import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { desiredBranches } from "@/data/operations/leads";
import { PosPurchaseNewPanel } from "@/features/operations/modules/pos/pos-purchase-new-panel";
import { canManageInventory } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { listPosSuppliers, searchPosProducts } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS1.2-F — crear una orden de compra.
 *
 * Un rol no global solo puede comprar para su sucursal, así que solo recibe esa
 * opción; `createPosPurchaseOrderAction` lo vuelve a comprobar con
 * `canAccessBranch`, porque la pantalla no es la frontera de seguridad.
 */
export default async function PosPurchaseNewPage() {
  const session = await requireAuth();
  if (!canManageInventory(session.roleEnum)) notFound();

  const isGlobal = session.branchId === GLOBAL_BRANCH_ID;
  const branches = isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : desiredBranches
        .filter((branch) => branch.id === session.branchId)
        .map((branch) => ({ code: branch.id, name: branch.name }));

  const [suppliers, products] = await Promise.all([
    listPosSuppliers(),
    searchPosProducts(""),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Órdenes de compra", href: "/panel/pos/compras" },
          { label: "Nueva orden" },
        ]}
        description="Una orden es solo una intención de comprar: no mueve existencias ni crea deuda. Nace en borrador y hay que aprobarla."
        title="Nueva orden de compra"
      />
      <PosPurchaseNewPanel
        branches={branches}
        products={products}
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
        }))}
      />
    </section>
  );
}
