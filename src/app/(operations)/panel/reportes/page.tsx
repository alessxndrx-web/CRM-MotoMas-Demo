import { BarChart3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { LegacyOperationalPanelGate } from "@/features/operations/components/legacy-section-divider";
import { ReportsDbPanel } from "@/features/operations/modules/reports-db/reports-db-panel";
import { ReportsPanel } from "@/features/operations/modules/reports/reports-panel";
import { canViewMarketing } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { isDatabaseConfigured } from "@/server/db/prisma";
import {
  getCommercialReportSummary,
  type AnalyticsContext,
} from "@/server/analytics/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();

  // Commercial reports remain restricted to Admin and Manager, matching the
  // current role rules. Seller, Cashier and Accountant never see them.
  const canViewReports =
    session.roleEnum === "ADMIN" || session.roleEnum === "GERENTE";

  if (!canViewReports) {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Reportes restringidos</h2>
        <p className="mt-2 text-sm text-slate-500">
          Los reportes comerciales están disponibles para Gerente y Administrador.
        </p>
      </Card>
    );
  }

  const context: AnalyticsContext = {
    role: session.roleEnum,
    branchCode: session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId,
    userId: session.uid,
  };

  if (dbConfigured) {
    const report = await getCommercialReportSummary(context);
    return (
      <section className="space-y-10">
        <ReportsDbPanel
          branchName={session.branchName}
          canViewMarketing={canViewMarketing(session.roleEnum)}
          report={report}
          scopeIsGlobal={report.scopeLevel === "global"}
        />
        <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
          <ReportsPanel />
        </LegacyOperationalPanelGate>
      </section>
    );
  }

  // No database configured: fall back to the legacy localStorage reports.
  return (
    <LegacyOperationalPanelGate dbAvailable={dbConfigured} fallbackAllowed>
      <ReportsPanel />
    </LegacyOperationalPanelGate>
  );
}
