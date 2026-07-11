import { desiredBranches } from "@/data/operations/leads";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { ActivitiesPanel } from "@/features/operations/modules/activities/activities-panel";
import { ActivitiesDbPanel } from "@/features/operations/modules/activities-db/activities-db-panel";
import {
  canOperateActivities,
  getActivityScopeForUser,
  getCrmScopeForUser,
  isGlobalScopeRole,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listCustomerFiles } from "@/server/crm/queries";
import { buildActivitySummary } from "@/server/crm/shared";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listActivities } from "@/server/expedientes/queries";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  // Cashier and Accountant never operate commercial activities.
  const canOperate = canOperateActivities(session.roleEnum);

  let activities: Awaited<ReturnType<typeof listActivities>> = [];
  let files: Awaited<ReturnType<typeof listCustomerFiles>> = [];
  if (dbConfigured && canOperate) {
    const scope = getActivityScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    activities = await listActivities(scope);
    // The expediente selector only ever offers expedientes already in scope.
    files = await listCustomerFiles(
      getCrmScopeForUser(session.roleEnum, session.branchId, session.uid),
    );
  }

  // `now` is resolved once on the server so the overdue count cannot differ
  // between the server and client render.
  const now = new Date();

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis actividades";

  return (
    <section className="space-y-10">
      {canOperate ? (
        <ActivitiesDbPanel
          activities={activities}
          // Only a global role picks a branch; the others inherit their own.
          branches={
            isGlobalScopeRole(session.roleEnum)
              ? desiredBranches.map((branch) => ({
                  code: branch.id,
                  name: branch.name,
                }))
              : []
          }
          dbConfigured={dbConfigured}
          files={files.map((file) => ({
            id: file.id,
            fileNumber: file.fileNumber,
            customerName: file.customerName,
          }))}
          nowIso={now.toISOString()}
          scopeLabel={scopeLabel}
          summary={buildActivitySummary(activities, now)}
        />
      ) : null}

      <LegacyOperationalPanelGate
        dbAvailable={dbConfigured}
        fallbackAllowed={canOperate}
      >
        {dbConfigured ? (
          <LegacySectionDivider
            businessLabel="Registros adicionales de actividades"
            technicalLabel="Actividades locales · Temporal, pendiente de migración"
          />
        ) : null}
        <ActivitiesPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
