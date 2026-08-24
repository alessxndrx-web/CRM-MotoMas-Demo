import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { TransfersPanel } from "@/features/operations/modules/transfers/transfers-panel";
import { TransfersDbPanel } from "@/features/operations/modules/transfers-db/transfers-db-panel";
import { desiredBranches } from "@/data/operations/leads";
import {
  canApproveTransfers,
  canManageTransfers,
  getBranchScopeForUser,
  getOperationsScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { getInventoryData } from "@/server/inventory/queries";
import { listTransfers } from "@/server/operations/queries";

export const dynamic = "force-dynamic";

export default async function TransfersPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const canRequest = canManageTransfers(session.roleEnum);
  const canApprove = canApproveTransfers(session.roleEnum);

  let transfers: Awaited<ReturnType<typeof listTransfers>> = [];
  let units: Awaited<ReturnType<typeof getInventoryData>>["units"] = [];

  if (dbConfigured && canRequest) {
    const scope = getOperationsScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    const branchScope = getBranchScopeForUser(session.roleEnum, session.branchId);
    const [transfersResult, inventoryResult] = await Promise.all([
      listTransfers(scope),
      getInventoryData(branchScope),
    ]);
    transfers = transfersResult;
    units = inventoryResult.units;
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis traslados";

  return (
    <section className="space-y-10">
      {canRequest ? (
        <TransfersDbPanel
          branches={desiredBranches.map((branch) => ({ code: branch.id, name: branch.name }))}
          canApprove={canApprove}
          canRequest={canRequest}
          dbConfigured={dbConfigured}
          scopeLabel={scopeLabel}
          transfers={transfers}
          units={units}
        />
      ) : null}
      <LegacyOperationalPanelGate
        dbAvailable={dbConfigured}
        fallbackAllowed={canRequest}
      >
        {dbConfigured ? (
          <LegacySectionDivider
            businessLabel="Seguimiento adicional de traslados"
            technicalLabel="Traslados locales · Temporal, pendiente de migración"
          />
        ) : null}
        <TransfersPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
