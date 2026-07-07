"use client";

import Link from "next/link";
import {
  CalendarCheck,
  History,
  PackageCheck,
  Search,
  XCircle,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type {
  CustomerFileRecord,
  CustomerRecord,
} from "@/data/operations/customer-files";
import type { PublicLead } from "@/data/operations/leads";
import {
  RESERVATION_ACTIVE_STATUS,
  RESERVATION_CANCELLED_STATUS,
  RESERVATION_COMPLETED_STATUS,
  reservationStatuses,
  type ReservationRecord,
  type ReservationStatus,
} from "@/data/operations/reservations";
import type { InventoryUnit } from "@/data/operations/inventory";
import {
  readCustomerFiles,
  readCustomers,
} from "@/features/operations/services/customer-files-service";
import { readInventoryUnits } from "@/features/operations/services/inventory-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import {
  filterCustomerFilesBySession,
  filterReservationsBySession,
} from "@/features/operations/services/operation-scope-service";
import {
  cancelReservation,
  createReservation,
  hasActiveReservationForUnit,
  readReservations,
} from "@/features/operations/services/reservation-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

const ALL_STATUSES = "todos";
const MANUAL_TARGET = "manual";
const INVENTORY_AVAILABLE_STATUS = "Disponible";

type StatusFilter = ReservationStatus | typeof ALL_STATUSES;
type Feedback = { tone: "success" | "error"; message: string } | null;

