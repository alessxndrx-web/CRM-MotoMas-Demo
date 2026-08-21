"use client";

import {
  Check,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { QuantityInput } from "@/components/ui/fields";
import { Field } from "@/components/ui/form-section";
import { Notice } from "@/components/ui/feedback";
import {
  createPosHardware,
  readPrinterConfig,
} from "@/features/pos/pos-printer";
import { buildPosReceiptAction } from "@/server/pos/receipt-actions";
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
  /** Del catálogo. Una cantidad sin unidad no dice si son tres piezas o tres litros. */
  unitLabel: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  tax: string;
};

/**
 * Un número tecleado, o `null` si no lo es.
 *
 * **[R] Devolvía cero, y para el precio eso era vender gratis.** La cantidad y el
 * monto de pago se salvaban solos —el servidor rechaza una cantidad que no sea
 * mayor que cero y un pago que no lo sea—, pero **cero es un precio válido**, así
 * que un dedazo en el precio llegaba al servidor convertido en un dato correcto
 * y la venta se guardaba en cero. El navegador no debe inventar la cifra que el
 * servidor tenía que rechazar; este archivo ya lo decía de los pagos.
 */
function parseAmount(value: string): number | null {
  const clean = value.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Descuento e impuesto son opcionales: en blanco es cero, y eso sí es un dato. */
function parseOptionalAmount(value: string): number | null {
  return value.trim() === "" ? 0 : parseAmount(value);
}

/** Lo que la línea vale para el servidor, o `null` si todavía no vale nada. */
function linePayload(line: CartLine) {
  const quantity = parseAmount(line.quantity);
  const unitPrice = parseAmount(line.unitPrice);
  const discount = parseOptionalAmount(line.discount);
  const tax = parseOptionalAmount(line.tax);
  if (quantity === null || unitPrice === null || discount === null || tax === null) {
    return null;
  }
  return { quantity, unitPrice, discount, tax };
}

/** Para las vistas previas: lo que aún no es número se dibuja como cero. */
const preview = (value: string) => parseAmount(value) ?? 0;

function formatPosQuantity(value: number) {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);
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
  /**
   * Patch POS4.0 — la búsqueda tiene su propio estado de carga.
   *
   * No se reutiliza `pending`: ese es el de las mutaciones, y mezclarlos haría
   * que cobrar apagase el buscador y que buscar apagase el cobro.
   */
  const [searching, setSearching] = useState(false);
  /** Saldo por artículo en la bodega elegida. Sin clave = sin saldo abierto. */
  const [balances, setBalances] = useState<Record<string, number>>({});
  /**
   * Qué lineas tienen abierto el ajuste de precio.
   *
   * Precio, descuento e impuesto **siguen estando**: son capacidad probada del
   * mostrador. Lo que cambia es que dejan de ocupar cuatro campos permanentes
   * por linea, porque la operacion de todos los dias es la cantidad y no ellos.
   */
  const [adjusting, setAdjusting] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  /**
   * Generación de la petición.
   *
   * **Una respuesta vieja no puede pisar una búsqueda nueva.** Es el fallo que
   * de verdad importa en un mostrador: se escanea A, se escanea B, y la
   * respuesta de A llega después y deja a A en pantalla como si fuera B.
   */
  const searchToken = useRef(0);
  /**
   * La referencia va al **contenedor**, no al campo.
   *
   * `Input` no reenvía `ref` —su tipo no lo declara— y ensancharlo sería tocar el
   * sistema de diseño para una necesidad de esta pantalla. El contenedor
   * `pos-search` tiene exactamente un `input`, así que basta con él. Queda
   * anotado: que una primitiva de campo no se pueda enfocar por código es un
   * hueco real para una aplicación que se opera con teclado.
   */
  const searchBoxRef = useRef<HTMLDivElement>(null);
  /**
   * Patch POS5.0 — la identidad del intento de cobro en curso.
   *
   * **Nace con el primer cobro de este carrito y sobrevive a sus reintentos.**
   * Si la red se corta y el navegador reenvía, o si el cajero vuelve a pulsar
   * porque vio un error, el servidor reconoce el mismo intento y devuelve la
   * venta que ya existía en vez de crear otra.
   *
   * **Se descarta solo cuando la venta se registra.** El siguiente cliente
   * empieza con una clave nueva; un fallo, en cambio, la conserva, porque
   * reintentar ese mismo cobro sigue siendo el mismo cobro.
   *
   * Vive en una referencia y no en estado: cambiarla no debe repintar nada.
   */
  const checkoutKeyRef = useRef<string | null>(null);
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
  // Patch POS2.6. El id permite reimprimir sin volver a buscar la venta.
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [printState, setPrintState] = useState<
    { tone: "pending" | "ok" | "error"; text: string } | null
  >(null);
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
          quantity: preview(line.quantity),
          unitPrice: preview(line.unitPrice),
          discount: preview(line.discount),
          tax: preview(line.tax),
        })),
      ),
    [lines],
  );

  /** El buscador es el dispositivo principal: siempre vuelve a él. */
  function focusSearch() {
    searchBoxRef.current?.querySelector("input")?.focus();
  }

  // El terminal abre listo para escanear. `autoFocus` lo hace en el primer
  // pintado; esto lo asegura también cuando el componente se remonta.
  useEffect(() => {
    // Solo al montar: enfocar en cada renderizado le robaría el foco al cajero.
    focusSearch();
  }, []);

  /**
   * Patch POS4.0 — buscar, y si no hay ambigüedad, agregar.
   *
   * **La regla del alta automática es la del servidor, no una nueva.**
   * `searchPosProducts` resuelve SKU y código de barras por igualdad exacta; si
   * de esa igualdad sale **un solo** artículo, lo tecleado no puede referirse a
   * otra cosa. Por nombre nunca: «casco» describe muchos artículos y elegir uno
   * sería inventar una preferencia.
   *
   * Los resultados se vacían **al empezar**, no al terminar: dejar el artículo
   * anterior en pantalla mientras viaja la consulta es lo que permitía agregar
   * el equivocado.
   */
  async function runSearch(rawTerm: string, warehouseId: string) {
    const token = ++searchToken.current;
    setError(null);
    setResults([]);
    setBalances({});
    setSearched(false);
    setSearching(true);

    const result = await searchPosProductsAction({
      term: rawTerm,
      warehouseId: warehouseId || undefined,
    });

    // Llegó tarde: otra búsqueda ya la sustituyó.
    if (token !== searchToken.current) return;
    setSearching(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    const clean = rawTerm.trim().toLowerCase();
    const only = result.products.length === 1 ? result.products[0] : null;
    const exact =
      clean.length > 0 &&
      only !== undefined &&
      only !== null &&
      (only.sku.toLowerCase() === clean ||
        (only.barcode?.toLowerCase() ?? "") === clean);

    if (exact && only) {
      // Escaneo inequívoco: entra solo y el buscador queda limpio y enfocado
      // para la siguiente lectura. Repetir el mismo código sigue sumando
      // cantidad, porque `addProduct` no cambia.
      addProduct(only);
      setTerm("");
      focusSearch();
      return;
    }

    setResults(result.products);
    setBalances(result.balances);
    setSearched(true);
  }

  function search() {
    void runSearch(term, effectiveWarehouse);
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
          quantity: String(preview(line.quantity) + 1),
        };
        return next;
      }
      return [
        ...current,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          unitLabel: product.unitLabel,
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
        payments.map((payment) => ({ amount: preview(payment.amount) })),
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
  /** La clave del intento en curso, creándola si este carrito aún no la tenía. */
  function checkoutKey() {
    checkoutKeyRef.current ??= crypto.randomUUID();
    return checkoutKeyRef.current;
  }

  function checkout() {
    setError(null);
    setLastSale(null);

    // **Nada sale del navegador con una cifra inventada.** Antes el precio ilegible
    // viajaba como cero y el servidor lo aceptaba, porque cero es un precio.
    const invalid = lines.find((line) => linePayload(line) === null);
    if (invalid) {
      setError(
        `Revisa la cantidad y el precio de ${invalid.name}: hay un valor que no es un número.`,
      );
      return;
    }

    startTransition(async () => {
      const result = await checkoutPosSaleAction({
        // Patch POS5.0 — **la sucursal ya no viaja**: la pone la sesión en el
        // servidor. Mandarla era la superficie que permitía cobrar en otra.
        idempotencyKey: checkoutKey(),
        warehouseId: effectiveWarehouse,
        customerId: customer?.id ?? null,
        notes: notes || null,
        lines: lines.map((line) => ({
          productId: line.productId,
          // `linePayload` ya se comprobó línea por línea justo arriba.
          ...(linePayload(line) ?? { quantity: 0, unitPrice: 0, discount: 0, tax: 0 }),
        })),
        // Se descarta la fila **vacía** —agregada y no rellenada—, nunca un
        // monto tecleado: si dice algo que no es un número, el servidor debe
        // rechazarlo. Filtrar por `> 0` borraría "abc" sin avisar.
        payments: payments
          .filter((payment) => payment.amount.trim() !== "")
          .map((payment) => ({
            method: payment.method,
            // Se manda tal cual lo tecleado: un monto ilegible llega como cero y
            // el servidor lo rechaza, que es lo que esta pantalla quiere. Para el
            // precio no servía, porque cero sí es un precio.
            amount: preview(payment.amount),
          })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // El carrito deja de ser la fuente de verdad en cuanto la venta existe, y
      // el intento se da por cerrado: el siguiente cliente estrena clave.
      checkoutKeyRef.current = null;
      setLines([]);
      setPayments([]);
      setCustomer(null);
      setCustomerTerm("");
      setCustomers([]);
      setNotes("");
      setLastSale(result.saleNumber);
      setLastSaleId(result.saleId);
      // Patch POS4.0 — el mostrador queda listo para el siguiente cliente sin
      // tocar el ratón. El botón de cobro ya no puede repetirse: sin líneas
      // está deshabilitado, y el servidor sigue siendo la última palabra.
      setResults([]);
      setBalances({});
      setSearched(false);
      setTerm("");
      focusSearch();
      router.refresh();

      /*
       * Patch POS2.6 — la impresión ocurre **después** de que la venta existe, y
       * fuera de su suerte.
       *
       * La venta ya está confirmada: mercancía descontada, pagos registrados.
       * Que la impresora falle no puede deshacer nada de eso, ni provocar un
       * reintento del cobro — reintentar sería duplicar la venta, que es el peor
       * fallo posible en un mostrador.
       *
       * Por eso el error de impresión vive en su propio estado y con su propio
       * mensaje, separado de `error`, que es el del cobro.
       */
      void printReceiptFor(result.saleId);
    });
  }

  /** Imprime un recibo ya persistido. Nunca toca la venta. */
  function printReceiptFor(saleId: string) {
    const config = readPrinterConfig();
    if (!config.enabled) return Promise.resolve();

    setPrintState({ tone: "pending", text: "Imprimiendo recibo…" });
    return buildPosReceiptAction({ saleId, paperWidth: config.paperWidth })
      .then(async (receipt) => {
        if (!receipt.ok) {
          setPrintState({ tone: "error", text: receipt.error });
          return;
        }
        const result = await createPosHardware(config).printReceipt(receipt.job);
        setPrintState(
          result.ok
            ? { tone: "ok", text: "Recibo impreso." }
            : { tone: "error", text: result.message },
        );
      })
      .catch(() => {
        // **Ningún interno llega al cajero.** Y la venta sigue siendo válida.
        setPrintState({
          tone: "error",
          text: "La venta quedó registrada, pero el recibo no se pudo imprimir.",
        });
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
      {/*
        Patch POS4.0 — el terminal en dos columnas.
        A la izquierda se busca; a la derecha vive la transaccion, y se queda a
        la vista mientras la lista de resultados se desplaza. Por debajo de `lg`
        se apila: un mostrador tambien se opera desde un telefono.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div className="space-y-6">
      <Card className="p-6">
        {error ? (
          <Notice className="mb-5" tone="danger">
            <span data-testid="pos-error">{error}</span>
          </Notice>
        ) : null}

        <div
          className="flex flex-wrap items-end gap-2"
          data-testid="pos-search"
          ref={searchBoxRef}
        >
          <div className="min-w-[16rem] flex-1">
            <Field hint="SKU, código de barras o nombre." label="Buscar artículo">
              <Input
                autoFocus
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") search();
                }}
                placeholder="Escanea o escribe"
                value={term}
              />
            </Field>
          </div>
          <Button disabled={searching} onClick={search} size="sm" variant="secondary">
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </div>

        {searching ? (
          <p
            className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500"
            data-testid="pos-buscando"
            role="status"
          >
            Buscando…
          </p>
        ) : searched ? (
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
                    {/*
                      Patch POS4.0 — el saldo, donde se decide.
                      **Informativo: no bloquea nada.** P-8 sigue sin responderse
                      y esta pantalla no la inventa; lo que hace es que el cajero
                      no descubra al cobrar que el artículo no tenía saldo.
                    */}
                    {effectiveWarehouse ? (
                      <span data-testid="pos-result-balance">
                        {Object.prototype.hasOwnProperty.call(
                          balances,
                          product.id,
                        ) ? (
                          <Badge
                            tone={
                              (balances[product.id] ?? 0) > 0 ? "green" : "red"
                            }
                          >
                            {formatPosQuantity(balances[product.id] ?? 0)}{" "}
                            {product.unitLabel}
                          </Badge>
                        ) : (
                          <Badge tone="amber">Sin saldo abierto</Badge>
                        )}
                      </span>
                    ) : null}
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
        </div>

        <div className="space-y-6 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <Card className="p-6">
        <h2 className="text-base font-bold text-slate-900">Carrito</h2>

        {lines.length ? (
          <div className="mt-4 space-y-3">
            {lines.map((line) => {
              const lineTotal = calculatePosLineTotal({
                quantity: preview(line.quantity),
                unitPrice: preview(line.unitPrice),
                discount: preview(line.discount),
                tax: preview(line.tax),
              });
              const notNumber = "No es un número.";
              const badQuantity = parseAmount(line.quantity) === null;
              const badPrice = parseAmount(line.unitPrice) === null;
              const badDiscount = parseOptionalAmount(line.discount) === null;
              const badTax = parseOptionalAmount(line.tax) === null;
              // El ajuste se abre si el cajero lo pide, o si hay algo que
              // corregir dentro: un error escondido no se puede arreglar.
              const open =
                adjusting.includes(line.productId) ||
                badPrice ||
                badDiscount ||
                badTax;
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
                        {formatPosQuantity(preview(line.quantity))} x {line.name}
                      </span>
                      {/* La unidad acompana siempre: tres piezas y tres litros
                          no son la misma venta. */}
                      <span className="text-xs text-slate-500">
                        ({line.unitLabel})
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

                  <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                    <div className="w-full max-w-[14rem]">
                      {/*
                        **El rótulo no es un `<label>` envolvente.** `Field` lo es,
                        y un `<label>` que envuelve a `QuantityInput` se asocia al
                        primer control etiquetable de dentro —el botón «Restar»—,
                        con lo que «Cantidad» dejaría de nombrar al campo. El
                        nombre accesible se pone donde tiene que estar.
                      */}
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">
                        Cantidad
                      </span>
                      <QuantityInput
                        aria-invalid={badQuantity || undefined}
                        aria-label="Cantidad"
                        min={1}
                        onValueChange={(value) =>
                          updateLine(line.productId, { quantity: value })
                        }
                        unit={line.unitLabel}
                        value={line.quantity}
                      />
                      {badQuantity ? (
                        <span className="mt-1 block text-xs text-red-600">
                          {notNumber}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      aria-expanded={open}
                      data-testid="pos-line-ajustar"
                      onClick={() =>
                        setAdjusting((current) =>
                          current.includes(line.productId)
                            ? current.filter((id) => id !== line.productId)
                            : [...current, line.productId],
                        )
                      }
                      size="sm"
                      variant="ghost"
                    >
                      <SlidersHorizontal aria-hidden className="h-4 w-4" />
                      Ajustar precio
                    </Button>
                  </div>

                  {open ? (
                    <div
                      className="mt-3 grid gap-3 sm:grid-cols-3"
                      data-testid="pos-line-ajuste"
                    >
                      <Field error={badPrice ? notNumber : undefined} label="Precio">
                        <Input
                          aria-invalid={badPrice || undefined}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateLine(line.productId, { unitPrice: event.target.value })
                          }
                          value={line.unitPrice}
                        />
                      </Field>
                      <Field error={badDiscount ? notNumber : undefined} label="Descuento">
                        <Input
                          aria-invalid={badDiscount || undefined}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateLine(line.productId, { discount: event.target.value })
                          }
                          value={line.discount}
                        />
                      </Field>
                      <Field error={badTax ? notNumber : undefined} label="Impuesto">
                        <Input
                          aria-invalid={badTax || undefined}
                          inputMode="decimal"
                          onChange={(event) =>
                            updateLine(line.productId, { tax: event.target.value })
                          }
                          value={line.tax}
                        />
                      </Field>
                    </div>
                  ) : null}
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

        {/*
          Patch POS2.6 — el estado del recibo, **separado del de la venta**.
          Que el papel falle no pone en duda el cobro, y mezclarlos en un solo
          aviso invitaría a repetir la venta.
        */}
        {printState ? (
          <Notice
            className="mt-3"
            onDismiss={() => setPrintState(null)}
            tone={
              printState.tone === "ok"
                ? "success"
                : printState.tone === "error"
                  ? "warning"
                  : "info"
            }
          >
            <span data-testid="pos-recibo-estado">{printState.text}</span>
            {printState.tone === "error" && lastSaleId ? (
              <Button
                className="ml-3"
                data-testid="pos-recibo-reimprimir"
                onClick={() => void printReceiptFor(lastSaleId)}
                size="sm"
                variant="secondary"
              >
                Reintentar impresión
              </Button>
            ) : null}
          </Notice>
        ) : null}

        {lastSaleId && !printState ? (
          <div className="mt-3">
            <Button
              data-testid="pos-recibo-imprimir"
              onClick={() => void printReceiptFor(lastSaleId)}
              size="sm"
              variant="secondary"
            >
              Imprimir recibo
            </Button>
          </div>
        ) : null}

        {branches.length ? (
          <div className="mt-4 max-w-xs" data-testid="pos-branch">
            <Field
              hint="Tu rol es global: indica en qué mostrador se registra la venta."
              label="Sucursal"
              required
            >
              <Select
                data-testid="pos-branch-select"
                onChange={(event) => setBranch(event.target.value)}
                value={branch}
              >
                {branches.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <div className="mt-4 max-w-xs" data-testid="pos-warehouse">
          <Field
            hint="De aquí se descuentan las existencias."
            label="Bodega"
            required
          >
            <Select
              data-testid="pos-warehouse-select"
              onChange={(event) => {
                const next = event.target.value;
                setWarehouse(next);
                // El saldo mostrado es el de **esta** bodega: si cambia, lo que
                // hay en pantalla deja de ser cierto y se vuelve a preguntar.
                if (searched && term.trim()) void runSearch(term, next);
              }}
              value={effectiveWarehouse}
            >
              {availableWarehouses.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
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
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
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
                Patch POS4.0 — el caso de todos los días, en un pulso.
                **Solo rellena el campo.** No persiste efectivo entregado ni
                cambio, no toca la semántica del pago y no renombra el
                sobrecobro: P-1 sigue sin responderse y esta pantalla no la
                responde por nadie.
              */}
              <Button
                data-testid="pos-pago-exacto"
                disabled={totals.total <= 0}
                onClick={() =>
                  setPayments((current) => {
                    const exact = String(totals.total);
                    if (!current.length) {
                      return [
                        {
                          id: `${Date.now()}-exacto`,
                          method: "EFECTIVO",
                          amount: exact,
                        },
                      ];
                    }
                    return current.map((item, index) =>
                      index === 0 ? { ...item, amount: exact } : item,
                    );
                  })
                }
                size="sm"
                variant="secondary"
              >
                Importe exacto
              </Button>
            </div>

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

        </div>
      </div>

      {/* Secundario: informa, no opera. Cerrado por omision para no robarle
          altura a la venta en curso. */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Últimas ventas</h2>
          <Button
            aria-expanded={showRecent}
            data-testid="pos-ultimas-ventas"
            onClick={() => setShowRecent((value) => !value)}
            size="sm"
            variant="ghost"
          >
            {showRecent ? "Ocultar" : `Ver ${recentSales.length}`}
          </Button>
        </div>
        {!showRecent ? null : recentSales.length ? (
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
