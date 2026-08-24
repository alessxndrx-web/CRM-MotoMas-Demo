"use client";

import { MessageCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
} from "@/server/whatsapp/actions";
import {
  WHATSAPP_APPROVED_TEMPLATES,
  isWithinServiceWindow,
  serviceWindowExpiresAt,
  type WhatsAppConversationDTO,
  type WhatsAppMessageDTO,
} from "@/server/whatsapp/shared";

/**
 * El hilo de WhatsApp de un lead o de un cliente, en un cajón sobre la tabla
 * donde ya vive ese registro. No hay ruta nueva: `/panel/leads` y
 * `/panel/clientes` siguen siendo las pantallas, y esto es su detalle.
 *
 * ## La ventana de 24 h también se ve
 *
 * Fuera de las 24 h del último mensaje del cliente, Meta sólo acepta plantillas.
 * El cuadro de texto se deshabilita y se dice por qué, en vez de dejar escribir
 * un mensaje que el servidor va a rechazar igual. La comprobación de verdad está
 * en el servidor; esto evita el viaje.
 */

export type WhatsAppConversationDrawerProps = {
  open: boolean;
  onClose: () => void;
  /** Nombre del lead o cliente, sólo para el encabezado. */
  contactName: string;
  phone: string;
  conversation: WhatsAppConversationDTO | null;
};

const templateNames = Object.keys(WHATSAPP_APPROVED_TEMPLATES);

export function WhatsAppConversationDrawer({
  open,
  onClose,
  contactName,
  phone,
  conversation,
}: WhatsAppConversationDrawerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const messages = conversation?.messages ?? [];
  const lastInboundAt = conversation?.lastInboundAt ?? null;
  const withinWindow = isWithinServiceWindow(lastInboundAt);
  const expiresAt = serviceWindowExpiresAt(lastInboundAt);

  function report(text: string, failed: boolean) {
    setMessage(text);
    setIsError(failed);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    report("", false);
    startTransition(async () => {
      const result = await sendWhatsAppMessage({ phone, body });
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      setDraft("");
      report("Mensaje enviado.", false);
      router.refresh();
    });
  }

  function sendTemplate(templateName: string) {
    report("", false);
    startTransition(async () => {
      const result = await sendWhatsAppTemplateMessage({ phone, templateName });
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report("Plantilla enviada.", false);
      router.refresh();
    });
  }

  return (
    <Drawer
      description={`${phone}${
        lastInboundAt
          ? ` · último mensaje del cliente ${formatDateTime(lastInboundAt)}`
          : " · sin mensajes del cliente"
      }`}
      onClose={onClose}
      open={open}
      size="lg"
      title={`WhatsApp · ${contactName}`}
    >
      <div className="space-y-4">
        {messages.length ? (
          <ol className="space-y-3">
            {messages.map((item) => (
              <MessageBubble key={item.id} message={item} />
            ))}
          </ol>
        ) : (
          <EmptyState
            description="Cuando el cliente escriba por WhatsApp, la conversación aparece aquí."
            icon={MessageCircle}
            title="Sin mensajes todavía"
          />
        )}

        {message ? (
          <p
            className={
              isError
                ? "text-sm font-medium text-red-600"
                : "text-sm font-medium text-emerald-600"
            }
          >
            {message}
          </p>
        ) : null}

        {withinWindow ? (
          <form className="space-y-2" onSubmit={submit}>
            <textarea
              className="h-24 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Escribe tu respuesta…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {expiresAt
                  ? `Puedes escribir texto libre hasta ${formatDateTime(
                      expiresAt.toISOString(),
                    )}.`
                  : null}
              </span>
              <Button disabled={isPending || !draft.trim()} type="submit">
                <Send className="h-4 w-4" />
                Enviar
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-800">
              Fuera de la ventana de 24 horas
            </p>
            <p className="text-sm text-amber-700">
              {lastInboundAt
                ? "Pasaron más de 24 horas desde el último mensaje del cliente."
                : "Este cliente todavía no ha escrito."}{" "}
              Meta sólo permite texto libre dentro de esa ventana; fuera de ella
              hay que usar una plantilla aprobada.
            </p>
            {templateNames.length ? (
              <div className="flex flex-wrap gap-2">
                {templateNames.map((name) => (
                  <Button
                    disabled={isPending}
                    key={name}
                    size="sm"
                    variant="secondary"
                    onClick={() => sendTemplate(name)}
                  >
                    Enviar plantilla «{name}»
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-700">
                No hay ninguna plantilla aprobada registrada en el servidor, así
                que ahora mismo no se puede iniciar la conversación.
              </p>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function MessageBubble({ message }: { message: WhatsAppMessageDTO }) {
  const outbound = message.direction === "SALIENTE";
  return (
    <li className={outbound ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
          outbound
            ? "bg-blue-600 text-white"
            : "border border-slate-200 bg-slate-50 text-slate-900"
        }`}
      >
        <p className="whitespace-pre-wrap">
          {message.body ??
            (message.templateName
              ? `Plantilla «${message.templateName}»`
              : "(sin texto)")}
        </p>
        <div
          className={`mt-2 flex items-center gap-2 text-xs ${
            outbound ? "text-blue-100" : "text-slate-500"
          }`}
        >
          <span>{formatDateTime(message.createdAt)}</span>
          {outbound ? (
            <Badge tone={message.status === "FALLIDO" ? "red" : "slate"}>
              {message.statusLabel}
            </Badge>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
