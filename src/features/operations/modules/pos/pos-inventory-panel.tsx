"use client";

import { ArrowDownUp, PackagePlus, Plus, Warehouse } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailList } from "@/components/ui/detail-list";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge, defineStatuses } from "@/components/ui/status";
import { FilterBar } from "@/components/ui/toolbar";
import {
  adjustPosInventoryAction,
  openPosInventoryAction,
  registerPosInventoryReceiptAction,
} from "@/server/pos/actions";
import type {
  PosInventoryDTO,
  PosInventoryMovementDTO,
  PosProductDTO,
  PosWarehouseDTO,
} from "@/server/pos/shared";

/**
 * Patch POS2.3 — existencias del mostrador, por fin alcanzables.
 *
 * ## Qué expone, y qué no construye
 *
 * POS1.1-B, POS1.1-C y POS1.1-D dejaron cinco acciones de servidor —abrir saldo,
 * ingresar, ajustar, y crear/editar bodega— **sin ninguna puerta**. Es la misma
 * situación que tenían las compras antes de POS1.2-F: código correcto, probado
 * por suites Prisma, y que nadie podía ejecutar.
 *
 * Esta pantalla no reimplementa nada. Llama a esas acciones tal cual, y por eso
 * hereda sin esfuerzo lo que ya garantizan: el bloqueo `FOR UPDATE`, la
 * invariante `después = antes + cantidad`, el motivo obligatorio y el autor.
 *
 * ## Lo que deliberadamente no hace
 *
 * **No valida existencia suficiente.** P-8 sigue abierta: el repositorio no
 * contiene ninguna regla que diga si el saldo puede bajar de cero, y una
 * pantalla no es el sitio donde inventar política de operación. Un ajuste
 * negativo que deje el saldo bajo cero se registra, como lo registra el motor.
 *
 * **No decide quién puede ajustar.** Las cinco acciones usan `authorizePos`
 * (`canOperateCaja`), y así se quedan. Que un ajuste deba pedir un segundo par
 * de ojos es **P-10**, y sigue sin responderse.
 */

/** El estado de un saldo frente a sus umbrales. El diccionario vive aquí. */
const stockStatus = defineStatuses({
  agotado: { label: "Agotado", tone: "danger", hint: "Saldo en cero o negativo" },
  bajo: { label: "Bajo mínimo", tone: "warning", hint: "Por debajo del mínimo declarado" },
  reponer: { label: "Reponer", tone: "progress", hint: "En el punto de reposición" },
  normal: { label: "Normal", tone: "success" },
});

/**
 * **Solo compara contra umbrales declarados.**
 *
 * `minimumStock` y `reorderPoint` nacen en cero. Tratar el cero como umbral
 * marcaría «bajo mínimo» cualquier artículo agotado y haría el estado inútil.
 */
function stockStateOf(row: PosInventoryDTO): keyof typeof stockStatus {
  if (row.quantity <= 0) return "agotado";
  if (row.minimumStock > 0 && row.quantity <= row.minimumStock) return "bajo";
  if (row.reorderPoint > 0 && row.quantity <= row.reorderPoint) return "reponer";
  return "normal";
}

const quantity = (value: number) =>
  new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);

const moment = (iso: string) =>
  new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

type Operation = "ingreso" | "ajuste" | "abrir";