export function ReservationsPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [targetId, setTargetId] = useState(MANUAL_TARGET);
  const [clienteNombre, setClienteNombre] = useState("");
  const [observacion, setObservacion] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    const currentSession = readDemoSession();
    const storedUnits = readInventoryUnits();
    const storedReservations = readReservations();

    setSession(currentSession);
    setUnits(storedUnits);
    setReservations(storedReservations);
    setCustomers(readCustomers());
    setFiles(readCustomerFiles());
    setLeads(readLeadInboxLeads());
    setSelectedReservationId(storedReservations[0]?.id ?? "");
    setSelectedUnitId(
      getAvailableUnitsForSession(storedUnits, storedReservations, currentSession)[0]
        ?.id ?? "",
    );

    return subscribeToDemoSession(() => {
      const nextSession = readDemoSession();
      const nextUnits = readInventoryUnits();
      const nextReservations = readReservations();

      setSession(nextSession);
      setUnits(nextUnits);
      setReservations(nextReservations);
      setCustomers(readCustomers());
      setFiles(readCustomerFiles());
      setLeads(readLeadInboxLeads());
      setSelectedReservationId(nextReservations[0]?.id ?? "");
      setSelectedUnitId(
        getAvailableUnitsForSession(nextUnits, nextReservations, nextSession)[0]
          ?.id ?? "",
      );
    });
  }, []);

  const availableUnits = useMemo(
    () => getAvailableUnitsForSession(units, reservations, session),
    [reservations, session, units],
  );
  const scopedFiles = useMemo(
    () => filterCustomerFilesBySession(files, leads, session),
    [files, leads, session],
  );

  useEffect(() => {
    if (!availableUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(availableUnits[0]?.id ?? "");
    }
  }, [availableUnits, selectedUnitId]);

  const scopedReservations = useMemo(
    () => filterReservationsBySession(reservations, session),
    [reservations, session],
  );

  const filteredReservations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return scopedReservations.filter((reservation) => {
      const matchesStatus =
        statusFilter === ALL_STATUSES || reservation.estado === statusFilter;
      const matchesQuery =
        !normalizedQuery ||
        reservation.numeroReserva.toLowerCase().includes(normalizedQuery) ||
        reservation.clienteNombre.toLowerCase().includes(normalizedQuery) ||
        reservation.vin.toLowerCase().includes(normalizedQuery) ||
        reservation.modelo.toLowerCase().includes(normalizedQuery) ||
        (reservation.numeroExpediente ?? "")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesStatus && matchesQuery;
    });
  }, [query, scopedReservations, statusFilter]);

  const selectedReservation =
    filteredReservations.find(
      (reservation) => reservation.id === selectedReservationId,
    ) ??
    filteredReservations[0] ??
    null;

  useEffect(() => {
    if (!selectedReservation && filteredReservations[0]) {
      setSelectedReservationId(filteredReservations[0].id);
    }
  }, [filteredReservations, selectedReservation]);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <CalendarCheck className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">
          Sesión interna requerida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Inicia sesión demo para gestionar reservas operativas.
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

  function applyMutation(result: {
    ok: boolean;
    message: string;
    reservations: ReservationRecord[];
    units: InventoryUnit[];
    reservation: ReservationRecord | null;
  }) {
    setReservations(result.reservations);
    setUnits(result.units);
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
    if (result.reservation) {
      setSelectedReservationId(result.reservation.id);
    }
  }

  function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const result = createReservation(
      {
        unitId: selectedUnitId,
        customerFileId: targetId === MANUAL_TARGET ? null : targetId,
        clienteNombre,
        observacion,
      },
      session,
    );

    applyMutation(result);
    if (result.ok) {
      setClienteNombre("");
      setObservacion("");
      setTargetId(MANUAL_TARGET);
    }
  }

  function runCancelReservation() {
    if (!selectedReservation || !session) return;
    applyMutation(cancelReservation(selectedReservation.id, session));
  }

  const canCreateReservation =
    session.role === "Vendedor" && session.branchId !== "all";
  const managerRiskReservations = scopedReservations.filter(
    (reservation) => reservation.estado === RESERVATION_ACTIVE_STATUS && !reservation.expedienteId,
  );
  const targetOptions = scopedFiles.map((file) => ({
    file,
    customer: customers.find((customer) => customer.id === file.clienteId) ?? null,
  }));

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge tone="red">Reservas operativas</Badge>
          <h2 className="mt-4 text-3xl font-black text-white">
            Reservas de unidades
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Reserva unidades disponibles para un cliente o expediente sin
            convertir el flujo en venta. Cada reserva actualiza el inventario y
            conserva trazabilidad de la unidad.
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

      {session.role === "Gerente" ? (
        <Card className="border-yellow-500/20 bg-yellow-500/8 p-5">
          <div className="text-sm font-black text-white">Riesgo de reservas</div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Supervisa reservas activas por vendedor, unidad y expediente. Las reservas sin expediente deben revisarse antes de avanzar a venta.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <RiskMetric label="Sin expediente" value={managerRiskReservations.length} />
            <RiskMetric label="Activas" value={scopedReservations.filter((reservation) => reservation.estado === RESERVATION_ACTIVE_STATUS).length} />
            <RiskMetric label="Canceladas/completadas" value={scopedReservations.filter((reservation) => reservation.estado !== RESERVATION_ACTIVE_STATUS).length} />
          </div>
        </Card>
      ) : null}

      {canCreateReservation ? (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <PackageCheck className="h-5 w-5 text-red-400" />
            <h3 className="text-xl font-black text-white">
              Crear reserva
            </h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Solo aparecen unidades disponibles de {session.branchName}. Al
            reservar, la unidad cambia a Reservada en inventario.
          </p>
          <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-4 text-sm leading-6 text-yellow-100">
            Recomendacion: conecta la reserva a un expediente cuando exista. Una reserva sin expediente sirve para demo o atencion inmediata, pero debe regularizarse antes del cierre comercial.
          </div>

          <form className="mt-6 grid gap-4" onSubmit={submitReservation}>
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Cliente o expediente">
                <FilterSelect
                  ariaLabel="Cliente o expediente"
                  name="reservation-target"
                  onChange={setTargetId}
                  value={targetId}
                >
                  <option value={MANUAL_TARGET}>Cliente sin expediente (regularizar despues)</option>
                  {targetOptions.map(({ customer, file }) => (
                    <option key={file.id} value={file.id}>
                      {file.numeroExpediente} / {customer?.nombre ?? "Cliente"}
                    </option>
                  ))}
                </FilterSelect>
              </Field>

              <Field label="Unidad disponible">
                <FilterSelect
                  ariaLabel="Unidad disponible"
                  name="reservation-unit"
                  onChange={setSelectedUnitId}
                  value={selectedUnitId}
                >
                  {availableUnits.length ? (
                    availableUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.vin} / {unit.modelo}
                      </option>
                    ))
                  ) : (
                    <option value="">Sin unidades disponibles</option>
                  )}
                </FilterSelect>
              </Field>

              <Field label="Cliente">
                <Input
                  disabled={targetId !== MANUAL_TARGET}
                  name="reservation-customer"
                  onChange={(event) => setClienteNombre(event.target.value)}
                  placeholder={
                    targetId === MANUAL_TARGET
                      ? "Nombre del cliente"
                      : "Tomado del expediente"
                  }
                  value={
                    targetId === MANUAL_TARGET
                      ? clienteNombre
                      : getTargetCustomerName(targetId, targetOptions)
                  }
                />
              </Field>
            </div>

            <Field label="Observacion opcional">
              <textarea
                className="min-h-[96px] w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
                name="reservation-observation"
                onChange={(event) => setObservacion(event.target.value)}
                placeholder="Contexto de la reserva"
                value={observacion}
              />
            </Field>

            <Button
              className="w-full sm:w-auto"
              disabled={!selectedUnitId}
              type="submit"
            >
              <CalendarCheck className="h-4 w-4" />
              Crear reserva
            </Button>
          </form>
        </Card>
      ) : null}

      {feedback ? (
        <Card
          className={cn(
            "p-4 text-sm font-semibold",
            feedback.tone === "success"
              ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-200"
              : "border-red-500/25 bg-red-500/10 text-red-200",
          )}
        >
          {feedback.message}
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Activas"
          value={
            scopedReservations.filter(
              (reservation) => reservation.estado === RESERVATION_ACTIVE_STATUS,
            ).length
          }
        />
        <MetricCard
          label="Canceladas"
          value={
            scopedReservations.filter(
              (reservation) =>
                reservation.estado === RESERVATION_CANCELLED_STATUS,
            ).length
          }
        />
        <MetricCard
          label="Completadas"
          value={
            scopedReservations.filter(
              (reservation) =>
                reservation.estado === RESERVATION_COMPLETED_STATUS,
            ).length
          }
        />
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input
              className="pl-11"
              name="reservation-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por reserva, cliente, expediente, VIN o modelo"
              value={query}
            />
          </label>
          <FilterSelect
            ariaLabel="Filtrar por estado"
            name="reservation-status"
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            value={statusFilter}
          >
            <option value={ALL_STATUSES}>Todos los estados</option>
            {reservationStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </FilterSelect>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[0.9fr_1.2fr_1fr_1fr_1fr_1fr_0.9fr] border-b border-white/10 px-6 py-4 text-xs font-black uppercase tracking-[0.12em] text-zinc-500 xl:grid">
            <div>Reserva</div>
            <div>Cliente / expediente</div>
            <div>Modelo</div>
            <div>VIN</div>
            <div>Sucursal</div>
            <div>Vendedor</div>
            <div>Estado</div>
          </div>

          {filteredReservations.length ? (
            filteredReservations.map((reservation) => (
              <button
                className={cn(
                  "grid w-full gap-4 border-b border-white/7 px-6 py-5 text-left transition last:border-b-0 xl:grid-cols-[0.9fr_1.2fr_1fr_1fr_1fr_1fr_0.9fr] xl:items-center",
                  selectedReservation?.id === reservation.id
                    ? "bg-red-500/10"
                    : "hover:bg-white/[0.045]",
                )}
                key={reservation.id}
                onClick={() => setSelectedReservationId(reservation.id)}
                type="button"
              >
                <div>
                  <div className="font-mono text-xs font-black text-white">
                    {reservation.numeroReserva}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {formatDate(reservation.fechaReserva)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-300">
                    {reservation.clienteNombre}
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-600">
                    {reservation.numeroExpediente ?? "Sin expediente"}
                  </div>
                </div>
                <div className="text-sm text-zinc-400">
                  {reservation.modelo}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  {reservation.vin}
                </div>
                <div className="text-sm text-zinc-400">
                  {reservation.sucursalNombre}
                </div>
                <div className="text-sm text-zinc-400">
                  {reservation.vendedorNombre}
                </div>
                <div>
                  <Badge tone={statusTone(reservation.estado)}>
                    {reservation.estado}
                  </Badge>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-zinc-500">
              Aún no hay reservas para este alcance. Seleccioná una unidad disponible y un cliente o expediente para crear una reserva.
            </div>
          )}
        </Card>

        <ReservationDetail
          onCancel={runCancelReservation}
          reservation={selectedReservation}
          session={session}
        />
      </div>
    </section>
  );
}

function ReservationDetail({
  onCancel,
  reservation,
  session,
}: {
  onCancel: () => void;
  reservation: ReservationRecord | null;
  session: DemoSession;
}) {
  if (!reservation) {
    return (
      <Card className="p-8 text-center">
        <CalendarCheck className="mx-auto h-10 w-10 text-zinc-600" />
        <h3 className="mt-4 text-xl font-black text-white">Sin seleccion</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Selecciona una reserva para ver el detalle operativo.
        </p>
      </Card>
    );
  }

  const canCancel =
    session.role === "Vendedor" &&
    reservation.vendedorId === session.userId &&
    reservation.estado === RESERVATION_ACTIVE_STATUS;

  return (
    <Card className="p-6">
      <Badge tone={statusTone(reservation.estado)}>{reservation.estado}</Badge>
      <h3 className="mt-4 text-2xl font-black text-white">
        {reservation.numeroReserva}
      </h3>
      <p className="mt-1 font-mono text-xs text-zinc-600">{reservation.vin}</p>

      <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/[0.045] p-5">
        <DetailLine label="Cliente" value={reservation.clienteNombre} />
        <DetailLine
          label="Expediente"
          value={reservation.numeroExpediente ?? "Sin expediente"}
        />
        <DetailLine label="Modelo" value={reservation.modelo} />
        <DetailLine label="Sucursal" value={reservation.sucursalNombre} />
        <DetailLine label="Vendedor" value={reservation.vendedorNombre} />
        <DetailLine label="Fecha" value={formatDate(reservation.fechaReserva)} />
        {reservation.observacion ? (
          <DetailLine label="Observacion" value={reservation.observacion} />
        ) : null}
      </div>

      <div className="mt-6 grid gap-3">
        {canCancel ? (
          <Button className="w-full" onClick={onCancel} variant="danger">
            <XCircle className="h-4 w-4" />
            Cancelar reserva
          </Button>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-zinc-500">
            No hay acciones disponibles para tu rol y el estado actual.
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-red-400" />
          <h4 className="text-lg font-black text-white">Historial</h4>
        </div>
        <div className="mt-4 space-y-3">
          {reservation.historial.map((entry) => (
            <div
              className="rounded-xl border border-white/10 bg-white/[0.045] p-4"
              key={entry.id}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge tone={statusTone(entry.estado)}>{entry.estado}</Badge>
                <span className="text-xs text-zinc-600">
                  {formatDate(entry.fecha)}
                </span>
              </div>
              <div className="mt-2 text-sm font-black text-white">
                {entry.usuarioNombre}
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {entry.notas}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function getAvailableUnitsForSession(
  units: InventoryUnit[],
  reservations: ReservationRecord[],
  session: DemoSession | null,
) {
  if (!session || session.role !== "Vendedor" || session.branchId === "all") {
    return [];
  }

  return units.filter(
    (unit) =>
      unit.estado === INVENTORY_AVAILABLE_STATUS &&
      unit.sucursalActualId === session.branchId &&
      !hasActiveReservationForUnit(reservations, unit.id),
  );
}

function getTargetCustomerName(
  targetId: string,
  targetOptions: { file: CustomerFileRecord; customer: CustomerRecord | null }[],
) {
  return (
    targetOptions.find(({ file }) => file.id === targetId)?.customer?.nombre ?? ""
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
          <CalendarCheck className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function RiskMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs font-black uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
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
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
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
      className="h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
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
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="max-w-[240px] text-right text-sm font-black text-white">
        {value}
      </span>
    </div>
  );
}

function statusTone(status: ReservationStatus) {
  if (status === RESERVATION_ACTIVE_STATUS) return "green" as const;
  if (status === RESERVATION_COMPLETED_STATUS) return "blue" as const;
  return "gray" as const;
}

function scopeCopy(session: DemoSession) {
  if (session.role === "Vendedor") {
    return "Puedes crear y cancelar reservas propias sobre unidades disponibles de tu sucursal.";
  }

  if (session.role === "Gerente") {
    return "Puedes consultar reservas registradas en tu sucursal.";
  }

  return "Vista global de todas las reservas operativas.";
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
