import { Megaphone } from "lucide-react";

import { Card } from "@/components/ui/card";
import { motorcycles } from "@/data/catalog/motorcycles";
import { desiredBranches } from "@/data/operations/leads";
import { LegacyOperationalPanelGate } from "@/features/operations/components/legacy-section-divider";
import {
  MarketingDbPanel,
  type BranchOption,
  type ModelOption,
} from "@/features/operations/modules/marketing-db/marketing-db-panel";
import { MarketingAttributionSection } from "@/features/operations/modules/marketing-db/marketing-attribution-section";
import { MetaIntegrationsPanel } from "@/features/operations/modules/marketing-db/meta-integrations-panel";
import { MarketingPanel } from "@/features/operations/modules/marketing/marketing-panel";
import {
  canManageMarketing,
  canViewLeadAttribution,
  canViewCosts,
  canViewMarketing,
  getMarketingScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";
import {
  getMarketingAttributionReport,
  getMarketingCampaignPerformance,
  getMarketingSummary,
  listMarketingCampaigns,
  listMarketingLeadAttribution,
} from "@/server/marketing/queries";
import {
  listBranchChoices,
  listMetaPageBranchMappings,
  listPendingMetaUnmappedLeads,
} from "@/server/meta/queries";
import {
  getLatestMetaAdMetrics,
  listMetaAdAccounts,
} from "@/server/meta-ads/queries";
import {
  isMetaAdDatePresetValue,
  type MetaAdDatePresetValue,
} from "@/server/meta-ads/shared";

export const dynamic = "force-dynamic";

const branchOptions: BranchOption[] = desiredBranches.map((branch) => ({
  code: branch.id,
  name: branch.name,
}));
const modelOptions: ModelOption[] = motorcycles.map((model) => ({
  slug: model.slug,
  name: model.name,
}));

/** Periodo por defecto del tablero cuando la URL no pide otro. */
const DEFAULT_METRICS_PRESET: MetaAdDatePresetValue = "ULTIMOS_7D";

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const metricsPreset: MetaAdDatePresetValue =
    periodo && isMetaAdDatePresetValue(periodo) ? periodo : DEFAULT_METRICS_PRESET;

  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();

  // Dedicated Marketing access: Admin and MARKETING manage; Manager reads.
  if (!canViewMarketing(session.roleEnum)) {
    return (
      <Card className="p-8 text-center">
        <Megaphone className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Marketing restringido</h2>
        <p className="mt-2 text-sm text-slate-500">
          Este módulo está disponible para Marketing, Gerente y Administrador.
        </p>
      </Card>
    );
  }

  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const canManage = canManageMarketing(session.roleEnum);
  const canViewAttribution = canViewLeadAttribution(session.roleEnum);
  // Campaign planning budget is part of Marketing management. This does not
  // grant inventory/accounting cost access (`canViewCosts` remains false).
  const canViewBudget = canManage || canViewCosts(session.roleEnum);

  if (dbConfigured) {
    const scope = getMarketingScopeForUser(session.roleEnum, branchCode);
    const [
      campaigns,
      performance,
      summary,
      attribution,
      metaMappings,
      metaPending,
      metaBranches,
      metaAdAccounts,
      metaMetricsBoard,
      attributionReport,
    ] = await Promise.all([
      listMarketingCampaigns(scope, canViewBudget),
      getMarketingCampaignPerformance(scope),
      getMarketingSummary(scope),
      canViewAttribution
        ? listMarketingLeadAttribution(scope)
        : Promise.resolve([]),
      // La integración de Meta es configuración global, no un dato de sucursal:
      // sólo la ve quien administra Marketing (Admin y MARKETING), la misma
      // puerta que ya restringe la atribución a nivel de lead.
      canManage ? listMetaPageBranchMappings() : Promise.resolve([]),
      canManage ? listPendingMetaUnmappedLeads() : Promise.resolve([]),
      canManage ? listBranchChoices() : Promise.resolve([]),
      canManage ? listMetaAdAccounts() : Promise.resolve([]),
      // Lectura de la base, sin red: el tablero nunca consulta a Meta al cargar.
      canManage
        ? getLatestMetaAdMetrics(metricsPreset)
        : Promise.resolve({ datePreset: metricsPreset, rows: [] }),
      /*
       * Patch Marketing-P1 — **sin `canManage` delante.**
       *
       * Attribution-1 lo puso ahí porque su tabla vivía dentro del panel de
       * integraciones de Meta, y eso dejó fuera al Gerente de un agregado que
       * `canViewLeadAttribution` dice que le corresponde: «Managers keep
       * aggregate campaign metrics but do not receive lead-level rows». Este
       * informe no tiene ni una fila a nivel de lead — es un recuento por canal.
       *
       * Quien llega hasta aquí ya pasó `canViewMarketing`, y el alcance por
       * sucursal lo impone `scope`, no la pantalla.
       *
       * Lo que sí depende del rol es **el dinero**: `canViewAttribution` (Admin y
       * MARKETING) decide si las filas traen gasto y coste por lead. Al Gerente
       * se le retiran los dos juntos, porque el coste por lead es el gasto
       * dividido entre unos leads que sí ve — ocultar uno y enseñar el otro no
       * ocultaría nada.
       */
      getMarketingAttributionReport(scope, metricsPreset, canViewAttribution),
    ]);

    return (
      <section className="space-y-10">
        <MarketingDbPanel
          attribution={attribution}
          branches={branchOptions}
          campaigns={campaigns}
          canManage={canManage}
          canViewAttribution={canViewAttribution}
          canViewBudget={canViewBudget}
          models={modelOptions}
          adAccounts={metaAdAccounts}
          performance={performance}
          summary={summary}
        />
        {/*
          Patch Marketing-P1 — la atribución por canal **cuelga de la página**, no
          del panel de integraciones de Meta.

          Vivía dentro de `MetaIntegrationsPanel`, que sólo se dibuja para quien
          administra Marketing; mientras estuviera ahí, dársela al Gerente era
          imposible por construcción. Aquí la ve todo el que ve el módulo, y lo
          que cambia según el rol son sus columnas de dinero, que el servidor
          incluye o no.
        */}
        <MarketingAttributionSection report={attributionReport} />
        {canManage ? (
          <MetaIntegrationsPanel
            adAccounts={metaAdAccounts}
            branches={metaBranches}
            metricsBoard={metaMetricsBoard}
            canManage={canManage}
            mappings={metaMappings}
            pending={metaPending}
          />
        ) : null}
        <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
          <MarketingPanel />
        </LegacyOperationalPanelGate>
      </section>
    );
  }

  // No database configured: fall back to the legacy localStorage Marketing panel.
  return (
    <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
      <MarketingPanel />
    </LegacyOperationalPanelGate>
  );
}