export function PosInventoryPanel({
  canOperate,
  balances,
  movements,
  warehouses,
  products,
}: {
  canOperate: boolean;
  balances: PosInventoryDTO[];
  movements: PosInventoryMovementDTO[];
  warehouses: PosWarehouseDTO[];
  products: PosProductDTO[];
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [warehouseFilter, setWarehouseFilter] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState("");
  const [operation, setOperation] = React.useState<Operation | null>(null);
  const [detail, setDetail] = React.useState<PosInventoryDTO | null>(null);

  // Formulario de la operación. Vive aquí porque el cajón es una sola cosa.
  const [formWarehouse, setFormWarehouse] = React.useState("");
  const [formProduct, setFormProduct] = React.useState("");
  const [formQuantity, setFormQuantity] = React.useState("");
  const [formReason, setFormReason] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const router = useRouter();

  if (!canOperate) {
    return (
      <Card className="p-6">
        <Notice tone="warning">
          <span data-testid="inventario-denied">
            Tu rol no puede operar las existencias del mostrador.
          </span>
        </Notice>
      </Card>
    );
  }

  const filtered = balances.filter((row) => {
    const term = search.trim().toLowerCase();
    if (term && !`${row.productSku} ${row.productName}`.toLowerCase().includes(term)) {
      return false;
    }
    if (warehouseFilter && row.warehouseId !== warehouseFilter) return false;
    if (stateFilter && stockStateOf(row) !== stateFilter) return false;
    return true;
  });

  const activeFilters = [search.trim(), warehouseFilter, stateFilter].filter(Boolean).length;

  // Validación de cliente: el servidor vuelve a comprobarlo todo y es la
  // autoridad. Esto solo evita un viaje obviamente inútil.
  const quantityValue = Number(formQuantity.replace(",", "."));
  const quantityError =
    submitted && !Number.isFinite(quantityValue)
      ? "Escribe una cantidad."
      : submitted && operation === "ingreso" && !(quantityValue > 0)
        ? "El ingreso debe ser mayor que cero."
        : submitted && operation === "ajuste" && quantityValue === 0
          ? "Un ajuste de cero no cambia nada."
          : null;
  const reasonError =
    submitted && operation !== "abrir" && !formReason.trim()
      ? "Indica el motivo."
      : null;
  const warehouseError = submitted && !formWarehouse ? "Elige una bodega." : null;
  const productError = submitted && !formProduct ? "Elige un artículo." : null;

  function closeDrawer() {
    setOperation(null);
    setSubmitted(false);
    setFormQuantity("");
    setFormReason("");
  }

  function submit() {
    setSubmitted(true);
    setError(null);
    setNotice(null);

    if (!formWarehouse || !formProduct) return;
    if (operation !== "abrir") {
      if (!formReason.trim() || !Number.isFinite(quantityValue)) return;
      if (operation === "ingreso" && !(quantityValue > 0)) return;
      if (operation === "ajuste" && quantityValue === 0) return;
    }

    startTransition(async () => {
      const input = {
        warehouseId: formWarehouse,
        productId: formProduct,
        quantity: quantityValue,
        reason: formReason.trim(),
      };
      const result =
        operation === "abrir"
          ? await openPosInventoryAction({
              warehouseId: formWarehouse,
              productId: formProduct,
            })
          : operation === "ingreso"
            ? await registerPosInventoryReceiptAction(input)
            : await adjustPosInventoryAction(input);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      // **El éxito lo dice el servidor**, no el clic. Y lo que se anuncia es el
      // saldo que devolvió, no el que la pantalla creía tener.
      setNotice(
        "quantityAfter" in result
          ? `Registrado. Saldo: ${quantity(result.quantityAfter)}.`
          : "Saldo abierto en cero.",
      );
      closeDrawer();
      router.refresh();
    });
  }

  const balanceColumns: Array<DataTableColumn<PosInventoryDTO>> = [
    {
      id: "product",
      header: "Artículo",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate text-slate-800">{row.productName}</span>
          <span className="block truncate font-mono text-[11px] text-slate-400">
            {row.productSku}
          </span>
        </span>
      ),
    },
    {
      id: "warehouse",
      header: "Bodega",
      cell: (row) => row.warehouseName,
      hideOnMobile: true,
    },
    {
      id: "state",
      header: "Estado",
      cell: (row) => <StatusBadge map={stockStatus} value={stockStateOf(row)} />,
      width: "9rem",
    },
    {
      id: "quantity",
      header: "Existencia",
      cell: (row) => (
        <span className={row.quantity <= 0 ? "font-semibold text-red-600" : undefined}>
          {quantity(row.quantity)}
        </span>
      ),
      numeric: true,
      width: "8rem",
    },
    {
      id: "unit",
      header: "Unidad",
      cell: (row) => row.unitLabel,
      hideOnMobile: true,
      width: "7rem",
    },
  ];

  const movementColumns: Array<DataTableColumn<PosInventoryMovementDTO>> = [
    {
      id: "when",
      header: "Cuándo",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-slate-500">
          {moment(row.createdAt)}
        </span>
      ),
      width: "10rem",
    },
    {
      id: "type",
      header: "Tipo",
      cell: (row) => <span className="text-slate-700">{row.typeLabel}</span>,
      width: "9rem",
    },
    {
      id: "product",
      header: "Artículo",
      cell: (row) => (
        <span className="block truncate text-slate-800">{row.productName}</span>
      ),
    },
    {
      id: "quantity",
      header: "Cantidad",
      // El signo se dice con el símbolo además del color.
      cell: (row) => (
        <span className={row.quantity < 0 ? "text-red-600" : "text-emerald-700"}>
          {row.quantity > 0 ? "+" : ""}
          {quantity(row.quantity)}
        </span>
      ),
      numeric: true,
      width: "7rem",
    },
    {
      id: "after",
      header: "Saldo",
      cell: (row) => quantity(row.quantityAfter),
      numeric: true,
      hideOnMobile: true,
      width: "7rem",
    },
    {
      id: "who",
      header: "Quién",
      cell: (row) => <span className="text-xs text-slate-500">{row.createdByName}</span>,
      hideOnMobile: true,
    },
  ];

  const drawerTitle =
    operation === "ingreso"
      ? "Registrar ingreso"
      : operation === "ajuste"
        ? "Ajustar existencias"
        : "Abrir saldo";

  return (
    <div className="space-y-6">
      {error ? (
        <Notice onDismiss={() => setError(null)} tone="danger">
          <span data-testid="inventario-error">{error}</span>
        </Notice>
      ) : null}
      {notice ? (
        <Notice onDismiss={() => setNotice(null)} tone="success">
          <span data-testid="inventario-ok">{notice}</span>
        </Notice>
      ) : null}

      <Card className="overflow-hidden p-0">
        <FilterBar
          actions={
            <>
              <Button
                data-testid="abrir-saldo"
                onClick={() => setOperation("abrir")}
                size="sm"
                variant="secondary"
              >
                <Plus aria-hidden className="h-4 w-4" />
                Abrir saldo
              </Button>
              <Button
                data-testid="registrar-ajuste"
                onClick={() => setOperation("ajuste")}
                size="sm"
                variant="secondary"
              >
                <ArrowDownUp aria-hidden className="h-4 w-4" />
                Ajustar
              </Button>
              <Button data-testid="registrar-ingreso" onClick={() => setOperation("ingreso")} size="sm">
                <PackagePlus aria-hidden className="h-4 w-4" />
                Ingresar
              </Button>
            </>
          }
          activeCount={activeFilters}
          filters={
            <>
              <Select
                aria-label="Bodega"
                className="w-44"
                data-testid="filtro-bodega"
                onChange={(event) => setWarehouseFilter(event.target.value)}
                value={warehouseFilter}
              >
                <option value="">Todas las bodegas</option>
                {warehouses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Estado"
                className="w-40"
                data-testid="filtro-estado"
                onChange={(event) => setStateFilter(event.target.value)}
                value={stateFilter}
              >
                <option value="">Todos los estados</option>
                {Object.entries(stockStatus).map(([key, definition]) => (
                  <option key={key} value={key}>
                    {definition.label}
                  </option>
                ))}
              </Select>
            </>
          }
          onClear={() => {
            setSearch("");
            setWarehouseFilter("");
            setStateFilter("");
          }}
          onSearchChange={setSearch}
          search={search}
          searchPlaceholder="Buscar por SKU o nombre…"
        />

        {balances.length === 0 ? (
          <div className="p-6">
            <EmptyState
              action={
                <Button onClick={() => setOperation("abrir")} size="sm">
                  <Plus aria-hidden className="h-4 w-4" />
                  Abrir el primer saldo
                </Button>
              }
              description="Un artículo empieza a tener existencias cuando se le abre saldo en una bodega."
              icon={Warehouse}
              title="Sin saldos abiertos"
            />
          </div>
        ) : (
          <div data-testid="tabla-saldos">
            <DataTable
              caption="Existencias por bodega"
              columns={balanceColumns}
              emptyMessage="Ningún saldo coincide con los filtros. Prueba a quitar alguno."
              isRowMuted={(row) => row.quantity <= 0}
              onRowClick={setDetail}
              rowKey={(row) => row.id}
              rows={filtered}
            />
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Movimientos recientes</h2>
        <div data-testid="tabla-movimientos">
            <DataTable
            caption="Movimientos recientes de inventario"
            columns={movementColumns}
            emptyMessage="Todavía no se ha registrado ningún movimiento."
            rowKey={(row) => row.id}
            rows={movements}
          />
        </div>
      </div>

      {/* --- Operación ------------------------------------------------- */}
      <Drawer
        description={
          operation === "ajuste"
            ? "La cantidad lleva signo: negativa reduce las existencias."
            : operation === "ingreso"
              ? "Entrada de mercancía sin orden de compra."
              : "Un saldo nace en cero; después se ingresa o se ajusta."
        }
        footer={
          <>
            <Button disabled={pending} onClick={closeDrawer} variant="secondary">
              Cancelar
            </Button>
            <Button data-testid="operacion-confirmar" disabled={pending} onClick={submit}>
              {drawerTitle}
            </Button>
          </>
        }
        onClose={closeDrawer}
        open={operation !== null}
        title={drawerTitle}
      >
        <div className="space-y-4" data-testid="operacion-formulario">
          <FormField error={warehouseError} label="Bodega" required>
            {(field) => (
              <Select
                {...field}
                data-testid="operacion-bodega"
                onChange={(event) => setFormWarehouse(event.target.value)}
                value={formWarehouse}
              >
                <option value="">Selecciona…</option>
                {warehouses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField error={productError} label="Artículo" required>
            {(field) => (
              <Select
                {...field}
                data-testid="operacion-articulo"
                onChange={(event) => setFormProduct(event.target.value)}
                value={formProduct}
              >
                <option value="">Selecciona…</option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.sku}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          {operation !== "abrir" ? (
            <>
              <FormField
                error={quantityError}
                hint={
                  operation === "ajuste"
                    ? "Con signo. Ejemplo: -3 para reducir tres."
                    : "Cantidad que entra a la bodega."
                }
                label="Cantidad"
                required
              >
                {(field) => (
                  <Input
                    {...field}
                    className="sb-numeric text-right"
                    data-testid="operacion-cantidad"
                    inputMode="decimal"
                    onChange={(event) => setFormQuantity(event.target.value)}
                    value={formQuantity}
                  />
                )}
              </FormField>

              <FormField error={reasonError} label="Motivo" required>
                {(field) => (
                  <Input
                    {...field}
                    data-testid="operacion-motivo"
                    onChange={(event) => setFormReason(event.target.value)}
                    value={formReason}
                  />
                )}
              </FormField>
            </>
          ) : null}
        </div>
      </Drawer>

      {/* --- Detalle de un saldo --------------------------------------- */}
      <Drawer
        description={detail?.productSku}
        onClose={() => setDetail(null)}
        open={detail !== null}
        title={detail?.productName ?? "Saldo"}
      >
        {detail ? (
          <DetailList
            columns={1}
            items={[
              { label: "Bodega", value: detail.warehouseName },
              {
                label: "Estado",
                value: <StatusBadge map={stockStatus} value={stockStateOf(detail)} />,
              },
              { label: "Existencia", value: quantity(detail.quantity), numeric: true },
              { label: "Unidad", value: detail.unitLabel },
              {
                label: "Mínimo",
                value: detail.minimumStock > 0 ? quantity(detail.minimumStock) : null,
                numeric: true,
              },
              {
                label: "Punto de reposición",
                value: detail.reorderPoint > 0 ? quantity(detail.reorderPoint) : null,
                numeric: true,
              },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}

