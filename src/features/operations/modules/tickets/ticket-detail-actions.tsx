"use client";

import { useRouter } from "next/navigation";
import { Ban, LockKeyhole, MessageSquareReply, RotateCcw } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  canCancelOwnTicket,
  canReopenOwnTicket,
  type TicketStatusValue,
} from "@/features/operations/modules/tickets/ticket-ui";
import {
  addPublicCommentAction,
  cancelOwnTicketAction,
  reopenTicketAction,
} from "@/server/tickets/actions";

type Notice = { tone: "success" | "error"; message: string } | null;

export function TicketDetailActions({
  code,
  isCreator,
  status,
}: {
  code: string;
  isCreator: boolean;
  status: TicketStatusValue;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const locked = status === "CERRADO";

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim()) return;
    setNotice(null);
    startTransition(async () => {
      const result = await addPublicCommentAction(code, comment);
      if (!result.ok) {
        setNotice({
          tone: "error",
          message: "No pudimos agregar la respuesta. Actualiza la página e inténtalo nuevamente.",
        });
        return;
      }
      setComment("");
      setNotice({ tone: "success", message: "Respuesta agregada al ticket." });
      router.refresh();
    });
  }

  function cancelTicket() {
    if (!window.confirm("¿Deseas cancelar este ticket? Esta acción quedará registrada.")) {
      return;
    }
    setNotice(null);
    startTransition(async () => {
      const result = await cancelOwnTicketAction(code);
      if (!result.ok) {
        setNotice({
          tone: "error",
          message: "El ticket no pudo cancelarse. Puede que su estado haya cambiado.",
        });
        return;
      }
      setNotice({ tone: "success", message: "Ticket cancelado." });
      router.refresh();
    });
  }

  function reopenTicket() {
    setNotice(null);
    startTransition(async () => {
      const result = await reopenTicketAction(code);
      if (!result.ok) {
        setNotice({
          tone: "error",
          message: "El ticket no pudo reabrirse. Puede que su estado haya cambiado.",
        });
        return;
      }
      setNotice({ tone: "success", message: "Ticket reabierto correctamente." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
            {locked ? (
              <LockKeyhole className="h-4 w-4" />
            ) : (
              <MessageSquareReply className="h-4 w-4" />
            )}
          </span>
          <div>
            <h2 className="font-semibold text-slate-900">Responder públicamente</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {locked
                ? "La conversación está cerrada. El creador puede solicitar una reapertura cuando corresponda."
                : "Tu respuesta será visible para los participantes autorizados del ticket."}
            </p>
          </div>
        </div>

        {!locked ? (
          <form className="mt-5" onSubmit={submitComment}>
            <label className="block" htmlFor="ticket-public-comment">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Nueva respuesta
              </span>
              <textarea
                className="min-h-28 w-full resize-y rounded-md border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                id="ticket-public-comment"
                maxLength={4000}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Agrega información útil sin incluir contraseñas, tokens, cookies ni datos de pago."
                required
                value={comment}
              />
            </label>
            <div className="mt-3 flex justify-end">
              <Button disabled={pending || !comment.trim()} type="submit">
                <MessageSquareReply className="h-4 w-4" />
                {pending ? "Enviando…" : "Agregar respuesta"}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>

      {isCreator &&
      (canCancelOwnTicket(status) || canReopenOwnTicket(status)) ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">Acciones del creador</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Estas acciones solo están disponibles para quien reportó el ticket y
            vuelven a validarse en el servidor.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {canReopenOwnTicket(status) ? (
              <Button disabled={pending} onClick={reopenTicket} variant="secondary">
                <RotateCcw className="h-4 w-4" />
                Reabrir ticket
              </Button>
            ) : null}
            {canCancelOwnTicket(status) ? (
              <Button disabled={pending} onClick={cancelTicket} variant="danger">
                <Ban className="h-4 w-4" />
                Cancelar ticket
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {notice ? (
        <div
          aria-live="polite"
          className={
            notice.tone === "success"
              ? "rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          }
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </div>
      ) : null}
    </div>
  );
}
