"use client";

import { useRouter } from "next/navigation";
import { CreditCard, Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { CustomerDTO } from "@/server/crm/shared";
import {
  cancelPaymentRequestAction,
  createPaymentRequestAction,
} from "@/server/payments/actions";
import {
  formatMoney,
  supportedCurrencies,
  type PaymentRequestDTO,
  type PaymentRequestStatusValue,
} from "@/server/payments/shared";

/**
 * Patch CRM-QA1 — «MotoMas le pide C$ X al cliente Y».
 *
 * **El importe lo fija esta pantalla y el servidor lo conserva.** La acción que
 * el cliente ejecuta desde su portal recibe sólo el identificador de la
 * solicitud; el monto sale de la fila. No hay ningún camino por el que una cifra
 * del navegador del cliente llegue a la pasarela.
 *
 * Cuando no hay pasarela configurada la tarjeta lo dice y no ofrece cobrar en
 * línea: la solicitud sigue sirviendo como aviso al cliente, pero no se finge
 * que exista un botón de pago que funcione.
 */
export function PaymentRequestsPanel({
  canManage,
  customers,
  dbConfigured,
  provider,
  requests,
  scopeLabel,
}: {
  canManage: boolean;
  customers: CustomerDTO[];
  dbConfigured: boolean;
  /** Nulo mientras MotoMas no tenga pasarela contratada y configurada. */
  provider: { label: string; isSandbox: boolean } | null;
  requests: PaymentRequestDTO[];
  scopeLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [customerId, setCustomerId] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState<string>("NIO");
  const [concepto, setConcepto] = useState("");
  const [vence, setVence] = useState("");

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setMessage(done);
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Cobros al cliente</Badge>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            {scopeLabel}
          </span>
          {provider?.isSandbox ? (
            <Badge tone="orange">Pasarela de pruebas</Badge>
          ) : null}
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <CreditCard className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
        El cliente ve la solicitud en su portal cuando consulta su proceso y la
        paga desde ahí. El monto lo fijas aquí: el cliente no puede cambiarlo.
      </p>

      {!dbConfigured ? (
        <Notice className="mt-5" tone="warning">
          Esta sección requiere una base de datos configurada.
        </Notice>
      ) : (
        <>
          {provider ? null : (
            <Notice
              className="mt-5"
              tone="info"
              title="El pago en línea no está habilitado"
            >
              Falta configurar la pasarela (<code>PAYMENTS_PROVIDER</code>). Puedes
              emitir la solicitud —el cliente la verá en su portal— pero no habrá
              botón de pago hasta que la pasarela esté contratada y configurada.
            </Notice>
          )}

          {canManage ? (
            <div className="mt-5">
              {open ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <FormSection
                    description="El cliente lo verá al consultar su proceso en el portal público."
                    title="Solicitar un pago"
                  >
                    <Field className="sm:col-span-2" label="Cliente" required>
                      <Select
                        onChange={(event) => setCustomerId(event.target.value)}
                        value={customerId}
                      >
                        <option value="">Selecciona un cliente</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name} · {customer.phone}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Monto" required>
                      <Input
                        inputMode="decimal"
                        onChange={(event) => setMonto(event.target.value)}
                        placeholder="0.00"
                        value={monto}
                      />
                    </Field>
                    <Field label="Moneda" required>
                      <Select
                        onChange={(event) => setMoneda(event.target.value)}
                        value={moneda}
                      >
                        {supportedCurrencies.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field className="sm:col-span-2" label="Concepto" required>
                      <Input
                        onChange={(event) => setConcepto(event.target.value)}
                        placeholder="Qué está pagando el cliente"
                        value={concepto}
                      />
                    </Field>
                    <Field hint="Opcional" label="Vence el">
                      <Input
                        onChange={(event) => setVence(event.target.value)}
                        type="date"
                        value={vence}
                      />
                    </Field>
                  </FormSection>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      disabled={
                        pending || !customerId || !monto.trim() || !concepto.trim()
                      }
                      onClick={() =>
                        run(async () => {
                          const result = await createPaymentRequestAction({
                            customerId,
                            monto,
                            moneda,
                            concepto,
                            vence: vence ? new Date(vence).toISOString() : null,
                          });
                          if (result.ok) {
                            setMonto("");
                            setConcepto("");
                            setVence("");
                          }
                          return result;
                        }, "Cobro enviado al portal del cliente.")
                      }
                    >
                      Solicitar pago
                    </Button>
                    <Button onClick={() => setOpen(false)} variant="secondary">
                      Cerrar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button onClick={() => setOpen(true)} size="sm">
                  <Plus aria-hidden className="h-4 w-4" />
                  Solicitar pago
                </Button>
              )}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4">
              <Notice tone="danger">{error}</Notice>
            </div>
          ) : null}
          {message ? (
            <div className="mt-4">
              <Notice tone="success">{message}</Notice>
            </div>
          ) : null}

          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[900px] overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[1fr_1.3fr_0.8fr_0.9fr_0.9fr_auto] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div>Cobro</div>
                <div>Cliente y concepto</div>
                <div>Monto</div>
                <div>Vence</div>
                <div>Estado</div>
                <div className="text-right">Acciones</div>
              </div>

              {requests.length ? (
                requests.map((request) => (
                  <div
                    className="grid grid-cols-[1fr_1.3fr_0.8fr_0.9fr_0.9fr_auto] items-center gap-3 border-b border-slate-100 px-5 py-4 last:border-b-0"
                    key={request.id}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs font-semibold text-slate-900">
                        {request.requestNumber}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {request.purposeLabel}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {request.customerName}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {request.concept}
                        {request.reservationNumber
                          ? ` · ${request.reservationNumber}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {formatMoney(request.amount, request.currency)}
                    </div>
                    <div className="text-sm text-slate-500">
                      {request.dueDate
                        ? new Date(request.dueDate).toLocaleDateString("es-NI")
                        : "—"}
                    </div>
                    <div>
                      <Badge tone={statusTone(request.status)}>
                        {request.statusLabel}
                      </Badge>
                    </div>
                    <div className="text-right">
                      {canManage &&
                      (request.status === "PENDIENTE" ||
                        request.status === "PROCESANDO") ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(
                              () =>
                                cancelPaymentRequestAction({
                                  paymentRequestId: request.id,
                                }),
                              "Cobro anulado.",
                            )
                          }
                          size="sm"
                          variant="danger"
                        >
                          Anular
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  description="Emite uno con el botón de arriba, o desde la tarjeta de pago de una reserva."
                  icon={CreditCard}
                  title="Aún no hay cobros en tu alcance"
                />
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function statusTone(status: PaymentRequestStatusValue) {
  if (status === "PAGADA") return "green" as const;
  if (status === "PROCESANDO") return "blue" as const;
  if (status === "CANCELADA" || status === "EXPIRADA") return "gray" as const;
  return "orange" as const;
}
