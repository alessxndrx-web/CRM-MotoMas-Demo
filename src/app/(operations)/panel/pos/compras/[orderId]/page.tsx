import { notFound } from "next/navigation";

import { PosPurchaseDetailPanel } from "@/features/operations/modules/pos/pos-purchase-detail-panel";
import { canManageInventory } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import {
  derivePosPurchaseAbilities,
  getPosPurchaseOrderDetail,
  listPosPurchaseOrderEvents,
  listPosWarehouses,
} from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS1.2-F — el detalle de una orden de compra.
 *
 * **Autoriza con `canManageInventory`**, el mismo predicado que las acciones. La
 * página no es la frontera de seguridad —las acciones reautorizan— pero tampoco
 * debe enseñar un documento a quien no puede operarlo.
 *
 * **La sucursal acota**: un rol no global solo abre órdenes de la suya. Devuelve
 * 404 en vez de un error, porque para ese usuario la orden efectivamente no
 * existe.
 */
export default async function PosPurchaseDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const session = await requireAuth();
  if (!canManageInventory(session.roleEnum)) notFound();

  const order = await getPosPurchaseOrderDetail(orderId);
  if (!order) notFound();

  const isGlobal = session.branchId === "all";
  if (!isGlobal && order.branchCode !== session.branchId) notFound();

  const [events, warehouses] = await Promise.all([
    listPosPurchaseOrderEvents(order.id),
    listPosWarehouses({ branchCode: order.branchCode }),
  ]);

  return (
    <section className="space-y-10">
      <PosPurchaseDetailPanel
        abilities={derivePosPurchaseAbilities(order.status, order.items)}
        events={events}
        order={order}
        warehouses={warehouses}
      />
    </section>
  );
}
