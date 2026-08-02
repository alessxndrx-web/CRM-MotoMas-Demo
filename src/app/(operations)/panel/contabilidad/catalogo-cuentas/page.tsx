import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadChartAccountsDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-chart-accounts-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listChartAccounts } from "@/server/contabilidad/queries";
import { getChartAccountCatalogSummary } from "@/server/finance/chart-of-accounts/service";

export const dynamic = "force-dynamic";

export default async function AccountingChartAccountsPage() {
  const ctb = await getContabilidadPageContext();
  // Archived accounts are loaded too: they are never deleted, so the catalogue
  // has to be able to show them. The panel filters them out by default.
  const accounts = ctb.enabled
    ? await listChartAccounts(ctb.scope, { includeArchived: true })
    : [];
  const summary = ctb.enabled ? await getChartAccountCatalogSummary() : null;

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadChartAccountsDbPanel
          accounts={accounts}
          canOperate={ctb.canOperate}
          enabled={ctb.enabled}
          scopeLabel={ctb.scopeLabel}
          summary={summary?.ok ? summary.data : null}
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
        section="catalogo-cuentas"
      />
    </section>
  );
}
