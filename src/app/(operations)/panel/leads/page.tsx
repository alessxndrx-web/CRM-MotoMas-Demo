import { Badge } from "@/components/ui/badge";
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
      {dbConfigured && canOperate ? <LegacyDivider /> : null}
      <LeadsInbox />
    </section>
  );
}

/** Marks the pre-existing localStorage bandeja as temporary now that the
 * database section above is primary. Shown only when the database section is
 * actually rendered, so this label never appears while the database is the
 * only unavailable option (in which case the localStorage view is not
 * "temporary" — it's the sole working path). */
function LegacyDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-white/10" />
      <Badge tone="gray">Bandeja local · Temporal, pendiente de migración</Badge>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
