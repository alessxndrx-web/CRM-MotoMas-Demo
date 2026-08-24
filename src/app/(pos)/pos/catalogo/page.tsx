import { PageHeader } from "@/components/ui/page-header";
import { PosCataloguePanel } from "@/features/pos/pos-catalogue-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import {
  listPosCategories,
  listPosInventory,
  listPosWarehouses,
  searchPosProducts,
} from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS7.0-B — el catálogo que consulta el mostrador.
 *
 * Las bodegas se acotan a la sucursal de la sesión: el saldo que se enseña es el
 * de un almacén de **esta** sucursal y no hay forma de pedir el de otra, igual
 * que en la pantalla de venta. Las categorías no se acotan porque no pertenecen
 * a ninguna sucursal — el catálogo de artículos es de la empresa.
 */
export default async function PosCatalogoPage() {
  const session = await requirePosSession();
  const [categories, warehouses, products] = await Promise.all([
    listPosCategories(),
    listPosWarehouses({ branchCode: session.branchCode }),
    searchPosProducts("", { includeInactive: false }),
  ]);

  // El saldo de la primera bodega, para que la pantalla abra ya diciendo cuánto
  // queda. `listPosInventory` exige que la bodega sea de esta sucursal, así que
  // no hay forma de que aquí entre un almacén ajeno.
  const warehouseId = warehouses[0]?.id;
  const rows = warehouseId
    ? await listPosInventory({
        warehouseId,
        branchCode: session.branchCode,
        productIds: products.map((product) => product.id),
      })
    : [];
  const balances = Object.fromEntries(
    rows.map((row) => [row.productId, row.quantity]),
  );

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          description="Qué se puede vender, a qué precio y cuánto queda. Dar de alta o editar artículos es del panel administrativo."
          eyebrow="Mostrador"
          title="Catálogo"
        />
        <PosCataloguePanel
          categories={categories}
          initialBalances={balances}
          initialProducts={products}
          warehouses={warehouses}
        />
      </main>
    </>
  );
}
