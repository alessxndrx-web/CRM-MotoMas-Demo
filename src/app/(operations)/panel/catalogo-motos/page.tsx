import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { CatalogAdminPanel } from "@/features/operations/modules/catalog-db/catalog-admin-panel";
import { UnitReconciliationPanel } from "@/features/operations/modules/catalog-db/unit-reconciliation-panel";
import { canManageMotorcycleCatalog } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listCatalogForAdmin, listUnlinkedUnits } from "@/server/catalog/queries";
import { isDatabaseConfigured } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-INT1 — `/panel/catalogo-motos`.
 *
 * El catálogo general era un arreglo dentro de `prisma/seed.mjs` que el propio
 * seed reescribía en cada despliegue. Aquí lo mantiene el Administrador, y de
 * aquí leen todos los selectores de modelo del CRM.
 *
 * `notFound()` fuera del permiso, como el resto del panel: la pantalla no
 * confirma que existe a quien no puede usarla.
 *
 * Patch CRM-INT2 — debajo del catálogo, la conciliación de las unidades que se
 * registraron sin modelo.
 */
export default async function MotorcycleCatalogPage() {
  const session = await requireAuth();
  if (!canManageMotorcycleCatalog(session.roleEnum)) notFound();
  if (!isDatabaseConfigured()) notFound();

  const [models, unlinked] = await Promise.all([listCatalogForAdmin(), listUnlinkedUnits()]);

  return (
    <section className="space-y-6">
      <PageHeader
        description="Los modelos que MotoMas vende. Leads, expedientes, campañas y el alta de unidades eligen de aquí. Estar en el catálogo no implica tener existencias."
        title="Catálogo de motocicletas"
      />
      <CatalogAdminPanel models={models} unitsWithoutModel={unlinked.total} />
      <UnitReconciliationPanel models={models} total={unlinked.total} units={unlinked.units} />
    </section>
  );
}
