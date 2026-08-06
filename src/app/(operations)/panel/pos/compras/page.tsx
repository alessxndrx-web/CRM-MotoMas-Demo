import { PosPurchasesPanel } from "@/features/operations/modules/pos/pos-purchases-panel";
import { canManageInventory } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { listPosPurchaseOrders } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS1.2-C — pantalla de órdenes de compra.
 *
 * **Autorización con `canManageInventory` (ADMIN o GERENTE)**, el mismo
 * predicado que usan las acciones de compras. La página no decide por su cuenta:
 * si el rol no pasa, el panel lo dice y las acciones lo rechazarían igual.
 *
 * Un rol no global solo ve las órdenes de su sucursal, como el resto del
 * repositorio.
 */
export default async function PosPurchasesPage() {
  const session = await requireAuth();
  const canOperate = canManageInventory(session.roleEnum);
  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;

  const orders = canOperate
    ? await listPosPurchaseOrders(branchCode ? { branchCode } : {})
    : [];

  return (
    <section className="space-y-10">
      <PosPurchasesPanel canOperate={canOperate} orders={orders} />
    </section>
  );
}
