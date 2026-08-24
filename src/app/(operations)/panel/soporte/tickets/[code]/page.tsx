import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CircleOff,
  GitBranch,
  History,
  MessageSquare,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { OperatorRestrictedState } from "@/features/operations/modules/tickets/operator-restricted-state";
import { OperatorTicketControls } from "@/features/operations/modules/tickets/operator-ticket-controls";
import {
  formatTicketDate,
  ticketCategoryLabels,
  ticketEventLabel,
  ticketImpactLabels,
  ticketPriorityLabels,
  ticketScopeLabels,
  ticketStatusLabels,
  ticketStatusTone,
} from "@/features/operations/modules/tickets/ticket-ui";
import { canOperateTickets } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import {
  getOperatorTicketDetail,
  getOperatorTicketOptions,
} from "@/server/tickets/operator-queries";

export const dynamic = "force-dynamic";

function unavailable() {
  return (
    <section className="space-y-6">
      <PageHeader description="El ticket no existe o no está dentro del alcance autorizado." eyebrow="Centro de soporte" title="Ticket no disponible" />
      <EmptyState action={<Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" href="/panel/soporte/tickets"><ArrowLeft className="h-4 w-4" /> Volver a la bandeja</Link>} icon={CircleOff} title="Ticket no disponible" />
    </section>
  );
}

export default async function OperatorTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) return <OperatorRestrictedState />;
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();
  if (!/^TKT-\d{4}-\d{5}$/.test(code)) return unavailable();
  const [ticket, options] = await Promise.all([
    getOperatorTicketDetail(code),
    getOperatorTicketOptions(),
  ]);
  if (!ticket || !options) return unavailable();
  const query = await searchParams;
  const created = query.creado === "1";
  const publicComments = ticket.comments.filter((comment) => comment.visibility === "PUBLIC");
  const internalComments = ticket.comments.filter((comment) => comment.visibility === "INTERNAL");

  return (
    <section className="space-y-6">
      {created ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800" role="status">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-semibold">Ticket operativo creado</p><p className="mt-1 text-sm">Código público: <strong className="font-mono">{ticket.code}</strong>.</p></div>
        </div>
      ) : null}

      <PageHeader
        actions={
          <>
            {session.roleEnum === "ADMIN" ? <Badge tone="blue">Supervisión Admin</Badge> : <Badge tone="emerald">Operador</Badge>}
            <Link className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700" href="/panel/soporte/tickets"><ArrowLeft className="h-4 w-4" /> Bandeja</Link>
          </>
        }
        description={ticket.title}
        eyebrow="Detalle operativo"
        title={<span className="font-mono">{ticket.code}</span>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><h1 className="text-xl font-semibold text-slate-900">{ticket.title}</h1><p className="mt-2 text-sm text-slate-500">{ticketCategoryLabels[ticket.category]} · {ticket.requesterLabel} ({ticket.requesterRoleLabel})</p></div>
              <div className="flex flex-wrap gap-2"><Badge tone={ticketStatusTone[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge><Badge tone={ticket.priority === "P1_CRITICA" ? "red" : ticket.priority === "P2_ALTA" ? "orange" : "slate"}>{ticketPriorityLabels[ticket.priority]}</Badge><Badge tone={ticket.scope === "GLOBAL" ? "red" : ticket.scope === "BRANCH" ? "orange" : "slate"}>{ticketScopeLabels[ticket.scope]}</Badge></div>
            </div>
            <div className="mt-6 grid gap-4 border-y border-slate-100 py-5 sm:grid-cols-2 lg:grid-cols-4">
              <SafeField label="Impacto" value={ticketImpactLabels[ticket.impact]} />
              <SafeField label="Sucursal" value={ticket.branch?.label ?? "Sin sucursal"} />
              <SafeField label="Asignación" value={ticket.assignedOperatorLabel ?? "Sin asignar"} />
              <SafeField label="Actualizado" value={formatTicketDate(ticket.updatedAt, true)} />
            </div>
            <h2 className="mt-5 text-sm font-semibold text-slate-900">Descripción pública</h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{ticket.description}</p>
            <div className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <SafeField label="Subcategoría" value={ticket.subcategory ?? "No especificada"} />
              <SafeField label="Módulo / tipo" value={ticket.relatedEntityType ?? "No especificado"} />
              <SafeField label="Referencia opaca" value={ticket.relatedEntityReference ?? "No especificada"} mono />
              <SafeField label="Ruta" value={ticket.sourceRoute ?? "No especificada"} mono />
              <SafeField label="Código de error" value={ticket.errorCode ?? "No especificado"} mono />
              <SafeField label="Contexto técnico" value={[ticket.appVersion, ticket.browser, ticket.operatingSystem, ticket.deviceType].filter(Boolean).join(" · ") || "No especificado"} />
            </div>
          </Card>

          <Conversation title="Respuesta al usuario" description="Conversación PUBLIC visible para participantes autorizados." comments={publicComments} />
          <Conversation internal title="Notas internas" description="Contenido INTERNAL exclusivo de Administrador y Soporte Técnico." comments={internalComments} />

          {ticket.rootCauses.length ? (
            <Card className="overflow-hidden border-slate-300">
              <div className="border-b border-slate-200 bg-slate-50 p-5"><div className="flex items-center gap-3"><Wrench className="h-5 w-5 text-slate-700" /><div><h2 className="font-semibold text-slate-900">Registros de causa raíz</h2><p className="text-sm text-slate-500">Eventos privilegiados e inmutables; nunca se publican en Ayuda.</p></div></div></div>
              <div className="divide-y divide-slate-100">{ticket.rootCauses.map((rootCause, index) => (
                <article className="p-5" key={`${rootCause.createdAt}-${index}`}><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-slate-900">{rootCause.actorLabel}</p><time className="text-xs text-slate-500" dateTime={rootCause.createdAt}>{formatTicketDate(rootCause.createdAt, true)}</time></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700"><strong>Resumen:</strong> {rootCause.summary}</p>{rootCause.correctiveAction ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700"><strong>Acción correctiva:</strong> {rootCause.correctiveAction}</p> : null}{rootCause.preventionNotes ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700"><strong>Prevención:</strong> {rootCause.preventionNotes}</p> : null}</article>
              ))}</div>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-3"><GitBranch className="h-5 w-5 text-violet-600" /><h2 className="font-semibold text-slate-900">Relaciones</h2></div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>Duplicado de: {ticket.duplicateOfCode ? <Link className="font-mono font-semibold text-blue-700" href={`/panel/soporte/tickets/${ticket.duplicateOfCode}`}>{ticket.duplicateOfCode}</Link> : "No"}</p>
              <p>Incidente global: {ticket.globalIncidentCode ? <Link className="font-mono font-semibold text-blue-700" href={`/panel/soporte/tickets/${ticket.globalIncidentCode}`}>{ticket.globalIncidentCode}</Link> : "No vinculado"}</p>
              <p>Tickets vinculados: {ticket.linkedTicketCodes.length}</p>
              {ticket.linkedTicketCodes.length ? <div className="flex flex-wrap gap-2">{ticket.linkedTicketCodes.map((linkedCode) => <Link className="font-mono text-xs font-semibold text-blue-700" href={`/panel/soporte/tickets/${linkedCode}`} key={linkedCode}>{linkedCode}</Link>)}</div> : null}
              <p className="rounded-lg bg-slate-50 p-3 text-xs">La relación global es informativa. Este parche no propaga estados automáticamente.</p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3"><History className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-slate-900">Auditoría</h2></div>
            <ol className="mt-5 space-y-4">{ticket.events.map((event, index) => (
              <li className="relative pl-6" key={`${event.createdAt}-${index}`}><span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-blue-500 ring-2 ring-blue-100" /><p className="text-sm font-semibold text-slate-800">{ticketEventLabel(event)}</p><p className="mt-0.5 text-xs text-slate-500">{event.actorLabel} · {formatTicketDate(event.createdAt, true)}</p></li>
            ))}</ol>
          </Card>
        </aside>
      </div>

      <OperatorTicketControls options={options} ticket={ticket} />
    </section>
  );
}

function SafeField({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><p className={`mt-1 break-words text-sm text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</p></div>;
}

function Conversation({ comments, description, internal = false, title }: { comments: { authorLabel: string; content: string; createdAt: string }[]; description: string; internal?: boolean; title: string }) {
  return (
    <Card className={internal ? "overflow-hidden border-amber-200" : "overflow-hidden"}>
      <div className={`border-b p-5 ${internal ? "border-amber-200 bg-amber-50" : "border-slate-200"}`}><div className="flex items-center gap-3">{internal ? <ShieldCheck className="h-5 w-5 text-amber-700" /> : <MessageSquare className="h-5 w-5 text-blue-600" />}<div><h2 className={internal ? "font-semibold text-amber-900" : "font-semibold text-slate-900"}>{title}</h2><p className={internal ? "text-sm text-amber-700" : "text-sm text-slate-500"}>{description}</p></div></div></div>
      {comments.length ? <div className={internal ? "divide-y divide-amber-100" : "divide-y divide-slate-100"}>{comments.map((comment, index) => <article className={internal ? "bg-amber-50/40 p-5" : "p-5"} key={`${comment.createdAt}-${index}`}><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{comment.authorLabel}</p><time className="text-xs text-slate-500" dateTime={comment.createdAt}>{formatTicketDate(comment.createdAt, true)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{comment.content}</p></article>)}</div> : <p className="p-5 text-sm text-slate-500">Sin contenido registrado.</p>}
    </Card>
  );
}
