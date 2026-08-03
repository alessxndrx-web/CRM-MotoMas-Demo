import { canOperateCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { PosCartPanel } from "@/features/operations/modules/pos/pos-cart-panel";

export const dynamic = "force-dynamic";

/**
 * Patch POS1.0-C — pantalla de cobro del punto de venta.
 *
 * No carga nada: el carrito vive en el navegador y los artículos llegan por
 * `searchPosProductsAction`. Esta página solo resuelve el permiso.
 */
export default async function PosCheckoutPage() {
  const session = await requireAuth();
  return (
    <section className="space-y-10">
      <PosCartPanel canOperate={canOperateCaja(session.roleEnum)} />
    </section>
  );
}
