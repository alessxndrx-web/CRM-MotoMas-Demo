import { PageHeader } from "@/components/ui/page-header";
import { desiredBranches } from "@/data/operations/leads";
import { PosWarehousesPanel } from "@/features/operations/modules/pos/pos-warehouses-panel";
import { canAccessBranch, canOperateCaja } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listPosWarehouses } from "@/server/pos/queries";

export const dynamic = "force-dynamic";

/**
 * Patch INT5 — administración de bodegas (**P-38**).
 *
 * POS2.3 dejó fuera esta pantalla a propósito: administrar bodegas es
 * configuración, no operación de mostrador, y meterla en las existencias habría
 * hecho dos pantallas de una. Quedó anotada y sin puerta, así que una bodega
 * solo nacía por semilla.
 *
 * **La pantalla no es la frontera.** Filtra sucursales y bodegas por lo que la
 * sesión puede administrar, pero desde INT5 `createPosWarehouseAction` y
 * `updatePosWarehouseAction` aplican `canAccessBranch` por su cuenta: una
 * petición contra otra sucursal se rechaza aunque el selector nunca la ofrezca.
 */
export default async function PosWarehousesPage() {
  const session = await requireAuth();

  if (!canOperateCaja(session.roleEnum)) {
    return (
      <section className="space-y-6">
        <PageHeader
          description="Tu rol no administra las bodegas del mostrador."
          eyebrow="Configuración"
          title="Bodegas"
        />
      </section>
    );
  }

  // Las sucursales que esta sesión puede administrar. El servidor lo vuelve a
  // comprobar en la acción; esto solo evita ofrecer lo que se va a rechazar.
  const branches = desiredBranches
    .filter((branch) => canAccessBranch(session.roleEnum, session.branchId, branch.id))
    .map((branch) => ({ code: branch.id, name: branch.name }));

  const scoped = branches.length === 1 ? branches[0]?.code : undefined;
  const warehouses = await listPosWarehouses({
    branchCode: scoped,
    includeInactive: true,
  });

  return (
    <section className="space-y-6">
      <PageHeader
        description="Dónde se guardan y de dónde se descuentan los repuestos. Una bodega pertenece a una sucursal y no se mueve entre ellas."
        eyebrow="Configuración"
        title="Bodegas"
      />
      <PosWarehousesPanel branches={branches} warehouses={warehouses} />
    </section>
  );
}
