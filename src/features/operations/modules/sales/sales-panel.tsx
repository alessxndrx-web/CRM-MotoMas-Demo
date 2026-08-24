"use client";

import Link from "next/link";
import {
  BadgeCheck,
  CalendarCheck,
  FileText,
  PackageCheck,
  Search,
  Store,
  Truck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import type {
  CustomerFileRecord,
  CustomerRecord,
} from "@/data/operations/customer-files";
import type { InventoryUnit } from "@/data/operations/inventory";
import type { PublicLead } from "@/data/operations/leads";
import { RESERVATION_ACTIVE_STATUS } from "@/data/operations/reservations";
import {
  SALE_COMPLETED_STATUS,
  SALE_DELIVERED_STATUS,
  saleTypes,
  type SaleRecord,
  type SaleType,
} from "@/data/operations/sales";
import {
  findCustomerById,
  readCustomerFiles,
  readCustomers,
} from "@/features/operations/services/customer-files-service";
import { readInventoryUnits } from "@/features/operations/services/inventory-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import {
  filterCustomerFilesBySession,
  filterCustomersBySession,
  filterReservationsBySession,
  filterSalesBySession,
} from "@/features/operations/services/operation-scope-service";
import { readReservations } from "@/features/operations/services/reservation-service";
import {
  createSale,
  deliverSale,
  hasSaleForUnit,
  readSales,
} from "@/features/operations/services/sales-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

const SOURCE_RESERVATION = "reservation";
const SOURCE_FILE = "file";
const SOURCE_CUSTOMER = "customer";
const ALL_TYPES = "todos";

type SourceType =
  | typeof SOURCE_RESERVATION
  | typeof SOURCE_FILE
  | typeof SOURCE_CUSTOMER;
type TypeFilter = SaleType | typeof ALL_TYPES;
type Feedback = { tone: "success" | "error"; message: string } | null;

