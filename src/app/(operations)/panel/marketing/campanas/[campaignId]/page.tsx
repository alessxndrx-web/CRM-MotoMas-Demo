import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { CampaignDetailPanel } from "@/features/operations/modules/marketing-db/campaign-detail-panel";
import {
  canConfirmCampaignLeads,
  canManageMarketing,
  canReportCampaignLeads,
  canViewCosts,
  canViewMarketing,
  getMarketingScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  getCampaignReconciliation,
  getMarketingCampaignDetail,
  getMarketingCampaignPerformance,
  listCampaignChanges,
} from "@/server/marketing/queries";
import { resolveGrantCoverage } from "@/server/permissions/service";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-INT1 — `/panel/marketing/campanas/[campaignId]`.
 *
 * El detalle de una campaña: a quién cubre, qué produjo, su historial de
 * cambios y la conciliación de leads por sucursal.
 *
 * El alcance lo aplica la consulta: un Gerente o Líder sólo abre campañas que
 * cubren su sucursal (o toda la empresa) y sólo ve la fila de la suya. Un id
 * fuera de alcance es `notFound()`, sin distinguir «no existe» de «no es tuyo».
 */
export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const session = await requireAuth();
  if (!canViewMarketing(session.roleEnum)) notFound();
  if (!isDatabaseConfigured()) notFound();

  const { campaignId } = await params;
  const branchCode = session.branchId === GLOBAL_BRANCH_ID ? null : session.branchId;
  const scope = getMarketingScopeForUser(session.roleEnum, branchCode);
  const canManage = canManageMarketing(session.roleEnum);
  const canViewBudget = canManage || canViewCosts(session.roleEnum);
  const prisma = getPrisma();
  const viewer = { id: session.uid, role: session.roleEnum };

  const [editCoverage, reportCoverage] = await Promise.all([
    canManage
      ? resolveGrantCoverage(prisma, viewer, "MARKETING_GESTIONAR_CAMPANAS")
      : Promise.resolve(null),
    canReportCampaignLeads(session.roleEnum)
      ? resolveGrantCoverage(prisma, viewer, "MARKETING_REPORTAR_LEADS")
      : Promise.resolve(null),
  ]);

  const campaign = await getMarketingCampaignDetail(
    scope,
    campaignId,
    canViewBudget,
    editCoverage,
  );
  if (!campaign) notFound();

  const [reconciliation, performance, changes] = await Promise.all([
    getCampaignReconciliation(scope, campaignId, {
      reportCoverage,
      canConfirm: canConfirmCampaignLeads(session.roleEnum),
      branchCode: scope.level === "global" ? null : branchCode,
    }),
    getMarketingCampaignPerformance(scope),
    // El historial de cambios es de quien gestiona campañas.
    canManage ? listCampaignChanges(campaignId) : Promise.resolve([]),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Marketing", href: "/panel/marketing" },
          { label: campaign.name },
        ]}
        description="Cobertura, resultados, historial de cambios y conciliación de leads por sucursal."
        title={campaign.name}
      />
      <CampaignDetailPanel
        campaign={campaign}
        canViewBudget={canViewBudget}
        changes={changes}
        performance={performance.find((row) => row.campaignId === campaignId) ?? null}
        reconciliation={reconciliation}
      />
    </section>
  );
}
