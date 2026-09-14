import { notFound } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { PaymentRequestsPanel } from "@/features/operations/modules/payments-db/payment-requests-panel";
import {
  canManagePaymentRequests,
  getCrmScopeForUser,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listCustomers } from "@/server/crm/queries";
import { isDatabaseConfigured } from "@/server/db/prisma";
import { getActivePaymentProvider } from "@/server/payments/providers";
import { listPaymentRequests } from "@/server/payments/queries";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-QA1 — `/panel/pagos`, los cobros que MotoMas le pide a sus clientes.
 *
 * Dos casos, un solo modelo: el anticipo que desbloquea una reserva y el cobro
 * suelto por cualquier concepto. Los distingue `PaymentRequest.purpose`, y sólo
 * el primero confirma una reserva al pagarse.
 */
export default async function PaymentRequestsPage() {
  const session = await requireAuth();
  if (!canManagePaymentRequests(session.roleEnum)) notFound();

  const dbConfigured = isDatabaseConfigured();
  const scope = getCrmScopeForUser(
    session.roleEnum,
    session.branchId,
    session.uid,
  );

  const [requests, customers] = dbConfigured
    ? await Promise.all([listPaymentRequests(scope), listCustomers(scope)])
    : [[], []];

  const adapter = getActivePaymentProvider();

  const scopeLabel =
    session.roleEnum === "ADMIN" ? "Vista global" : session.branchName;

  return (
    <section className="space-y-6">
      <PageHeader
        description="Pídele un monto a un cliente y lo verá en su portal. El monto lo fijas tú y el servidor lo conserva: el cliente no puede cambiarlo."
        title="Cobros al cliente"
      />
      <PaymentRequestsPanel
        canManage={canManagePaymentRequests(session.roleEnum)}
        customers={customers}
        dbConfigured={dbConfigured}
        provider={
          adapter ? { label: adapter.label, isSandbox: adapter.isSandbox } : null
        }
        requests={requests}
        scopeLabel={scopeLabel}
      />
    </section>
  );
}
