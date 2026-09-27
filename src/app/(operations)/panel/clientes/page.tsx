import { PageHeader } from "@/components/ui/page-header";
import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { CustomersList } from "@/features/operations/modules/customers/customers-list";
import {
  CustomersDbPanel,
  type CustomerSellerOption,
} from "@/features/operations/modules/customers-db/customers-db-panel";
import {
  canAssignCustomers,
  canOperateCrm,
  getCrmScopeForUser,
  isGlobalScopeRole,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { GLOBAL_BRANCH_ID } from "@/server/auth/roles";
import { listUsers } from "@/server/auth/user-store";
import { listActiveBranches } from "@/server/branches/queries";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomers, listCustomersPage } from "@/server/crm/queries";
import { listWhatsAppConversations } from "@/server/whatsapp/queries";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const session = await requireAuth();
  // Patch CRM-AUD1. Ver §`ListSearchBar`: el filtro va en la URL y lo aplica la
  // base, no el navegador.
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const page = Number(params.pagina ?? 1);
  const dbConfigured = isDatabaseConfigured();
  const canOperate = canOperateCrm(session.roleEnum);
  const canAssign = canAssignCustomers(session.roleEnum);

  let customers: Awaited<ReturnType<typeof listCustomers>> = [];
  let total = 0;
  let resolvedPage = 1;
  let pageSize = 0;
  let conversations: Awaited<ReturnType<typeof listWhatsAppConversations>> = {};
  let sellers: CustomerSellerOption[] = [];
  if (dbConfigured && canOperate) {
    const scope = getCrmScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    const paged = await listCustomersPage(scope, { q: query, page });
    customers = paged.rows;
    total = paged.total;
    resolvedPage = paged.page;
    pageSize = paged.pageSize;
    conversations = await listWhatsAppConversations(
      customers.map((customer) => customer.phone),
    );

    // El desplegable de cartera sólo se puebla para quien puede repartirla. Es
    // cortesía visual: `assignCustomerAction` vuelve a comprobar el permiso.
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

  // Patch CRM-INT1. Las sucursales del selector salen de la base, y sólo las ve
  // quien elige (un rol global). Un rol de sucursal ve la suya, escrita, porque
  // el servidor la usa de todas formas: esconderla era lo que hacía creer que
  // «faltaba el selector».
  const global = isGlobalScopeRole(session.roleEnum);
  const branches = global && dbConfigured ? await listActiveBranches() : [];
  const homeBranch =
    !global && session.branchId && session.branchId !== GLOBAL_BRANCH_ID
      ? { code: session.branchId, name: session.branchName }
      : null;

  const scopeLabel =
    session.roleEnum === "ADMIN"
      ? "Vista global"
      : session.roleEnum === "VENDEDOR"
        ? "Mis clientes"
        : session.branchName;

  return (
    <section className="space-y-6">
      <PageHeader
        description="La cartera comercial. Quien supervisa la reparte; reasignar no altera las ventas ni los expedientes ya registrados."
        title="Clientes"
      />
      {canOperate ? (
        <CustomersDbPanel
          branches={branches}
          canAssign={canAssign}
          canChooseBranch={global}
          homeBranch={homeBranch}
          conversations={conversations}
          page={resolvedPage}
          pageSize={pageSize}
          total={total}
          customers={customers}
          dbConfigured={dbConfigured}
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
            businessLabel="Historial adicional de clientes"
            technicalLabel="Listado local · Temporal, pendiente de migración"
          />
        ) : null}
        <CustomersList />
      </LegacyOperationalPanelGate>
    </section>
  );
}
