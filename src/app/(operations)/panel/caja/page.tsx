import { desiredBranches } from "@/data/operations/leads";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { CajaDashboardDbPanel } from "@/features/operations/modules/caja-db/caja-dashboard-db-panel";
import { CashierPanel } from "@/features/operations/modules/cashier/cashier-panel";
import { getCajaPageContext } from "@/server/caja/context";
import {
  getCajaDashboardSummary,
  listCashClosings,
  listCashDocuments,
} from "@/server/caja/queries";

export const dynamic = "force-dynamic";

const RECENT_DOCUMENTS = 8;
const RECENT_CLOSINGS = 5;

export default async function CashierPage() {
  // Seller and Accountant never enter the operational Caja layer, and every
  // query below re-applies the scope this context resolved.
  const caja = await getCajaPageContext();

  const summary = caja.canAccess
    ? await getCajaDashboardSummary(caja.scope)
    : null;
  const [documents, closings] = caja.enabled
    ? await Promise.all([
        listCashDocuments(caja.scope),
        listCashClosings(caja.scope),
      ])
    : [[], []];

  return (
    <section className="space-y-10">
      {summary ? (
        <CajaDashboardDbPanel
          // Only a global role picks the branch of a new turno.
          branches={
            caja.isGlobal
              ? desiredBranches.map((branch) => ({
                  code: branch.id,
                  name: branch.name,
                }))
              : []
          }
          canOperate={caja.canOperate}
          closings={closings.slice(0, RECENT_CLOSINGS)}
          documents={documents.slice(0, RECENT_DOCUMENTS)}
          enabled={caja.enabled}
          scopeLabel={caja.scopeLabel}
          summary={summary}
          supervision={caja.supervision}
        />
      ) : null}

      <LegacyOperationalPanelGate
        dbAvailable={caja.dbConfigured}
        fallbackAllowed={caja.canAccess}
      >
        {caja.enabled ? (
          <LegacySectionDivider
            businessLabel="Registros adicionales de caja"
            technicalLabel="Caja local · Temporal, pendiente de migración"
          />
        ) : null}
        <CashierPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
