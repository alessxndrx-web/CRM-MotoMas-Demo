import { PageHeader } from "@/components/ui/page-header";
import { PosInventoryPanel } from "@/features/operations/modules/pos/pos-inventory-panel";
import { canOperateCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import {
  listPosInventory,
  listPosInventoryMovements,
  listPosWarehouses,
  searchPosProducts,
} from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS2.3 — existencias del mostrador.
 *
 * **Autoriza con `canOperateCaja`**, el mismo predicado que usan las cinco
 * acciones que esta pantalla expone. No se crea ninguno: quien opera el
 * mostrador es quien mueve sus existencias, que es lo que POS1.1 decidió y este
 * parche no cambia.
 *
 * El alcance por sucursal se resuelve aquí y las consultas salen ya filtradas;
 * un rol no global no recibe saldos de otra sucursal ni en el HTML.
 */
export default async function PosInventoryPage() {
  const session = await requireAuth();
  const canOperate = canOperateCaja(session.roleEnum);
  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const scope = branchCode ? { branchCode } : {};

  const [balances, warehouses, products] = canOperate
    ? await Promise.all([
        listPosInventory(scope),
        listPosWarehouses(scope),
        searchPosProducts(""),
      ])
    : [[], [], []];

  // Los movimientos se piden por bodega para respetar el alcance: la consulta
  // no admite sucursal, y pedirlos todos filtrando después mostraría de más.
  const movements = canOperate
    ? (
        await Promise.all(
          warehouses.map((warehouse) =>
            listPosInventoryMovements({ warehouseId: warehouse.id }),
          ),
        )
      )
        .flat()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12)
    : [];

  return (
    <section className="space-y-6">
      <PageHeader
        description="Saldos por bodega y la bitácora que los explica. Un ingreso o un ajuste escriben un movimiento con su motivo y su autor."
        eyebrow="Mostrador"
        title="Existencias"
      />
      <PosInventoryPanel
        balances={balances}
        canOperate={canOperate}
        movements={movements}
        products={products}
        warehouses={warehouses}
      />
    </section>
  );
}
