import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { OperatorRestrictedState } from "@/features/operations/modules/tickets/operator-restricted-state";
import { OperatorTicketCreateForm } from "@/features/operations/modules/tickets/operator-ticket-create-form";
import { canOperateTickets } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { getOperatorTicketOptions } from "@/server/tickets/operator-queries";

export const dynamic = "force-dynamic";

export default async function NewOperatorTicketPage() {
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) return <OperatorRestrictedState />;
  const options = await getOperatorTicketOptions();
  if (!options) return <OperatorRestrictedState />;

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <>
            {session.roleEnum === "ADMIN" ? <Badge tone="blue">Supervisión Admin</Badge> : null}
            <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" href="/panel/soporte/tickets">
              <ArrowLeft className="h-4 w-4" /> Bandeja
            </Link>
          </>
        }
        description="Crea un incidente con alcance validado por el servidor. Este flujo está restringido a operadores autorizados."
        eyebrow="Centro de soporte"
        title="Nuevo ticket operativo"
      />
      <OperatorTicketCreateForm options={options} />
    </section>
  );
}
