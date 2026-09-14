import { PageHeader } from "@/components/ui/page-header";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { CreditsPanel } from "@/features/operations/modules/credits/credits-panel";
import { CreditsDbPanel } from "@/features/operations/modules/credits-db/credits-db-panel";
import {
  canOperateExpedientes,
  getCrmScopeForUser,
  getExpedienteScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listCustomerFiles } from "@/server/crm/queries";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCreditApplications } from "@/server/expedientes/queries";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();

  // Supervisión de sucursal, no lista de todos. Patch CRM-QA1 añade al Líder de
  // ventas por la misma razón que el Gerente estaba: supervisa la cartera de
  // crédito de su equipo. Un Vendedor sigue llegando al crédito por su propio
  // expediente, no por esta lista de toda la sucursal.
  const canOperate =
    canOperateExpedientes(session.roleEnum) &&
    (session.roleEnum === "ADMIN" ||
      session.roleEnum === "GERENTE" ||
      session.roleEnum === "LIDER_VENTAS");

  let applications: Awaited<ReturnType<typeof listCreditApplications>> = [];
  let filesWithoutCredit: Awaited<ReturnType<typeof listCustomerFiles>> = [];
  if (dbConfigured && canOperate) {
    const scope = getExpedienteScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    applications = await listCreditApplications(scope);

    // Una solicitud por expediente: los que ya la tienen no se ofrecen.
    const files = await listCustomerFiles(
      getCrmScopeForUser(session.roleEnum, session.branchId, session.uid),
    );
    const taken = new Set(applications.map((row) => row.customerFileId));
    filesWithoutCredit = files.filter((file) => !taken.has(file.id));
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis créditos";

  return (
    <section className="space-y-6">
      <PageHeader
        description="El seguimiento manual de financiamiento, uno por expediente. Abre el expediente para actualizar montos, estado y requisitos."
        title="Créditos"
      />
      {canOperate ? (
        <CreditsDbPanel
          applications={applications}
          dbConfigured={dbConfigured}
          filesWithoutCredit={filesWithoutCredit}
          scopeLabel={scopeLabel}
        />
      ) : null}
      <LegacyOperationalPanelGate
        dbAvailable={dbConfigured}
        fallbackAllowed={canOperate}
      >
        {dbConfigured ? (
          <LegacySectionDivider
            businessLabel="Seguimiento adicional de créditos"
            technicalLabel="Créditos locales · Temporal, pendiente de migración"
          />
        ) : null}
        <CreditsPanel />
      </LegacyOperationalPanelGate>
    </section>
  );
}
