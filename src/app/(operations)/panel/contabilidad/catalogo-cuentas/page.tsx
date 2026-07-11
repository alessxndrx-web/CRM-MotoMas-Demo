import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadChartAccountsDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-chart-accounts-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listChartAccounts } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingChartAccountsPage() {
  const ctb = await getContabilidadPageContext();
  const accounts = ctb.enabled ? await listChartAccounts(ctb.scope) : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadChartAccountsDbPanel
          accounts={accounts}
          canOperate={ctb.canOperate}
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
        section="catalogo-cuentas"
      />
    </section>
  );
}
