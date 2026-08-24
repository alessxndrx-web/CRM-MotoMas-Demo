import { LegacyOperationalPanelGate } from "@/features/operations/components/legacy-section-divider";
import { DashboardDbPanel } from "@/features/operations/modules/dashboard-db/dashboard-db-panel";
import { OperationsDashboard } from "@/features/operations/modules/dashboard/operations-dashboard";
import { PosOperationsPanel } from "@/features/operations/modules/dashboard/pos-operations-panel";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { getPosDashboard, parseDashboardPeriod } from "@/server/pos/dashboard";
import {
  getDashboardAlerts,
  getDashboardBranchPerformance,
  getDashboardRecentActivity,
  getDashboardRoleContext,
  getDashboardSellerPerformance,
  getOperationsDashboardSummary,
  type AnalyticsContext,
} from "@/server/analytics/queries";

export const dynamic = "force-dynamic";

/**
 * Patch POS2.1. El período viaja en la URL (`?periodo=`), no en estado de
 * cliente: así el servidor recalcula **todas** las cifras del mismo rango y el
 * filtro se puede compartir pegando el enlace.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const period = parseDashboardPeriod((await searchParams).periodo);

  const context: AnalyticsContext = {
    role: session.roleEnum,
    branchCode: session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId,
    userId: session.uid,
  };

  const roleContext = getDashboardRoleContext({
    ...context,
    branchName: session.branchName,
  });

  if (dbConfigured) {
    const [
      summary,
      alerts,
      recentActivity,
      branchPerformance,
      sellerPerformance,
      posDashboard,
    ] = await Promise.all([
      getOperationsDashboardSummary(context),
      getDashboardAlerts(context),
      getDashboardRecentActivity(context),
      getDashboardBranchPerformance(context),
      getDashboardSellerPerformance(context),
      // Patch POS2.1. En paralelo con lo demás: son fuentes independientes y
      // encadenarlas solo añadiría latencia a una pantalla de alta frecuencia.
      getPosDashboard(
        {
          role: session.roleEnum,
          branchCode: context.branchCode,
          branchName: session.branchName,
        },
        period,
      ),
    ]);

    return (
      <section className="space-y-10">
        <PosOperationsPanel data={posDashboard} />
        <DashboardDbPanel
          alerts={alerts}
          branchName={session.branchName}
          branchPerformance={branchPerformance}
          recentActivity={recentActivity}
          roleContext={roleContext}
          sellerPerformance={sellerPerformance}
          summary={summary}
        />
        <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
          <OperationsDashboard />
        </LegacyOperationalPanelGate>
      </section>
    );
  }

  // No database configured: fall back to the legacy localStorage dashboard.
  return (
    <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
      <OperationsDashboard />
    </LegacyOperationalPanelGate>
  );
}
