import { desiredBranches } from "@/data/operations/leads";
import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadThirdPartiesDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-third-parties-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listThirdParties } from "@/server/contabilidad/queries";

export const dynamic = "force-dynamic";

export default async function AccountingThirdPartiesPage() {
  const ctb = await getContabilidadPageContext();
  const parties =
    ctb.enabled && ctb.canViewLedger ? await listThirdParties(ctb.scope) : [];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadThirdPartiesDbPanel
          branches={branches}
          canOperate={ctb.canOperate}
          canViewLedger={ctb.canViewLedger}
          enabled={ctb.enabled}
          parties={parties}
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
        section="terceros"
      />
    </section>
  );
}
