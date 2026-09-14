"use client";

import { BellRing, CreditCard, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  btnPrimary,
  PortalBadge,
  PortalCard,
} from "@/features/portal/components/ui";
import {
  getPortalPaymentsAction,
  markPortalNotificationsReadAction,
  startPortalPaymentAction,
} from "@/server/payments/portal-actions";
import {
  formatMoney,
  type CustomerNotificationDTO,
  type CustomerPaymentRequestDTO,
} from "@/server/payments/shared";
import { cn } from "@/lib/utils";

/**
 * Patch CRM-QA1 — lo que el cliente ve y paga desde el portal.
 *
 * ## Cómo se entera de un cambio
 *
 * **Consultando cada pocos segundos, no por empuje.** Es una decisión, no una
 * omisión: este repositorio no tiene intermediario de mensajes, ni Redis, ni
 * proceso permanente, y su despliegue no garantiza una sola instancia. Un canal
 * SSE o WebSocket sostenido en la memoria de un proceso **no vería** el pago
 * confirmado por el webhook si éste aterriza en otra instancia — es decir,
 * parecería tiempo real y fallaría justo en el caso que importa.
 *
 * La consulta periódica no tiene ese problema: la verdad está en PostgreSQL y
 * todas las instancias la ven. Cuando el negocio justifique el intermediario, lo
 * único que cambia es de dónde llega el aviso; el DTO y esta pantalla no.
 *
 * Las propiedades que sí se cumplen: **reconexión** (un fallo de red no detiene
 * el ciclo, sólo salta esa vuelta), **autorización** (cada llamada lleva el
 * testigo firmado y el servidor saca de él el cliente), **aislamiento** (ninguna
 * función acepta un identificador de cliente, así que no existe el parámetro con
 * el que pedir los cobros de otro) y **persistencia** (los avisos son filas, no
 * mensajes en vuelo: una recarga los recupera todos).
 *
 * ## El intervalo
 *
 * Ocho segundos mientras hay un cobro vivo, treinta cuando no lo hay. Un
 * portal abierto en una pestaña olvidada no debe golpear la base cada ocho
 * segundos para siempre.
 */

const FAST_INTERVAL_MS = 8_000;
const IDLE_INTERVAL_MS = 30_000;

export function PortalPayments({
  returnPath,
  token,
}: {
  /** A dónde vuelve el cliente tras pagar. Ruta interna. */
  returnPath: string;
  token: string;
}) {
  const [requests, setRequests] = useState<CustomerPaymentRequestDTO[]>([]);
  const [notifications, setNotifications] = useState<CustomerNotificationDTO[]>([]);
  const [provider, setProvider] = useState<{
    label: string;
    isSandbox: boolean;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

  // El intervalo vivo se guarda en una referencia para que el efecto no se
  // reinicie en cada renderizado: reiniciarlo reiniciaría también el reloj, y
  // con datos que cambian solos eso es un ciclo que nunca llega a disparar.
  const hasLiveRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getPortalPaymentsAction(token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError("");
      setRequests(result.requests);
      setNotifications(result.notifications);
      setProvider(
        result.provider
          ? { label: result.provider.label, isSandbox: result.provider.isSandbox }
          : null,
      );
      hasLiveRef.current = result.requests.some((request) => request.payable);
    } catch {
      // Un fallo de red no rompe el ciclo: se reintenta en la siguiente vuelta.
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      if (cancelled) return;
      await refresh();
      if (cancelled) return;
      timer = setTimeout(
        tick,
        hasLiveRef.current ? FAST_INTERVAL_MS : IDLE_INTERVAL_MS,
      );
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  async function pay(requestId: string) {
    setStartingId(requestId);
    setError("");
    try {
      const result = await startPortalPaymentAction({
        token,
        paymentRequestId: requestId,
        returnPath,
      });
      if (!result.ok) {
        setError(result.error);
        setStartingId(null);
        return;
      }
      window.location.assign(result.redirectUrl);
    } catch {
      setError("No pudimos iniciar el pago. Inténtalo de nuevo.");
      setStartingId(null);
    }
  }

  const unread = notifications.filter((notification) => !notification.readAt);

  if (!loaded) {
    return (
      <PortalCard className="flex items-center gap-3 text-sm text-slate-500">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Consultando tus pagos…
      </PortalCard>
    );
  }

  if (!requests.length && !notifications.length) return null;

  return (
    <div className="space-y-4">
      {unread.length ? (
        <PortalCard>
          <div className="flex items-start justify-between gap-3">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <BellRing aria-hidden className="h-4 w-4 text-orange-500" />
              Novedades
            </h3>
            <button
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              onClick={async () => {
                await markPortalNotificationsReadAction(token);
                void refresh();
              }}
              type="button"
            >
              Marcar como leídas
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {unread.map((notification) => (
              <li
                className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3"
                key={notification.id}
              >
                <p className="text-sm font-semibold text-slate-900">
                  {notification.title}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{notification.body}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {new Date(notification.createdAt).toLocaleString("es-NI")}
                </p>
              </li>
            ))}
          </ul>
        </PortalCard>
      ) : null}

      {requests.length ? (
        <PortalCard>
          <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <CreditCard aria-hidden className="h-4 w-4 text-slate-400" />
            Tus pagos
          </h3>
          {provider?.isSandbox ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Pasarela de <strong>pruebas</strong> ({provider.label}). Ningún cobro
              es real.
            </p>
          ) : null}

          <ul className="mt-4 space-y-3">
            {requests.map((request) => (
              <li
                className="rounded-lg border border-slate-200 px-4 py-3"
                key={request.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{request.concept}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {request.requestNumber} · {request.branchName}
                      {request.dueDate
                        ? ` · Vence ${new Date(request.dueDate).toLocaleDateString("es-NI")}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-900">
                      {formatMoney(request.amount, request.currency)}
                    </p>
                    <PortalBadge>{request.statusLabel}</PortalBadge>
                  </div>
                </div>

                {request.payable ? (
                  provider ? (
                    <button
                      className={cn(btnPrimary, "mt-3")}
                      disabled={startingId === request.id}
                      onClick={() => pay(request.id)}
                      type="button"
                    >
                      {startingId === request.id ? (
                        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                      ) : (
                        <CreditCard aria-hidden className="h-4 w-4" />
                      )}
                      Pagar en línea
                    </button>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      El pago en línea aún no está habilitado. Comunícate con tu
                      sucursal para coordinarlo.
                    </p>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        </PortalCard>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
