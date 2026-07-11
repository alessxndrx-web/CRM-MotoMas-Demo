import { desiredBranches } from "@/data/operations/leads";
import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadPayrollDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-payroll-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listPayrollRecords } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingPayrollPage() {
  const ctb = await getContabilidadPageContext();
  const payroll =
    ctb.enabled && ctb.canViewLedger ? await listPayrollRecords(ctb.scope) : [];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadPayrollDbPanel
          branches={branches}
          canOperate={ctb.canOperate}
          canReview={ctb.canReview}
          canViewLedger={ctb.canViewLedger}
          enabled={ctb.enabled}
          payroll={payroll}
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
        section="planilla"
      />
    </section>
  );
}
