"use client";

import { Barcode, Pencil, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { StatusBadge, defineStatuses } from "@/components/ui/status";
import { FilterBar } from "@/components/ui/toolbar";
import {
  createPosProductAction,
  updatePosProductAction,
} from "@/server/pos/actions";
import {
  posProductUnitLabels,
  posProductUnitValues,
  type PosProductDTO,
  type PosProductUnitValue,
} from "@/server/pos/shared";

const RUTA = "/panel/pos/productos";

/**
 * `""` es «todos»: el catálogo enseña lo retirado salvo que se pida lo contrario.
 *
 * **El contrato de la URL lo posee la ruta, no este módulo.** Es la ruta quien
 * lee `searchParams` y quien acota lo que llega de fuera, así que los tamaños
 * de página se declaran allí y bajan como prop. Exportarlos desde aquí no es
 * solo una cuestión de gusto: un `"use client"` no puede prestarle valores al
 * servidor — Next los sustituye por referencias de cliente, y el servidor
 * recibe un objeto sin los métodos del array. Un `type` sí viaja, porque se
 * borra al compilar.
 */
export type PosCatalogueStatus = "" | "activo" | "inactivo";

/**
 * El diccionario de estados del catálogo.
 *
 * Vive aquí y no repartido entre la insignia y el filtro: son el mismo hecho
 * dicho en dos sitios, y dos listas de rótulos es como se llega a que la tabla
 * diga «Activo» y el filtro «Habilitado».
 */
const productStatus = defineStatuses({
  activo: { label: "Activo", tone: "success" },
  inactivo: {
    label: "Inactivo",
    tone: "neutral",
    hint: "Retirado del mostrador; no se puede vender",
  },
});

/**
 * Patch POS1.0-B — catálogo del punto de venta (`/panel/pos/productos`).
 *
 * ## Sin estados, y por qué eso simplifica
 *
 * Un producto no tiene flujo: no hay borrador que proteger ni transición que
 * respetar, así que cualquier campo se edita en cualquier momento. Lo que sí
 * tiene es `isActive`, y **desactivar es como el catálogo retira un artículo sin
 * borrarlo**: una línea de venta pasada lo referencia y la clave foránea es
 * `ON DELETE RESTRICT`. Borrar no es una opción que este modelo ofrezca.
 *
 * ## Qué es esta pantalla, y qué no
 *
 * Es la pantalla de **datos maestros** del artículo. Escribe lo que identifica al
 * producto y los valores por defecto que otros contextos leen; **no escribe
 * existencias**. El saldo vive en `PosInventory`, por bodega, y se opera desde
 * `/pos/inventario`: `pos_products` no tiene —ni debe tener— columna de
 * cantidad, y el smoke de POS1.1-A lo verifica contra `information_schema`.
 *
 * Deliberadamente fuera, con su frontera declarada:
 *
 * - **`cost`** — dato de compras y costeo. Se guarda desde POS1.1-A y **nadie lo
 *   lee**; exponerlo junto al precio invitaría a pintar un margen que este
 *   repositorio no ha decidido cómo calcular.
 * - **`defaultTaxRate`** — es **P-6**. Nada deriva impuesto de él: el cobro toma
 *   el importe línea por línea. Un campo de tasa en pantalla haría creer que el
 *   mostrador la aplica, y no la aplica.
 * - **Categoría y marca** — son datos maestros del catálogo, pero sus tablas no
 *   tienen todavía pantalla de administración. Un selector permanentemente vacío
 *   es peor que ningún selector.
 *
 * ## Lo que sí escribe, porque alguien lo lee
 *
 * La **unidad** aparece en cada saldo y en cada movimiento de `/pos/inventario`;
 * sin poder declararla, todo el catálogo era «Unidad» y un artículo que se vende
 * en litros no podía decirlo. Los **umbrales** son los que `stockStateOf`
 * compara para marcar «Bajo mínimo» y «Reponer»: sin poder declararlos, dos de
 * los cuatro estados de existencia no podían ocurrir nunca.
 */
export function PosProductsPanel({
  canOperate,
  products,
  term,
  status,
  page,
  pageSize,
  pageSizes,
  total,
}: {
  canOperate: boolean;
  products: PosProductDTO[];
  /** Término aplicado en el servidor; la búsqueda no filtra en el navegador. */
  term: string;
  status: PosCatalogueStatus;
  page: number;
  pageSize: number;
  /** Los tamaños que la ruta acepta. La misma lista que valida `?tam=`. */
  pageSizes: number[];
  /** Cuántos coinciden en total, no cuántos vinieron en esta página. */
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState(term);

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    message: string,
    onSuccess?: () => void,
  ) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      // **El éxito lo dice el servidor, no el clic.** Antes de esto una alta
      // correcta y una rechazada se veían igual: el formulario se vaciaba y no
      // pasaba nada más.
      setNotice(message);
      onSuccess?.();
      router.refresh();
    });
  }

  /**
   * Todo el estado de la lista vive en la URL.
   *
   * El servidor resuelve término, estado y página, así que el resultado no
   * depende de lo que el navegador haya cargado — y la pantalla es enlazable y
   * sobrevive a una recarga.
   */
  function navigate(next: {
    q?: string;
    estado?: PosCatalogueStatus;
    pagina?: number;
    tam?: number;
  }) {
    const q = (next.q ?? term).trim();
    const estado = next.estado ?? status;
    const tam = next.tam ?? pageSize;
    // Cambiar el filtro vuelve a la primera página: la séptima de otro filtro
    // casi nunca existe, y aterrizar en una lista vacía parece un fallo.
    const pagina = next.pagina ?? 1;

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (estado) params.set("estado", estado);
    if (pagina > 1) params.set("pagina", String(pagina));
    // `tam` se escribe siempre: el panel no conoce el valor por omisión —lo
    // decide la ruta— y adivinarlo para ahorrar un parámetro sería inventar un
    // acuerdo tácito entre dos archivos.
    params.set("tam", String(tam));

    const query = params.toString();
    // Dentro de la transición: así `pending` cubre también la navegación y los
    // controles se apagan mientras el servidor resuelve.
    startTransition(() => router.push(query ? `${RUTA}?${query}` : RUTA));
  }

  const editing = canOperate
    ? (products.find((product) => product.id === editingId) ?? null)
    : null;
  const activeFilters = [term.trim(), status].filter(Boolean).length;

  const columns: Array<DataTableColumn<PosProductDTO>> = [
    {
      id: "producto",
      header: "Artículo",
      cell: (product) => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-800">
            {product.name}
          </span>
          <span className="block truncate font-mono text-[11px] text-slate-400">
            {product.sku}
          </span>
        </span>
      ),
    },
    {
      id: "barcode",
      header: "Código de barras",
      cell: (product) =>
        product.barcode ? (
          <span className="font-mono text-xs text-slate-500">{product.barcode}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
      hideOnMobile: true,
    },
    {
      id: "unidad",
      header: "Unidad",
      cell: (product) => (
        <span className="text-xs text-slate-500">{product.unitLabel}</span>
      ),
      hideOnMobile: true,
      width: "7rem",
    },
    {
      id: "minimo",
      header: "Mínimo",
      // Cero no es un umbral: es «sin declarar». Pintarlo como cifra haría creer
      // que el artículo tiene un piso fijado en cero, que es otra cosa.
      cell: (product) =>
        product.minimumStock > 0 ? (
          formatPosLevel(product.minimumStock)
        ) : (
          <span className="text-slate-300">—</span>
        ),
      numeric: true,
      hideOnMobile: true,
      width: "7rem",
    },
    {
      id: "estado",
      header: "Estado",
      cell: (product) => (
        <StatusBadge
          map={productStatus}
          value={product.isActive ? "activo" : "inactivo"}
        />
      ),
      width: "8rem",
    },
    {
      id: "precio",
      header: "Precio",
      cell: (product) => (
        <span data-testid="pos-product-price">
          {formatPosAmount(product.unitPrice)}
        </span>
      ),
      numeric: true,
      width: "9rem",
    },
  ];

  // Las acciones solo existen para quien puede ejecutarlas: una columna de
  // botones deshabilitados ocuparía ancho sin ofrecer nada.
  if (canOperate) {
    columns.push({
      id: "acciones",
      header: "",
      cell: (product) => (
        <span className="flex justify-end gap-1">
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
                <X aria-hidden className="h-4 w-4" />
                Cancelar
              </>
            ) : (
              <>
                <Pencil aria-hidden className="h-4 w-4" />
                Editar
              </>
            )}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  updatePosProductAction({
                    productId: product.id,
                    isActive: !product.isActive,
                  }),
                product.isActive
                  ? `Se retiró ${product.name} del mostrador.`
                  : `${product.name} vuelve al mostrador.`,
              )
            }
            size="sm"
            variant={product.isActive ? "ghost" : "success"}
          >
            {product.isActive ? "Desactivar" : "Activar"}
          </Button>
        </span>
      ),
      align: "right",
      width: "15rem",
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Notice onDismiss={() => setError(null)} tone="danger">
          <span data-testid="pos-error">{error}</span>
        </Notice>
      ) : null}
      {notice ? (
        <Notice onDismiss={() => setNotice(null)} tone="success">
          <span data-testid="pos-ok">{notice}</span>
        </Notice>
      ) : null}

      <Card className="p-6">
        {canOperate ? (
          <CreateProductForm disabled={pending} onRun={run} />
        ) : (
          <p className="text-sm text-slate-500">
            Tu rol puede consultar el catálogo, no modificarlo.
          </p>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        {/*
         * Enter se atiende en el contenedor, no en el campo: `FilterBar` no
         * expone el input, y la tecla burbujea igual. Es lo que convierte el
         * término en una navegación, que es donde vive la búsqueda.
         */}
        <div
          data-testid="pos-search"
          onKeyDown={(event) => {
            if (event.key === "Enter") navigate({ q: search });
          }}
        >
          <FilterBar
            actions={
              <Button
                disabled={pending}
                onClick={() => navigate({ q: search })}
                size="sm"
                variant="secondary"
              >
                <Search aria-hidden className="h-4 w-4" />
                Buscar
              </Button>
            }
            activeCount={activeFilters}
            filters={
              <Select
                aria-label="Estado"
                className="w-40"
                data-testid="filtro-estado"
                disabled={pending}
                onChange={(event) =>
                  navigate({ estado: event.target.value as PosCatalogueStatus })
                }
                value={status}
              >
                <option value="">Todos los estados</option>
                {Object.entries(productStatus).map(([key, definition]) => (
                  <option key={key} value={key}>
                    {definition.label}
                  </option>
                ))}
              </Select>
            }
            onClear={() => {
              setSearch("");
              navigate({ q: "", estado: "" });
            }}
            onSearchChange={setSearch}
            search={search}
            searchPlaceholder="SKU, código de barras o nombre…"
          />
        </div>

        {products.length ? (
          /*
           * El envoltorio rotulado es la lección de POS2.3: `DataTable` emite
           * `tabla-fila` para toda tabla, así que una aserción sobre filas
           * necesita saber de qué tabla habla.
           */
          <div data-testid="tabla-productos">
            <DataTable
              caption="Catálogo del punto de venta"
              columns={columns}
              // Un inactivo sigue en la lista: desactivar retira, no borra.
              isRowMuted={(product) => !product.isActive}
              rowKey={(product) => product.id}
              rows={products}
            />
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              description={
                activeFilters
                  ? "Ningún producto coincide con los filtros."
                  : "Registra el primer artículo del catálogo."
              }
              icon={Barcode}
              title="Sin productos"
              variant={activeFilters ? "no-results" : "empty"}
            />
          </div>
        )}

        {/*
         * **La paginación se dibuja siempre que haya algo que contar.** Su
         * trabajo principal no es cambiar de página sino decir «26-50 de 237»:
         * antes la lista cortaba en 200 filas sin decirlo, y quien tuviera 300
         * artículos veía 200 sin forma de enterarse ni de alcanzar el resto.
         */}
        {total > 0 ? (
          <div data-testid="paginacion-productos">
            <Pagination
              onPageChange={(next) => navigate({ pagina: next })}
              onPageSizeChange={(next) => navigate({ tam: next })}
              page={page}
              pageSize={pageSize}
              pageSizes={pageSizes}
              total={total}
            />
          </div>
        ) : null}

        {editing ? (
          <div className="border-t border-slate-200 px-5 pb-5">
            <EditProductForm
              disabled={pending}
              key={editing.id}
              onClose={() => setEditingId(null)}
              onRun={run}
              product={editing}
            />
          </div>
        ) : null}
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

function formatPosLevel(value: number) {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);
}

/**
 * Un importe tecleado, o `null` si no lo es.
 *
 * **Devuelve `null` en vez de cero.** La versión anterior hacía
 * `Number.isFinite(parsed) ? parsed : 0`, y ese cero viajaba al servidor como un
 * precio perfectamente válido: teclear «abc» o dejar el campo vacío daba de alta
 * un artículo a precio cero sin un solo aviso. El servidor valida —y sigue
 * validando— pero nunca llegaba a ver el dato malo, porque el navegador ya lo
 * había sustituido por uno bueno.
 */
function parseAmountInput(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (!clean) return null;
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Un umbral tecleado. **Vacío es cero y es legítimo**: «sin umbral declarado» es
 * el caso normal, y así lo trata `sanitizePosStockLevel` en el servidor.
 */
function parseLevelInput(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  if (!clean) return 0;
  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

type ProductDraft = {
  sku: string;
  name: string;
  barcode: string;
  unitPrice: string;
  unit: PosProductUnitValue;
  minimumStock: string;
  reorderPoint: string;
};

/**
 * Valida el borrador **una vez** y devuelve las dos cosas que hacen falta: qué
 * decirle a cada campo y qué mandar. Separarlas en dos funciones haría el mismo
 * análisis dos veces y abriría la puerta a que discrepen — a un formulario que
 * no señala ningún error y aun así se niega a enviar.
 *
 * `payload` es `null` cuando algo no cuadra, y entonces **no se manda nada**. El
 * servidor sigue siendo la autoridad: vuelve a sanear todo esto.
 */
function validateDraft(draft: ProductDraft) {
  const sku = draft.sku.trim();
  const name = draft.name.trim();
  const unitPrice = parseAmountInput(draft.unitPrice);
  const minimumStock = parseLevelInput(draft.minimumStock);
  const reorderPoint = parseLevelInput(draft.reorderPoint);
  const level = "Escribe una cantidad válida, o deja el campo vacío.";

  const errors = {
    sku: sku ? null : "El SKU es obligatorio.",
    name: name ? null : "El nombre es obligatorio.",
    unitPrice:
      unitPrice === null ? "Escribe un precio: un número, sin signo negativo." : null,
    minimumStock: minimumStock === null ? level : null,
    reorderPoint: reorderPoint === null ? level : null,
  };

  const complete =
    Boolean(sku) &&
    Boolean(name) &&
    unitPrice !== null &&
    minimumStock !== null &&
    reorderPoint !== null;

  return {
    errors,
    payload: complete
      ? {
          sku,
          name,
          unitPrice,
          minimumStock,
          reorderPoint,
          unit: draft.unit,
          barcode: draft.barcode.trim() || null,
        }
      : null,
  };
}

const emptyDraft: ProductDraft = {
  sku: "",
  name: "",
  barcode: "",
  unitPrice: "",
  unit: "UNIDAD",
  minimumStock: "",
  reorderPoint: "",
};

/** Un umbral en cero se muestra vacío: cero es «sin declarar», no una cifra. */
const levelToInput = (value: number) => (value > 0 ? String(value) : "");

/**
 * Los campos del artículo, una sola vez.
 *
 * Alta y edición piden exactamente lo mismo —un producto no tiene estados, así
 * que no hay campo que solo se pueda fijar al nacer—, y mantener dos copias de
 * siete campos con su validación es cómo se llega a que el alta acepte un precio
 * que la edición rechaza.
 */
function ProductFields({
  draft,
  errors,
  onChange,
  title,
  description,
}: {
  draft: ProductDraft;
  /** Solo se pintan tras el primer intento: regañar mientras se teclea molesta. */
  errors: ReturnType<typeof validateDraft>["errors"] | null;
  onChange: (patch: Partial<ProductDraft>) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <FormSection description={description} title={title}>
        <Field error={errors?.sku ?? undefined} label="SKU" required>
          <Input
            aria-invalid={Boolean(errors?.sku) || undefined}
            onChange={(event) => onChange({ sku: event.target.value })}
            value={draft.sku}
          />
        </Field>
        <Field error={errors?.name ?? undefined} label="Nombre" required>
          <Input
            aria-invalid={Boolean(errors?.name) || undefined}
            onChange={(event) => onChange({ name: event.target.value })}
            value={draft.name}
          />
        </Field>
        <Field hint="Opcional." label="Código de barras">
          <Input
            onChange={(event) => onChange({ barcode: event.target.value })}
            value={draft.barcode}
          />
        </Field>
        <Field error={errors?.unitPrice ?? undefined} label="Precio" required>
          <Input
            aria-invalid={Boolean(errors?.unitPrice) || undefined}
            inputMode="decimal"
            onChange={(event) => onChange({ unitPrice: event.target.value })}
            value={draft.unitPrice}
          />
        </Field>
        <Field
          hint="Cómo se cuenta el artículo. Las existencias la muestran."
          label="Unidad de medida"
        >
          <Select
            onChange={(event) =>
              onChange({ unit: event.target.value as PosProductUnitValue })
            }
            value={draft.unit}
          >
            {posProductUnitValues.map((value) => (
              <option key={value} value={value}>
                {posProductUnitLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection
        description="Valores por defecto del catálogo. No son un saldo: la existencia vive en las bodegas. Vacío significa sin umbral declarado."
        title="Umbrales de existencia"
      >
        <Field
          error={errors?.minimumStock ?? undefined}
          hint="Por debajo de aquí la existencia es un problema."
          label="Existencia mínima"
        >
          <Input
            aria-invalid={Boolean(errors?.minimumStock) || undefined}
            inputMode="decimal"
            onChange={(event) => onChange({ minimumStock: event.target.value })}
            value={draft.minimumStock}
          />
        </Field>
        <Field
          error={errors?.reorderPoint ?? undefined}
          hint="Nivel al que conviene volver a pedir; suele ser más alto que el mínimo."
          label="Punto de reposición"
        >
          <Input
            aria-invalid={Boolean(errors?.reorderPoint) || undefined}
            inputMode="decimal"
            onChange={(event) => onChange({ reorderPoint: event.target.value })}
            value={draft.reorderPoint}
          />
        </Field>
      </FormSection>
    </div>
  );
}

type RunAction = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  message: string,
  onSuccess?: () => void,
) => void;

function CreateProductForm({
  disabled,
  onRun,
}: {
  disabled: boolean;
  onRun: RunAction;
}) {
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [submitted, setSubmitted] = useState(false);
  const { errors, payload } = validateDraft(draft);

  function submit() {
    setSubmitted(true);
    // Sin `payload` no se manda nada: el error se señala en su campo en vez de
    // viajar al servidor convertido en un dato válido pero falso.
    if (!payload) return;
    onRun(
      () => createPosProductAction(payload),
      `Se registró ${payload.name}.`,
      () => {
        setDraft(emptyDraft);
        setSubmitted(false);
      },
    );
  }

  return (
    <div data-testid="pos-product-create-form">
      <ProductFields
        description="El SKU y el código de barras son únicos: la base de datos lo impone."
        draft={draft}
        errors={submitted ? errors : null}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        title="Registrar producto"
      />

      <div className="mt-4">
        <Button disabled={disabled} onClick={submit} size="sm">
          <Plus aria-hidden className="h-4 w-4" />
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
  onRun: RunAction;
  product: PosProductDTO;
}) {
  const [draft, setDraft] = useState<ProductDraft>({
    sku: product.sku,
    name: product.name,
    barcode: product.barcode ?? "",
    unitPrice: String(product.unitPrice),
    unit: product.unit,
    minimumStock: levelToInput(product.minimumStock),
    reorderPoint: levelToInput(product.reorderPoint),
  });
  const [submitted, setSubmitted] = useState(false);
  const { errors, payload } = validateDraft(draft);

  function submit() {
    setSubmitted(true);
    if (!payload) return;
    onRun(
      () => updatePosProductAction({ productId: product.id, ...payload }),
      `Se guardó ${payload.name}.`,
      onClose,
    );
  }

  return (
    <div
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      data-testid="pos-product-editor"
    >
      <ProductFields
        description="Un producto no tiene estados: cualquier campo se corrige en cualquier momento."
        draft={draft}
        errors={submitted ? errors : null}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        title="Editar producto"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={disabled} onClick={submit} size="sm">
          Guardar cambios
        </Button>
        <Button disabled={disabled} onClick={onClose} size="sm" variant="secondary">
          Cancelar
        </Button>
      </div>
    </div>
  );
}
