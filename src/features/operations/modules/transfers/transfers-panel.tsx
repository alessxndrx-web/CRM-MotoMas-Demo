"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Clock3,
  History,
  PackageSearch,
  Search,
  Send,
  Truck,
  XCircle,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { desiredBranches, type DesiredBranchId } from "@/data/operations/leads";
import type { InventoryUnit } from "@/data/operations/inventory";
import {
  TRANSFER_APPROVED_STATUS,
  TRANSFER_CANCELLED_STATUS,
  TRANSFER_IN_TRANSIT_STATUS,
  TRANSFER_PENDING_STATUS,
  TRANSFER_RECEIVED_STATUS,
  transferOrderStatuses,
  type TransferOrder,
  type TransferOrderStatus,
} from "@/data/operations/transfers";
import { readInventoryUnits } from "@/features/operations/services/inventory-service";
import {
  approveTransferOrder,
  canCancelTransfer,
  canManagerHandleTransfer,
  canManagerReceiveTransfer,
  cancelTransferOrder,
  createTransferOrder,
  markTransferInTransit,
  readTransferOrders,
  receiveTransferOrder,
} from "@/features/operations/services/transfer-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

const ALL_BRANCHES = "todas";
const ALL_STATUSES = "todos";
const INVENTORY_AVAILABLE_STATUS = "Disponible";

type BranchFilter = DesiredBranchId | typeof ALL_BRANCHES;
type StatusFilter = TransferOrderStatus | typeof ALL_STATUSES;
type Feedback = { tone: "success" | "error"; message: string } | null;

