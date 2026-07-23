import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Clock3,
  History,
  LifeBuoy,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { TicketDetailActions } from "@/features/operations/modules/tickets/ticket-detail-actions";
import {
  TicketImpactBadge,
  TicketStatusBadge,
} from "@/features/operations/modules/tickets/ticket-summary-card";
import {
  formatTicketDate,
  ticketCategoryLabels,
  ticketEventLabel,
  ticketModuleLabel,
} from "@/features/operations/modules/tickets/ticket-ui";
import { canWriteInternalNote } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { getTicketDetail } from "@/server/tickets/queries";

export const dynamic = "force-dynamic";

function unavailable() {
  return (
    <section className="space-y-6">
      <PageHeader
        description="No pudimos mostrar esta solicitud."
        eyebrow="Tickets y ayuda"
        title="Ticket no disponible"
      />
      <EmptyState
        action={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            href="/panel/ayuda/mis-tickets"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a mis tickets
          </Link>
        }
        description="El ticket puede no existir o no estar dentro de tu alcance."
        icon={CircleOff}
        title="Ticket no disponible"
      />
    </section>
  );
}

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();
  if (!/^TKT-\d{4}-\d{5}$/.test(code)) return unavailable();

  let ticket = null;
  try {
    ticket = await getTicketDetail(code);
  } catch {
    return unavailable();
  }
  if (!ticket) return unavailable();

  const query = await searchParams;
  const created = query.creado === "1";
  const canSeeInternal = canWriteInternalNote(session.roleEnum);
  const publicComments = ticket.comments.filter(
    (comment) => comment.visibility === "PUBLIC",
  );
  const internalComments = canSeeInternal
    ? ticket.comments.filter((comment) => comment.visibility === "INTERNAL")
    : [];
  const isCreator = ticket.participants.some(
    (participant) => participant.type === "CREATOR" && participant.label === "Tu",
  );
  const moduleLabel = ticketModuleLabel(ticket.relatedEntityType);

  return (
    <section className="space-y-6">
      {created ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"
          role="status"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Ticket registrado correctamente</p>
            <p className="mt-1 text-sm">
              Guarda este código para dar seguimiento: {" "}
              <strong className="font-mono">{ticket.code}</strong>
            </p>
          </div>
        </div>
      ) : null}

      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            href="/panel/ayuda/mis-tickets"
          >
            <ArrowLeft className="h-4 w-4" />
            Mis tickets
          </Link>
        }
        description={ticket.title}
        eyebrow="Detalle de ticket"
        title={<span className="font-mono">{ticket.code}</span>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-slate-900">{ticket.title}</h1>
                <p className="mt-2 text-sm text-slate-500">
                  {ticketCategoryLabels[ticket.category]}
                  {moduleLabel ? ` · ${moduleLabel}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <TicketStatusBadge ticket={ticket} />
                <TicketImpactBadge ticket={ticket} />
              </div>
            </div>

            <div className="mt-6 grid gap-4 border-y border-slate-100 py-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Creado
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  {formatTicketDate(ticket.createdAt, true)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Actualizado
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  {formatTicketDate(ticket.updatedAt, true)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Sucursal
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  {ticket.branch?.name ?? "Sin sucursal asociada"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Módulo
                </p>
                <p className="mt-1 text-sm text-slate-800">
                  {moduleLabel ?? "No especificado"}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <h2 className="text-sm font-semibold text-slate-900">Descripción</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                {ticket.description}
              </p>
            </div>

            {ticket.subcategory ||
            ticket.errorCode ||
            ticket.sourceRoute ||
            ticket.relatedEntityReference ? (
              <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                {ticket.subcategory ? (
                  <SafeContext label="Subcategoría" value={ticket.subcategory} />
                ) : null}
                {ticket.errorCode ? (
                  <SafeContext label="Código de error" value={ticket.errorCode} mono />
                ) : null}
                {ticket.sourceRoute ? (
                  <SafeContext label="Ruta" value={ticket.sourceRoute} mono />
                ) : null}
                {ticket.relatedEntityReference ? (
                  <SafeContext
                    label="Referencia relacionada"
                    value={ticket.relatedEntityReference}
                    mono
                  />
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  <MessageSquare className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-semibold text-slate-900">Conversación pública</h2>
                  <p className="text-sm text-slate-500">
                    Respuestas visibles para los participantes autorizados.
                  </p>
                </div>
              </div>
            </div>
            {publicComments.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {publicComments.map((comment, index) => (
                  <article className="p-5 sm:p-6" key={`${comment.createdAt}-${index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {comment.authorLabel}
                      </p>
                      <time className="text-xs text-slate-500" dateTime={comment.createdAt}>
                        {formatTicketDate(comment.createdAt, true)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                      {comment.content}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-slate-500">
                Aún no hay respuestas públicas en este ticket.
              </p>
            )}
          </Card>

          {canSeeInternal && internalComments.length > 0 ? (
            <Card className="overflow-hidden border-amber-200">
              <div className="border-b border-amber-200 bg-amber-50 p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-amber-700" />
                  <div>
                    <h2 className="font-semibold text-amber-900">Notas internas</h2>
                    <p className="text-sm text-amber-700">
                      Solo Administrador y Soporte Técnico pueden ver esta sección.
                    </p>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-amber-100">
                {internalComments.map((comment, index) => (
                  <article className="bg-amber-50/40 p-5 sm:p-6" key={`${comment.createdAt}-${index}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-amber-900">
                        {comment.authorLabel}
                      </p>
                      <time className="text-xs text-amber-700" dateTime={comment.createdAt}>
                        {formatTicketDate(comment.createdAt, true)}
                      </time>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-amber-900">
                      {comment.content}
                    </p>
                  </article>
                ))}
              </div>
            </Card>
          ) : null}

          <TicketDetailActions
            code={ticket.code}
            isCreator={isCreator}
            status={ticket.status}
          />
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <History className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-semibold text-slate-900">Historial</h2>
                <p className="text-sm text-slate-500">Actividad segura del ticket.</p>
              </div>
            </div>
            <ol className="mt-5 space-y-4">
              {ticket.events.map((event, index) => (
                <li className="relative pl-7" key={`${event.createdAt}-${index}`}>
                  {index < ticket.events.length - 1 ? (
                    <span
                      aria-hidden
                      className="absolute left-[7px] top-4 h-[calc(100%+0.5rem)] w-px bg-slate-200"
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 ring-1 ring-blue-200"
                  />
                  <p className="text-sm font-semibold text-slate-800">
                    {ticketEventLabel(event)}
                  </p>
                  <time className="mt-1 block text-xs text-slate-500" dateTime={event.createdAt}>
                    {formatTicketDate(event.createdAt, true)}
                  </time>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3">
              <LifeBuoy className="h-5 w-5 text-orange-600" />
              <h2 className="font-semibold text-slate-900">Seguimiento seguro</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p className="flex items-start gap-2">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                Usa este código para consultar la solicitud: {ticket.code}.
              </p>
              <p className="flex items-start gap-2">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                Las actualizaciones aparecerán en esta conversación y en el historial.
              </p>
            </div>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function SafeContext({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-sm text-slate-800 ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