export function SalesPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [reservations, setReservations] = useState(readReservationsSafe);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>(SOURCE_RESERVATION);
  const [selectedReservationId, setSelectedReservationId] = useState("");
  const [selectedFileId, setSelectedFileId] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [tipoVenta, setTipoVenta] = useState<SaleType>("Contado");
  const [observaciones, setObservaciones] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(ALL_TYPES);
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    function syncState() {
      const currentSession = readDemoSession();
      const storedSales = readSales();

      setSession(currentSession);
      setSales(storedSales);
      setUnits(readInventoryUnits());
      setCustomers(readCustomers());
      setFiles(readCustomerFiles());
      setLeads(readLeadInboxLeads());
      setReservations(readReservations());
      setSelectedSaleId(storedSales[0]?.id ?? "");
    }

    syncState();
    return subscribeToDemoSession(syncState);
  }, []);

  const scopedSales = useMemo(
    () => filterSalesBySession(sales, session),
    [sales, session],
  );
  const scopedFiles = useMemo(
    () => filterCustomerFilesBySession(files, leads, session),
    [files, leads, session],
  );
  const scopedCustomers = useMemo(
    () => filterCustomersBySession(customers, files, leads, session),
    [customers, files, leads, session],
  );
  const scopedReservations = useMemo(
    () => filterReservationsBySession(reservations, session),
    [reservations, session],
  );

  const activeReservationOptions = useMemo(
    () =>
      scopedReservations.filter(
        (reservation) =>
          reservation.estado === RESERVATION_ACTIVE_STATUS &&
          Boolean(reservation.clienteId),
      ),
    [scopedReservations],
  );
  const fileOptions = useMemo(
    () =>
      scopedFiles.map((file) => ({
        file,
        customer: findCustomerById(customers, file.clienteId),
      })),
    [customers, scopedFiles],
  );
  const customerOptions = scopedCustomers;
  const selectedReservation =
    activeReservationOptions.find(
      (reservation) => reservation.id === selectedReservationId,
    ) ??
    activeReservationOptions[0] ??
    null;
  const selectedReservationUnit = selectedReservation
    ? units.find((unit) => unit.id === selectedReservation.unidadId) ?? null
    : null;
  const availableUnits = useMemo(() => {
    if (!session || session.role !== "Vendedor" || session.branchId === "all") {
      return [];
    }

    return units.filter(
      (unit) =>
        unit.estado === "Disponible" &&
        unit.sucursalActualId === session.branchId &&
        !hasSaleForUnit(sales, unit.id),
    );
  }, [sales, session, units]);
  const saleUnits =
    sourceType === SOURCE_RESERVATION
      ? selectedReservationUnit
        ? [selectedReservationUnit].filter(
            (unit) =>
              (unit.estado === "Reservada" || unit.estado === "Disponible") &&
              !hasSaleForUnit(sales, unit.id),
          )
        : []
      : availableUnits;

  useEffect(() => {
    if (!activeReservationOptions.some((item) => item.id === selectedReservationId)) {
      setSelectedReservationId(activeReservationOptions[0]?.id ?? "");
    }
  }, [activeReservationOptions, selectedReservationId]);

  useEffect(() => {
    if (!fileOptions.some(({ file }) => file.id === selectedFileId)) {
      setSelectedFileId(fileOptions[0]?.file.id ?? "");
    }
  }, [fileOptions, selectedFileId]);

  useEffect(() => {
    if (!customerOptions.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(customerOptions[0]?.id ?? "");
    }
  }, [customerOptions, selectedCustomerId]);

  useEffect(() => {
    if (!saleUnits.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(saleUnits[0]?.id ?? "");
    }
  }, [saleUnits, selectedUnitId]);

  const filteredSales = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return scopedSales.filter((sale) => {
      const matchesType = typeFilter === ALL_TYPES || sale.tipoVenta === typeFilter;
      const matchesQuery =
        !normalizedQuery ||
        sale.numeroVenta.toLowerCase().includes(normalizedQuery) ||
        sale.clienteNombre.toLowerCase().includes(normalizedQuery) ||
        sale.modelo.toLowerCase().includes(normalizedQuery) ||
        sale.vin.toLowerCase().includes(normalizedQuery) ||
        sale.vendedorNombre.toLowerCase().includes(normalizedQuery);

      return matchesType && matchesQuery;
    });
  }, [query, scopedSales, typeFilter]);

  const selectedSale =
    filteredSales.find((sale) => sale.id === selectedSaleId) ??
    filteredSales[0] ??
    null;

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Store className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          Inicia sesión para continuar
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Inicia sesión para registrar ventas internas.
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

  function submitSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    const result = createSale(
      {
        sourceType,
        reservationId:
          sourceType === SOURCE_RESERVATION ? selectedReservationId : null,
        customerFileId: sourceType === SOURCE_FILE ? selectedFileId : null,
        customerId: sourceType === SOURCE_CUSTOMER ? selectedCustomerId : null,
        unitId: selectedUnitId,
        tipoVenta,
        observaciones,
      },
      session,
    );

    setSales(result.sales);
    setUnits(result.units);
    setReservations(result.reservations);
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
    if (result.sale) {
      setSelectedSaleId(result.sale.id);
      setObservaciones("");
    }
  }

  function markSaleDelivered(saleId: string) {
    if (!session) return;

    const result = deliverSale(saleId, session);
    setSales(result.sales);
    setUnits(result.units);
    setReservations(result.reservations);
    setFeedback({
      tone: result.ok ? "success" : "error",
      message: result.message,
    });
    if (result.sale) setSelectedSaleId(result.sale.id);
  }

  const canCreateSale = session.role === "Vendedor" && session.branchId !== "all";
  const completedSales = scopedSales.filter(
    (sale) => sale.estado === SALE_COMPLETED_STATUS,
  ).length;
  const deliveredSales = scopedSales.filter(
    (sale) => sale.estado === SALE_DELIVERED_STATUS,
  ).length;
  const salesWithReservationOrFile = scopedSales.filter(
    (sale) => Boolean(sale.reservaId || sale.expedienteId),
  ).length;
  const pendingDelivery = scopedSales.filter(
    (sale) => sale.estado === SALE_COMPLETED_STATUS && !sale.fechaEntrega,
  ).length;

  return (
    <section className="space-y-6">
      <PageHeader
        actions={<Badge tone="slate">{session.branchName}</Badge>}
        description={scopeCopy(session)}
        eyebrow="Ventas internas"
        title="Registro de ventas"
      />

      {session.role === "Gerente" ? (
        <Card className="border-blue-200 bg-blue-50 p-5">
          <div className="text-sm font-semibold text-slate-900">Progresion comercial</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Supervisa que las ventas avancen desde Reserva o Expediente hacia Venta y Entrega, manteniendo trazabilidad de cliente, unidad y vendedor.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ProgressMetric label="Reserva/Expediente" value={salesWithReservationOrFile} />
            <ProgressMetric label="Ventas completadas" value={completedSales} />
            <ProgressMetric label="Entregas pendientes" value={pendingDelivery} />
          </div>
        </Card>
      ) : null}

      {canCreateSale ? (
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-slate-900">Crear venta</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Al completar la venta, la unidad cambia a Vendida. Si la venta viene
            de una reserva activa, la reserva queda Completada.
          </p>
          <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-500/8 p-4 text-sm leading-6 text-yellow-100">
            Recomendacion de flujo: inicia la venta desde una reserva activa o expediente. La opcion de cliente existente queda para casos donde ya existe una unidad disponible y el expediente se regulariza despues.
          </div>

          <form className="mt-6 grid gap-4" onSubmit={submitSale}>
            <div className="grid gap-4 lg:grid-cols-3">
              <Field label="Origen de venta">
                <FilterSelect
                  ariaLabel="Origen de venta"
                  name="sale-source"
                  onChange={(value) => setSourceType(value as SourceType)}
                  value={sourceType}
                >
                  <option value={SOURCE_RESERVATION}>Reserva activa</option>
                  <option value={SOURCE_FILE}>Expediente existente</option>
                  <option value={SOURCE_CUSTOMER}>Cliente existente</option>
                </FilterSelect>
              </Field>

              {sourceType === SOURCE_RESERVATION ? (
                <Field label="Reserva activa">
                  <FilterSelect
                    ariaLabel="Reserva activa"
                    name="sale-reservation"
                    onChange={setSelectedReservationId}
                    value={selectedReservationId}
                  >
                    {activeReservationOptions.length ? (
                      activeReservationOptions.map((reservation) => (
                        <option key={reservation.id} value={reservation.id}>
                          {reservation.numeroReserva} / {reservation.clienteNombre}
                        </option>
                      ))
                    ) : (
                      <option value="">Sin reservas activas</option>
                    )}
                  </FilterSelect>
                </Field>
              ) : null}

              {sourceType === SOURCE_FILE ? (
                <Field label="Expediente">
                  <FilterSelect
                    ariaLabel="Expediente"
                    name="sale-file"
                    onChange={setSelectedFileId}
                    value={selectedFileId}
                  >
                    {fileOptions.length ? (
                      fileOptions.map(({ customer, file }) => (
                        <option key={file.id} value={file.id}>
                          {file.numeroExpediente} / {customer?.nombre ?? "Cliente"}
                        </option>
                      ))
                    ) : (
                      <option value="">Sin expedientes visibles</option>
                    )}
                  </FilterSelect>
                </Field>
              ) : null}

              {sourceType === SOURCE_CUSTOMER ? (
                <Field label="Cliente">
                  <FilterSelect
                    ariaLabel="Cliente"
                    name="sale-customer"
                    onChange={setSelectedCustomerId}
                    value={selectedCustomerId}
                  >
                    {customerOptions.length ? (
                      customerOptions.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.nombre} / {customer.telefono}
                        </option>
                      ))
                    ) : (
                      <option value="">Sin clientes visibles</option>
                    )}
                  </FilterSelect>
                </Field>
              ) : null}

              <Field label="Unidad">
                <FilterSelect
                  ariaLabel="Unidad"
                  name="sale-unit"
                  onChange={setSelectedUnitId}
                  value={selectedUnitId}
                >
                  {saleUnits.length ? (
                    saleUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.vin} / {unit.modelo} / {unit.estado}
                      </option>
                    ))
                  ) : (
                    <option value="">Sin unidades elegibles</option>
                  )}
                </FilterSelect>
              </Field>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Tipo de venta">
                <FilterSelect
                  ariaLabel="Tipo de venta"
                  name="sale-type"
                  onChange={(value) => setTipoVenta(value as SaleType)}
                  value={tipoVenta}
                >
                  {saleTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </FilterSelect>
              </Field>

              <Field label="Observaciones">
                <Input
                  name="sale-observations"
                  onChange={(event) => setObservaciones(event.target.value)}
                  placeholder="Detalle opcional del cierre"
                  value={observaciones}
                />
              </Field>
            </div>

            <Button
              className="w-full sm:w-auto"
              disabled={!canSubmitSale(sourceType, {
                selectedReservationId,
                selectedFileId,
                selectedCustomerId,
                selectedUnitId,
              })}
              type="submit"
            >
              <BadgeCheck className="h-4 w-4" />
              Completar venta
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

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Ventas visibles" value={scopedSales.length} />
        <MetricCard label="Completadas" value={completedSales} />
        <MetricCard label="Entregadas" value={deliveredSales} />
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-11"
              name="sale-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por venta, cliente, VIN, modelo o vendedor"
              value={query}
            />
          </label>
          <FilterSelect
            ariaLabel="Filtrar por tipo"
            name="sale-type-filter"
            onChange={(value) => setTypeFilter(value as TypeFilter)}
            value={typeFilter}
          >
            <option value={ALL_TYPES}>Todos los tipos</option>
            {saleTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </FilterSelect>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[0.9fr_1.1fr_1fr_1fr_1fr_1fr_0.9fr_0.9fr] border-b border-slate-200 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 xl:grid">
            <div>Venta</div>
            <div>Cliente</div>
            <div>Modelo</div>
            <div>VIN</div>
            <div>Sucursal</div>
            <div>Vendedor</div>
            <div>Tipo</div>
            <div>Estado</div>
          </div>

          {filteredSales.length ? (
            filteredSales.map((sale) => (
              <button
                className={cn(
                  "grid w-full gap-4 border-b border-slate-100 px-6 py-5 text-left transition last:border-b-0 xl:grid-cols-[0.9fr_1.1fr_1fr_1fr_1fr_1fr_0.9fr_0.9fr] xl:items-center",
                  selectedSale?.id === sale.id
                    ? "bg-red-50"
                    : "hover:bg-slate-100",
                )}
                key={sale.id}
                onClick={() => setSelectedSaleId(sale.id)}
                type="button"
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-slate-900">
                    {sale.numeroVenta}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {formatDate(sale.fechaVenta)}
                  </div>
                  {sale.fechaEntrega ? (
                    <div className="mt-1 text-xs text-emerald-700">
                      Entrega: {formatDate(sale.fechaEntrega)}
                    </div>
                  ) : null}
                </div>
                <div className="text-sm font-semibold text-slate-600">
                  {sale.clienteNombre}
                </div>
                <div className="text-sm text-slate-500">{sale.modelo}</div>
                <div className="font-mono text-xs text-slate-500">{sale.vin}</div>
                <div className="text-sm text-slate-500">{sale.sucursalNombre}</div>
                <div className="text-sm text-slate-500">{sale.vendedorNombre}</div>
                <div className="text-sm text-slate-500">{sale.tipoVenta}</div>
                <div>
                  <Badge tone="green">{sale.estado}</Badge>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              Aún no hay ventas para este alcance. Completá una venta desde una reserva, expediente o cliente para verla aquí.
            </div>
          )}
        </Card>

        <SaleDetail
          onDeliver={markSaleDelivered}
          sale={selectedSale}
          session={session}
        />
      </div>
    </section>
  );
}

function SaleDetail({
  onDeliver,
  sale,
  session,
}: {
  onDeliver: (saleId: string) => void;
  sale: SaleRecord | null;
  session: DemoSession;
}) {
  if (!sale) {
    return (
      <Card className="p-8 text-center">
        <Store className="mx-auto h-10 w-10 text-slate-400" />
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Sin seleccion</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Selecciona una venta para ver el detalle del cierre.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <Badge tone="green">{sale.estado}</Badge>
      <h3 className="mt-4 font-mono text-xl font-semibold text-slate-900">
        {sale.numeroVenta}
      </h3>
      <p className="mt-1 font-mono text-xs text-slate-400">{sale.vin}</p>

      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <DetailLine icon={UserRound} label="Cliente" value={sale.clienteNombre} />
        <DetailLine icon={PackageCheck} label="Modelo" value={sale.modelo} />
        <DetailLine label="Sucursal" value={sale.sucursalNombre} />
        <DetailLine label="Vendedor" value={sale.vendedorNombre} />
        <DetailLine label="Tipo" value={sale.tipoVenta} />
        <DetailLine label="Fecha de venta" value={formatDate(sale.fechaVenta)} />
        <DetailLine
          label="Fecha de entrega"
          value={
            sale.fechaEntrega
              ? formatDate(sale.fechaEntrega)
              : "Entrega pendiente"
          }
        />
      </div>

      <div className="mt-6 grid gap-4">
        <Card className="border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-red-600" />
            <div className="text-sm font-semibold text-slate-900">Relacion comercial</div>
          </div>
          <div className="mt-4 space-y-3">
            <DetailLine
              label="Expediente"
              value={sale.numeroExpediente ?? "Sin expediente"}
            />
            <DetailLine
              label="Reserva"
              value={sale.numeroReserva ?? "Sin reserva"}
            />
          </div>
        </Card>

        <Card className="border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 text-red-600" />
            <div className="text-sm font-semibold text-slate-900">Observaciones</div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            {sale.observaciones ?? "Sin observaciones registradas."}
          </p>
        </Card>
      </div>

      {canDeliverSale(sale, session) ? (
        <Button
          className="mt-6 w-full"
          onClick={() => onDeliver(sale.id)}
          type="button"
        >
          <Truck className="h-4 w-4" />
          Marcar como entregada
        </Button>
      ) : null}
    </Card>
  );
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
          <Store className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
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

function DetailLine({
  icon: Icon,
  label,
  value,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 last:border-b-0 last:pb-0">
      <span className="flex items-center gap-2 text-sm text-slate-500">
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {label}
      </span>
      <span className="max-w-[220px] text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function canSubmitSale(
  sourceType: SourceType,
  values: {
    selectedReservationId: string;
    selectedFileId: string;
    selectedCustomerId: string;
    selectedUnitId: string;
  },
) {
  if (!values.selectedUnitId) return false;
  if (sourceType === SOURCE_RESERVATION) return Boolean(values.selectedReservationId);
  if (sourceType === SOURCE_FILE) return Boolean(values.selectedFileId);
  return Boolean(values.selectedCustomerId);
}

function canDeliverSale(sale: SaleRecord, session: DemoSession) {
  return (
    session.role === "Vendedor" &&
    sale.vendedorId === session.userId &&
    sale.estado === SALE_COMPLETED_STATUS
  );
}

function scopeCopy(session: DemoSession) {
  if (session.role === "Vendedor") {
    return "Puedes crear y consultar tus ventas registradas.";
  }

  if (session.role === "Gerente") {
    return "Puedes consultar ventas registradas en tu sucursal.";
  }

  return "Vista global de todas las ventas internas.";
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

function readReservationsSafe() {
  if (typeof window === "undefined") return [];
  return readReservations();
}