export function TransfersPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [orders, setOrders] = useState<TransferOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [originBranchId, setOriginBranchId] = useState<DesiredBranchId>(
    "ciudad-sandino",
  );
  const [destinationBranchId, setDestinationBranchId] =
    useState<DesiredBranchId>("central");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [branchFilter, setBranchFilter] = useState<BranchFilter>(ALL_BRANCHES);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    const currentSession = readDemoSession();
    const storedUnits = readInventoryUnits();
    const storedOrders = readTransferOrders();
    const defaults = getDraftDefaults(currentSession, storedUnits, storedOrders);

    setSession(currentSession);
    setUnits(storedUnits);
    setOrders(storedOrders);
    setSelectedOrderId(storedOrders[0]?.id ?? "");
    setOriginBranchId(defaults.originBranchId);
    setDestinationBranchId(defaults.destinationBranchId);
    setSelectedUnitId(defaults.unitId);
    setBranchFilter(
      currentSession?.role === "Gerente" && currentSession.branchId !== "all"
        ? currentSession.branchId
        : ALL_BRANCHES,
    );

    return subscribeToDemoSession(() => {
      const nextSession = readDemoSession();
      const nextUnits = readInventoryUnits();
      const nextOrders = readTransferOrders();
      const nextDefaults = getDraftDefaults(nextSession, nextUnits, nextOrders);

      setSession(nextSession);
      setUnits(nextUnits);
      setOrders(nextOrders);
      setSelectedOrderId(nextOrders[0]?.id ?? "");
      setOriginBranchId(nextDefaults.originBranchId);
      setDestinationBranchId(nextDefaults.destinationBranchId);
      setSelectedUnitId(nextDefaults.unitId);
      setBranchFilter(
        nextSession?.role === "Gerente" && nextSession.branchId !== "all"
          ? nextSession.branchId
          : ALL_BRANCHES,
      );
    });
  }, []);

  const activeUnitIds = useMemo(
    () =>
      new Set(
        orders
          .filter((order) =>
            [
              TRANSFER_PENDING_STATUS,
              TRANSFER_APPROVED_STATUS,
              TRANSFER_IN_TRANSIT_STATUS,
            ].includes(order.estado),
          )
          .map((order) => order.unidadId),
      ),
    [orders],
  );

  const availableUnits = useMemo(
    () =>
      units.filter(
        (unit) =>
          unit.estado === INVENTORY_AVAILABLE_STATUS &&
          !activeUnitIds.has(unit.id),
      ),
    [activeUnitIds, units],
  );

  const originUnits = useMemo(
    () =>
      availableUnits.filter(
        (unit) =>
          unit.sucursalActualId === originBranchId &&
          unit.sucursalActualId !== destinationBranchId,
      ),
    [availableUnits, destinationBranchId, originBranchId],
  );

  useEffect(() => {
    if (!originUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(originUnits[0]?.id ?? "");
    }
  }, [originUnits, selectedUnitId]);

  const scopedOrders = useMemo(
    () => filterOrdersBySession(orders, session),
    [orders, session],
  );

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return scopedOrders.filter((order) => {
      const matchesStatus =
        statusFilter === ALL_STATUSES || order.estado === statusFilter;
      const matchesBranch =
        branchFilter === ALL_BRANCHES ||
        order.sucursalOrigenId === branchFilter ||
        order.sucursalDestinoId === branchFilter;
      const matchesQuery =
        !normalizedQuery ||
        order.numeroTraslado.toLowerCase().includes(normalizedQuery) ||
        order.vin.toLowerCase().includes(normalizedQuery) ||
        order.modelo.toLowerCase().includes(normalizedQuery) ||
        order.solicitanteNombre.toLowerCase().includes(normalizedQuery);

      return matchesStatus && matchesBranch && matchesQuery;
    });
  }, [branchFilter, query, scopedOrders, statusFilter]);

  const selectedOrder =
    filteredOrders.find((order) => order.id === selectedOrderId) ??
    filteredOrders[0] ??
    null;

  useEffect(() => {
    if (!selectedOrder && filteredOrders[0]) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrder]);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Truck className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          Inicia sesión para continuar
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Inicia sesión para gestionar traslados entre sucursales.
        </p>
        <Link
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          href="/panel"
        >
          Ir a inicio de sesión
        </Link>
      </Card>
    );
  }

  function applyMutation(result: {
    ok: boolean;
    message: string;
    orders: TransferOrder[];
    units: InventoryUnit[];
    order: TransferOrder | null;
  }) {
    setOrders(result.orders);
    setUnits(result.units);
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
    if (result.order) {
      setSelectedOrderId(result.order.id);
    }
  }

  function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const result = createTransferOrder(
      {
        originBranchId,
        destinationBranchId,
        unitId: selectedUnitId,
        motivo,
      },
      session,
    );

    applyMutation(result);
    if (result.ok) {
      setMotivo("");
    }
  }

  function runAction(action: "approve" | "transit" | "receive" | "cancel") {
    if (!selectedOrder || !session) return;

    const actions = {
      approve: approveTransferOrder,
      transit: markTransferInTransit,
      receive: receiveTransferOrder,
      cancel: cancelTransferOrder,
    };

    applyMutation(actions[action](selectedOrder.id, session));
  }

  const canCreateRequest = session.role === "Vendedor" && session.branchId !== "all";
  const branchOptions =
    session.role === "Gerente" && session.branchId !== "all"
      ? desiredBranches.filter((branch) => branch.id === session.branchId)
      : desiredBranches;

  return (
    <section className="space-y-6">
      <PageHeader
        actions={<Badge tone="slate">{session.branchName}</Badge>}
        description={scopeCopy(session)}
        eyebrow="Traslados internos"
        title="Traslados entre sucursales"
      />

      {canCreateRequest ? (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-slate-900">
              Crear solicitud de traslado
            </h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Solo aparecen unidades disponibles y sin traslado activo. La unidad
            no cambia de estado hasta que la gerencia marque el despacho en
            tránsito.
          </p>

          <form className="mt-6 grid gap-4" onSubmit={submitTransfer}>
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Sucursal origen">
                <FilterSelect
                  ariaLabel="Sucursal origen"
                  name="transfer-origin"
                  onChange={(value) => setOriginBranchId(value as DesiredBranchId)}
                  value={originBranchId}
                >
                  {desiredBranches
                    .filter((branch) => branch.id !== destinationBranchId)
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                </FilterSelect>
              </Field>

              <Field label="Sucursal destino">
                <FilterSelect
                  ariaLabel="Sucursal destino"
                  name="transfer-destination"
                  onChange={(value) =>
                    setDestinationBranchId(value as DesiredBranchId)
                  }
                  value={destinationBranchId}
                >
                  {session.branchId !== "all" ? (
                    <option value={session.branchId}>{session.branchName}</option>
                  ) : null}
                </FilterSelect>
              </Field>

              <Field label="Unidad disponible">
                <FilterSelect
                  ariaLabel="Unidad disponible"
                  name="transfer-unit"
                  onChange={setSelectedUnitId}
                  value={selectedUnitId}
                >
                  {originUnits.length ? (
                    originUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.vin} / {unit.modelo}
                      </option>
                    ))
                  ) : (
                    <option value="">Sin unidades disponibles</option>
                  )}
                </FilterSelect>
              </Field>
            </div>

            <Field label="Motivo">
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                name="transfer-reason"
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Ej. Solicitud para atender expediente en sucursal destino"
                required
                value={motivo}
              />
            </Field>

            <Button
              className="w-full sm:w-auto"
              disabled={!selectedUnitId}
              type="submit"
            >
              <Send className="h-4 w-4" />
              Crear solicitud
            </Button>
          </form>
        </Card>
      ) : null}

      {feedback ? (
        <Card
          className={cn(
            "p-4 text-sm font-semibold",
            feedback.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {feedback.message}
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          label="Pendientes"
          value={
            scopedOrders.filter((order) => order.estado === TRANSFER_PENDING_STATUS)
              .length
          }
        />
        <MetricCard
          label="Aprobados"
          value={
            scopedOrders.filter((order) => order.estado === TRANSFER_APPROVED_STATUS)
              .length
          }
        />
        <MetricCard
          label="En tránsito"
          value={
            scopedOrders.filter(
              (order) => order.estado === TRANSFER_IN_TRANSIT_STATUS,
            ).length
          }
        />
        <MetricCard
          label="Recibidos"
          value={
            scopedOrders.filter((order) => order.estado === TRANSFER_RECEIVED_STATUS)
              .length
          }
        />
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_220px_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-11"
              name="transfer-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por traslado, VIN, modelo o solicitante"
              value={query}
            />
          </label>
          <FilterSelect
            ariaLabel="Filtrar por estado"
            name="transfer-status"
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            value={statusFilter}
          >
            <option value={ALL_STATUSES}>Todos los estados</option>
            {transferOrderStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            ariaLabel="Filtrar por sucursal"
            name="transfer-branch"
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
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_430px]">
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[0.9fr_0.85fr_1fr_1fr_1.2fr_1fr_1fr] border-b border-slate-200 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 xl:grid">
            <div>Traslado</div>
            <div>Estado</div>
            <div>Origen</div>
            <div>Destino</div>
            <div>Unidad</div>
            <div>Fechas</div>
            <div>Responsable</div>
          </div>

          {filteredOrders.length ? (
            filteredOrders.map((order) => (
              <button
                className={cn(
                  "grid w-full gap-4 border-b border-slate-100 px-6 py-5 text-left transition last:border-b-0 xl:grid-cols-[0.9fr_0.85fr_1fr_1fr_1.2fr_1fr_1fr] xl:items-center",
                  selectedOrder?.id === order.id
                    ? "bg-red-50"
                    : "hover:bg-slate-100",
                )}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                type="button"
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-slate-900">
                    {order.numeroTraslado}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {formatDate(order.fechaSolicitud)}
                  </div>
                </div>
                <div>
                  <Badge tone={statusTone(order.estado)}>{order.estado}</Badge>
                </div>
                <div className="text-sm text-slate-500">
                  {order.sucursalOrigenNombre}
                </div>
                <div className="text-sm text-slate-500">
                  {order.sucursalDestinoNombre}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-600">
                    {order.modelo}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    {order.vin}
                  </div>
                </div>
                <div className="text-xs leading-5 text-slate-500">
                  {dateSummary(order)}
                </div>
                <div className="text-sm text-slate-500">
                  {currentResponsible(order)}
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              Aún no hay traslados para este alcance. Creá una solicitud cuando una unidad disponible deba moverse entre sucursales.
            </div>
          )}
        </Card>

        <TransferDetail
          onApprove={() => runAction("approve")}
          onCancel={() => runAction("cancel")}
          onReceive={() => runAction("receive")}
          onTransit={() => runAction("transit")}
          order={selectedOrder}
          session={session}
        />
      </div>
    </section>
  );
}

function TransferDetail({
  onApprove,
  onCancel,
  onReceive,
  onTransit,
  order,
  session,
}: {
  onApprove: () => void;
  onCancel: () => void;
  onReceive: () => void;
  onTransit: () => void;
  order: TransferOrder | null;
  session: DemoSession;
}) {
  if (!order) {
    return (
      <Card className="p-8 text-center">
        <PackageSearch className="mx-auto h-10 w-10 text-slate-400" />
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Sin seleccion</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Selecciona una orden para ver detalle y acciones.
        </p>
      </Card>
    );
  }

  const canApprove =
    order.estado === TRANSFER_PENDING_STATUS &&
    canManagerHandleTransfer(order, session);
  const canTransit =
    order.estado === TRANSFER_APPROVED_STATUS &&
    canManagerHandleTransfer(order, session);
  const canReceive =
    order.estado === TRANSFER_IN_TRANSIT_STATUS &&
    canManagerReceiveTransfer(order, session);
  const canCancel = canCancelTransfer(order, session);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone={statusTone(order.estado)}>{order.estado}</Badge>
          <h3 className="mt-4 text-xl font-semibold text-slate-900">
            {order.numeroTraslado}
          </h3>
          <p className="mt-1 font-mono text-xs text-slate-400">{order.vin}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600">
          <Truck className="h-6 w-6" />
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <DetailLine label="Modelo" value={order.modelo} />
        <DetailLine
          label="Ruta"
          value={`${order.sucursalOrigenNombre} -> ${order.sucursalDestinoNombre}`}
        />
        <DetailLine label="Solicitante" value={order.solicitanteNombre} />
        <DetailLine label="Motivo" value={order.motivo} />
        <DetailLine label="Solicitud" value={formatDate(order.fechaSolicitud)} />
        <DetailLine label="Responsable" value={currentResponsible(order)} />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Linea de estado</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {transferTimeline.map((step) => (
            <div
              className={cn(
                "rounded-xl border px-3 py-2 text-center text-xs font-semibold",
                isTransferStepReached(order.estado, step.status)
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-slate-50 text-slate-500",
              )}
              key={step.label}
            >
              {step.label}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        {canApprove ? (
          <Button className="w-full" onClick={onApprove} variant="success">
            <CheckCircle2 className="h-4 w-4" />
            Aprobar
          </Button>
        ) : null}
        {canTransit ? (
          <Button className="w-full" onClick={onTransit}>
            <Truck className="h-4 w-4" />
            Marcar en tránsito
          </Button>
        ) : null}
        {canReceive ? (
          <Button className="w-full" onClick={onReceive} variant="success">
            <CheckCircle2 className="h-4 w-4" />
            Confirmar recepcion
          </Button>
        ) : null}
        {canCancel ? (
          <Button className="w-full" onClick={onCancel} variant="danger">
            <XCircle className="h-4 w-4" />
            Cancelar
          </Button>
        ) : null}
        {!canApprove && !canTransit && !canReceive && !canCancel ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
            No hay acciones disponibles para tu rol y el estado actual.
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-red-600" />
          <h4 className="text-base font-semibold text-slate-900">Historial</h4>
        </div>
        <div className="mt-4 space-y-3">
          {order.historial.map((entry) => (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              key={entry.id}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge tone={statusTone(entry.estado)}>{entry.estado}</Badge>
                <span className="text-xs text-slate-400">
                  {formatDate(entry.fecha)}
                </span>
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {entry.usuarioNombre}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {entry.notas}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function filterOrdersBySession(
  orders: TransferOrder[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return orders;

  if (session.role === "Gerente" && session.branchId !== "all") {
    return orders.filter(
      (order) =>
        order.sucursalOrigenId === session.branchId ||
        order.sucursalDestinoId === session.branchId,
    );
  }

  return orders.filter((order) => order.solicitanteId === session.userId);
}

function getDraftDefaults(
  session: DemoSession | null,
  units: InventoryUnit[],
  orders: TransferOrder[],
): {
  destinationBranchId: DesiredBranchId;
  originBranchId: DesiredBranchId;
  unitId: string;
} {
  const destinationBranchId =
    session?.role === "Vendedor" && session.branchId !== "all"
      ? session.branchId
      : "central";
  const activeUnitIds = new Set(
    orders
      .filter((order) =>
        [
          TRANSFER_PENDING_STATUS,
          TRANSFER_APPROVED_STATUS,
          TRANSFER_IN_TRANSIT_STATUS,
        ].includes(order.estado),
      )
      .map((order) => order.unidadId),
  );
  const availableUnits = units.filter(
    (unit) =>
      unit.estado === INVENTORY_AVAILABLE_STATUS && !activeUnitIds.has(unit.id),
  );
  const originBranch =
    desiredBranches.find(
      (branch) =>
        branch.id !== destinationBranchId &&
        availableUnits.some((unit) => unit.sucursalActualId === branch.id),
    ) ?? desiredBranches.find((branch) => branch.id !== destinationBranchId);
  const originBranchId = originBranch?.id ?? "ciudad-sandino";
  const unitId =
    availableUnits.find((unit) => unit.sucursalActualId === originBranchId)?.id ??
    "";

  return { destinationBranchId, originBranchId, unitId };
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600">
          <Clock3 className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function Field({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
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
      className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      name={name}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="max-w-[240px] text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function statusTone(status: TransferOrderStatus) {
  if (status === TRANSFER_RECEIVED_STATUS) return "green" as const;
  if (status === TRANSFER_APPROVED_STATUS || status === TRANSFER_IN_TRANSIT_STATUS) {
    return "blue" as const;
  }
  if (status === TRANSFER_CANCELLED_STATUS) return "gray" as const;
  return "yellow" as const;
}

const transferTimeline = [
  { label: "Solicitud", status: TRANSFER_PENDING_STATUS },
  { label: "Aprobado", status: TRANSFER_APPROVED_STATUS },
  { label: "En transito", status: TRANSFER_IN_TRANSIT_STATUS },
  { label: "Recibido", status: TRANSFER_RECEIVED_STATUS },
] as const;

function isTransferStepReached(current: TransferOrderStatus, target: TransferOrderStatus) {
  const currentIndex = transferTimeline.findIndex((step) => step.status === current);
  const targetIndex = transferTimeline.findIndex((step) => step.status === target);
  return currentIndex >= targetIndex && currentIndex !== -1 && targetIndex !== -1;
}

function currentResponsible(order: TransferOrder) {
  if (order.estado === TRANSFER_RECEIVED_STATUS) {
    return order.recibidoPorNombre ?? order.solicitanteNombre;
  }
  if (order.estado === TRANSFER_IN_TRANSIT_STATUS) {
    return order.despachadoPorNombre ?? order.aprobadoPorNombre ?? order.solicitanteNombre;
  }
  if (order.estado === TRANSFER_APPROVED_STATUS) {
    return order.aprobadoPorNombre ?? order.solicitanteNombre;
  }
  if (order.estado === TRANSFER_CANCELLED_STATUS) {
    return order.canceladoPorNombre ?? order.solicitanteNombre;
  }

  return order.solicitanteNombre;
}

function dateSummary(order: TransferOrder) {
  const dates = [
    `Sol. ${formatDate(order.fechaSolicitud)}`,
    order.fechaAprobacion ? `Apr. ${formatDate(order.fechaAprobacion)}` : null,
    order.fechaDespacho ? `Desp. ${formatDate(order.fechaDespacho)}` : null,
    order.fechaRecepcion ? `Rec. ${formatDate(order.fechaRecepcion)}` : null,
  ].filter(Boolean);

  return dates.join("\n");
}

function scopeCopy(session: DemoSession) {
  if (session.role === "Vendedor") {
    return "Puedes solicitar traslados hacia tu sucursal usando unidades disponibles.";
  }

  if (session.role === "Gerente") {
    return "Puedes aprobar, despachar y recibir traslados relacionados con tu sucursal.";
  }

  return "Vista global de todas las ordenes de traslado.";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
