"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { returnPosSaleAction } from "@/server/pos/return-actions";
import type { PosSaleDetailDTO, PosWarehouseDTO } from "@/server/pos/shared";
import type { PosSaleReturnStateDTO } from "@/server/pos/queries";

/**
 * Patch DEV-A — devolver artículos de una venta.
 *
 * ## Ninguna cifra manda desde aquí
 *
 * El tope de efectivo y lo ya devuelto por línea llegan derivados del servidor.
 * Esta pantalla los usa para **no ofrecer lo imposible**, pero
 * `returnPosSaleAction` los vuelve a calcular bajo el bloqueo de la cabecera de
 * la venta: la frontera está allí, no aquí.
 *
 * ## Una venta sin efectivo dice por qué, en vez de esconder el botón
 *
 * Si la venta se cobró solo con tarjeta o transferencia, no hay efectivo que
 * devolver y esta pantalla **lo explica**. Ocultar el botón dejaría al cajero
 * buscando una función que no encontraría, sin saber que la razón es el método
 * de pago.
 */
export function PosSaleReturnPanel({
  sale,
  state,
  warehouses,
}: {
  sale: PosSaleDetailDTO;
  state: PosSaleReturnStateDTO;
  warehouses: PosWarehouseDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [warehouse, setWarehouse] = useState(warehouses[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  /** Lo que queda por devolver de cada línea, según el servidor. */
  const remaining = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of sale.items) {
      const returned = state.returnedByItem[item.id] ?? 0;
      map[item.id] = Math.round((item.quantity - returned) * 1_000) / 1_000;
    }
    return map;
  }, [sale.items, state.returnedByItem]);

  /** Vista previa del importe. El que cuenta lo calcula el servidor. */
  const preview = useMemo(() => {
    let total = 0;
    for (const item of sale.items) {
      const typed = Number((quantities[item.id] ?? "").trim().replace(",", "."));
      if (!Number.isFinite(typed) || typed <= 0) continue;
      total += (item.total * typed) / item.quantity;
    }
    return Math.round(total * 100) / 100;
  }, [quantities, sale.items]);

  const fullyReturned = sale.items.every((item) => (remaining[item.id] ?? 0) <= 0);
  const anythingReturned = state.returns.length > 0;

  function submit() {
    setError(null);
    setCode(null);
    const lines = sale.items
      .map((item) => ({
        saleItemId: item.id,
        quantity: Number((quantities[item.id] ?? "").trim().replace(",", ".")),
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);

    if (!lines.length) {
      setError("Indica cuánto devolver de al menos un artículo.");
      return;
    }

    startTransition(async () => {
      const result = await returnPosSaleAction({
        saleId: sale.id,
        warehouseId: warehouse,
        reason,
        lines,
      });
      if (!result.ok) {
        setError(result.error);
        setCode(result.code ?? null);
        return;
      }
      setOpen(false);
      setReason("");
      setQuantities({});
      router.refresh();
    });
  }

  return (
    <Card className="p-5" data-testid="pos-devolucion">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-slate-900">Devoluciones</h2>
        {anythingReturned ? (
          <Badge tone={fullyReturned ? "amber" : "blue"}>
            {fullyReturned ? "Devuelta por completo" : "Devuelta en parte"}
          </Badge>
        ) : null}
      </div>

      {/* --- Estado derivado --- */}
      {anythingReturned ? (
        <div className="mt-3 space-y-2" data-testid="pos-devolucion-historial">
          {state.returns.map((row) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
              data-testid="pos-devolucion-fila"
              key={row.id}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-slate-600">
                  {row.returnNumber}
                </span>
                <span className="text-xs text-slate-500">{row.reason}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums text-slate-900">
                {formatAmount(row.cashRefunded)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <Notice className="mt-3" tone="danger">
          <span data-testid="pos-devolucion-error">{error}</span>
        </Notice>
      ) : null}

      {/* --- Por qué no se puede, cuando no se puede --- */}
      {state.cashTendered <= 0 ? (
        <Notice className="mt-3" tone="info">
          <span data-testid="pos-devolucion-sin-efectivo">
            Esta venta se cobró <strong>sin efectivo</strong>, así que no hay
            efectivo que devolver desde el cajón. Devolver contra tarjeta o
            transferencia todavía no es una operación que exista. Si la mercancía
            vuelve, repón las existencias con un{" "}
            <strong>ajuste de inventario</strong>, que es lo que de verdad ocurre.
          </span>
        </Notice>
      ) : fullyReturned ? (
        <p className="mt-3 text-sm text-slate-500" data-testid="pos-devolucion-completa">
          Todos los artículos de esta venta ya fueron devueltos.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm tabular-nums text-slate-600">
            Efectivo cobrado {formatAmount(state.cashTendered)} · Devuelto{" "}
            {formatAmount(state.cashRefunded)} ·{" "}
            <strong data-testid="pos-devolucion-tope">
              Máximo a devolver {formatAmount(state.refundable)}
            </strong>
          </p>
          <Button
            className="mt-4"
            data-testid="pos-devolucion-abrir"
            onClick={() => setOpen(true)}
            variant="secondary"
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            Devolver artículos
          </Button>
        </>
      )}

      <Drawer
        description={`Máximo en efectivo: ${formatAmount(state.refundable)}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)} variant="secondary">
              Cancelar
            </Button>
            <Button
              className="h-11 px-6"
              data-testid="pos-devolucion-confirmar"
              disabled={pending}
              onClick={submit}
            >
              Registrar devolución
            </Button>
          </>
        }
        onClose={() => setOpen(false)}
        open={open}
        size="lg"
        title="Devolver artículos"
      >
        <div className="space-y-4">
          {error ? (
            <Notice tone="danger">
              <span data-testid="pos-devolucion-error-cajon">{error}</span>
              {code === "NO_OPEN_SHIFT" ? (
                <a
                  className="sb-focus ml-3 inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                  data-testid="pos-devolucion-abrir-turno"
                  href="/pos/caja"
                  rel="noreferrer"
                  target="_blank"
                >
                  Abrir turno de caja
                </a>
              ) : null}
            </Notice>
          ) : null}

          <div className="space-y-3" data-testid="pos-devolucion-lineas">
            {sale.items.map((item) => {
              const left = remaining[item.id] ?? 0;
              return (
                <div
                  className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 p-3"
                  data-testid="pos-devolucion-linea"
                  key={item.id}
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-slate-500">
                      {item.productSku}
                    </span>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.productName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Vendidos {item.quantity} · quedan por devolver {left}
                    </p>
                  </div>
                  <div className="w-28">
                    <Field label="Devolver">
                      <Input
                        data-testid={`pos-devolucion-cantidad-${item.productSku}`}
                        disabled={left <= 0}
                        inputMode="decimal"
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="0"
                        value={quantities[item.id] ?? ""}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>

          {warehouses.length > 1 ? (
            <Field hint="A dónde vuelve la mercancía." label="Bodega">
              <Select
                data-testid="pos-devolucion-bodega"
                onChange={(event) => setWarehouse(event.target.value)}
                value={warehouse}
              >
                {warehouses.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field hint="Obligatorio. Queda en el documento." label="Motivo">
            <Input
              data-testid="pos-devolucion-motivo"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Artículo defectuoso, talla equivocada…"
              value={reason}
            />
          </Field>

          <p
            className={
              preview > state.refundable
                ? "text-sm font-medium text-amber-700"
                : "text-sm text-slate-600"
            }
            data-testid="pos-devolucion-previa"
            role="status"
          >
            A devolver en efectivo: {formatAmount(preview)}
            {preview > state.refundable
              ? ` · supera el máximo de ${formatAmount(state.refundable)}`
              : ""}
          </p>
        </div>
      </Drawer>
    </Card>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
