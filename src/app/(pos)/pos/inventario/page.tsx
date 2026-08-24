import { PageHeader } from "@/components/ui/page-header";
import { PosInventoryPanel } from "@/features/operations/modules/pos/pos-inventory-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import {
  listPosInventory,
  listPosInventoryMovements,
  listPosWarehouses,
  searchPosProducts,
} from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS2.4 — existencias del mostrador, detrás de la sesión de POS.
 *
 * Mismo panel que POS2.3 y mismas acciones de servidor. El alcance ya no sale de
 * la sesión administrativa sino de la sucursal del operador, que el servidor
 * revalida en cada petición.
 */
export default async function PosInventarioPage() {
  const session = await requirePosSession();
  const scope = { branchCode: session.branchCode };

  const [balances, warehouses, products] = await Promise.all([
    listPosInventory(scope),
    listPosWarehouses(scope),
    searchPosProducts(""),
  ]);

  const movements = (
    await Promise.all(
      warehouses.map((warehouse) =>
        listPosInventoryMovements({ warehouseId: warehouse.id }),
      ),
    )
  )
    .flat()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          description="Saldos por bodega y la bitácora que los explica. Un ingreso o un ajuste escriben un movimiento con su motivo y su autor."
          eyebrow="Mostrador"
          title="Existencias"
        />
        <PosInventoryPanel
          balances={balances}
          canOperate
          movements={movements}
          products={products}
          warehouses={warehouses}
        />
      </main>
    </>
  );
}
