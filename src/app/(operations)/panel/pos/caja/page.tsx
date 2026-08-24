import { PageHeader } from "@/components/ui/page-header";
import { desiredBranches } from "@/data/operations/leads";
import { PosCashReviewPanel } from "@/features/operations/modules/pos/pos-cash-review-panel";
import { canAccessBranch, canReviewCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listClosedPosCashShifts } from "@/server/pos/cash";

export const dynamic = "force-dynamic";

/**
 * Patch CB4-B — supervisión de los arqueos del mostrador.
 *
 * **Vive en el panel, no en el terminal, y es deliberado.** Revisar un arqueo es
 * supervisión: el repositorio ya lo decidió en `canReviewCaja`, que excluye al
 * cajero. Ponerlo en `/pos/caja` habría dejado al mismo operador contar el
 * dinero y aprobar su propia cuenta.
 *
 * **La pantalla no es la frontera.** Filtra por las sucursales que la sesión
 * administra, y `reviewPosCashShiftAction` vuelve a comprobar `canAccessBranch`
 * antes de escribir.
 */
export default async function PosCashReviewPage() {
  const session = await requireAuth();

  if (!canReviewCaja(session.roleEnum)) {
    return (
      <section className="space-y-6">
        <PageHeader
          description="Revisar arqueos del mostrador es supervisión: tu rol no la ejerce."
          eyebrow="Mostrador"
          title="Arqueos de caja"
        />
      </section>
    );
  }

  const branches = desiredBranches
    .filter((branch) => canAccessBranch(session.roleEnum, session.branchId, branch.id))
    .map((branch) => branch.id);

  // Un rol global ve todas: `null` significa «sin acotar», que no es lo mismo
  // que una lista vacía —esa no alcanzaría ninguna—.
  const scoped = branches.length === desiredBranches.length ? null : branches;
  const shifts = await listClosedPosCashShifts({ branchCodes: scoped });

  return (
    <section className="space-y-6">
      <PageHeader
        description="Turnos cerrados del mostrador con su efectivo esperado, lo contado y la diferencia. Las cifras están congeladas desde el cierre."
        eyebrow="Mostrador"
        title="Arqueos de caja"
      />
      <PosCashReviewPanel shifts={shifts} />
    </section>
  );
}
