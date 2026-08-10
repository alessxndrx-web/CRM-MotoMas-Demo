"use client";

import { Check, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/form-section";
import { Notice } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  checkoutPosSaleAction,
  searchPosCustomersAction,
  searchPosProductsAction,
} from "@/server/pos/actions";
import {
  calculatePosLineTotal,
  calculatePosPaidTotal,
  calculatePosSaleTotals,
  posPaymentMethodLabels,
  posPaymentMethodValues,
  type PosProductDTO,
  type PosSaleDTO,
  type PosWarehouseDTO,
} from "@/server/pos/shared";

/**
 * Patch POS1.0-C — carrito del punto de venta (`/panel/pos/venta`).
 * Patch POS1.0-D — el cobro, que lo convierte en una venta persistida.
 *
 * ## El carrito vive en el navegador hasta el cobro
 *
 * Mientras se arma, nada se escribe: un mostrador corrige cantidades y quita
 * líneas en segundos, y persistir cada pulsación llenaría la base de borradores
 * abandonados. **Recargar antes de cobrar lo vacía, a propósito.** El cobro es
 * la frontera: ahí, y solo ahí, nacen `PosSale`, sus líneas y sus pagos, en una
 * sola transacción.
 *
 * ## Los pagos se capturan en el cobro, no mientras se arma
 *
 * Si vivieran en el carrito, una venta abandonada dejaría pagos huérfanos que
 * nadie podría conciliar ni revertir. Hasta el cobro no hay nada que auditar.
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

type CartPayment = { id: string; method: string; amount: string };

export function PosCartPanel({
  branchCode,
  branches,
  warehouses,
  canOperate,
  recentSales,
}: {
  /** Sucursal de la sesión, o `null` para un rol global. */
  branchCode: string | null;
  /**
   * Solo un rol global recibe opciones: quien tiene sucursal cobra en la suya y
   * no puede equivocarse de mostrador. Mismo criterio que `caja/page.tsx`.
   */
  branches: Array<{ code: string; name: string }>;
  /**
   * Patch POS1.1-E — bodegas de las que el cobro puede descontar.
   *
   * **La bodega se elige, no se deduce.** Una sucursal puede tener varias y
   * `PosSale` no guarda ninguna, así que elegir por el cajero —"la primera
   * activa"— sería inventar una regla de selección que el repositorio no tiene.
   * Sin bodegas no se puede cobrar, y la pantalla lo dice.
   */
  warehouses: PosWarehouseDTO[];
  canOperate: boolean;
  /** Ventas ya persistidas, leídas por la capa de consultas. */
  recentSales: PosSaleDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PosProductDTO[]>([]);
  const [searched, setSearched] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<CartPayment[]>([]);
  const [customerTerm, setCustomerTerm] = useState("");
  const [customers, setCustomers] = useState<
    Array<{ id: string; name: string; phone: string | null }>
  >([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [lastSale, setLastSale] = useState<string | null>(null);
  const [branch, setBranch] = useState(branchCode ?? branches[0]?.code ?? "");
  const [warehouse, setWarehouse] = useState("");

  /**
   * Patch POS1.1-E. **Las bodegas se filtran por la sucursal elegida.**
   *
   * El servidor rechaza consumir de una bodega de otra sucursal, y con razón:
   * sería mover existencias entre sucursales sin traslado. Ofrecer bodegas
   * ajenas en la lista solo serviría para que el cajero eligiera algo que va a
   * fallar. Los dos selectores no pueden contradecirse porque uno depende del
   * otro.
   */
  const availableWarehouses = useMemo(
    () => warehouses.filter((option) => option.branchCode === branch),
    [warehouses, branch],
  );

  // Cambiar de sucursal invalida la bodega elegida: se pasa a la primera de la
  // nueva, o a ninguna si esa sucursal no tiene.
  const firstAvailable = availableWarehouses[0]?.id ?? "";
  const warehouseIsValid = availableWarehouses.some(
    (option) => option.id === warehouse,
  );
  const effectiveWarehouse = warehouseIsValid ? warehouse : firstAvailable;

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

  /**
   * Patch POS2.5 — en qué situación está la asignación de pagos.
   *
   * Se deriva de los mismos totales que ya calcula la pantalla; **no es una
   * segunda aritmética**. El servidor sigue siendo la autoridad: recalcula el
   * total desde las líneas y no confía en lo que llegue del navegador.
   *
   * La comparación redondea a céntimos antes de decidir «exacto»: con decimales
   * de tres cifras en las cantidades, un resto de 0,000001 no es una diferencia
   * que el cajero deba ver.
   */
  const paidTotal = useMemo(
    () =>
      calculatePosPaidTotal(
        payments.map((payment) => ({ amount: parseAmount(payment.amount) })),
      ),
    [payments],
  );

  const paymentState = useMemo(() => {
    if (payments.length === 0) {
      return { tone: "none" as const, label: "Sin pagos registrados." };
    }
    // Céntimos enteros: comparar flotantes decidiría «corto» por un residuo.
    const diff = Math.round((totals.total - paidTotal) * 100);
    if (diff === 0) return { tone: "exact" as const, label: "Cobro exacto." };
    if (diff > 0) {
      return {
        tone: "short" as const,
        label: `Faltan ${formatPosAmount(diff / 100)} por cobrar.`,
      };
    }
    return {
      tone: "over" as const,
      label: `El cobro supera el total en ${formatPosAmount(-diff / 100)}.`,
    };
  }, [payments.length, totals.total, paidTotal]);

  function searchCustomers() {
    setError(null);
    startTransition(async () => {
      const result = await searchPosCustomersAction({ term: customerTerm });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCustomers(result.customers);
    });
  }

  /**
   * El cobro. Envía las líneas y los pagos; **no envía totales**: el servidor
   * los recalcula desde las líneas, así que no existe cifra que un navegador
   * manipulado pueda imponer.
   */
  function checkout() {
    setError(null);
    setLastSale(null);
    startTransition(async () => {
      const result = await checkoutPosSaleAction({
        branchCode: branch,
        warehouseId: effectiveWarehouse,
        customerId: customer?.id ?? null,
        notes: notes || null,
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: parseAmount(line.quantity),
          unitPrice: parseAmount(line.unitPrice),
          discount: parseAmount(line.discount),
          tax: parseAmount(line.tax),
        })),
        // Se descarta la fila **vacía** —agregada y no rellenada—, nunca un
        // monto tecleado: si dice algo que no es un número, el servidor debe
        // rechazarlo. Filtrar por `> 0` borraría "abc" sin avisar.
        payments: payments
          .filter((payment) => payment.amount.trim() !== "")
          .map((payment) => ({
            method: payment.method,
            amount: parseAmount(payment.amount),
          })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // El carrito deja de ser la fuente de verdad en cuanto la venta existe.
      setLines([]);
      setPayments([]);
      setCustomer(null);
      setCustomerTerm("");
      setCustomers([]);
      setNotes("");
      setLastSale(result.saleNumber);
      router.refresh();
    });
  }

  // Patch POS2.2. El título lo pone `PageHeader` desde la página; aquí queda el
  // motivo, con marca propia para que la denegación se pueda comprobar.
  if (!canOperate) {
    return (
      <Card className="p-6">
        <Notice tone="warning">
          <span data-testid="pos-denied">
            Tu rol no puede operar el punto de venta.
          </span>
        </Notice>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        {error ? (
          <Notice className="mb-5" tone="danger">
            <span data-testid="pos-error">{error}</span>
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-end gap-2" data-testid="pos-search">
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

      </Card>

      <Card className="p-6" data-testid="pos-checkout">
        <h2 className="text-base font-bold text-slate-900">Cobro</h2>

        {lastSale ? (
          <Notice className="mt-4" tone="success">
            <span data-testid="pos-sale-created">
              Venta registrada: <strong>{lastSale}</strong>
            </span>
          </Notice>
        ) : null}

        {branches.length ? (
          <div className="mt-4 max-w-xs" data-testid="pos-branch">
            <Field
              hint="Tu rol es global: indica en qué mostrador se registra la venta."
              label="Sucursal"
              required
            >
              <select
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                onChange={(event) => setBranch(event.target.value)}
                value={branch}
              >
                {branches.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : null}

        <div className="mt-4 max-w-xs" data-testid="pos-warehouse">
          <Field
            hint="De aquí se descuentan las existencias."
            label="Bodega"
            required
          >
            <select
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              onChange={(event) => setWarehouse(event.target.value)}
              value={effectiveWarehouse}
            >
              {availableWarehouses.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
          {availableWarehouses.length ? null : (
            <p className="mt-2 text-xs text-amber-700">
              Esta sucursal no tiene bodegas activas: sin una bodega de la que
              descontar, el cobro no puede registrarse.
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="flex items-end gap-2" data-testid="pos-customer-search">
              <div className="flex-1">
                <Field hint="Opcional. Nombre o teléfono." label="Cliente">
                  <Input
                    onChange={(event) => setCustomerTerm(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") searchCustomers();
                    }}
                    value={customerTerm}
                  />
                </Field>
              </div>
              <Button
                disabled={pending}
                onClick={searchCustomers}
                size="sm"
                variant="secondary"
              >
                Buscar cliente
              </Button>
            </div>

            {customer ? (
              <p
                className="mt-2 text-sm text-slate-700"
                data-testid="pos-customer-selected"
              >
                Cliente: <strong>{customer.name}</strong>
                <button
                  className="ml-2 text-xs text-blue-600 underline"
                  onClick={() => setCustomer(null)}
                  type="button"
                >
                  quitar
                </button>
              </p>
            ) : customers.length ? (
              <div className="mt-2 space-y-1" data-testid="pos-customer-results">
                {customers.map((option) => (
                  <button
                    className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                    key={option.id}
                    onClick={() => setCustomer({ id: option.id, name: option.name })}
                    type="button"
                  >
                    {option.name}
                    {option.phone ? ` · ${option.phone}` : ""}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-3">
              <Field hint="Opcional." label="Notas">
                <Input
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </Field>
            </div>
          </div>

          <div data-testid="pos-payments">
            <p className="text-sm font-semibold text-slate-700">Pagos</p>
            {payments.map((payment, index) => (
              // Anchos flexibles, no fijos: un mostrador cobra desde el
              // teléfono y `w-40 + w-36 + botón` no cabe en 390 px.
              <div className="mt-2 flex flex-wrap items-end gap-2" key={payment.id}>
                <div className="min-w-[8rem] flex-1">
                  <Field label={`Forma ${index + 1}`}>
                    <Select
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((item) =>
                            item.id === payment.id
                              ? { ...item, method: event.target.value }
                              : item,
                          ),
                        )
                      }
                      value={payment.method}
                    >
                      {posPaymentMethodValues.map((value) => (
                        <option key={value} value={value}>
                          {posPaymentMethodLabels[value]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="min-w-[7rem] flex-1">
                  <Field label={`Monto ${index + 1}`}>
                    <Input
                      inputMode="decimal"
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((item) =>
                            item.id === payment.id
                              ? { ...item, amount: event.target.value }
                              : item,
                          ),
                        )
                      }
                      value={payment.amount}
                    />
                  </Field>
                </div>
                <Button
                  aria-label={`Quitar pago ${index + 1}`}
                  onClick={() =>
                    setPayments((current) =>
                      current.filter((item) => item.id !== payment.id),
                    )
                  }
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              className="mt-2"
              onClick={() =>
                setPayments((current) => [
                  ...current,
                  {
                    id: `${Date.now()}-${current.length}`,
                    method: "EFECTIVO",
                    amount: "",
                  },
                ])
              }
              size="sm"
              variant="secondary"
            >
              <Plus className="h-4 w-4" />
              Agregar pago
            </Button>

            {/*
              Patch POS2.5 — el estado de la asignación, **dicho con palabras**.
              El importe pagado y el saldo ya estaban; lo que faltaba era que el
              cajero pudiera leer de un vistazo si el cobro queda corto, exacto o
              sobrado sin restar mentalmente. `role="status"` lo anuncia a quien
              no lo ve, y el estado nunca se comunica solo con color.

              **No bloquea el cobro.** Que una venta pueda cerrarse sin cubrir el
              total sigue siendo P-1, una decisión de negocio que el repositorio
              no ha tomado; esta pantalla la informa, no la inventa.
            */}
            <div className="mt-3 space-y-1" data-testid="pos-paid" role="status">
              <p className="text-sm tabular-nums text-slate-600">
                Total {formatPosAmount(totals.total)} · Pagado{" "}
                {formatPosAmount(paidTotal)} · Saldo{" "}
                <span data-testid="pos-balance">
                  {formatPosAmount(totals.total - paidTotal)}
                </span>
              </p>
              <p
                className={
                  paymentState.tone === "short"
                    ? "text-sm font-medium text-amber-700"
                    : paymentState.tone === "over"
                      ? "text-sm font-medium text-blue-700"
                      : paymentState.tone === "exact"
                        ? "text-sm font-medium text-emerald-700"
                        : "text-sm text-slate-500"
                }
                data-testid="pos-estado-pago"
              >
                {paymentState.label}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <Button
            disabled={pending || !lines.length || !branch || !effectiveWarehouse}
            onClick={checkout}
            size="sm"
          >
            <Check className="h-4 w-4" />
            Cobrar y registrar venta
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-bold text-slate-900">Últimas ventas</h2>
        {recentSales.length ? (
          <div className="mt-4 space-y-2">
            {recentSales.map((sale) => (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3"
                data-testid="pos-sale-row"
                key={sale.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="green">{sale.statusLabel}</Badge>
                  <span className="font-mono text-xs text-slate-600">
                    {sale.saleNumber}
                  </span>
                  {sale.customerName ? (
                    <span className="text-sm text-slate-700">
                      {sale.customerName}
                    </span>
                  ) : null}
                </div>
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {formatPosAmount(sale.total)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Todavía no hay ventas registradas.
          </p>
        )}
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
