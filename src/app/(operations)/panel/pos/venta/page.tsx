import { PageHeader } from "@/components/ui/page-header";
import { desiredBranches } from "@/data/operations/leads";
import { PosCartPanel } from "@/features/operations/modules/pos/pos-cart-panel";
import { canOperateCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { listPosSales, listPosWarehouses } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

const RECENT_SALES = 10;

/**
 * Patch POS1.0-C — pantalla de cobro del punto de venta.
 * Patch POS1.0-D — además lee las ventas que ya existen.
 *
 * El carrito sigue viviendo en el navegador; lo único que esta página carga de
 * la base son las ventas ya registradas, por la capa de consultas.
 *
 * **La sucursal no se elige en silencio.** Quien tiene sucursal cobra en la
 * suya; solo un rol global recibe opciones y debe decir en qué mostrador
 * registra la venta. Es el mismo criterio con el que `caja/page.tsx` abre un
 * turno, y por eso reutiliza `desiredBranches` en vez de inventar otra lista.
 *
 * La página no importa nada de `server/caja`: comparte el predicado de rol de la
 * capa de acceso, no el contexto de Caja.
 */
export default async function PosCheckoutPage() {
  const session = await requireAuth();
  const canOperate = canOperateCaja(session.roleEnum);
  const isGlobal = session.branchId === GLOBAL_BRANCH_ID;
  const branchCode = isGlobal ? null : session.branchId;

  // Un rol global ve las ventas de todas las sucursales; el resto, las suyas.
  const recentSales = canOperate
    ? await listPosSales(branchCode ? { branchCode } : {})
    : [];

  // Patch POS1.1-E. El cobro descuenta existencias, y la bodega se elige: una
  // sucursal puede tener varias y `PosSale` no guarda ninguna.
  const warehouses = canOperate
    ? await listPosWarehouses(branchCode ? { branchCode } : {})
    : [];

  // Patch POS2.2. La cabecera la pone el sistema de diseño: la pantalla ya no
  // dibuja su propio título ni alinea nada a mano.
  return (
    <section className="space-y-6">
      <PageHeader
        description="Arma la venta escaneando o buscando artículos. El carrito vive en esta pantalla hasta que cobras: recargar antes lo vacía."
        eyebrow="Mostrador"
        title="Punto de venta"
      />
      <PosCartPanel
        branchCode={branchCode}
        branches={
          isGlobal
            ? desiredBranches.map((branch) => ({
                code: branch.id,
                name: branch.name,
              }))
            : []
        }
        canOperate={canOperate}
        recentSales={recentSales.slice(0, RECENT_SALES)}
        warehouses={warehouses}
      />
    </section>
  );
}
