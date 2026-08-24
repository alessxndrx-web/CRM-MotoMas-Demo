import { desiredBranches } from "@/data/operations/leads";
import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadReconciliationsDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-reconciliations-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import {
  listBankAccounts,
  listBankReconciliations,
} from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingReconciliationPage() {
  const ctb = await getContabilidadPageContext();
  const active = ctb.enabled && ctb.canViewLedger;
  const [records, bankAccounts] = active
    ? await Promise.all([
        listBankReconciliations(ctb.scope),
        listBankAccounts(ctb.scope, { isActive: true }),
      ])
    : [[], []];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadReconciliationsDbPanel
          bankAccounts={bankAccounts}
          branches={branches}
          canOperate={ctb.canOperate}
          canReview={ctb.canReview}
          canViewLedger={ctb.canViewLedger}
          enabled={ctb.enabled}
          records={records}
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
        section="conciliacion"
      />
    </section>
  );
}
