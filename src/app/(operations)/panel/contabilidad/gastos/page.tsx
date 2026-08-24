import { desiredBranches } from "@/data/operations/leads";
import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadExpensesDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-expenses-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listExpenses } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingExpensesPage() {
  const ctb = await getContabilidadPageContext();
  const expenses = ctb.enabled && ctb.canViewLedger ? await listExpenses(ctb.scope) : [];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadExpensesDbPanel
          branches={branches}
          canOperate={ctb.canOperate}
          canReview={ctb.canReview}
          canViewLedger={ctb.canViewLedger}
          enabled={ctb.enabled}
          expenses={expenses}
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
        section="gastos"
      />
    </section>
  );
}
