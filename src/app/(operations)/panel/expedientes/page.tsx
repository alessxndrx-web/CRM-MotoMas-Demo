import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ServiceRating } from "@/features/operations/modules/customer-files-db/service-rating";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { CustomerFilesList } from "@/features/operations/modules/customer-files/customer-files-list";
import { CustomerFilesDbPanel } from "@/features/operations/modules/customer-files-db/customer-files-db-panel";
import { ExpedienteSupportPanel } from "@/features/operations/modules/expediente-support-db/expediente-support-panel";
import {
  canAssignLeads,
  canOperateCrm,
  canOperateExpedientes,
  canReviewExpedienteDocuments,
  getCrmScopeForUser,
  getExpedienteScopeForUser,
  isGlobalScopeRole,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listUsers } from "@/server/auth/user-store";
import { listActiveBranches } from "@/server/branches/queries";
import { listCatalogOptions } from "@/server/catalog/queries";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { getCustomerFileDetail, listCustomerFiles, listCustomers, listLeads } from "@/server/crm/queries";
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
  let customers: Awaited<ReturnType<typeof listCustomers>> = [];
  let leads: Awaited<ReturnType<typeof listLeads>> = [];
  let sellers: Array<{ id: string; name: string; branchCode: string | null }> = [];
  let branches: Array<{ code: string; name: string }> = [];
  let catalogModels: Array<{ id: string; label: string }> = [];
  if (dbConfigured && canOperate) {
    const scope = getCrmScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    // El formulario de alta sólo ofrece clientes y leads que el alcance del
    // usuario ya le deja ver; la acción lo vuelve a comprobar igualmente.
    // Patch CRM-INT1 — sucursales y catálogo desde la base, la misma fuente
    // que usan Clientes y Leads.
    const [catalog, activeBranches] = await Promise.all([
      listCatalogOptions(),
      isGlobalScopeRole(session.roleEnum) ? listActiveBranches() : Promise.resolve([]),
    ]);
    catalogModels = catalog.map((model) => ({ id: model.id, label: model.label }));
    branches = activeBranches;
    [files, customers, leads] = await Promise.all([
      listCustomerFiles(scope),
      listCustomers(scope),
      listLeads(scope),
    ]);

    if (canAssignLeads(session.roleEnum)) {
      const sellerUsers = await listUsers(
        scope.level === "branch" ? { branchCode: scope.branchCode } : undefined,
      );
      sellers = sellerUsers
        .filter(
          (user) => user.role === "VENDEDOR" || user.role === "LIDER_VENTAS" || user.role === "CALL_CENTER",
        )
        .map((user) => ({
          id: user.id,
          name: user.name,
          branchCode: user.branchCode,
        }));
    }
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
  const detail = support ? await getCustomerFileDetail(
    getCrmScopeForUser(session.roleEnum,session.branchId,session.uid), support.customerFileId,
  ) : null;

  const scopeLabel =
    (session.roleEnum === "ADMIN" || session.roleEnum === "CALL_CENTER")
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis expedientes";

  return (
    <section className="space-y-6">
      <PageHeader
        description="El expediente agrupa proforma, documentos y seguimiento de crédito de un cliente. Selecciona uno para trabajarlo."
        title="Expedientes"
      />
      {canOperate ? (
        <CustomerFilesDbPanel
          branches={branches}
          canChooseSeller={canAssignLeads(session.roleEnum)}
          catalogModels={catalogModels}
          customers={customers}
          dbConfigured={dbConfigured}
          files={files}
          leads={leads}
          scopeLabel={scopeLabel}
          sellers={sellers}
          selectedFileId={support ? support.customerFileId : null}
        />
      ) : null}

      {detail ? <Card className="space-y-4 p-6">
        <h3 className="text-lg font-semibold">Ficha del cliente · {detail.customer.name}</h3>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Teléfono</dt><dd>{detail.customer.phone}</dd></div>
          <div><dt className="text-slate-500">Correo</dt><dd>{detail.customer.email ?? "Sin registrar"}</dd></div>
          <div><dt className="text-slate-500">Sucursal de atención</dt><dd>{detail.branchName}</dd></div>
          <div><dt className="text-slate-500">Motocicleta de interés</dt><dd>{detail.motorcycleInterest ?? "Sin registrar"}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">Requisitos pendientes de {detail.customer.name}</dt><dd>{support?.creditApplication?.pendingItems ?? "Sin requisitos de crédito registrados"}</dd></div>
        </dl>
        <Link className="inline-block underline" href={`/panel/clientes/${detail.customerId}`}>Abrir ficha completa de {detail.customer.name}</Link>
        <ServiceRating fileId={detail.id} rating={detail.serviceRating} canRate={["ADMIN","GERENTE","CALL_CENTER"].includes(session.roleEnum)}/>
      </Card> : null}
      {support ? (
        <ExpedienteSupportPanel
          canReview={canReviewExpedienteDocuments(session.roleEnum)}
          fileNumber={selectedFile?.fileNumber ?? ""}
          nowIso={new Date().toISOString()}
          support={support}
        />
      ) : null}

      <LegacyOperationalPanelGate
        dbAvailable={dbConfigured}
        fallbackAllowed={canOperate}
      >
        {dbConfigured ? (
          <LegacySectionDivider
            businessLabel="Registros adicionales de expedientes"
            technicalLabel="Expedientes locales · Temporal, pendiente de migración"
          />
        ) : null}
        <CustomerFilesList />
      </LegacyOperationalPanelGate>
    </section>
  );
}
