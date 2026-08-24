import { desiredBranches } from "@/data/operations/leads";
import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadInventoryDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-inventory-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listAccountingInventoryCosts } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingInventoryPage() {
  const ctb = await getContabilidadPageContext();
  const costs =
    ctb.enabled && ctb.canViewCosts
      ? await listAccountingInventoryCosts(ctb.scope, ctb.canViewCosts)
      : [];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadInventoryDbPanel
          branches={branches}
          canOperate={ctb.canOperate}
          canViewCosts={ctb.canViewCosts}
          costs={costs}
          enabled={ctb.enabled}
          scopeLabel={ctb.scopeLabel}
          supervision={ctb.supervision}
        />
      ) : null}

      {ctb.enabled ? (
        <LegacySectionDivider
          businessLabel="Registros adicionales de contabilidad"
          technicalLabel="Contabilidad local · Temporal, pendiente de migración"
        />
      ) : null}
      <AccountingPanel
        dbAvailable={ctb.dbConfigured}
        fallbackAllowed={ctb.canAccess}
        section="inventario"
      />
    </section>
  );
}
