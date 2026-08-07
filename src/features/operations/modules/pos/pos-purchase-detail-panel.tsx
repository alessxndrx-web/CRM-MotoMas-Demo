"use client";

import { Ban, Check, PackageCheck, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { PosPurchaseHistory } from "@/features/operations/modules/pos/pos-purchase-history";
import {
  approvePosPurchaseOrderAction,
  cancelPosPurchaseOrderAction,
  receivePosPurchaseOrderAction,
  returnPosPurchaseOrderAction,
} from "@/server/pos/actions";
import type {
  PosPurchaseEventDTO,
  PosPurchaseOrderAbilities,
  PosPurchaseOrderDetailDTO,
  PosWarehouseDTO,
} from "@/server/pos/shared";

/**
 * Patch POS1.2-F — el detalle de una orden de compra, y sus operaciones.
 *
 * ## Por qué existe
 *
 * POS1.2-A a POS1.2-E construyeron seis acciones de servidor y expusieron **una**:
 * anular. Crear, aprobar, recibir y devolver eran inalcanzables desde la
 * aplicación. Un flujo que nadie puede ejecutar no está cerrado, y cerrar el
 * módulo es lo que este parche hace.
 *
 * ## Deliberadamente sin diseño
 *
 * Usa las primitivas que ya existen y nada más: sin tarjetas de indicadores, sin
 * gráficos, sin filtros. **El objetivo es alcanzabilidad funcional**; el lenguaje
 * visual es POS2.0-B/C.
 *
 * ## La pantalla no decide
 *
 * Qué botones se muestran viene de `abilities`, derivado en la capa de consultas
 * desde las mismas condiciones que aplican las acciones. Y **no es la frontera de
 * seguridad**: cada acción reautoriza y revalida en el servidor, porque estos
 * campos viajan al navegador y un cliente puede mentir.
 */
function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);
}

