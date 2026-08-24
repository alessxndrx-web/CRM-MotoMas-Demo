import { desiredBranches } from "@/data/operations/leads";
import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadVouchersDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-vouchers-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listAccountingVouchers } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingVouchersPage() {
  const ctb = await getContabilidadPageContext();
  const vouchers =
    ctb.enabled && ctb.canViewLedger ? await listAccountingVouchers(ctb.scope) : [];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadVouchersDbPanel
          branches={branches}
          canOperate={ctb.canOperate}
          canReview={ctb.canReview}
          canViewLedger={ctb.canViewLedger}
          enabled={ctb.enabled}
          scopeLabel={ctb.scopeLabel}
          supervision={ctb.supervision}
          vouchers={vouchers}
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
        section="comprobantes"
      />
    </section>
  );
}
