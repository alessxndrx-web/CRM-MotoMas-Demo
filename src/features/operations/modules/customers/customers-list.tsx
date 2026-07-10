"use client";

import Link from "next/link";
import { ClipboardCheck, History, Phone, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActivityRelationshipPanel } from "@/features/operations/components/activity-relationship-panel";
import type {
  CustomerFileRecord,
  CustomerRecord,
} from "@/data/operations/customer-files";
import type { PublicLead } from "@/data/operations/leads";
import {
  getCustomerFilesByCustomerId,
  readCustomerFiles,
  readCustomers,
} from "@/features/operations/services/customer-files-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import {
  filterCustomerFilesBySession,
  filterCustomersBySession,
} from "@/features/operations/services/operation-scope-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

export function CustomersList() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setSession(readDemoSession());
    const storedCustomers = readCustomers();
    setCustomers(storedCustomers);
    setFiles(readCustomerFiles());
    setLeads(readLeadInboxLeads());
    setSelectedCustomerId(storedCustomers[0]?.id ?? "");
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  const scopedFiles = useMemo(
    () => filterCustomerFilesBySession(files, leads, session),
    [files, leads, session],
  );
  const scopedCustomers = useMemo(
    () => filterCustomersBySession(customers, files, leads, session),
    [customers, files, leads, session],
  );

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return scopedCustomers;

    return scopedCustomers.filter(
      (customer) =>
        customer.nombre.toLowerCase().includes(normalizedQuery) ||
        customer.telefono.toLowerCase().includes(normalizedQuery) ||
        (customer.cedula ?? "").toLowerCase().includes(normalizedQuery),
    );
  }, [query, scopedCustomers]);

  const selectedCustomer =
    filteredCustomers.find((customer) => customer.id === selectedCustomerId) ??
    filteredCustomers[0] ??
    null;

  useEffect(() => {
    if (!selectedCustomer && filteredCustomers[0]) {
      setSelectedCustomerId(filteredCustomers[0].id);
    }
  }, [filteredCustomers, selectedCustomer]);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          Inicia sesión para continuar
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Inicia sesión para consultar clientes del Centro de Operaciones.
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

  return (
    <section className="space-y-6">
      <PageHeader
        description="Registro central de clientes creados desde leads. El cliente pertenece a MotoMas y puede conservar varias interacciones por sucursal o vendedor."
        eyebrow="Clientes MotoMas"
        title="Ficha integral de cliente"
      />

      <Card className="p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-11"
            name="customer-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, teléfono o cédula"
            value={query}
          />
        </label>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr] border-b border-slate-200 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <div>Cliente</div>
            <div>Teléfono</div>
            <div>Sucursal origen</div>
            <div>Expedientes</div>
          </div>

          {filteredCustomers.length ? (
            filteredCustomers.map((customer) => {
              const customerFiles = getCustomerFilesByCustomerId(
                scopedFiles,
                customer.id,
              );

              return (
                <button
                  className={cn(
                    "grid w-full gap-4 border-b border-slate-100 px-6 py-5 text-left transition last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_1fr] lg:items-center",
                    selectedCustomer?.id === customer.id
                      ? "bg-red-50"
                      : "hover:bg-slate-100",
                  )}
                  key={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                  type="button"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{customer.nombre}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {customer.id}
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    {customer.telefono}
                  </div>
                  <div className="text-sm text-slate-500">
                    {customer.sucursalOrigenNombre}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {customerFiles.length}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              Aún no hay clientes para este alcance. Cuando conviertas un lead en expediente, aparecerá aquí.
            </div>
          )}
        </Card>

        <CustomerDetail customer={selectedCustomer} files={scopedFiles} session={session} />
      </div>
    </section>
  );
}

function CustomerDetail({
  customer,
  files,
  session,
}: {
  customer: CustomerRecord | null;
  files: CustomerFileRecord[];
  session: DemoSession;
}) {
  if (!customer) {
    return (
      <Card className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-400" />
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Sin seleccion</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Selecciona un cliente para ver identidad, telefonos, expedientes, actividades e historial comercial. Los clientes pertenecen a MotoMas, no a un vendedor individual.
        </p>
      </Card>
    );
  }

  const customerFiles = getCustomerFilesByCustomerId(files, customer.id);

  return (
    <Card className="p-6">
      <Badge tone="green">Cliente</Badge>
      <h3 className="mt-4 text-xl font-semibold text-slate-900">{customer.nombre}</h3>
      <p className="mt-1 font-mono text-xs text-slate-400">{customer.id}</p>

      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <DetailLine icon={Phone} label="Teléfono" value={customer.telefono} />
        <DetailLine label="Cédula" value={customer.cedula ?? "No registrada"} />
        <DetailLine label="Correo" value={customer.correo ?? "No indicado"} />
        <DetailLine
          label="Sucursal origen"
          value={customer.sucursalOrigenNombre}
        />
        <DetailLine label="Lead origen" value={customer.origenLeadId} />
        <DetailLine
          label="Creacion"
          value={formatDate(customer.fechaCreacion)}
        />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 text-red-600" />
          <h4 className="text-base font-semibold text-slate-900">Expedientes y motos de interes</h4>
        </div>
        <div className="mt-4 space-y-3">
          {customerFiles.length ? (
            customerFiles.map((file) => (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                key={file.id}
              >
                <div className="font-mono text-sm font-semibold text-slate-900">
                  {file.numeroExpediente}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {file.motoInteres} / {file.sucursalNombre} / {file.vendedor}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-400">
                  Estado comercial: {file.estado}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Aún no hay expedientes relacionados con este cliente.
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <History className="h-5 w-5 text-red-600" />
          <h4 className="text-base font-semibold text-slate-900">Historial comercial multi-sucursal</h4>
        </div>
        <div className="mt-4 space-y-3">
          {customer.historialInteracciones.length ? (
            customer.historialInteracciones.map((interaction) => (
              <div
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                key={interaction.id}
              >
                <div className="text-sm font-semibold text-slate-900">
                  {interaction.tipo}
                </div>
                <div className="mt-1 text-sm leading-6 text-slate-500">
                  {interaction.descripcion}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {formatDate(interaction.fecha)} / {interaction.sucursalNombre}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Aún no hay interacciones registradas. El historial comercial aparecerá aquí.
            </div>
          )}
        </div>
      </div>

      <ActivityRelationshipPanel
        allowedTypes={["Nota", "Llamada", "WhatsApp", "Visita", "Seguimiento"]}
        branchId={customer.sucursalOrigenId}
        branchName={customer.sucursalOrigenNombre}
        customerId={customer.id}
        leadIds={[customer.origenLeadId]}
        session={session}
        title="Actividades del cliente"
      />
    </Card>
  );
}

function DetailLine({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Phone;
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
