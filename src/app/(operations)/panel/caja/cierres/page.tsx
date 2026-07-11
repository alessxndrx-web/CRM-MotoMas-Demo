import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { CajaClosingsDbPanel } from "@/features/operations/modules/caja-db/caja-closings-db-panel";
import { CashierPanel } from "@/features/operations/modules/cashier/cashier-panel";
import { getCajaPageContext } from "@/server/caja/context";
import {
  getCashSessionDetail,
  getCurrentCashSession,
  listCashClosings,
} from "@/server/caja/queries";

export const dynamic = "force-dynamic";

export default async function CashierClosuresPage() {
  const caja = await getCajaPageContext();

  const [closings, session] = caja.enabled
    ? await Promise.all([
        listCashClosings(caja.scope),
        getCurrentCashSession(caja.scope),
      ])
    : [[], null];

  // The open turno carries the documents the closing preview derives from.
  const sessionDetail =
    caja.enabled && session
      ? await getCashSessionDetail(caja.scope, session.id)
      : null;

  return (
    <section className="space-y-10">
      {caja.canAccess ? (
        <CajaClosingsDbPanel
          canOperate={caja.canOperate}
          canReview={caja.canReview}
          closings={closings}
          enabled={caja.enabled}
          scopeLabel={caja.scopeLabel}
          sessionDetail={sessionDetail}
          supervision={caja.supervision}
        />
      ) : null}

      <LegacyOperationalPanelGate
        dbAvailable={caja.dbConfigured}
        fallbackAllowed={caja.canAccess}
      >
        {caja.enabled ? (
          <LegacySectionDivider
            businessLabel="Registros adicionales de cierres"
            technicalLabel="Cierres locales · Temporal, pendiente de migración"
          />
        ) : null}
        <CashierPanel section="cierres" />
      </LegacyOperationalPanelGate>
    </section>
  );
}
