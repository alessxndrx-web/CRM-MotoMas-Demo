"use client";

import { Plus, Warehouse } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge, defineStatuses } from "@/components/ui/status";
import { FilterBar } from "@/components/ui/toolbar";
import {
  createPosWarehouseAction,
  updatePosWarehouseAction,
} from "@/server/pos/actions";
import type { PosWarehouseDTO } from "@/server/pos/shared";

/**
 * Patch INT5 — administración de bodegas del mostrador.
 *
 * ## Qué había, y por qué faltaba esta pantalla
 *
 * `createPosWarehouseAction` y `updatePosWarehouseAction` existen desde POS1.1-B
 * y **no tenían puerta**: POS2.3 dejó fuera la administración de bodegas a
 * propósito —era configuración, no operación diaria— y quedó como **P-38**. Sin
 * ella, una bodega solo nacía por semilla o por SQL.
 *
 * ## La sucursal la decide el servidor, no este selector
 *
 * El desplegable solo ofrece las sucursales que la sesión puede administrar, y
 * **eso no es la garantía**: `createPosWarehouseAction` aplica `canAccessBranch`
 * desde INT5, así que una petición con otra sucursal se rechaza aunque el
 * selector nunca la haya mostrado. La pantalla no es la frontera.
 *
 * ## Lo que no hace
 *
 * **No reasigna bodegas entre sucursales.** `updatePosWarehouseAction` no admite
 * `branchCode`, y mover una bodega con existencias de una sucursal a otra sería
 * un traslado —que este repositorio no modela para repuestos—, no una edición.
 * Tampoco borra: `PosInventory` y `PosInventoryMovement` la referencian con
 * `RESTRICT`, y desactivar es como este dominio retira las cosas.
 */
const warehouseStatus = defineStatuses({
  activa: { label: "Activa", tone: "success" },
  inactiva: {
    label: "Inactiva",
    tone: "neutral",
    hint: "No se puede consumir ni recibir en ella",
  },
});

export function PosWarehousesPanel({
  warehouses,
  branches,
}: {
  warehouses: PosWarehouseDTO[];
  /** Solo las sucursales que esta sesión puede administrar. */
  branches: Array<{ code: string; name: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [branchCode, setBranchCode] = React.useState(branches[0]?.code ?? "");
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const codeError = submitted && !code.trim() ? "El código es obligatorio." : null;
  const nameError = submitted && !name.trim() ? "El nombre es obligatorio." : null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      setNotice(message);
      router.refresh();
    });
  }

  function create() {
    setSubmitted(true);
    if (!code.trim() || !name.trim() || !branchCode) return;
    run(
      () => createPosWarehouseAction({ branchCode, code, name }),
      `Bodega ${name} creada.`,
    );
    setCreating(false);
    setSubmitted(false);
    setCode("");
    setName("");
  }

  const filtered = warehouses.filter((warehouse) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return `${warehouse.code} ${warehouse.name} ${warehouse.branchName}`
      .toLowerCase()
      .includes(term);
  });

  const columns: Array<DataTableColumn<PosWarehouseDTO>> = [
    {
      id: "bodega",
      header: "Bodega",
      cell: (warehouse) => (
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-800">
            {warehouse.name}
          </span>
          <span className="block truncate font-mono text-[11px] text-slate-400">
            {warehouse.code}
          </span>
        </span>
      ),
    },
    {
      id: "sucursal",
      header: "Sucursal",
      cell: (warehouse) => warehouse.branchName,
      hideOnMobile: true,
    },
    {
      id: "articulos",
      header: "Artículos con saldo",
      cell: (warehouse) => warehouse.productCount,
      numeric: true,
      hideOnMobile: true,
      width: "10rem",
    },
    {
      id: "estado",
      header: "Estado",
      cell: (warehouse) => (
        <StatusBadge
          map={warehouseStatus}
          value={warehouse.isActive ? "activa" : "inactiva"}
        />
      ),
      width: "9rem",
    },
    {
      id: "acciones",
      header: "",
      cell: (warehouse) => (
        <span className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  updatePosWarehouseAction({
                    warehouseId: warehouse.id,
                    isActive: !warehouse.isActive,
                  }),
                warehouse.isActive
                  ? `${warehouse.name} queda fuera de servicio.`
                  : `${warehouse.name} vuelve a estar disponible.`,
              )
            }
            size="sm"
            variant={warehouse.isActive ? "ghost" : "success"}
          >
            {warehouse.isActive ? "Desactivar" : "Activar"}
          </Button>
        </span>
      ),
      align: "right",
      width: "10rem",
    },
  ];

  return (
    <div className="space-y-6" data-testid="pos-bodegas">
      {error ? (
        <Notice onDismiss={() => setError(null)} tone="danger">
          <span data-testid="bodega-error">{error}</span>
        </Notice>
      ) : null}
      {notice ? (
        <Notice onDismiss={() => setNotice(null)} tone="success">
          <span data-testid="bodega-ok">{notice}</span>
        </Notice>
      ) : null}

      <Card className="overflow-hidden p-0">
        <FilterBar
          actions={
            <Button
              data-testid="bodega-nueva"
              disabled={pending || branches.length === 0}
              onClick={() => setCreating(true)}
              size="sm"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Nueva bodega
            </Button>
          }
          activeCount={search.trim() ? 1 : 0}
          onClear={() => setSearch("")}
          onSearchChange={setSearch}
          search={search}
          searchPlaceholder="Código, nombre o sucursal…"
        />

        {warehouses.length === 0 ? (
          <div className="p-6">
            <EmptyState
              description="Sin bodegas no se puede recibir mercancía ni cobrar en el mostrador."
              icon={Warehouse}
              title="Sin bodegas"
            />
          </div>
        ) : (
          <div data-testid="tabla-bodegas">
            <DataTable
              caption="Bodegas del punto de venta"
              columns={columns}
              emptyMessage="Ninguna bodega coincide con la búsqueda."
              isRowMuted={(warehouse) => !warehouse.isActive}
              rowKey={(warehouse) => warehouse.id}
              rows={filtered}
            />
          </div>
        )}
      </Card>

      <Drawer
        description="El código identifica la bodega dentro de su sucursal. La sucursal no se puede cambiar después: mover existencias es un traslado, no una edición."
        footer={
          <>
            <Button disabled={pending} onClick={() => setCreating(false)} variant="secondary">
              Cancelar
            </Button>
            <Button data-testid="bodega-crear" disabled={pending} onClick={create}>
              Crear bodega
            </Button>
          </>
        }
        onClose={() => setCreating(false)}
        open={creating}
        title="Nueva bodega"
      >
        <div className="space-y-4">
          <FormField
            hint="Solo se ofrecen las sucursales que tu rol puede administrar; el servidor lo vuelve a comprobar."
            label="Sucursal"
            required
          >
            {(field) => (
              <Select
                {...field}
                data-testid="bodega-sucursal"
                onChange={(event) => setBranchCode(event.target.value)}
                value={branchCode}
              >
                {branches.map((branch) => (
                  <option key={branch.code} value={branch.code}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField error={codeError} label="Código" required>
            {(field) => (
              <Input
                {...field}
                data-testid="bodega-codigo"
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
            )}
          </FormField>

          <FormField error={nameError} label="Nombre" required>
            {(field) => (
              <Input
                {...field}
                data-testid="bodega-nombre"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            )}
          </FormField>
        </div>
      </Drawer>
    </div>
  );
}
