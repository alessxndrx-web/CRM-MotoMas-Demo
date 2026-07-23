import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { CajaDocumentsDbPanel } from "@/features/operations/modules/caja-db/caja-documents-db-panel";
import { CashierPanel } from "@/features/operations/modules/cashier/cashier-panel";
import { loadCajaDocumentsSection } from "@/server/caja/sections";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ documento?: string | string[] }>;
};

export default async function CashierNotesPage({ searchParams }: PageProps) {
  const data = await loadCajaDocumentsSection("notas", searchParams);

  return (
    <section className="space-y-10">
      {data.caja.canAccess ? (
        <CajaDocumentsDbPanel
          auditEvents={data.auditEvents}
          canOperate={data.caja.canOperate}
          detail={data.detail}
          documents={data.documents}
          enabled={data.caja.enabled}
          scopeLabel={data.caja.scopeLabel}
          section="notas"
          sessions={data.sessions}
          supervision={data.caja.supervision}
        />
      ) : null}

      <LegacyOperationalPanelGate
        dbAvailable={data.caja.dbConfigured}
        fallbackAllowed={data.caja.canAccess}
      >
        {data.caja.enabled ? (
          <LegacySectionDivider
            businessLabel="Registros adicionales de notas"
            technicalLabel="Notas locales · Temporal, pendiente de migración"
          />
        ) : null}
        <CashierPanel section="notas" />
      </LegacyOperationalPanelGate>
    </section>
  );
}
