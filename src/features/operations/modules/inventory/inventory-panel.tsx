"use client";

import Link from "next/link";
import {
  History,
  MapPin,
  Package,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PENDING_CATALOG_INFO, motorcycles } from "@/data/catalog/motorcycles";
import {
  desiredBranches,
  type DesiredBranchId,
} from "@/data/operations/leads";
import {
  buildInventoryModelSummaries,
  inventoryUnitStatuses,
  type InventoryUnit,
  type InventoryUnitStatus,
} from "@/data/operations/inventory";
import { readInventoryUnits } from "@/features/operations/services/inventory-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

const ALL_MODELS = "todos";
const ALL_BRANCHES = "todas";
const ALL_STATUSES = "todos";

type ModelFilter = string | typeof ALL_MODELS;
type BranchFilter = DesiredBranchId | typeof ALL_BRANCHES;
type StatusFilter = InventoryUnitStatus | typeof ALL_STATUSES;

export function InventoryPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [modelFilter, setModelFilter] = useState<ModelFilter>(ALL_MODELS);
  const [branchFilter, setBranchFilter] = useState<BranchFilter>(ALL_BRANCHES);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const currentSession = readDemoSession();
    const storedUnits = readInventoryUnits();

    setSession(currentSession);
    setUnits(storedUnits);
    setSelectedUnitId(storedUnits[0]?.id ?? "");
    setBranchFilter(
      currentSession?.role === "Gerente"
        ? (currentSession.branchId as DesiredBranchId)
        : ALL_BRANCHES,
    );

    return subscribeToDemoSession(() => {
      const nextSession = readDemoSession();
      setSession(nextSession);
      setBranchFilter(
        nextSession?.role === "Gerente"
          ? (nextSession.branchId as DesiredBranchId)
          : ALL_BRANCHES,
      );
    });
  }, []);

  const summaries = useMemo(() => buildInventoryModelSummaries(units), [units]);
  const visibleSummaries = useMemo(() => {
    if (modelFilter === ALL_MODELS) return summaries;
    return summaries.filter((summary) => summary.modeloSlug === modelFilter);
  }, [modelFilter, summaries]);

  const roleScopedUnits = useMemo(() => {
    if (!session) return [];
    if (session.role === "Gerente") {
      return units.filter((unit) => unit.sucursalActualId === session.branchId);
    }

    return units;
  }, [session, units]);

  const filteredUnits = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return roleScopedUnits.filter((unit) => {
      const matchesModel =
        modelFilter === ALL_MODELS || unit.modeloSlug === modelFilter;
      const matchesBranch =
        branchFilter === ALL_BRANCHES || unit.sucursalActualId === branchFilter;
      const matchesStatus =
        statusFilter === ALL_STATUSES || unit.estado === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        unit.vin.toLowerCase().includes(normalizedQuery) ||
        unit.modelo.toLowerCase().includes(normalizedQuery) ||
        unit.chasis.toLowerCase().includes(normalizedQuery) ||
        unit.motor.toLowerCase().includes(normalizedQuery);

      return matchesModel && matchesBranch && matchesStatus && matchesQuery;
    });
  }, [branchFilter, modelFilter, query, roleScopedUnits, statusFilter]);

  const selectedUnit =
    filteredUnits.find((unit) => unit.id === selectedUnitId) ??
    filteredUnits[0] ??
    null;

  useEffect(() => {
    if (!selectedUnit && filteredUnits[0]) {
      setSelectedUnitId(filteredUnits[0].id);
    }
  }, [filteredUnits, selectedUnit]);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Package className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">
          Sesión interna requerida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Inicia sesión demo para consultar el inventario operativo.
        </p>
        <Link
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
          href="/panel"
        >
          Ir a inicio de sesión
        </Link>
      </Card>
    );
  }

  const branchOptions =
    session.role === "Gerente"
      ? desiredBranches.filter((branch) => branch.id === session.branchId)
      : desiredBranches;
  const isSellerInventory = session.role === "Vendedor";
  const isManagerInventory = session.role === "Gerente";
  const lowStockSummaries = visibleSummaries.filter((summary) => {
    const branchStock = summary.porSucursal.find((branch) => branch.sucursalId === session.branchId);
    return (branchStock?.disponible ?? 0) <= 1;
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge tone="red">Inventario operativo</Badge>
          <h2 className="mt-4 text-3xl font-black text-white">
            Inventario por sucursal
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Unidades individuales basadas en modelos reales del catálogo. La
            información permanece dentro de `/panel` y queda preparada para
            trazabilidad y traslados futuros.
          </p>
        </div>
        <Card className="p-4">
          <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
            Alcance de sesión
          </div>
          <div className="mt-2 text-sm font-black text-white">
            {session.role} / {session.branchName}
          </div>
          <div className="mt-1 text-xs text-zinc-500">{scopeCopy(session)}</div>
        </Card>
      </div>

      {isSellerInventory ? (
        <Card className="border-blue-500/20 bg-blue-500/8 p-5">
          <div className="text-sm font-black text-white">Consulta comercial de disponibilidad</div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            El Vendedor consulta modelo, sucursal, unidades disponibles, reservadas, en transito y colores para ofrecer opciones. Datos tecnicos de unidad quedan secundarios y no se muestran costos.
          </p>
        </Card>
      ) : null}

      {isManagerInventory ? (
        <Card className="border-yellow-500/20 bg-yellow-500/8 p-5">
          <div className="text-sm font-black text-white">Supervision de inventario de sucursal</div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Revisa disponibles, reservadas, en transito y vendidas para decidir ofertas, reservas o traslados. No se muestran costos contables globales en esta vista.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MiniAlert label="Alertas de bajo stock" value={lowStockSummaries.length} />
            <MiniAlert label="Oportunidad de traslado" value={lowStockSummaries.length ? "Revisar" : "Normal"} />
            <MiniAlert label="Vista por sucursal" value={session.branchName} />
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 text-red-400" />
          <h3 className="text-lg font-black text-white">Filtros</h3>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <FilterSelect
            ariaLabel="Filtrar por modelo"
            name="inventory-model"
            onChange={(value) => setModelFilter(value as ModelFilter)}
            value={modelFilter}
          >
            <option value={ALL_MODELS}>Todos los modelos</option>
            {motorcycles.map((motorcycle) => (
              <option key={motorcycle.slug} value={motorcycle.slug}>
                {motorcycle.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            ariaLabel="Filtrar por sucursal"
            name="inventory-branch"
            onChange={(value) => setBranchFilter(value as BranchFilter)}
            value={branchFilter}
          >
            {session.role !== "Gerente" ? (
              <option value={ALL_BRANCHES}>Todas las sucursales</option>
            ) : null}
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect
            ariaLabel="Filtrar por estado"
            name="inventory-status"
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            value={statusFilter}
          >
            <option value={ALL_STATUSES}>Todos los estados</option>
            {inventoryUnitStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </FilterSelect>

          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <input
              className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 pl-11 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
              name="inventory-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="VIN, chasis, motor"
              value={query}
            />
          </label>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Unidades visibles" value={filteredUnits.length} />
        <MetricCard
          label="Disponibles"
          value={filteredUnits.filter((unit) => unit.estado === "Disponible").length}
        />
        <MetricCard
          label="Reservadas"
          value={filteredUnits.filter((unit) => unit.estado === "Reservada").length}
        />
        <MetricCard
          label="En tránsito"
          value={filteredUnits.filter((unit) => unit.estado === "En tránsito").length}
        />
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3">
          <MapPin className="h-5 w-5 text-red-400" />
          <h3 className="text-xl font-black text-white">
            Vista agregada por modelo
          </h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Disponibilidad general por sucursal. Los gerentes conservan la vista
          de sus unidades en la tabla inferior.
        </p>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {visibleSummaries.map((summary) => (
            <div
              className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"
              key={summary.modeloSlug}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-white">
                    {summary.modelo}
                  </h4>
                  <p className="mt-1 text-sm text-zinc-500">
                    Total: {summary.total} / Disponible: {summary.disponible}
                  </p>
                </div>
                <Badge tone="gray">{summary.total} unidades</Badge>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {summary.porSucursal.map((branch) => (
                  <div
                    className="rounded-xl border border-white/10 bg-black/20 p-3"
                    key={`${summary.modeloSlug}-${branch.sucursalId}`}
                  >
                    <div className="text-xs font-black uppercase tracking-[0.08em] text-zinc-500">
                      {branch.sucursalNombre}
                    </div>
                    <div className="mt-1 text-sm font-black text-white">
                      {branch.total} total / {branch.disponible} disp.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className={cn("hidden border-b border-white/10 px-6 py-4 text-xs font-black uppercase tracking-[0.12em] text-zinc-500 xl:grid", isSellerInventory ? "grid-cols-[1.2fr_1fr_1fr_1fr_1fr]" : "grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr]")}>
            {isSellerInventory ? (
              <>
                <div>Modelo</div>
                <div>Sucursal</div>
                <div>Estado</div>
                <div>Color</div>
                <div>Accion</div>
              </>
            ) : (
              <>
                <div>VIN</div>
                <div>Modelo</div>
                <div>Sucursal actual</div>
                <div>Estado</div>
                <div>Color</div>
                <div>Chasis</div>
                <div>Motor</div>
              </>
            )}
          </div>

          {filteredUnits.length ? (
            filteredUnits.map((unit) => (
              <button
                className={cn(
                  cn("grid w-full gap-4 border-b border-white/7 px-6 py-5 text-left transition last:border-b-0 xl:items-center", isSellerInventory ? "xl:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]" : "xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr_1fr]"),
                  selectedUnit?.id === unit.id
                    ? "bg-red-500/10"
                    : "hover:bg-white/[0.045]",
                )}
                key={unit.id}
                onClick={() => setSelectedUnitId(unit.id)}
                type="button"
              >
                {!isSellerInventory ? (
                  <div className="font-mono text-xs font-black text-white">
                    {unit.vin}
                  </div>
                ) : null}
                <div className="text-sm font-semibold text-zinc-300">
                  {unit.modelo}
                </div>
                <div className="text-sm text-zinc-400">{unit.sucursalActual}</div>
                <div>
                  <Badge tone={statusTone(unit.estado)}>{unit.estado}</Badge>
                </div>
                <div className="text-sm text-zinc-400">
                  {unit.color ?? PENDING_CATALOG_INFO}
                </div>
                {isSellerInventory ? (
                  <div className="text-sm font-semibold text-red-200">
                    {unit.estado === "Disponible" ? "Crear reserva" : "Consultar disponibilidad"}
                  </div>
                ) : (
                  <>
                    <div className="font-mono text-xs text-zinc-500">
                      {unit.chasis}
                    </div>
                    <div className="font-mono text-xs text-zinc-500">
                      {unit.motor}
                    </div>
                  </>
                )}
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-zinc-500">
              No hay unidades para estos filtros. Ajustá la búsqueda o esperá el registro de nuevas unidades operativas.
            </div>
          )}
        </Card>

        <UnitDetail unit={selectedUnit} />
      </div>
    </section>
  );
}

function UnitDetail({ unit }: { unit: InventoryUnit | null }) {
  if (!unit) {
    return (
      <Card className="p-8 text-center">
        <Package className="mx-auto h-10 w-10 text-zinc-600" />
        <h3 className="mt-4 text-xl font-black text-white">Sin seleccion</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Selecciona una unidad para revisar su trazabilidad.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <Badge tone={statusTone(unit.estado)}>{unit.estado}</Badge>
      <h3 className="mt-4 text-2xl font-black text-white">{unit.modelo}</h3>
      <p className="mt-1 font-mono text-xs text-zinc-600">{unit.vin}</p>

      <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/[0.045] p-5">
        <DetailLine label="Unidad" value={unit.id} />
        <DetailLine label="Sucursal actual" value={unit.sucursalActual} />
        <DetailLine label="Color" value={unit.color ?? PENDING_CATALOG_INFO} />
        <DetailLine label="Chasis" value={unit.chasis} />
        <DetailLine label="Motor" value={unit.motor} />
        <DetailLine label="Actualizacion" value={formatDate(unit.fechaActualizacion)} />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-red-400" />
          <h4 className="text-lg font-black text-white">Trazabilidad</h4>
        </div>
        <div className="mt-4 space-y-3">
          {unit.historialMovimientos.map((movement) => (
            <div
              className="rounded-xl border border-white/10 bg-white/[0.045] p-4"
              key={movement.id}
            >
              <div className="text-sm font-black text-white">{movement.tipo}</div>
              <div className="mt-1 text-sm leading-6 text-zinc-500">
                {movement.sucursalDestinoNombre} / {movement.estado}
              </div>
              <div className="mt-2 text-xs text-zinc-600">
                {formatDate(movement.fecha)}
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {movement.notas}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-zinc-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-white">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-500/15 text-red-400">
          <Package className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function MiniAlert({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs font-black uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="max-w-[220px] text-right text-sm font-black text-white">
        {value}
      </span>
    </div>
  );
}

function FilterSelect({
  ariaLabel,
  children,
  name,
  onChange,
  value,
}: {
  ariaLabel: string;
  children: ReactNode;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
      name={name}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

function statusTone(status: InventoryUnitStatus) {
  if (status === "Disponible") return "green" as const;
  if (status === "Reservada" || status === "En tránsito") return "blue" as const;
  if (status === "Vendida" || status === "Entregada") return "gray" as const;
  return "red" as const;
}

function scopeCopy(session: DemoSession) {
  if (session.role === "Gerente") {
    return `Unidades de ${session.branchName} y disponibilidad general por modelo.`;
  }

  if (session.role === "Administrador") {
    return "Inventario global de todas las sucursales.";
  }

  return "Consulta operativa de disponibilidad para atencion comercial.";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
