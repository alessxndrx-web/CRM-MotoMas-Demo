"use client";

import { useRouter } from "next/navigation";
import {
  GitBranch,
  Link2,
  MessageSquareReply,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRoundCheck,
  Wrench,
} from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  operatorStatusOptions,
  ticketCategoryOptions,
  ticketImpactOptions,
  ticketModuleOptions,
  ticketPriorityOptions,
  ticketScopeOptions,
} from "@/features/operations/modules/tickets/ticket-ui";
import {
  addInternalCommentAction,
  addPublicCommentAction,
  assignTicketAction,
  linkGlobalIncidentAction,
  markDuplicateAction,
  reopenTicketAction,
  updateTicketPriorityAction,
  updateTicketStatusAction,
} from "@/server/tickets/actions";
import {
  recordRootCauseAction,
  unlinkGlobalIncidentAction,
  updateTicketClassificationAction,
} from "@/server/tickets/operator-actions";
import type {
  OperatorTicketDetailDTO,
  OperatorTicketOptionsDTO,
} from "@/server/tickets/types";

const selectClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
const textareaClass =
  "min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

type Notice = { tone: "success" | "error"; message: string } | null;

export function OperatorTicketControls({
  ticket,
  options,
}: {
  ticket: OperatorTicketDetailDTO;
  options: OperatorTicketOptionsDTO;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [classification, setClassification] = useState({
    category: ticket.category,
    subcategory: ticket.subcategory ?? "",
    impact: ticket.impact,
    scope: ticket.scope,
    branchCode: ticket.branch?.code ?? "",
    module: ticket.relatedEntityType ?? "",
    reference: ticket.relatedEntityReference ?? "",
  });
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState(ticket.priority);
  const [nextStatus, setNextStatus] = useState("");
  const [publicReply, setPublicReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [duplicateCode, setDuplicateCode] = useState("");
  const [globalCode, setGlobalCode] = useState(ticket.globalIncidentCode ?? "");
  const [rootCause, setRootCause] = useState({
    summary: "",
    correctiveAction: "",
    preventionNotes: "",
  });
  const locked = ticket.status === "CERRADO";
  const statusOptions = operatorStatusOptions(ticket.status);
  const canReopen = ["RESUELTO", "CERRADO", "CANCELADO"].includes(ticket.status);

  function execute(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
    after?: () => void,
  ) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setNotice({ tone: "error", message: result.error ?? "No fue posible completar la acción." });
        return;
      }
      after?.();
      setNotice({ tone: "success", message: success });
      router.refresh();
    });
  }

  function classify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    execute(
      () =>
        updateTicketClassificationAction({
          code: ticket.code,
          category: classification.category,
          subcategory: classification.subcategory || null,
          impact: classification.impact,
          scope: classification.scope,
          branchCode: classification.branchCode || null,
          relatedEntityType: classification.module || null,
          relatedEntityReference: classification.reference || null,
        }),
      "Clasificación actualizada y auditada.",
    );
  }

  function submitReply(
    event: FormEvent<HTMLFormElement>,
    visibility: "PUBLIC" | "INTERNAL",
  ) {
    event.preventDefault();
    const content = visibility === "PUBLIC" ? publicReply : internalNote;
    execute(
      () =>
        visibility === "PUBLIC"
          ? addPublicCommentAction(ticket.code, content)
          : addInternalCommentAction(ticket.code, content),
      visibility === "PUBLIC" ? "Respuesta enviada al usuario." : "Nota interna registrada.",
      () => (visibility === "PUBLIC" ? setPublicReply("") : setInternalNote("")),
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <div
          className={notice.tone === "success" ? "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700" : "rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}

      {locked ? (
        <Card className="border-amber-200 bg-amber-50 p-5">
          <p className="font-semibold text-amber-900">Ticket cerrado</p>
          <p className="mt-1 text-sm text-amber-700">Debe reabrirse antes de modificar clasificación, conversación o relaciones.</p>
          <Button className="mt-4" disabled={pending} onClick={() => execute(() => reopenTicketAction(ticket.code), "Ticket reabierto.")} variant="secondary">
            <RotateCcw className="h-4 w-4" /> Reabrir ticket
          </Button>
        </Card>
      ) : null}

      <Card className="p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <GitBranch className="h-5 w-5 text-blue-600" />
          <div><h2 className="font-semibold text-slate-900">Clasificación</h2><p className="text-sm text-slate-500">Cada valor modificado genera un evento auditable.</p></div>
        </div>
        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={classify}>
          <Control label="Categoría">
            <select className={selectClass} disabled={locked} onChange={(event) => setClassification({ ...classification, category: event.target.value as typeof classification.category })} value={classification.category}>
              {ticketCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Control>
          <Control label="Subcategoría">
            <Input disabled={locked} maxLength={120} onChange={(event) => setClassification({ ...classification, subcategory: event.target.value })} value={classification.subcategory} />
          </Control>
          <Control label="Impacto">
            <select className={selectClass} disabled={locked} onChange={(event) => setClassification({ ...classification, impact: event.target.value as typeof classification.impact })} value={classification.impact}>
              {ticketImpactOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Control>
          <Control label="Alcance">
            <select className={selectClass} disabled={locked} onChange={(event) => setClassification({ ...classification, scope: event.target.value as typeof classification.scope })} value={classification.scope}>
              {ticketScopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Control>
          {classification.scope === "BRANCH" || classification.scope === "MODULE" ? (
            <Control label="Sucursal">
              <select className={selectClass} disabled={locked} onChange={(event) => setClassification({ ...classification, branchCode: event.target.value })} required={classification.scope === "BRANCH"} value={classification.branchCode}>
                <option value="">Sin sucursal específica</option>
                {options.branches.map((branch) => <option key={branch.code} value={branch.code}>{branch.label}</option>)}
              </select>
            </Control>
          ) : null}
          <Control label="Módulo">
            <select className={selectClass} disabled={locked} onChange={(event) => setClassification({ ...classification, module: event.target.value })} required={classification.scope === "MODULE"} value={classification.module}>
              <option value="">Sin módulo específico</option>
              {ticketModuleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Control>
          <Control label="Referencia opaca">
            <Input disabled={locked} maxLength={160} onChange={(event) => setClassification({ ...classification, reference: event.target.value })} value={classification.reference} />
          </Control>
          <div className="flex items-end sm:col-span-2"><Button disabled={locked || pending} type="submit"><Wrench className="h-4 w-4" /> Guardar clasificación</Button></div>
        </form>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="p-5">
          <UserRoundCheck className="h-5 w-5 text-indigo-600" />
          <h2 className="mt-3 font-semibold text-slate-900">Asignación</h2>
          <p className="mt-1 text-sm text-slate-500">Actual: {ticket.assignedOperatorLabel ?? "Sin asignar"}</p>
          <select className={`${selectClass} mt-4`} disabled={locked} onChange={(event) => setAssignee(event.target.value)} value={assignee}>
            <option value="">Sin asignar</option>
            {options.operators.map((operator) => <option key={operator.email} value={operator.email}>{operator.label} · {operator.roleLabel}</option>)}
          </select>
          <Button className="mt-3" disabled={locked || pending} onClick={() => execute(() => assignTicketAction(ticket.code, assignee || null), assignee ? "Operador asignado." : "Ticket sin asignación.")} variant="secondary">Guardar asignación</Button>
        </Card>

        <Card className="p-5">
          <ShieldCheck className="h-5 w-5 text-red-600" />
          <h2 className="mt-3 font-semibold text-slate-900">Prioridad</h2>
          <select className={`${selectClass} mt-4`} disabled={locked} onChange={(event) => setPriority(event.target.value as typeof priority)} value={priority}>
            {ticketPriorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <Button className="mt-3" disabled={locked || pending} onClick={() => execute(() => updateTicketPriorityAction(ticket.code, priority), "Prioridad actualizada.")} variant="secondary">Guardar prioridad</Button>
        </Card>

        <Card className="p-5">
          <Wrench className="h-5 w-5 text-emerald-600" />
          <h2 className="mt-3 font-semibold text-slate-900">Estado</h2>
          {statusOptions.length > 0 ? (
            <>
              <select className={`${selectClass} mt-4`} disabled={locked} onChange={(event) => setNextStatus(event.target.value)} value={nextStatus}>
                <option value="">Seleccionar transición</option>
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <Button className="mt-3" disabled={locked || pending || !nextStatus} onClick={() => execute(() => updateTicketStatusAction(ticket.code, nextStatus), "Estado actualizado.")} variant="secondary">Aplicar transición</Button>
            </>
          ) : <p className="mt-4 text-sm text-slate-500">No hay transiciones directas disponibles.</p>}
          {canReopen && !locked ? <Button className="mt-3" disabled={pending} onClick={() => execute(() => reopenTicketAction(ticket.code), "Ticket reabierto.")} variant="ghost"><RotateCcw className="h-4 w-4" /> Reabrir</Button> : null}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <MessageSquareReply className="h-5 w-5 text-blue-600" />
          <h2 className="mt-3 font-semibold text-slate-900">Respuesta al usuario</h2>
          <p className="mt-1 text-sm text-slate-500">Se guarda como PUBLIC y será visible para participantes autorizados.</p>
          <form className="mt-4" onSubmit={(event) => submitReply(event, "PUBLIC")}>
            <textarea className={textareaClass} disabled={locked} maxLength={4000} onChange={(event) => setPublicReply(event.target.value)} required value={publicReply} />
            <Button className="mt-3" disabled={locked || pending || !publicReply.trim()} type="submit"><Send className="h-4 w-4" /> Enviar respuesta pública</Button>
          </form>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40 p-5 sm:p-6">
          <ShieldCheck className="h-5 w-5 text-amber-700" />
          <h2 className="mt-3 font-semibold text-amber-900">Nota interna</h2>
          <p className="mt-1 text-sm text-amber-700">Se guarda como INTERNAL. Nunca se entrega al flujo compartido.</p>
          <form className="mt-4" onSubmit={(event) => submitReply(event, "INTERNAL")}>
            <textarea className={textareaClass} disabled={locked} maxLength={4000} onChange={(event) => setInternalNote(event.target.value)} required value={internalNote} />
            <Button className="mt-3" disabled={locked || pending || !internalNote.trim()} type="submit" variant="secondary">Registrar nota interna</Button>
          </form>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <GitBranch className="h-5 w-5 text-violet-600" />
          <h2 className="mt-3 font-semibold text-slate-900">Marcar duplicado</h2>
          <p className="mt-1 text-sm text-slate-500">El reporte se conserva y queda relacionado al ticket principal.</p>
          <Input className="mt-4" disabled={locked} maxLength={14} onChange={(event) => setDuplicateCode(event.target.value.toUpperCase())} placeholder="TKT-YYYY-NNNNN" value={duplicateCode} />
          <Button className="mt-3" disabled={locked || pending || !duplicateCode} onClick={() => {
            if (window.confirm(`¿Marcar ${ticket.code} como duplicado de ${duplicateCode}?`)) execute(() => markDuplicateAction(ticket.code, duplicateCode), "Relación de duplicado registrada.");
          }} variant="secondary">Confirmar duplicado</Button>
        </Card>
        <Card className="p-5">
          <Link2 className="h-5 w-5 text-orange-600" />
          <h2 className="mt-3 font-semibold text-slate-900">Incidente global</h2>
          <p className="mt-1 text-sm text-slate-500">Solo se admiten tickets clasificados GLOBAL; no hay propagación automática de estado.</p>
          <select className={`${selectClass} mt-4`} disabled={locked} onChange={(event) => setGlobalCode(event.target.value)} value={globalCode}>
            <option value="">Sin incidente relacionado</option>
            {options.globalIncidents.filter((incident) => incident.code !== ticket.code).map((incident) => <option key={incident.code} value={incident.code}>{incident.code} · {incident.title}</option>)}
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={locked || pending || !globalCode} onClick={() => execute(() => linkGlobalIncidentAction(ticket.code, globalCode), "Incidente global relacionado.")} variant="secondary">Vincular</Button>
            {ticket.globalIncidentCode ? <Button disabled={locked || pending} onClick={() => execute(() => unlinkGlobalIncidentAction(ticket.code), "Incidente global desvinculado.")} variant="ghost">Desvincular</Button> : null}
          </div>
        </Card>
      </div>

      <Card className="p-5 sm:p-6">
        <Wrench className="h-5 w-5 text-slate-700" />
        <h2 className="mt-3 font-semibold text-slate-900">Registrar causa raíz</h2>
        <p className="mt-1 text-sm text-slate-500">Cada registro crea un evento privilegiado inmutable; no se publica en Ayuda.</p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(event) => {
          event.preventDefault();
          execute(() => recordRootCauseAction({ code: ticket.code, summary: rootCause.summary, correctiveAction: rootCause.correctiveAction || null, preventionNotes: rootCause.preventionNotes || null }), "Causa raíz registrada.", () => setRootCause({ summary: "", correctiveAction: "", preventionNotes: "" }));
        }}>
          <Control className="sm:col-span-2" label="Resumen">
            <textarea className={textareaClass} disabled={locked} maxLength={2000} onChange={(event) => setRootCause({ ...rootCause, summary: event.target.value })} required value={rootCause.summary} />
          </Control>
          <Control label="Acción correctiva"><textarea className={textareaClass} disabled={locked} maxLength={2000} onChange={(event) => setRootCause({ ...rootCause, correctiveAction: event.target.value })} value={rootCause.correctiveAction} /></Control>
          <Control label="Prevención"><textarea className={textareaClass} disabled={locked} maxLength={2000} onChange={(event) => setRootCause({ ...rootCause, preventionNotes: event.target.value })} value={rootCause.preventionNotes} /></Control>
          <div className="sm:col-span-2"><Button disabled={locked || pending || !rootCause.summary.trim()} type="submit">Registrar evento de causa raíz</Button></div>
        </form>
      </Card>
    </div>
  );
}

function Control({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return <label className={className}><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}</label>;
}
