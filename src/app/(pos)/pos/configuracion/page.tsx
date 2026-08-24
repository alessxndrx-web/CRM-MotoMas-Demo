import { Card } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Notice } from "@/components/ui/feedback";
import { PageHeader } from "@/components/ui/page-header";
import { PosPrinterPanel } from "@/features/pos/pos-printer-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import { listPosWarehouses } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS7.0-D — la configuración del terminal, en su propia pantalla.
 *
 * ## Por qué se muda
 *
 * `PosPrinterPanel` vivía **al pie de `/pos/venta`**, debajo del carrito. Es
 * hardware del puesto: se ajusta una vez cuando se instala la impresora y no se
 * vuelve a tocar en todo el turno. Ocupando el final de la pantalla de venta
 * competía por espacio con lo único que se usa a diario, y obligaba a
 * desplazarse por encima de ella para llegar a las últimas ventas.
 *
 * ## Lo que hay aquí es lo que de verdad se configura
 *
 * La impresora y el cajón portamonedas son configurables: viven en
 * `localStorage` de este navegador y gobiernan `createPosHardware`. El escáner
 * **no** lo es —se comporta como un teclado y no hay nada que ajustar— y la
 * identidad del terminal tampoco: la impone la sesión. Ambos se informan, no se
 * ofrecen como ajustes, porque una tarjeta de configuración que no gobierna nada
 * es exactamente el error que POS4.0 quitó de esta aplicación.
 */
export default async function PosConfiguracionPage() {
  const session = await requirePosSession();
  const warehouses = await listPosWarehouses({ branchCode: session.branchCode });

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[900px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          description="El hardware de este puesto y la identidad con la que cobra. La impresora y el cajón se guardan en este navegador; lo demás lo impone la sesión."
          eyebrow="Mostrador"
          title="Configuración del terminal"
        />

        <PosPrinterPanel />

        <Card className="p-5" data-testid="pos-config-terminal">
          <h2 className="text-base font-bold text-slate-900">Este terminal</h2>
          <p className="mt-1 text-sm text-slate-500">
            Datos de la sesión. <strong>No son ajustes</strong>: cambiarlos aquí
            no significaría nada, porque el servidor los resuelve en cada
            petición.
          </p>
          <DetailList
            className="mt-4"
            items={[
              { label: "Operador", value: session.username },
              { label: "Sucursal", value: session.branchName },
              {
                label: "Bodegas disponibles",
                value: warehouses.length
                  ? warehouses.map((warehouse) => warehouse.name).join(" · ")
                  : "Esta sucursal no tiene bodegas activas.",
              },
              {
                label: "Compras",
                value: session.canManagePurchases
                  ? "Este operador puede gestionar compras."
                  : "Este operador no gestiona compras.",
              },
            ]}
          />
        </Card>

        <Notice tone="info">
          <span data-testid="pos-config-escaner">
            El <strong>lector de código de barras</strong> no necesita
            configuración: se comporta como un teclado y escribe en el buscador de
            la pantalla de venta. Si no lee, el problema está en el propio lector
            o en su modo de emulación, no en esta aplicación.
          </span>
        </Notice>
      </main>
    </>
  );
}
