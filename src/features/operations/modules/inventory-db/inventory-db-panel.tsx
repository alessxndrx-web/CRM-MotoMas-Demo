"use client";

import { Boxes } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { StatusBadge, defineStatuses } from "@/components/ui/status";
import { FilterBar } from "@/components/ui/toolbar";
import { unitStatusLabels, type InventoryUnitDTO } from "@/server/inventory/shared";

/**
 * Patch INT1 — el inventario que la empresa tiene, no el que tenía este navegador.
 *
 * ## Qué corrige
 *
 * `/panel/inventario` montaba `InventoryPanel` **sin ninguna barrera de base de
 * datos**: un componente de cliente que lee `readInventoryUnits()` del
 * `localStorage`. Con PostgreSQL configurado seguía pintando existencias
 * inventadas por el navegador, mientras su ruta hermana
 * `/panel/inventario/movimientos` leía la base. **Dos pantallas del mismo menú
 * se contradecían**, y la falsa era la que llevaba el nombre del módulo.
 *
 * ## Qué no hace
 *
 * **No es una tercera implementación de inventario.** Lee `getInventoryData`, la
 * misma consulta que ya usan `/panel/traslados` y `/panel/inventario/movimientos`;
 * aquí solo se dibuja.
 *
 * ## Los dos inventarios siguen siendo dos
 *
 * Esta pantalla muestra **unidades de motocicleta**, que es lo que
 * `MotorcycleUnit` modela: serializado, una fila por chasis. Los repuestos del
 * mostrador son fungibles y viven en `PosInventory`, con su propia pantalla. No
 * se suman ni se mezclan porque no son la misma cosa; lo que sí se hace es
 * decirlo, en vez de dejar al usuario suponiendo.
 */
const unitStatus = defineStatuses({
  AVAILABLE: { label: unitStatusLabels.AVAILABLE, tone: "success" },
  RESERVED: { label: unitStatusLabels.RESERVED, tone: "progress" },
  IN_TRANSFER: { label: unitStatusLabels.IN_TRANSFER, tone: "warning" },
  SOLD: { label: unitStatusLabels.SOLD, tone: "neutral" },
  DELIVERED: { label: unitStatusLabels.DELIVERED, tone: "neutral" },
  EXITED: { label: unitStatusLabels.EXITED, tone: "neutral" },
  CANCELLED: { label: unitStatusLabels.CANCELLED, tone: "danger" },
});

export function InventoryDbPanel({
  units,
  scopeLabel,
}: {
  units: InventoryUnitDTO[];
  /** Qué alcance está viendo: global o una sucursal. */
  scopeLabel: string;
}) {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");

  const filtered = units.filter((unit) => {
    const term = search.trim().toLowerCase();
    if (
      term &&
      !`${unit.name} ${unit.brand} ${unit.model} ${unit.chassisNumber}`
        .toLowerCase()
        .includes(term)
    ) {
      return false;
    }
    if (status && unit.status !== status) return false;
    return true;
  });

  const columns: Array<DataTableColumn<InventoryUnitDTO>> = [
    {
      id: "unidad",
      header: "Unidad",
      cell: (unit) => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-800">{unit.name}</span>
          <span className="block truncate text-[11px] text-slate-400">
            {unit.brand} · {unit.model} · {unit.year}
          </span>
        </span>
      ),
    },
    {
      id: "chasis",
      header: "Chasis",
      cell: (unit) => (
        <span className="font-mono text-xs text-slate-600">{unit.chassisNumber}</span>
      ),
      hideOnMobile: true,
    },
    {
      id: "sucursal",
      header: "Sucursal",
      cell: (unit) => unit.branchName,
      hideOnMobile: true,
    },
    {
      id: "estado",
      header: "Estado",
      cell: (unit) => <StatusBadge map={unitStatus} value={unit.status} />,
      width: "10rem",
    },
  ];

  return (
    <div className="space-y-6" data-testid="inventario-db">
      {/* La frontera, dicha en la pantalla y no solo en un documento. */}
      <Notice tone="info">
        Unidades de motocicleta por chasis, leídas de la base ({scopeLabel}). Los
        repuestos del mostrador son fungibles y se cuentan aparte:{" "}
        <Link className="font-semibold underline" href="/pos/inventario">
          existencias del mostrador
        </Link>
        .
      </Notice>

      <Card className="overflow-hidden p-0">
        <FilterBar
          activeCount={[search.trim(), status].filter(Boolean).length}
          filters={
            <select
              aria-label="Estado"
              className="sb-focus h-10 w-44 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
              data-testid="inventario-filtro-estado"
              onChange={(event) => setStatus(event.target.value)}
              value={status}
            >
              <option value="">Todos los estados</option>
              {Object.entries(unitStatus).map(([key, definition]) => (
                <option key={key} value={key}>
                  {definition.label}
                </option>
              ))}
            </select>
          }
          onClear={() => {
            setSearch("");
            setStatus("");
          }}
          onSearchChange={setSearch}
          search={search}
          searchPlaceholder="Nombre, marca, modelo o chasis…"
        />

        {units.length === 0 ? (
          <div className="p-6">
            <EmptyState
              description="No hay unidades registradas en este alcance."
              icon={Boxes}
              title="Sin unidades"
            />
          </div>
        ) : (
          <div data-testid="tabla-unidades">
            <DataTable
              caption="Unidades de motocicleta en inventario"
              columns={columns}
              emptyMessage="Ninguna unidad coincide con los filtros."
              rowKey={(unit) => unit.id}
              rows={filtered}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
