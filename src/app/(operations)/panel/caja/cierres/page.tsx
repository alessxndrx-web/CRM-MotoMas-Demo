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
import { listFinancialAuditHistory } from "@/server/financial-audit/queries";

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
  const [sessionAuditEvents, closingAuditEvents] = sessionDetail
    ? await Promise.all([
        listFinancialAuditHistory({
          domain: "CAJA",
          entityType: "CASH_SESSION",
          entityId: sessionDetail.session.id,
          limit: 50,
        }),
        sessionDetail.closing
          ? listFinancialAuditHistory({
              domain: "CAJA",
              entityType: "CASH_CLOSING",
              entityId: sessionDetail.closing.id,
              limit: 50,
            })
          : Promise.resolve([]),
      ])
    : [[], []];
  const historicalClosingAuditEvents = caja.enabled
    ? await listFinancialAuditHistory({
        domain: "CAJA",
        entityType: "CASH_CLOSING",
        limit: 100,
      })
    : [];

  return (
    <section className="space-y-10">
      {caja.canAccess ? (
        <CajaClosingsDbPanel
          canOperate={caja.canOperate}
          canReview={caja.canReview}
          closings={closings}
          closingAuditEvents={closingAuditEvents}
          enabled={caja.enabled}
          historicalClosingAuditEvents={historicalClosingAuditEvents}
          scopeLabel={caja.scopeLabel}
          sessionDetail={sessionDetail}
          sessionAuditEvents={sessionAuditEvents}
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
