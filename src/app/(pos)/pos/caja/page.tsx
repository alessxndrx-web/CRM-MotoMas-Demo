import { PageHeader } from "@/components/ui/page-header";
import { PosCashPanel } from "@/features/pos/pos-cash-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";
import { getOpenPosCashShift, listPosCashShifts } from "@/server/pos/cash";

export const dynamic = "force-dynamic";

/**
 * Patch CB4-B — el cajón del mostrador.
 *
 * ## El alcance no se elige
 *
 * El turno abierto se busca por **la sucursal y el operador de la sesión**, no
 * por un parámetro. No hay forma de pedir el cajón de otro mostrador porque no
 * hay nada que pedir: los dos identificadores salen de `requirePosSession`.
 *
 * El historial se acota a la sucursal —un operador que releva a otro necesita
 * ver los turnos del puesto—, y las acciones siguen exigiendo que el turno sea
 * suyo.
 */
export default async function PosCajaPage() {
  const session = await requirePosSession();

  const [shift, history] = await Promise.all([
    getOpenPosCashShift({
      branchId: session.branchId,
      operatorId: session.operatorId,
    }),
    listPosCashShifts({ branchId: session.branchId }),
  ]);

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[1000px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          description={`Efectivo del mostrador de ${session.branchName}. Las cifras las deriva el servidor de lo registrado; un turno cerrado no se vuelve a calcular.`}
          eyebrow="Mostrador"
          title="Caja"
        />
        <PosCashPanel history={history} shift={shift} />
      </main>
    </>
  );
}
