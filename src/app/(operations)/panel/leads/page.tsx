import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { LeadsInbox } from "@/features/operations/modules/leads/leads-inbox";
import {
  LeadsDbPanel,
  type SellerOption,
} from "@/features/operations/modules/leads-db/leads-db-panel";
import {
  canAssignLeads,
  canOperateCrm,
  getCrmScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listUsers } from "@/server/auth/user-store";
import { listLeads } from "@/server/crm/queries";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const canOperate = canOperateCrm(session.roleEnum);
  const canAssign = canAssignLeads(session.roleEnum);

  let dbLeads: Awaited<ReturnType<typeof listLeads>> = [];
  let sellers: SellerOption[] = [];

  if (dbConfigured && canOperate) {
    const scope = getCrmScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    dbLeads = await listLeads(scope);

    if (canAssign) {
      const sellerUsers = await listUsers(
        scope.level === "branch" ? { branchCode: scope.branchCode } : undefined,
      );
      sellers = sellerUsers
        .filter((user) => user.role === "VENDEDOR")
        .map((user) => ({
          id: user.id,
          name: user.name,
          branchCode: user.branchCode,
        }));
    }
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis leads";

  return (
    <section className="space-y-10">
      {canOperate ? (
        <LeadsDbPanel
          canAssign={canAssign}
          canChangeStatus={session.roleEnum === "GERENTE" || session.roleEnum === "VENDEDOR"}
          dbConfigured={dbConfigured}
          leads={dbLeads}
          scopeLabel={scopeLabel}
          sellers={sellers}
        />
      ) : null}
      <LegacyOperationalPanelGate
        dbAvailable={dbConfigured}
        fallbackAllowed={canOperate}
      >
        {dbConfigured ? (
          <LegacySectionDivider
            businessLabel="Seguimiento adicional de leads"
            technicalLabel="Bandeja local · Temporal, pendiente de migración"
          />
        ) : null}
        <LeadsInbox />
      </LegacyOperationalPanelGate>
    </section>
  );
}
