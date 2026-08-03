import { desiredBranches } from "@/data/operations/leads";
import { ContabilidadVatSettlementsDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-vat-settlements-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import { listVatSettlements } from "@/server/contabilidad/queries";
import { listFinancialAuditHistory } from "@/server/financial-audit/queries";

export const dynamic = "force-dynamic";

/**
 * Patch FF2.1-D — liquidación de IVA.
 *
 * A diferencia del resto de las páginas de Contabilidad, esta no renderiza un
 * panel heredado debajo: la liquidación nació en FF2.0-E, no existe en el módulo
 * local anterior y no hay nada que migrar.
 */
export default async function AccountingVatSettlementsPage() {
  const ctb = await getContabilidadPageContext();
  const settlements =
    ctb.enabled && ctb.canViewLedger ? await listVatSettlements(ctb.scope) : [];
  const auditEvents =
    ctb.enabled && ctb.canViewLedger
      ? await listFinancialAuditHistory({
          domain: "CONTABILIDAD",
          entityType: "VAT_SETTLEMENT",
          limit: 200,
        })
      : [];
  const branches = ctb.isGlobal
    ? desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))
    : [];

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadVatSettlementsDbPanel
          auditEvents={auditEvents}
          branches={branches}
          canOperate={ctb.canOperate}
          canReview={ctb.canReview}
          canViewLedger={ctb.canViewLedger}
          enabled={ctb.enabled}
          scopeLabel={ctb.scopeLabel}
          settlements={settlements}
          supervision={ctb.supervision}
        />
      ) : null}
    </section>
  );
}
