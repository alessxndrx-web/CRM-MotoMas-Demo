import {
  LegacyOperationalPanelGate,
  LegacySectionDivider,
} from "@/features/operations/components/legacy-section-divider";
import { CustomersList } from "@/features/operations/modules/customers/customers-list";
import { CustomersDbPanel } from "@/features/operations/modules/customers-db/customers-db-panel";
import { canOperateCrm, getCrmScopeForUser } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { listCustomers } from "@/server/crm/queries";
import { listWhatsAppConversations } from "@/server/whatsapp/queries";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const session = await requireAuth();
  const dbConfigured = isDatabaseConfigured();
  const canOperate = canOperateCrm(session.roleEnum);

  let customers: Awaited<ReturnType<typeof listCustomers>> = [];
  let conversations: Awaited<ReturnType<typeof listWhatsAppConversations>> = {};
  if (dbConfigured && canOperate) {
    const scope = getCrmScopeForUser(
      session.roleEnum,
      session.branchId,
      session.uid,
    );
    customers = await listCustomers(scope);
    conversations = await listWhatsAppConversations(
      customers.map((customer) => customer.phone),
    );
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
          conversations={conversations}
          customers={customers}
          dbConfigured={dbConfigured}
          scopeLabel={scopeLabel}
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
