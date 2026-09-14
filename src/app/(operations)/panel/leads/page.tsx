import { PageHeader } from "@/components/ui/page-header";
import { desiredBranches } from "@/data/operations/leads";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { LeadsInbox } from "@/features/operations/modules/leads/leads-inbox";
import { LeadsDbPanel } from "@/features/operations/modules/leads-db/leads-db-panel";
import type { SellerOption } from "@/features/operations/modules/leads-db/leads-db-panel";
import type { LeadCatalogOption } from "@/features/operations/modules/leads-db/lead-detail-drawer";
import {
  canAssignLeads,
  canOperateCrm,
  getCrmScopeForUser,
  isGlobalScopeRole,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured, getPrisma } from "@/server/db/prisma";
import { listUsers } from "@/server/auth/user-store";
import {
  getLeadCommercialContext,
  listLeads,
  listLeadsPage,
} from "@/server/crm/queries";
import {
  isLeadStatusValue,
  type ActivityListItemDTO,
  type LeadCommercialContextDTO,
} from "@/server/crm/shared";
import { listActivities } from "@/server/expedientes/queries";
import { listWhatsAppConversations } from "@/server/whatsapp/queries";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-QA1 — `/panel/leads`, la pantalla que la QA reportó como
 * inaccesible para el vendedor.
 *
 * **El alta manual, el seguimiento y la conversión a expediente vivían en la
 * bandeja local**, detrás de `LegacyOperationalPanelGate` — que la esconde
 * siempre que hay `DATABASE_URL`. En producción, por tanto, no existían. Eso es
 * lo que la QA vio como «el vendedor no puede entrar a Leads» y «no hay botón
 * para registrar un lead»: la pantalla cargaba, pero estaba vacía y no dejaba
 * hacer nada.
 *
 * Las tres funciones están ahora en `LeadsDbPanel`, contra PostgreSQL. La
 * bandeja local se queda exactamente donde estaba y con el mismo interruptor de
 * recuperación que el resto de módulos migrados: sigue siendo el camino de vuelta
 * cuando no hay base de datos, y nada más.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const session = await requireAuth();
  // Patch CRM-AUD1. El filtro viaja en la URL, como `?periodo=` en Inicio: el
  // servidor recalcula la consulta, sobrevive a una recarga y el enlace se puede
  // compartir. La búsqueda se AÑADE al alcance del usuario, nunca lo amplía.
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const statusFilter =
    params.estado && isLeadStatusValue(params.estado) ? params.estado : null;
  const page = Number(params.pagina ?? 1);
  const dbConfigured = isDatabaseConfigured();
  const canOperate = canOperateCrm(session.roleEnum);
  const canAssign = canAssignLeads(session.roleEnum);

  let dbLeads: Awaited<ReturnType<typeof listLeads>> = [];
  let total = 0;
  let resolvedPage = 1;
  let pageSize = 0;
  let sellers: SellerOption[] = [];
  let conversations: Awaited<ReturnType<typeof listWhatsAppConversations>> = {};
  let catalogModels: LeadCatalogOption[] = [];
  const activitiesByLead: Record<string, ActivityListItemDTO[]> = {};
  const contextByLead: Record<string, LeadCommercialContextDTO> = {};

  if (dbConfigured && canOperate) {
    const scope = getCrmScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    const paged = await listLeadsPage(scope, {
      q: query,
      status: statusFilter,
      page,
    });
    dbLeads = paged.rows;
    total = paged.total;
    resolvedPage = paged.page;
    pageSize = paged.pageSize;
    // Los hilos de los leads ya visibles: una consulta acotada por la lista que
    // el alcance del usuario ya recortó, no una por fila.
    conversations = await listWhatsAppConversations(
      dbLeads.map((lead) => lead.phone),
    );

    // Patch CRM-QA1. Mismo criterio para los seguimientos: se piden TODAS las
    // actividades del alcance en una consulta y se agrupan aquí. Abrir una ficha
    // no dispara ninguna consulta nueva.
    const scopedActivities = await listActivities(scope);
    for (const activity of scopedActivities) {
      if (!activity.leadId) continue;
      (activitiesByLead[activity.leadId] ??= []).push(activity);
    }

    // El catálogo es corto y global: se lee entero para el desplegable.
    catalogModels = (
      await getPrisma().motorcycleCatalogModel.findMany({
        where: { isActive: true },
        orderBy: [{ brand: "asc" }, { model: "asc" }],
        select: { id: true, brand: true, model: true, year: true },
      })
    ).map((model) => ({
      id: model.id,
      label: `${model.brand} ${model.model}${model.year ? ` (${model.year})` : ""}`,
    }));

    // Patch CRM-AUD1. El recorrido comercial sólo se pide para los leads que ya
    // tienen cliente: un lead sin cliente no tiene nada que enseñar, y pedirlo
    // para todos multiplicaría las consultas sin añadir una sola línea a la
    // ficha.
    const withCustomer = dbLeads.filter((lead) => lead.customerId);
    const contexts = await Promise.all(
      withCustomer.map((lead) => getLeadCommercialContext(scope, lead.id)),
    );
    withCustomer.forEach((lead, index) => {
      contextByLead[lead.id] = contexts[index];
    });

    if (canAssign) {
      const sellerUsers = await listUsers(
        scope.level === "branch" ? { branchCode: scope.branchCode } : undefined,
      );
      sellers = sellerUsers
        .filter(
          (user) => user.role === "VENDEDOR" || user.role === "LIDER_VENTAS",
        )
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
      : session.roleEnum === "VENDEDOR"
        ? "Mis leads"
        : session.branchName;

  return (
    <section className="space-y-6">
      <PageHeader
        description="Los leads del portal público y los que registras en mostrador, con su motocicleta de interés y su seguimiento."
        title={session.roleEnum === "VENDEDOR" ? "Mis leads" : "Leads"}
      />
      {canOperate ? (
        <LeadsDbPanel
          activitiesByLead={activitiesByLead}
          contextByLead={contextByLead}
          page={resolvedPage}
          pageSize={pageSize}
          total={total}
          branches={
            isGlobalScopeRole(session.roleEnum)
              ? desiredBranches.map((branch) => ({
                  code: branch.id,
                  name: branch.name,
                }))
              : []
          }
          canAssign={canAssign}
          canChangeStatus={canOperate}
          canCreateExpediente={canOperate}
          catalogModels={catalogModels}
          conversations={conversations}
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
