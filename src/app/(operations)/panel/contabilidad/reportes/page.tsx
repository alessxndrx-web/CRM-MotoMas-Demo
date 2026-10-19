import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadDashboardDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-dashboard-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { getContabilidadDashboardSummary } from "@/server/contabilidad/queries";
import { LedgerReport } from "@/features/operations/modules/contabilidad-db/ledger-report";

export const dynamic = "force-dynamic";

export default async function AccountingReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctb = await getContabilidadPageContext();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const summary = ctb.canAccess
    ? await getContabilidadDashboardSummary(ctb.scope, ctb.canViewCosts)
    : null;

  return (
    <section className="space-y-10">
      {ctb.enabled && ctb.canViewLedger ? <LedgerReport filters={{ from: value("from") ?? today.slice(0, 4) + "-01-01", to: value("to") ?? today, branchId: value("branchId"), accountId: value("accountId"), page: Number(value("page")) }} /> : null}
      {summary ? (
        <ContabilidadDashboardDbPanel
          canViewCosts={ctb.canViewCosts}
          enabled={ctb.enabled}
          heading="Resumen operativo · documentos y registros, sin equivalencia al libro mayor"
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
