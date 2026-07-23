import { LifeBuoy } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { TicketCreateForm } from "@/features/operations/modules/tickets/ticket-create-form";
import { requireAuth } from "@/server/auth/context";

export const dynamic = "force-dynamic";

function safeRoute(value: string | string[] | undefined): string {
  const route = Array.isArray(value) ? value[0] : value;
  return route && route.startsWith("/panel/") ? route.slice(0, 300) : "";
}

function safeErrorCode(value: string | string[] | undefined): string {
  const code = Array.isArray(value) ? value[0] : value;
  if (!code) return "";
  return /^[A-Za-z0-9._:-]{1,160}$/.test(code) ? code : "";
}

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <LifeBuoy className="h-5 w-5" />
          </span>
        }
        description="Describe lo ocurrido y el impacto en tu trabajo. La sucursal se toma de tu sesión y la prioridad se calcula en el servidor."
        eyebrow="Tickets y ayuda"
        title="Reportar un problema"
      />
      <TicketCreateForm
        branchName={session.branchName}
        initialErrorCode={safeErrorCode(params.codigoError)}
        initialSourceRoute={safeRoute(params.ruta)}
        role={session.role}
      />
    </section>
  );
}
