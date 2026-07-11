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
import { MarketingPanel } from "@/features/operations/modules/marketing/marketing-panel";
import {
  canManageMarketing,
  canViewCosts,
  canViewMarketing,
  getMarketingScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";
import {
  getMarketingCampaignPerformance,
  getMarketingSummary,
  listMarketingCampaigns,
} from "@/server/marketing/queries";

export const dynamic = "force-dynamic";

const branchOptions: BranchOption[] = desiredBranches.map((branch) => ({
  code: branch.id,
  name: branch.name,
}));
const modelOptions: ModelOption[] = motorcycles.map((model) => ({
  slug: model.slug,
  name: model.name,
}));

export default async function MarketingPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();

  // Marketing is restricted to Admin and Manager; everyone else is blocked.
  if (!canViewMarketing(session.roleEnum)) {
    return (
      <Card className="p-8 text-center">
        <Megaphone className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Marketing restringido</h2>
        <p className="mt-2 text-sm text-slate-500">
          Este módulo está disponible para Gerente y Administrador.
        </p>
      </Card>
    );
  }

  const branchCode =
    session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const canManage = canManageMarketing(session.roleEnum);
  const canViewBudget = canViewCosts(session.roleEnum);

  if (dbConfigured) {
    const scope = getMarketingScopeForUser(session.roleEnum, branchCode);
    const [campaigns, performance, summary] = await Promise.all([
      listMarketingCampaigns(scope, canViewBudget),
      getMarketingCampaignPerformance(scope),
      getMarketingSummary(scope),
    ]);

    return (
      <section className="space-y-10">
        <MarketingDbPanel
          branches={branchOptions}
          campaigns={campaigns}
          canManage={canManage}
          canViewBudget={canViewBudget}
          models={modelOptions}
          performance={performance}
          summary={summary}
        />
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
