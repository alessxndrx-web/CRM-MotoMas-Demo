import { PosCartPanel } from "@/features/operations/modules/pos/pos-cart-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import { listPosSales, listPosWarehouses } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

const RECENT_SALES = 10;

/**
 * Patch POS2.4 — el cobro, detrás de la sesión de POS.
 *
 * **La pantalla no cambió; cambió quién llega a ella.** `PosCartPanel` es el
 * mismo componente de POS1.0-D, con el mismo flujo, los mismos totales
 * derivados en el servidor y el mismo descuento de existencias.
 *
 * Dos diferencias frente a `/panel/pos/venta`:
 *
 * - **`requirePosSession`**, no `requireAuth` + `canOperateCaja`. Sin sesión de
 *   mostrador se redirige a `/pos/login` antes de consultar nada.
 * - **La sucursal no se elige.** El operador tiene la suya y el servidor la
 *   impone; un mostrador no decide en qué sucursal registra la venta.
 */
export default async function PosVentaPage() {
  const session = await requirePosSession();

  const [recentSales, warehouses] = await Promise.all([
    listPosSales({ branchCode: session.branchCode }),
    listPosWarehouses({ branchCode: session.branchCode }),
  ]);

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
        {/*
          El contenido principal necesita su propio encabezado: la barra del
          terminal es `<header>` y no cuenta. Compacto a propósito — un terminal
          de mostrador no lleva la tarjeta de cabecera del panel.
        */}
        <h1 className="mb-4 text-lg font-semibold text-slate-900">Punto de venta</h1>
        <PosCartPanel
          branchCode={session.branchCode}
          branches={[]}
          canOperate
          recentSales={recentSales.slice(0, RECENT_SALES)}
          warehouses={warehouses}
        />
      </main>
    </>
  );
}
