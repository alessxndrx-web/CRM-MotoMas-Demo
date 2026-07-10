import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { CustomerFilesList } from "@/features/operations/modules/customer-files/customer-files-list";
import { CustomerFilesDbPanel } from "@/features/operations/modules/customer-files-db/customer-files-db-panel";
import { ExpedienteSupportPanel } from "@/features/operations/modules/expediente-support-db/expediente-support-panel";
import {
  canOperateCrm,
  canOperateExpedientes,
  canReviewExpedienteDocuments,
  getCrmScopeForUser,
  getExpedienteScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomerFiles } from "@/server/crm/queries";
import { getExpedienteSupport } from "@/server/expedientes/queries";

export const dynamic = "force-dynamic";

type FilesPageProps = {
  searchParams?: Promise<{ expediente?: string | string[] }>;
};

export default async function FilesPage({ searchParams }: FilesPageProps) {
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

  // The selected expediente drives the support panel. `getExpedienteSupport`
  // re-applies the caller's scope, so an out-of-scope id simply yields null —
  // the URL is never trusted.
  const params = await searchParams;
  const raw = params?.expediente;
  const selectedFileId = Array.isArray(raw) ? raw[0] : raw;

  let support: Awaited<ReturnType<typeof getExpedienteSupport>> = null;
  if (dbConfigured && selectedFileId && canOperateExpedientes(session.roleEnum)) {
    const supportScope = getExpedienteScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    support = await getExpedienteSupport(supportScope, selectedFileId);
  }

  const selectedFile = support
    ? files.find((file) => file.id === support.customerFileId)
    : undefined;

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
          selectedFileId={support ? support.customerFileId : null}
        />
      ) : null}

      {support ? (
        <ExpedienteSupportPanel
          canReview={canReviewExpedienteDocuments(session.roleEnum)}
          fileNumber={selectedFile?.fileNumber ?? ""}
          support={support}
        />
      ) : null}

      {dbConfigured && canOperate ? (
        <LegacySectionDivider
          businessLabel="Registros adicionales de expedientes"
          technicalLabel="Expedientes locales · Temporal, pendiente de migración"
        />
      ) : null}
      <CustomerFilesList />
    </section>
  );
}
