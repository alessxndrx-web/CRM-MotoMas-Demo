import { Badge } from "@/components/ui/badge";
import { CustomerFilesList } from "@/features/operations/modules/customer-files/customer-files-list";
import { CustomerFilesDbPanel } from "@/features/operations/modules/customer-files-db/customer-files-db-panel";
import { canOperateCrm, getCrmScopeForUser } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomerFiles } from "@/server/crm/queries";

export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const canOperate = canOperateCrm(session.roleEnum);

  let files: Awaited<ReturnType<typeof listCustomerFiles>> = [];
  if (dbConfigured && canOperate) {
    const scope = getCrmScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    files = await listCustomerFiles(scope);
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis expedientes";

  return (
    <section className="space-y-10">
      {canOperate ? (
        <CustomerFilesDbPanel
          dbConfigured={dbConfigured}
          files={files}
          scopeLabel={scopeLabel}
        />
      ) : null}
      {dbConfigured && canOperate ? <LegacyDivider /> : null}
      <CustomerFilesList />
    </section>
  );
}

/** See LegacyDivider in panel/leads/page.tsx for rationale. */
function LegacyDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-white/10" />
      <Badge tone="gray">Expedientes locales · Temporal, pendiente de migración</Badge>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
