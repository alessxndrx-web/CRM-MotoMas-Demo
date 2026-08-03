"use client";

import { Barcode, Pencil, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  createPosProductAction,
  updatePosProductAction,
} from "@/server/pos/actions";
import type { PosProductDTO } from "@/server/pos/shared";

/**
 * Patch POS1.0-B — catálogo del punto de venta (`/panel/pos/productos`).
 *
 * POS1.0-A dejó el modelo y `createPosProductAction`; faltaba todo lo demás:
 * editar, activar/desactivar, listar y buscar.
 *
 * ## Sin estados, y por qué eso simplifica
 *
 * Un producto no tiene flujo: no hay borrador que proteger ni transición que
 * respetar, así que cualquier campo se edita en cualquier momento. Lo que sí
 * tiene es `isActive`, y **desactivar es como el catálogo retira un artículo sin
 * borrarlo**: una línea de venta pasada lo referencia y la clave foránea es
 * `ON DELETE RESTRICT`. Borrar no es una opción que este modelo ofrezca.
 *
 * ## Lo que la pantalla excluye a propósito
 *
 * Inventario, proveedores y costo. Es un catálogo de venta: el precio que cobra
 * el mostrador y nada más.
 */
export function PosProductsPanel({
  canOperate,
  products,
  term,
}: {
  canOperate: boolean;
  products: PosProductDTO[];
  /** Término aplicado en el servidor; la búsqueda no filtra en el navegador. */
  term: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState(term);

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  }

  function applySearch(value: string) {
    // La búsqueda vive en la URL: el servidor la resuelve contra SKU, código de
    // barras y nombre, así que el resultado no depende de lo que el navegador
    // haya cargado.
    const query = value.trim();
    router.push(query ? `/panel/pos/productos?q=${encodeURIComponent(query)}` : "/panel/pos/productos");
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-slate-900">Catálogo POS</h1>
            <p className="mt-1 text-sm text-slate-500">
              Artículos que el mostrador puede vender. Sin inventario, sin
              proveedores y sin costo: solo el precio de venta.
            </p>
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Barcode className="h-5 w-5" />
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

        {canOperate ? (
          <CreateProductForm disabled={pending} onRun={run} />
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            Tu rol puede consultar el catálogo, no modificarlo.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-base font-bold text-slate-900">Productos</h2>
          <div className="flex items-end gap-2" data-testid="pos-search">
            <div className="w-64">
              <Field hint="SKU, código de barras o nombre." label="Buscar">
                <Input
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") applySearch(search);
                  }}
                  placeholder="Ej. CASCO-01"
                  value={search}
                />
              </Field>
            </div>
            <Button
              disabled={pending}
              onClick={() => applySearch(search)}
              size="sm"
              variant="secondary"
            >
              <Search className="h-4 w-4" />
              Buscar
            </Button>
            {term ? (
              <Button
                disabled={pending}
                onClick={() => {
                  setSearch("");
                  applySearch("");
                }}
                size="sm"
                variant="ghost"
              >
                Limpiar
              </Button>
            ) : null}
          </div>
        </div>

        {products.length ? (
          <div className="mt-4 space-y-3">
            {products.map((product) => (
              <div
                className="rounded-xl border border-slate-200 p-4"
                data-testid="pos-product-row"
                key={product.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={product.isActive ? "green" : "slate"}>
                        {product.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                      <span className="font-mono text-xs font-medium text-slate-600">
                        {product.sku}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        {product.name}
                      </span>
                    </div>
                    {product.barcode ? (
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {product.barcode}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="text-right text-sm font-semibold tabular-nums text-slate-900"
                    data-testid="pos-product-price"
                  >
                    {formatPosAmount(product.unitPrice)}
                  </div>
                </div>

                {canOperate && editingId === product.id ? (
                  <EditProductForm
                    disabled={pending}
                    onClose={() => setEditingId(null)}
                    onRun={run}
                    product={product}
                  />
                ) : null}

                {canOperate ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      disabled={pending}
                      onClick={() =>
                        setEditingId(editingId === product.id ? null : product.id)
                      }
                      size="sm"
                      variant="secondary"
                    >
                      {editingId === product.id ? (
                        <>
                          <X className="h-4 w-4" />
                          Cancelar
                        </>
                      ) : (
                        <>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </>
                      )}
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          updatePosProductAction({
                            productId: product.id,
                            isActive: !product.isActive,
                          }),
                        )
                      }
                      size="sm"
                      variant={product.isActive ? "ghost" : "success"}
                    >
                      {product.isActive ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            description={
              term
                ? "Ningún producto coincide con la búsqueda."
                : "Registra el primer artículo del catálogo."
            }
            icon={Barcode}
            title="Sin productos"
          />
        )}
      </Card>
    </div>
  );
}

function formatPosAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function parseAmount(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function CreateProductForm({
  disabled,
  onRun,
}: {
  disabled: boolean;
  onRun: (
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) => void;
}) {
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unitPrice, setUnitPrice] = useState("0");

  return (
    <div className="mt-6" data-testid="pos-product-create-form">
      <FormSection
        description="El SKU y el código de barras son únicos: la base de datos lo impone."
        title="Registrar producto"
      >
        <Field label="SKU" required>
          <Input onChange={(event) => setSku(event.target.value)} value={sku} />
        </Field>
        <Field label="Nombre" required>
          <Input onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field hint="Opcional." label="Código de barras">
          <Input
            onChange={(event) => setBarcode(event.target.value)}
            value={barcode}
          />
        </Field>
        <Field label="Precio" required>
          <Input
            inputMode="decimal"
            onChange={(event) => setUnitPrice(event.target.value)}
            value={unitPrice}
          />
        </Field>
      </FormSection>

      <div className="mt-4">
        <Button
          disabled={disabled || !sku.trim() || !name.trim()}
          onClick={() =>
            onRun(
              () =>
                createPosProductAction({
                  sku,
                  name,
                  unitPrice: parseAmount(unitPrice),
                  barcode: barcode || null,
                }),
              () => {
                setSku("");
                setName("");
                setBarcode("");
                setUnitPrice("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar producto
        </Button>
      </div>
    </div>
  );
}

function EditProductForm({
  disabled,
  onClose,
  onRun,
  product,
}: {
  disabled: boolean;
  onClose: () => void;
  onRun: (
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
  ) => void;
  product: PosProductDTO;
}) {
  const [sku, setSku] = useState(product.sku);
  const [name, setName] = useState(product.name);
  const [barcode, setBarcode] = useState(product.barcode ?? "");
  const [unitPrice, setUnitPrice] = useState(String(product.unitPrice));

  return (
    <div
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      data-testid="pos-product-editor"
    >
      <FormSection
        description="Un producto no tiene estados: cualquier campo se corrige en cualquier momento."
        title="Editar producto"
      >
        <Field label="SKU" required>
          <Input onChange={(event) => setSku(event.target.value)} value={sku} />
        </Field>
        <Field label="Nombre" required>
          <Input onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field hint="Opcional." label="Código de barras">
          <Input
            onChange={(event) => setBarcode(event.target.value)}
            value={barcode}
          />
        </Field>
        <Field label="Precio" required>
          <Input
            inputMode="decimal"
            onChange={(event) => setUnitPrice(event.target.value)}
            value={unitPrice}
          />
        </Field>
      </FormSection>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={disabled || !sku.trim() || !name.trim()}
          onClick={() =>
            onRun(
              () =>
                updatePosProductAction({
                  productId: product.id,
                  sku,
                  name,
                  unitPrice: parseAmount(unitPrice),
                  barcode: barcode || null,
                }),
              onClose,
            )
          }
          size="sm"
        >
          Guardar cambios
        </Button>
        <Button disabled={disabled} onClick={onClose} size="sm" variant="secondary">
          Cancelar
        </Button>
      </div>
    </div>
  );
}
