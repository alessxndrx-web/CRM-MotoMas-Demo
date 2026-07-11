import { desiredBranches } from "@/data/operations/leads";
import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadBanksDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-banks-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listBankAccounts } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingBanksPage() {
  const ctb = await getContabilidadPageContext();
  const accounts = ctb.enabled && ctb.canViewLedger ? await listBankAccounts(ctb.scope) : [];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadBanksDbPanel
          accounts={accounts}
          branches={branches}
          canOperate={ctb.canOperate}
          canViewLedger={ctb.canViewLedger}
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
        section="bancos"
      />
    </section>
  );
}
