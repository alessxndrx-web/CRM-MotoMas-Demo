import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { CustomerDetailPanel } from "@/features/operations/modules/customers-db/customer-detail-panel";
import {
  canChangeCustomerBranch,
  canManagePaymentRequests,
  canOperateCrm,
  canOperateExpedientes,
  getCrmScopeForUser,
  isGlobalScopeRole,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listActiveBranches } from "@/server/branches/queries";
import { getCustomerDetail } from "@/server/crm/queries";
import { isDatabaseConfigured } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-AUD2 — `/panel/clientes/[customerId]`.
 *
 * La auditoría CRM-AUD1 dejó esto como el hueco de navegación más grande del
 * CRM: **el cliente sólo existía como fila de una lista.** Sus leads,
 * expedientes, créditos, reservas, cobros y ventas no eran alcanzables desde él,
 * así que entender la situación de una persona exigía cruzar seis pantallas
 * sabiendo de antemano que cada registro existía.
 *
 * ## La autorización
 *
 * `getCustomerDetail` aplica el alcance del solicitante **dentro de la consulta**
 * y devuelve `null` para un cliente fuera de él — el identificador de la URL no
 * es una llave. `notFound()` no distingue «no existe» de «no es tuyo», que es
 * justo lo que no debe distinguir.
 *
 * El alcance sale de `getCrmScopeForUser`, el mismo que recorta la lista: un
 * vendedor llega a su cartera y a los clientes de sus leads y expedientes; un
 * líder y un gerente, a su sucursal; un administrador, a todo.
 */
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const session = await requireAuth();
  if (!canOperateCrm(session.roleEnum)) notFound();
  if (!isDatabaseConfigured()) notFound();

  const { customerId } = await params;
  const scope = getCrmScopeForUser(
    session.roleEnum,
    session.branchId,
    session.uid,
  );
  const detail = await getCustomerDetail(scope, customerId);
  if (!detail) notFound();

  // Patch CRM-INT1. El Gerente cede clientes de su sucursal; el Administrador
  // mueve cualquiera. La acción lo vuelve a comprobar: esto sólo decide si se
  // dibuja el control.
  const canChangeBranch =
    canChangeCustomerBranch(session.roleEnum) &&
    (isGlobalScopeRole(session.roleEnum) ||
      detail.customer.branchCode === session.branchId);
  const branches = canChangeBranch ? await listActiveBranches() : [];

  return (
    <section className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Clientes", href: "/panel/clientes" },
          { label: detail.customer.name },
        ]}
        description="Todo lo que este cliente tiene abierto, y qué toca hacer a continuación."
        title={detail.customer.name}
      />
      <CustomerDetailPanel
        branches={branches}
        canChangeBranch={canChangeBranch}
        canCreateExpediente={canOperateExpedientes(session.roleEnum)}
        canRequestPayment={canManagePaymentRequests(session.roleEnum)}
        detail={detail}
        // `now` se resuelve en el servidor para que «vencida» no cambie entre el
        // render del servidor y la hidratación.
        nowIso={new Date().toISOString()}
      />
    </section>
  );
}
