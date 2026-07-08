import { Badge } from "@/components/ui/badge";
import { CustomersList } from "@/features/operations/modules/customers/customers-list";
import { CustomersDbPanel } from "@/features/operations/modules/customers-db/customers-db-panel";
import { canOperateCrm, getCrmScopeForUser } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomers } from "@/server/crm/queries";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const canOperate = canOperateCrm(session.roleEnum);

  let customers: Awaited<ReturnType<typeof listCustomers>> = [];
  if (dbConfigured && canOperate) {
    const scope = getCrmScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    customers = await listCustomers(scope);
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis clientes";

  return (
    <section className="space-y-10">
      {canOperate ? (
        <CustomersDbPanel
          customers={customers}
          dbConfigured={dbConfigured}
          scopeLabel={scopeLabel}
        />
      ) : null}
      {dbConfigured && canOperate ? <LegacyDivider /> : null}
      <CustomersList />
    </section>
  );
}

/** See LegacyDivider in panel/leads/page.tsx for rationale. */
function LegacyDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-white/10" />
      <Badge tone="gray">Listado local · Temporal, pendiente de migración</Badge>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
