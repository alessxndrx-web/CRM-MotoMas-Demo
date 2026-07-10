import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { CreditsPanel } from "@/features/operations/modules/credits/credits-panel";
import { CreditsDbPanel } from "@/features/operations/modules/credits-db/credits-db-panel";
import {
  canOperateExpedientes,
  getExpedienteScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCreditApplications } from "@/server/expedientes/queries";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();

  // This route has always been Admin/Gerente only (the legacy `CreditsPanel`
  // blocks Vendedor). Keep that gate: a Seller reaches credit follow-up through
  // their own expediente, not through this branch-wide list.
  const canOperate =
    canOperateExpedientes(session.roleEnum) &&
    (session.roleEnum === "ADMIN" || session.roleEnum === "GERENTE");

  let applications: Awaited<ReturnType<typeof listCreditApplications>> = [];
  if (dbConfigured && canOperate) {
    const scope = getExpedienteScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    applications = await listCreditApplications(scope);
  }

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "GERENTE"
        ? session.branchName
        : "Mis créditos";

  return (
    <section className="space-y-10">
      {canOperate ? (
        <CreditsDbPanel
          applications={applications}
          dbConfigured={dbConfigured}
          scopeLabel={scopeLabel}
        />
      ) : null}
      {dbConfigured && canOperate ? (
        <LegacySectionDivider
          businessLabel="Seguimiento adicional de créditos"
          technicalLabel="Créditos locales · Temporal, pendiente de migración"
        />
      ) : null}
      <CreditsPanel />
    </section>
  );
}
