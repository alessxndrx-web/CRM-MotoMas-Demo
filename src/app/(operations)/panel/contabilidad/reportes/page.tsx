import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadDashboardDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-dashboard-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { getContabilidadDashboardSummary } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingReportsPage() {
  const ctb = await getContabilidadPageContext();
  const summary = ctb.canAccess
    ? await getContabilidadDashboardSummary(ctb.scope, ctb.canViewCosts)
    : null;

  return (
    <section className="space-y-10">
      {summary ? (
        <ContabilidadDashboardDbPanel
          canViewCosts={ctb.canViewCosts}
          enabled={ctb.enabled}
          heading="Reportes"
          scopeLabel={ctb.scopeLabel}
          summary={summary}
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
        section="reportes"
      />
    </section>
  );
}
