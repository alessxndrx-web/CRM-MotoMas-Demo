import { PageHeader } from "@/components/ui/page-header";
import { LegacyOperationalPanelGate } from "@/features/operations/components/legacy-section-divider";
import { InventoryPanel } from "@/features/operations/modules/inventory/inventory-panel";
import { InventoryDbPanel } from "@/features/operations/modules/inventory-db/inventory-db-panel";
import { getBranchScopeForUser } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { getInventoryData } from "@/server/inventory/queries";

export const dynamic = "force-dynamic";

/**
 * Patch INT1 — el inventario deja de ser una pantalla del navegador.
 *
 * **[R] Esta ruta no tenía barrera.** Montaba `InventoryPanel` directamente, y
 * ese componente lee `localStorage`: con PostgreSQL configurado seguía
 * presentando existencias locales como si fueran las de la empresa, mientras
 * `/panel/inventario/movimientos` leía la base. Sus cinco rutas hermanas
 * —traslados, ventas, clientes, créditos, reportes— ya usaban
 * `LegacyOperationalPanelGate`; esta se quedó fuera.
 *
 * Ahora sigue el mismo patrón: los datos de la base mandan, y el panel local
 * solo aparece si no hay base o si alguien lo habilita a propósito para trabajo
 * técnico.
 */
export default async function InventoryPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();

  const scope = getBranchScopeForUser(session.roleEnum, session.branchId);
  const units = dbConfigured ? (await getInventoryData(scope)).units : [];
  const scopeLabel = scope.global ? "vista global" : session.branchName;

  return (
    <section className="space-y-6">
      <PageHeader
        description="Unidades de motocicleta por chasis. Los repuestos del mostrador se cuentan aparte, en existencias del punto de venta."
        eyebrow="Operación"
        title="Inventario"
      />
      {dbConfigured ? (
        <InventoryDbPanel scopeLabel={scopeLabel} units={units} />
      ) : null}
      <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
        <InventoryPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
