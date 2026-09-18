"use client";

import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  getMyNotificationsAction,
  markNotificationsReadAction,
} from "@/server/notifications/actions";
import {
  actionableNotificationKinds,
  relativeTime,
  type UserNotificationDTO,
} from "@/server/notifications/shared";
import { cn } from "@/lib/utils";

/**
 * Patch CRM-AUD2 — los avisos del empleado.
 *
 * ## Por qué vive en el chasis
 *
 * `OperationsTopbar` documenta que no aloja acciones de negocio, y esto no lo
 * es: es identidad, como la insignia de rol y el botón de salir. No depende de
 * la ruta ni de ningún permiso de módulo — depende de quién eres.
 *
 * ## Cómo se entera de un aviso nuevo
 *
 * **Sondeo de 45 segundos, y no se llama tiempo real.** Es la misma decisión, y
 * por la misma razón, que el portal del cliente: sin intermediario de mensajes y
 * sin garantía de una sola instancia, un canal SSE sostenido en memoria no vería
 * el aviso escrito por otra instancia. Parecería tiempo real y fallaría justo
 * cuando importa.
 *
 * Se refresca además **al volver a la pestaña**, que es cuando una persona
 * retoma el trabajo y es el momento en que de verdad quiere saber si hay algo
 * nuevo.
 *
 * ## Lo que la campana no decide
 *
 * Nada. El servidor resuelve el destinatario desde la sesión firmada; aquí no
 * hay ningún identificador de usuario que enviar ni filtrar.
 */

const POLL_MS = 45_000;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<UserNotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getMyNotificationsAction();
      setItems(result.notifications);
      setUnread(result.unread);
    } catch {
      // Un fallo de red no rompe el ciclo: se reintenta en la vuelta siguiente.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      timer = setTimeout(tick, POLL_MS);
    }
    void tick();

    // Volver a la pestaña es cuando alguien retoma el trabajo.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  // Cerrar al pulsar fuera y con Escape: lo mínimo que un desplegable debe
  // hacer para no quedarse abierto estorbando.
  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openNotification(notification: UserNotificationDTO) {
    setOpen(false);
    if (!notification.readAt) {
      await markNotificationsReadAction({ notificationId: notification.id });
      void refresh();
    }
    // El destino vuelve a autorizar por su cuenta: el aviso no es una llave.
    router.push(notification.href);
  }

  const now = new Date();

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-label={unread ? `Avisos (${unread} sin leer)` : "Avisos"}
        className="sb-focus relative grid h-9 w-9 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Bell aria-hidden className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          style={{ zIndex: "var(--sb-z-popover, 60)" }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Avisos</span>
            {unread > 0 ? (
              <button
                className="sb-focus rounded text-xs font-semibold text-blue-700 hover:underline"
                onClick={async () => {
                  await markNotificationsReadAction({});
                  void refresh();
                }}
                type="button"
              >
                Marcar todo como leído
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
            {!loaded ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                Cargando…
              </p>
            ) : items.length ? (
              <ul>
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      className={cn(
                        "sb-focus w-full border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50",
                        notification.readAt ? null : "bg-blue-50/60",
                      )}
                      onClick={() => openNotification(notification)}
                      type="button"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {notification.title}
                        </span>
                        {actionableNotificationKinds.includes(notification.kind) &&
                        !notification.readAt ? (
                          <Badge tone="orange">Acción</Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-slate-600">
                        {notification.body}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {relativeTime(notification.createdAt, now)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-slate-500">
                No tienes avisos. Cuando te asignen un lead o un cliente, o haya
                un comprobante esperando tu revisión, aparecerá aquí.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
