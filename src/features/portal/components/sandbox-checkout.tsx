"use client";

import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import {
  btnOutline,
  btnPrimary,
  PortalBadge,
  PortalCard,
} from "@/features/portal/components/ui";
import {
  getSandboxCheckoutAction,
  settleSandboxPaymentAction,
} from "@/server/payments/sandbox-actions";
import { formatMoney } from "@/server/payments/shared";
import { cn } from "@/lib/utils";

/**
 * Patch CRM-QA1 — la pasarela de pruebas, vista por el cliente.
 *
 * **Dice lo que es en la primera línea.** No imita a ningún proveedor, no pide
 * datos de tarjeta y no guarda ninguno. Es una página de pruebas con dos botones
 * cuyo único cometido es emitir un aviso **realmente firmado** hacia el mismo
 * manejador que atenderá al proveedor de verdad.
 *
 * Lo que se ejercita al pulsar: la verificación de firma HMAC, el registro
 * idempotente del evento, la comprobación de importe y moneda contra la fila, la
 * aplicación atómica del pago y la confirmación de la reserva. Lo único que no
 * se ejercita es el transporte HTTP, que es lo que hace la ruta
 * `/api/webhooks/pagos/[provider]`.
 */
export function SandboxCheckout({
  providerReference,
  returnPath,
}: {
  providerReference: string;
  returnPath: string;
}) {
  const [detail, setDetail] = useState<{
    concept: string;
    amount: string;
    currency: string;
    requestNumber: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [settled, setSettled] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getSandboxCheckoutAction({ providerReference });
      if (cancelled) return;
      if (result.ok) {
        setDetail({
          concept: result.concept,
          amount: result.amount,
          currency: result.currency,
          requestNumber: result.requestNumber,
        });
      } else {
        setError(result.error);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [providerReference]);

  async function settle(outcome: "approved" | "rejected") {
    setPending(true);
    setError("");
    const result = await settleSandboxPaymentAction({ providerReference, outcome });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSettled(outcome);
  }

  if (!loaded) {
    return (
      <PortalCard className="flex items-center gap-3 p-6 text-sm text-slate-500">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        Cargando…
      </PortalCard>
    );
  }

  if (!detail) {
    return (
      <PortalCard className="p-6">
        <h2 className="text-base font-semibold text-slate-900">
          No encontramos este pago
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          El enlace puede haber expirado. Vuelve a tu proceso e inténtalo de
          nuevo.
        </p>
        <Link className={cn(btnOutline, "mt-4")} href={returnPath}>
          Volver a mi proceso
        </Link>
      </PortalCard>
    );
  }

  return (
    <PortalCard className="p-6">
      <PortalBadge tone="orange">Pasarela de pruebas</PortalBadge>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">
        {detail.concept}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{detail.requestNumber}</p>
      <p className="mt-4 text-3xl font-semibold text-slate-900">
        {formatMoney(detail.amount, detail.currency)}
      </p>

      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Esto <strong>no es un cobro real</strong> y no se te piden datos de
        tarjeta. Es el entorno de pruebas de MotoMas: elige el resultado que
        quieres simular.
      </p>

      {settled ? (
        <div className="mt-5">
          <p
            className={cn(
              "flex items-center gap-2 text-sm font-semibold",
              settled === "approved" ? "text-emerald-700" : "text-red-700",
            )}
          >
            {settled === "approved" ? (
              <CheckCircle2 aria-hidden className="h-4 w-4" />
            ) : (
              <XCircle aria-hidden className="h-4 w-4" />
            )}
            {settled === "approved"
              ? "Pago aprobado y confirmado."
              : "Pago rechazado."}
          </p>
          <Link className={cn(btnPrimary, "mt-4")} href={returnPath}>
            Volver a mi proceso
          </Link>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className={btnPrimary}
            disabled={pending}
            onClick={() => settle("approved")}
            type="button"
          >
            {pending ? (
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 aria-hidden className="h-4 w-4" />
            )}
            Simular pago aprobado
          </button>
          <button
            className={btnOutline}
            disabled={pending}
            onClick={() => settle("rejected")}
            type="button"
          >
            <XCircle aria-hidden className="h-4 w-4" />
            Simular pago rechazado
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </PortalCard>
  );
}
