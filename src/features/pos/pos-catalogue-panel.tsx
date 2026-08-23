"use client";

import { Package, Search } from "lucide-react";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { searchPosProductsAction } from "@/server/pos/actions";
import type {
  PosLookupDTO,
  PosProductDTO,
  PosWarehouseDTO,
} from "@/server/pos/shared";

/**
 * Patch POS7.0-B — el catálogo **operativo**, que no es el administrativo.
 *
 * ## La diferencia, dicha una vez
 *
 * `/panel/pos/productos` da de alta artículos: SKU, costo, impuesto, umbrales,
 * unidad, estado. Es trabajo de quien administra el catálogo y se hace sentado.
 *
 * Esta pantalla responde a **una sola pregunta de mostrador**: «¿tenemos esto,
 * cuánto cuesta y cuánto queda?». Por eso no hay costo —el margen no es asunto
 * del cajero frente al cliente—, no hay umbrales, no hay estado y no hay
 * formulario. Meter aquí la administración habría vuelto a mezclar los dos
 * productos que POS2.4 separó.
 *
 * ## No duplica la búsqueda de la venta
 *
 * Llama a `searchPosProductsAction`, la misma acción que el terminal, con la
 * misma autorización de mostrador y el mismo filtro de categoría. **No agrega
 * al carrito**: el carrito vive en la pantalla de venta y no sobrevive a una
 * navegación, así que un botón «Agregar» aquí prometería algo que se perdería al
 * cambiar de pantalla.
 */
export function PosCataloguePanel({
  categories,
  warehouses,
  initialProducts,
  initialBalances,
}: {
  categories: PosLookupDTO[];
  warehouses: PosWarehouseDTO[];
  /**
   * El catálogo **ya pintado por el servidor**.
   *
   * Se recibe en vez de pedirse al montar: un mostrador abre esta pantalla para
   * mirar, y hacerle esperar un viaje al servidor para ver lo que el servidor
   * acababa de tener en la mano era latencia regalada. A partir de aquí, cada
   * filtro sí consulta.
   */
  initialProducts: PosProductDTO[];
  initialBalances: Record<string, number>;
}) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [warehouse, setWarehouse] = useState(warehouses[0]?.id ?? "");
  const [products, setProducts] = useState<PosProductDTO[]>(initialProducts);
  const [balances, setBalances] = useState<Record<string, number>>(initialBalances);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Una respuesta vieja no puede pisar una consulta nueva. */
  const token = useRef(0);

  async function load(nextTerm: string, nextCategory: string, nextWarehouse: string) {
    const mine = ++token.current;
    setLoading(true);
    setError(null);
    const result = await searchPosProductsAction({
      term: nextTerm,
      categoryId: nextCategory || undefined,
      warehouseId: nextWarehouse || undefined,
    });
    if (mine !== token.current) return;
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setProducts([]);
      setBalances({});
      return;
    }
    setProducts(result.products);
    setBalances(result.balances);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Field hint="SKU, código de barras o nombre." label="Buscar artículo">
              <Input
                className="h-11"
                data-testid="pos-catalogo-buscar"
                onChange={(event) => setTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void load(term, category, warehouse);
                }}
                placeholder="Escribe o escanea"
                value={term}
              />
            </Field>
          </div>
          <div className="min-w-[10rem]">
            <Field label="Categoría">
              <Select
                data-testid="pos-catalogo-categoria"
                onChange={(event) => {
                  const next = event.target.value;
                  setCategory(next);
                  void load(term, next, warehouse);
                }}
                value={category}
              >
                <option value="">Todas</option>
                {categories.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {warehouses.length ? (
            <div className="min-w-[10rem]">
              <Field hint="De qué bodega es el saldo." label="Bodega">
                <Select
                  data-testid="pos-catalogo-bodega"
                  onChange={(event) => {
                    const next = event.target.value;
                    setWarehouse(next);
                    void load(term, category, next);
                  }}
                  value={warehouse}
                >
                  {warehouses.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ) : null}
          <Button
            disabled={loading}
            onClick={() => void load(term, category, warehouse)}
            size="wide"
          >
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </div>
      </Card>

      {error ? (
        <Notice tone="danger">
          <span data-testid="pos-catalogo-error">{error}</span>
        </Notice>
      ) : null}

      {loading ? (
        <p
          className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500"
          role="status"
        >
          Cargando el catálogo…
        </p>
      ) : products.length ? (
        <>
          <p className="text-sm text-slate-500" data-testid="pos-catalogo-conteo">
            {products.length} artículo{products.length === 1 ? "" : "s"}
          </p>
          <div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            data-testid="pos-catalogo-lista"
          >
            {products.map((product) => {
              const known = Object.prototype.hasOwnProperty.call(
                balances,
                product.id,
              );
              const balance = balances[product.id] ?? 0;
              return (
                <div
                  className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4"
                  data-testid="pos-catalogo-articulo"
                  key={product.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs text-slate-500">
                      {product.sku}
                    </span>
                    {warehouse ? (
                      known ? (
                        <Badge tone={balance > 0 ? "green" : "red"}>
                          {formatQuantity(balance)} {product.unitLabel}
                        </Badge>
                      ) : (
                        <Badge tone="amber">Sin saldo abierto</Badge>
                      )
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold leading-snug text-slate-900">
                    {product.name}
                  </p>
                  {product.categoryName || product.brandName ? (
                    <p className="truncate text-xs text-slate-500">
                      {[product.brandName, product.categoryName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                  {/* El código de barras se enseña porque el cajero lo compara
                      con la etiqueta física cuando el lector no lee. */}
                  {product.barcode ? (
                    <p className="font-mono text-xs text-slate-400">
                      {product.barcode}
                    </p>
                  ) : null}
                  <p className="mt-auto text-lg font-bold tabular-nums text-slate-900">
                    {formatAmount(product.unitPrice)}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center">
          <Package aria-hidden className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-600">
            Ningún artículo coincide con este filtro.
          </p>
        </div>
      )}
    </div>
  );
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
