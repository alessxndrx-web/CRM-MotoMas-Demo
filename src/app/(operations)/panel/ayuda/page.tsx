import Link from "next/link";
import {
  CheckCircle2,
  CircleDot,
  Clock3,
  Inbox,
  LifeBuoy,
  ListChecks,
  Plus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { TicketSummaryCard } from "@/features/operations/modules/tickets/ticket-summary-card";
import { isTicketOpen } from "@/features/operations/modules/tickets/ticket-ui";
import { requireAuth } from "@/server/auth/context";
import { listMyTickets, listScopedTickets } from "@/server/tickets/queries";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";
const secondaryLinkClass =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40";

export default async function HelpOverviewPage() {
  const session = await requireAuth();
  const [myTickets, scopedTickets] = await Promise.all([
    listMyTickets(),
    session.roleEnum === "GERENTE" ? listScopedTickets() : Promise.resolve([]),
  ]);

  const myCodes = new Set(myTickets.map((ticket) => ticket.code));
  const branchTickets = scopedTickets.filter(
    (ticket) => !myCodes.has(ticket.code),
  );
  const recent = myTickets.slice(0, 5);
  const open = myTickets.filter((ticket) => isTicketOpen(ticket.status)).length;
  const waiting = myTickets.filter(
    (ticket) => ticket.status === "PENDIENTE_USUARIO",
  ).length;
  const inProgress = myTickets.filter((ticket) =>
    ["RECIBIDO", "EN_CLASIFICACION", "EN_PROGRESO", "REABIERTO"].includes(
      ticket.status,
    ),
  ).length;
  const resolved = myTickets.filter((ticket) =>
    ["RESUELTO", "CERRADO"].includes(ticket.status),
  ).length;
  const privilegedSharedView =
    session.roleEnum === "ADMIN" || session.roleEnum === "SOPORTE_TECNICO";

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <>
            <Link className={secondaryLinkClass} href="/panel/ayuda/mis-tickets">
              <ListChecks className="h-4 w-4" />
              Ver mis tickets
            </Link>
            <Link className={primaryLinkClass} href="/panel/ayuda/nuevo-ticket">
              <Plus className="h-4 w-4" />
              Reportar problema
            </Link>
          </>
        }
        description="Reporta una incidencia, consulta tus solicitudes y conversa con el equipo de soporte sin compartir datos sensibles."
        eyebrow="Ayuda interna"
        title="Tickets y ayuda"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CircleDot} label="Abiertos" value={open} />
        <StatCard icon={Clock3} label="Esperando respuesta" value={waiting} />
        <StatCard icon={LifeBuoy} label="En progreso" value={inProgress} />
        <StatCard icon={CheckCircle2} label="Resueltos" value={resolved} />
      </div>

      {privilegedSharedView ? (
        <Card className="border-blue-200 bg-blue-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-blue-900">
                Vista compartida de Tickets y ayuda
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-blue-700">
                Esta página prioriza tus tickets y conversaciones. La clasificación,
                asignación, prioridad y resolución operativa se incorporarán en el
                área de Soporte Técnico con el Patch 4.0G.
              </p>
            </div>
            <Badge tone="blue">Sin controles de operador</Badge>
          </div>
        </Card>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              Actividad reciente
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Mis tickets y participaciones
            </h2>
          </div>
          {myTickets.length > 5 ? (
            <Link
              className="text-sm font-semibold text-blue-700 hover:text-blue-800"
              href="/panel/ayuda/mis-tickets"
            >
              Ver todos
            </Link>
          ) : null}
        </div>

        {recent.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {recent.map((ticket) => (
              <TicketSummaryCard key={ticket.code} ticket={ticket} />
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              <Link className={primaryLinkClass} href="/panel/ayuda/nuevo-ticket">
                <Plus className="h-4 w-4" />
                Crear mi primer ticket
              </Link>
            }
            description="Cuando reportes una incidencia, podrás seguirla y responder desde aquí."
            icon={Inbox}
            title="Aún no tienes tickets"
          />
        )}
      </div>

      {session.roleEnum === "GERENTE" ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              Alcance de sucursal
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              Incidencias operativas de mi sucursal
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Esta sección usa exclusivamente el alcance del servidor. Las
              solicitudes personales de acceso y seguridad de otros empleados no
              se incluyen.
            </p>
          </div>
          {branchTickets.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {branchTickets.slice(0, 6).map((ticket) => (
                <TicketSummaryCard key={ticket.code} ticket={ticket} />
              ))}
            </div>
          ) : (
            <Card className="p-5 text-sm text-slate-500">
              No hay incidencias operativas adicionales dentro de tu alcance de
              sucursal.
            </Card>
          )}
        </div>
      ) : null}
    </section>
  );
}
