import { LegacyOperationalPanelGate } from "@/features/operations/components/legacy-section-divider";
import { DashboardDbPanel } from "@/features/operations/modules/dashboard-db/dashboard-db-panel";
import { OperationsDashboard } from "@/features/operations/modules/dashboard/operations-dashboard";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";
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

export default async function DashboardPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();

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
    ] = await Promise.all([
      getOperationsDashboardSummary(context),
      getDashboardAlerts(context),
      getDashboardRecentActivity(context),
      getDashboardBranchPerformance(context),
      getDashboardSellerPerformance(context),
    ]);

    return (
      <section className="space-y-10">
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
