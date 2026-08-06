"use client";

import { Ban, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { cancelPosPurchaseOrderAction } from "@/server/pos/actions";
import type { PosPurchaseOrderDTO } from "@/server/pos/shared";

/**
 * Patch POS1.2-C — órdenes de compra y su anulación.
 *
 * POS1.2-A y POS1.2-B construyeron el documento y su recepción **solo en el
 * servidor**. Esta pantalla existe porque una anulación que nadie puede alcanzar
 * no es un flujo, y porque la autorización —lo único que las suites Prisma no
 * pueden cubrir, ya que las acciones autorizan contra cookie— solo se prueba por
 * navegador.
 *
 * **Deliberadamente mínima**: lista y anula. No crea órdenes, no las aprueba y no
 * recibe mercancía; esas pantallas son de parches posteriores.
 *
 * **La regla de qué se puede anular no se reimplementa aquí**: viene resuelta en
 * `cancellable`, derivada en la capa de consultas desde la misma condición que
 * aplica el servidor. Una pantalla que decidiera por su cuenta podría discrepar.
 */
function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

const statusTone: Record<string, "slate" | "blue" | "amber" | "green" | "red"> = {
  BORRADOR: "slate",
  APROBADA: "blue",
  RECIBIDA_PARCIAL: "amber",
  RECIBIDA: "green",
  ANULADA: "red",
};

export function PosPurchasesPanel({
  canOperate,
  orders,
}: {
  canOperate: boolean;
  orders: PosPurchaseOrderDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [cancelled, setCancelled] = useState<string | null>(null);

  function cancel(orderId: string) {
    setError(null);
    setCancelled(null);
    startTransition(async () => {
      const result = await cancelPosPurchaseOrderAction({ orderId, reason });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpenFor(null);
      setReason("");
      setCancelled(orderId);
      router.refresh();
    });
  }

  if (!canOperate) {
    return (
      <Card className="p-6">
        <h1 className="text-base font-bold text-slate-900">Órdenes de compra</h1>
        <p className="mt-2 text-sm text-slate-500" data-testid="compras-denied">
          Tu rol no puede administrar órdenes de compra.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-slate-900">Órdenes de compra</h1>
          <p className="mt-1 text-sm text-slate-500">
            Anular solo cambia el estado del documento: no mueve existencias, no
            contabiliza y no crea deuda con el proveedor.
          </p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
          <ShoppingBag className="h-5 w-5" />
        </div>
      </div>

      {error ? (
        <div
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          data-testid="compras-error"
        >
          {error}
        </div>
      ) : null}

      {cancelled ? (
        <div
          className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          data-testid="compras-cancelled"
        >
          Orden anulada.
        </div>
      ) : null}

      {orders.length ? (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <div
              className="rounded-xl border border-slate-200 p-4"
              data-testid="compras-row"
              key={order.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusTone[order.status] ?? "slate"}>
                    {order.statusLabel}
                  </Badge>
                  <span className="font-mono text-xs text-slate-600">
                    {order.orderNumber}
                  </span>
                  <span className="text-sm text-slate-700">{order.supplierName}</span>
                  <span className="text-xs text-slate-500">{order.branchName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatAmount(order.total)}
                  </span>
                  {order.cancellable ? (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        setOpenFor(openFor === order.id ? null : order.id)
                      }
                      size="sm"
                      variant="secondary"
                    >
                      <Ban className="h-4 w-4" />
                      Anular
                    </Button>
                  ) : null}
                </div>
              </div>

              {order.cancelledReason ? (
                <p
                  className="mt-2 text-xs text-slate-500"
                  data-testid="compras-reason"
                >
                  Motivo de anulación: {order.cancelledReason}
                </p>
              ) : null}

              {openFor === order.id ? (
                <div
                  className="mt-3 flex flex-wrap items-end gap-2"
                  data-testid="compras-cancel-form"
                >
                  <div className="min-w-[16rem] flex-1">
                    <Field
                      hint="Obligatorio, como en la anulación de un documento de caja."
                      label="Motivo de la anulación"
                      required
                    >
                      <Input
                        onChange={(event) => setReason(event.target.value)}
                        value={reason}
                      />
                    </Field>
                  </div>
                  <Button
                    disabled={pending}
                    onClick={() => cancel(order.id)}
                    size="sm"
                  >
                    Confirmar anulación
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-6"
          description="Las órdenes de compra aparecerán aquí."
          icon={ShoppingBag}
          title="Sin órdenes de compra"
        />
      )}
    </Card>
  );
}
