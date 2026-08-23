import { PageHeader } from "@/components/ui/page-header";
import { PosCustomersPanel } from "@/features/pos/pos-customers-panel";
import { PosTerminalHeader } from "@/features/pos/pos-terminal-header";
import { requirePosSession } from "@/server/pos/auth";

export const dynamic = "force-dynamic";

/**
 * Patch POS7.0-C — los clientes que este mostrador puede ver.
 *
 * La página no consulta nada: la búsqueda es una acción y el alcance por
 * sucursal lo impone el servidor en cada llamada. Traer aquí una lista inicial
 * habría significado volcar la cartera de la sucursal en el primer pintado, que
 * no es lo que hace falta —se busca a alguien concreto— y sí es más superficie
 * de la necesaria.
 */
export default async function PosClientesPage() {
  const session = await requirePosSession();

  return (
    <>
      <PosTerminalHeader
        branchName={session.branchName}
        username={session.username}
      />
      <main className="mx-auto max-w-[900px] space-y-6 px-4 py-6 sm:px-6">
        <PageHeader
          description={`Clientes de ${session.branchName}. Su historial de compras es el de este mostrador.`}
          eyebrow="Mostrador"
          title="Clientes"
        />
        <PosCustomersPanel />
      </main>
    </>
  );
}