function formatMoment(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const statusTone: Record<string, "slate" | "blue" | "amber" | "green" | "red"> = {
  BORRADOR: "slate",
  APROBADA: "blue",
  RECIBIDA_PARCIAL: "amber",
  RECIBIDA: "green",
  ANULADA: "red",
};

type LineDraft = Record<string, string>;

export function PosPurchaseDetailPanel({
  order,
  abilities,
  events,
  warehouses,
}: {
  order: PosPurchaseOrderDetailDTO;
  abilities: PosPurchaseOrderAbilities;
  events: PosPurchaseEventDTO[];
  /** Bodegas de la sucursal de la orden. Recibir y devolver exigen una. */
  warehouses: PosWarehouseDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<"recibir" | "devolver" | "anular" | null>(null);
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [receiveDraft, setReceiveDraft] = useState<LineDraft>({});
  const [returnDraft, setReturnDraft] = useState<LineDraft>({});

  function run(operation: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await operation();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      setPanel(null);
      setReason("");
      setReceiveDraft({});
      setReturnDraft({});
      setNotice("Operación registrada.");
      router.refresh();
    });
  }

  /** Convierte el borrador de una tabla en líneas, descartando lo vacío. */
  function collect(draft: LineDraft) {
    return Object.entries(draft)
      .filter(([, value]) => value.trim() !== "")
      .map(([itemId, value]) => ({
        itemId,
        quantity: Number(value.replace(",", ".")),
      }));
  }

  const totalPending = order.items.reduce(
    (sum, item) => sum + item.pendingQuantity,
    0,
  );
  const totalReturnable = order.items.reduce(
    (sum, item) => sum + item.returnableQuantity,
    0,
  );

  return (
    <div className="space-y-6">
      <Card className="p-6" data-testid="compra-detalle">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge dot tone={statusTone[order.status] ?? "slate"}>
                {order.statusLabel}
              </Badge>
              <span className="font-mono text-sm text-slate-700">
                {order.orderNumber}
              </span>
            </div>
            <h1 className="mt-2 text-base font-bold text-slate-900">
              {order.supplierName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {order.branchName} · {order.itemCount} línea
              {order.itemCount === 1 ? "" : "s"}
            </p>
          </div>
          <span className="sb-numeric text-lg font-bold text-slate-900">
            {formatAmount(order.total)}
          </span>
        </div>

        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Creada
            </dt>
            <dd className="mt-1 text-slate-700">{formatMoment(order.createdAt)}</dd>
            <dd className="text-xs text-slate-500">{order.createdByName}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Aprobada
            </dt>
            <dd className="mt-1 text-slate-700">{formatMoment(order.approvedAt)}</dd>
            <dd className="text-xs text-slate-500">{order.approvedByName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Entrega esperada
            </dt>
            <dd className="mt-1 text-slate-700">{formatMoment(order.expectedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Anulada
            </dt>
            <dd className="mt-1 text-slate-700">{formatMoment(order.cancelledAt)}</dd>
            <dd className="text-xs text-slate-500">
              {order.cancelledReason ?? "—"}
            </dd>
          </div>
        </dl>

        {error ? (
          <div
            className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            data-testid="compra-error"
          >
            {error}
          </div>
        ) : null}
        {notice ? (
          <div
            className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
            data-testid="compra-ok"
          >
            {notice}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2" data-testid="compra-acciones">
          {abilities.approvable ? (
            <Button
              disabled={pending}
              onClick={() =>
                run(() => approvePosPurchaseOrderAction({ orderId: order.id }))
              }
              size="sm"
            >
              <Check className="h-4 w-4" />
              Aprobar
            </Button>
          ) : null}
          {abilities.receivable ? (
            <Button
              disabled={pending}
              onClick={() => setPanel(panel === "recibir" ? null : "recibir")}
              size="sm"
              variant="secondary"
            >
              <PackageCheck className="h-4 w-4" />
              Recibir
            </Button>
          ) : null}
          {abilities.returnable ? (
            <Button
              disabled={pending}
              onClick={() => setPanel(panel === "devolver" ? null : "devolver")}
              size="sm"
              variant="secondary"
            >
              <Undo2 className="h-4 w-4" />
              Devolver
            </Button>
          ) : null}
          {abilities.cancellable ? (
            <Button
              disabled={pending}
              onClick={() => setPanel(panel === "anular" ? null : "anular")}
              size="sm"
              variant="secondary"
            >
              <Ban className="h-4 w-4" />
              Anular
            </Button>
          ) : null}
        </div>

        {panel === "anular" ? (
          <div
            className="mt-4 flex flex-wrap items-end gap-2"
            data-testid="compra-anular"
          >
            <div className="min-w-[16rem] flex-1">
              <Field label="Motivo de la anulación" required>
                <Input
                  onChange={(event) => setReason(event.target.value)}
                  value={reason}
                />
              </Field>
            </div>
            <Button
              disabled={pending}
              onClick={() =>
                run(() =>
                  cancelPosPurchaseOrderAction({ orderId: order.id, reason }),
                )
              }
              size="sm"
            >
              Confirmar anulación
            </Button>
          </div>
        ) : null}

        {panel === "recibir" || panel === "devolver" ? (
          <div className="mt-4" data-testid="compra-bodega">
            <div className="max-w-xs">
              <Field
                hint={
                  panel === "recibir"
                    ? "Donde entra la mercancía."
                    : "De donde sale la mercancía devuelta."
                }
                label="Bodega"
                required
              >
                <select
                  className="sb-focus h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  onChange={(event) => setWarehouseId(event.target.value)}
                  value={warehouseId}
                >
                  {warehouses.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {warehouses.length ? null : (
              <p className="mt-2 text-xs text-amber-700">
                La sucursal de esta orden no tiene bodegas activas.
              </p>
            )}
            {panel === "devolver" ? (
              <div className="mt-3 max-w-md">
                <Field label="Motivo de la devolución" required>
                  <Input
                    onChange={(event) => setReason(event.target.value)}
                    value={reason}
                  />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">Líneas</h2>
          <p className="sb-numeric text-xs text-slate-500">
            Pendiente {formatQuantity(totalPending)} · Devolvible{" "}
            {formatQuantity(totalReturnable)}
          </p>
        </div>

        <div className="sb-scroll mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Artículo
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pedido
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recibido
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Devuelto
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pendiente
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Costo
                </th>
                {panel === "recibir" || panel === "devolver" ? (
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {panel === "recibir" ? "Recibir" : "Devolver"}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr
                  className="border-b border-slate-100 last:border-b-0"
                  data-testid="compra-linea"
                  key={item.id}
                >
                  <td className="px-3 py-2.5">
                    <span className="text-slate-800">{item.productName}</span>
                    <span className="ml-2 font-mono text-[11px] text-slate-400">
                      {item.productSku}
                    </span>
                  </td>
                  <td className="sb-numeric px-3 py-2.5 text-right text-slate-700">
                    {formatQuantity(item.quantity)}
                  </td>
                  <td className="sb-numeric px-3 py-2.5 text-right text-slate-700">
                    {formatQuantity(item.receivedQuantity)}
                  </td>
                  <td className="sb-numeric px-3 py-2.5 text-right text-slate-700">
                    {formatQuantity(item.returnedQuantity)}
                  </td>
                  <td className="sb-numeric px-3 py-2.5 text-right font-semibold text-slate-900">
                    {formatQuantity(item.pendingQuantity)}
                  </td>
                  <td className="sb-numeric px-3 py-2.5 text-right text-slate-700">
                    {formatAmount(item.unitCost)}
                  </td>
                  {panel === "recibir" ? (
                    <td className="px-3 py-2 text-right">
                      <Input
                        aria-label={`Recibir ${item.productName}`}
                        className="h-8 w-24 text-right"
                        disabled={item.pendingQuantity <= 0}
                        inputMode="decimal"
                        onChange={(event) =>
                          setReceiveDraft((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        value={receiveDraft[item.id] ?? ""}
                      />
                    </td>
                  ) : null}
                  {panel === "devolver" ? (
                    <td className="px-3 py-2 text-right">
                      <Input
                        aria-label={`Devolver ${item.productName}`}
                        className="h-8 w-24 text-right"
                        disabled={item.returnableQuantity <= 0}
                        inputMode="decimal"
                        onChange={(event) =>
                          setReturnDraft((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        value={returnDraft[item.id] ?? ""}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {panel === "recibir" ? (
          <div className="mt-4">
            <Button
              disabled={pending || !warehouseId}
              onClick={() =>
                run(() =>
                  receivePosPurchaseOrderAction({
                    orderId: order.id,
                    warehouseId,
                    lines: collect(receiveDraft),
                  }),
                )
              }
              size="sm"
            >
              Confirmar recepción
            </Button>
          </div>
        ) : null}

        {panel === "devolver" ? (
          <div className="mt-4">
            <Button
              disabled={pending || !warehouseId}
              onClick={() =>
                run(() =>
                  returnPosPurchaseOrderAction({
                    orderId: order.id,
                    warehouseId,
                    reason,
                    lines: collect(returnDraft),
                  }),
                )
              }
              size="sm"
            >
              Confirmar devolución
            </Button>
          </div>
        ) : null}
      </Card>

      <PosPurchaseHistory events={events} />
    </div>
  );
}
