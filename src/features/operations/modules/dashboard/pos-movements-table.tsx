"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge, defineStatuses } from "@/components/ui/status";
import type { DashboardMovementDTO } from "@/server/pos/dashboard";
import { posInventoryMovementTypeLabels } from "@/server/pos/shared";

/**
 * Patch POS2.1 — la bitácora reciente, en su propio límite de cliente.
 *
 * ## Por qué está separada
 *
 * `DataTable` describe sus columnas con **funciones** (`cell`, `rowKey`), y una
 * función no cruza la frontera servidor→cliente: React no puede serializarla.
 * El tablero es un componente de servidor a propósito —es una pantalla de alta
 * frecuencia y sus cifras no necesitan JavaScript—, así que la alternativa era
 * mandar el tablero entero al navegador para poder pintar una tabla estática.
 *
 * Esto es lo contrario: el límite de cliente es **esta tabla y nada más**. El
 * resto del tablero sigue llegando como HTML ya calculado.
 *
 * **[I]** Es una propiedad de la biblioteca, no un defecto de esta pantalla:
 * cualquier componente de servidor que quiera `DataTable` necesita un envoltorio
 * como este. Queda anotado en el informe de POS2.1.
 */
const movementStatus = defineStatuses({
  INICIAL: { label: posInventoryMovementTypeLabels.INICIAL, tone: "neutral" },
  COMPRA: { label: posInventoryMovementTypeLabels.COMPRA, tone: "success" },
  VENTA: { label: posInventoryMovementTypeLabels.VENTA, tone: "progress" },
  AJUSTE: { label: posInventoryMovementTypeLabels.AJUSTE, tone: "warning" },
  DEVOLUCION: { label: posInventoryMovementTypeLabels.DEVOLUCION, tone: "neutral" },
  TRASLADO_ENTRADA: {
    label: posInventoryMovementTypeLabels.TRASLADO_ENTRADA,
    tone: "neutral",
  },
  TRASLADO_SALIDA: {
    label: posInventoryMovementTypeLabels.TRASLADO_SALIDA,
    tone: "neutral",
  },
});

const quantity = (value: number) =>
  new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);

const momentLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const columns: Array<DataTableColumn<DashboardMovementDTO>> = [
  {
    id: "type",
    header: "Movimiento",
    cell: (row) => <StatusBadge map={movementStatus} value={row.type} />,
    width: "9rem",
  },
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
    id: "quantity",
    header: "Cantidad",
    // El signo se dice con el símbolo además del color: quien no distingue rojo
    // de verde sigue viendo si entró o salió mercancía.
    cell: (row) => (
      <span className={row.quantity < 0 ? "text-red-600" : "text-emerald-700"}>
        {row.quantity > 0 ? "+" : ""}
        {quantity(row.quantity)}
      </span>
    ),
    numeric: true,
    width: "8rem",
  },
  {
    id: "when",
    header: "Cuándo",
    cell: (row) => (
      <span className="whitespace-nowrap text-xs text-slate-500">
        {momentLabel(row.createdAt)}
        {row.userName ? ` · ${row.userName}` : ""}
      </span>
    ),
    hideOnMobile: true,
  },
];

export function PosMovementsTable({ movements }: { movements: DashboardMovementDTO[] }) {
  return (
    <DataTable
      caption="Últimos movimientos de inventario"
      columns={columns}
      emptyMessage="Todavía no se ha registrado ningún movimiento de inventario."
      rowKey={(row) => row.id}
      rows={movements}
    />
  );
}
