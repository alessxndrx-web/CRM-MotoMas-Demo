"use client";

import { Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { searchPosProductsAction } from "@/server/pos/actions";
import {
  calculatePosLineTotal,
  calculatePosSaleTotals,
  type PosProductDTO,
} from "@/server/pos/shared";

/**
 * Patch POS1.0-C — carrito del punto de venta (`/panel/pos/venta`).
 *
 * ## El carrito vive en el navegador, y eso es la decisión de diseño
 *
 * Nada de esta pantalla escribe en la base de datos. Un mostrador arma la venta
 * en segundos —escanea, corrige cantidad, quita una línea— y persistir cada
 * pulsación crearía borradores basura por cada cliente que se arrepiente.
 * **Recargar vacía el carrito, a propósito.** La venta se crea en el cobro, que
 * es un parche posterior.
 *
 * ## La búsqueda es una acción, no una navegación
 *
 * Buscar por URL recargaría la página y tiraría el carrito en cada escaneo. Por
 * eso `searchPosProductsAction` devuelve los productos y la página se queda
 * donde está.
 *
 * ## Aritmética
 *
 * **El navegador no tiene fórmulas propias**: `calculatePosLineTotal` y
 * `calculatePosSaleTotals` son las mismas que usa el servidor en POS1.0-A, así
 * que lo que el cajero ve no puede discrepar de lo que se guardará.
 */

type CartLine = {
  productId: string;
  sku: string;
  name: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  tax: string;
};

function parseAmount(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPosAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function PosCartPanel({ canOperate }: { canOperate: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PosProductDTO[]>([]);
  const [searched, setSearched] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);

  const totals = useMemo(
    () =>
      calculatePosSaleTotals(
        lines.map((line) => ({
          quantity: parseAmount(line.quantity),
          unitPrice: parseAmount(line.unitPrice),
          discount: parseAmount(line.discount),
          tax: parseAmount(line.tax),
        })),
      ),
    [lines],
  );

  function search() {
    setError(null);
    startTransition(async () => {
      const result = await searchPosProductsAction({ term });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResults(result.products);
      setSearched(true);
    });
  }

  /**
   * Un producto repetido **suma cantidad** en vez de abrir otra línea: es lo que
   * espera quien escanea el mismo artículo dos veces.
   */
  function addProduct(product: PosProductDTO) {
    setLines((current) => {
      const existing = current.findIndex((line) => line.productId === product.id);
      if (existing >= 0) {
        const next = [...current];
        const line = next[existing]!;
        next[existing] = {
          ...line,
          quantity: String(parseAmount(line.quantity) + 1),
        };
        return next;
      }
      return [
        ...current,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: "1",
          unitPrice: String(product.unitPrice),
          discount: "0",
          tax: "0",
        },
      ];
    });
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setLines((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, ...patch } : line,
      ),
    );
  }

  function removeLine(productId: string) {
    setLines((current) => current.filter((line) => line.productId !== productId));
  }

  if (!canOperate) {
    return (
      <Card className="p-6">
        <h1 className="text-base font-bold text-slate-900">Punto de venta</h1>
        <p className="mt-2 text-sm text-slate-500">
          Tu rol no puede operar el punto de venta.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">Punto de venta</h1>
            <p className="mt-1 text-sm text-slate-500">
              Arma la venta escaneando o buscando artículos. El carrito vive en
              esta pantalla: recargar lo vacía, y todavía no se guarda ninguna
              venta.
            </p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ShoppingCart className="h-5 w-5" />
          </div>
        </div>

        {error ? (
          <div
            className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            data-testid="pos-error"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-end gap-2" data-testid="pos-search">
          <div className="min-w-[16rem] flex-1">
            <Field hint="SKU, código de barras o nombre." label="Buscar artículo">
              <Input
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") search();
                }}
                placeholder="Escanea o escribe"
                value={term}
              />
            </Field>
          </div>
          <Button disabled={pending} onClick={search} size="sm" variant="secondary">
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </div>

        {searched ? (
          results.length ? (
            <div className="mt-4 space-y-2" data-testid="pos-results">
              {results.map((product) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
                  data-testid="pos-result-row"
                  key={product.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-600">
                        {product.sku}
                      </span>
                      <span className="text-sm font-medium text-slate-900">
                        {product.name}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatPosAmount(product.unitPrice)}
                    </span>
                    <Button onClick={() => addProduct(product)} size="sm">
                      <Plus className="h-4 w-4" />
                      Agregar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              Ningún artículo coincide con la búsqueda.
            </p>
          )
        ) : null}
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-bold text-slate-900">Carrito</h2>

        {lines.length ? (
          <div className="mt-4 space-y-3">
            {lines.map((line) => {
              const lineTotal = calculatePosLineTotal({
                quantity: parseAmount(line.quantity),
                unitPrice: parseAmount(line.unitPrice),
                discount: parseAmount(line.discount),
                tax: parseAmount(line.tax),
              });
              return (
                <div
                  className="rounded-xl border border-slate-200 p-4"
                  data-testid="pos-cart-line"
                  key={line.productId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="slate">{line.sku}</Badge>
                      <span className="text-sm font-semibold text-slate-900">
                        {line.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className="text-sm font-semibold tabular-nums text-slate-900"
                        data-testid="pos-line-total"
                      >
                        {formatPosAmount(lineTotal)}
                      </span>
                      <Button
                        aria-label={`Quitar ${line.name}`}
                        onClick={() => removeLine(line.productId)}
                        size="sm"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Cantidad">
                      <Input
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(line.productId, { quantity: event.target.value })
                        }
                        value={line.quantity}
                      />
                    </Field>
                    <Field label="Precio">
                      <Input
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(line.productId, { unitPrice: event.target.value })
                        }
                        value={line.unitPrice}
                      />
                    </Field>
                    <Field label="Descuento">
                      <Input
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(line.productId, { discount: event.target.value })
                        }
                        value={line.discount}
                      />
                    </Field>
                    <Field label="Impuesto">
                      <Input
                        inputMode="decimal"
                        onChange={(event) =>
                          updateLine(line.productId, { tax: event.target.value })
                        }
                        value={line.tax}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            description="Busca un artículo y agrégalo para empezar."
            icon={ShoppingCart}
            title="Carrito vacío"
          />
        )}

        <div
          className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          data-testid="pos-totals"
        >
          <Total label="Subtotal" testId="pos-total-subtotal" value={totals.subtotal} />
          <Total label="Descuento" testId="pos-total-discount" value={totals.discount} />
          <Total label="Impuesto" testId="pos-total-tax" value={totals.tax} />
          <Total emphasis label="Total" testId="pos-total-total" value={totals.total} />
        </div>

        <p className="mt-4 text-xs text-slate-500">
          El cobro todavía no existe: esta pantalla arma la venta pero no la
          guarda.
        </p>
      </Card>
    </div>
  );
}

function Total({
  emphasis,
  label,
  testId,
  value,
}: {
  emphasis?: boolean;
  label: string;
  testId: string;
  value: number;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
      data-testid={testId}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={
          emphasis
            ? "mt-1 text-lg font-bold tabular-nums text-slate-900"
            : "mt-1 text-sm font-semibold tabular-nums text-slate-700"
        }
      >
        {formatPosAmount(value)}
      </p>
    </div>
  );
}
