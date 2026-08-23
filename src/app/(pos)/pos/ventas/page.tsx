import { PageHeader } from "@/components/ui/page-header";
import { PosSalesPanel } from "@/features/pos/pos-sales-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import { listPosSales } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS6.0-C — el historial del mostrador, detrás de la sesión de POS.
 *
 * **El alcance lo pone el servidor.** `listPosSales` recibe la sucursal de la
 * sesión, no un parámetro del navegador: un operador no puede leer las ventas de
 * otra sucursal cambiando una URL, porque no hay URL que cambiar.
 */
export default async function PosVentasPage() {
  const session = await requirePosSession();
  const sales = await listPosSales({ branchCode: session.branchCode });

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          description="Las ventas registradas en este mostrador. Se consultan y se reimprimen; revertir una venta todavía no es una operación que exista."
          eyebrow="Mostrador"
          title="Ventas"
        />
        <PosSalesPanel sales={sales} />
      </main>
    </>
  );
}
