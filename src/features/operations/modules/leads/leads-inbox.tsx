"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Mail,
  MapPin,
  Phone,
  Search,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ActivityRelationshipPanel } from "@/features/operations/components/activity-relationship-panel";
import { motorcycles } from "@/data/catalog/motorcycles";
import {
  desiredBranches,
  leadStatuses,
  manualLeadOriginChannels,
  NEW_LEAD_STATUS,
  type DemoSeller,
  type DesiredBranchId,
  type LeadOriginChannel,
  type LeadStatus,
  type PublicLead,
} from "@/data/operations/leads";
import { getSellersForBranch } from "@/data/operations/users";
import { createCustomerFileFromLead } from "@/features/operations/services/customer-files-service";
import {
  createManualLead,
  readLeadInboxLeads,
  writeLeadInboxLeads,
  type ManualLeadInput,
} from "@/features/operations/services/leads-service";
import {
  filterLeadsBySession,
  isLeadAssignedToSessionSeller,
} from "@/features/operations/services/operation-scope-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

const ALL_BRANCHES = "todas";
const ALL_STATUSES = "todos";
const ALL_SELLERS = "todos";
const ALL_ORIGINS = "todos";

type BranchFilter = DesiredBranchId | typeof ALL_BRANCHES;
type StatusFilter = LeadStatus | typeof ALL_STATUSES;

const metricItems: { label: string; status: LeadStatus }[] = [
  { label: "Leads nuevos", status: NEW_LEAD_STATUS },
  { label: "Leads asignados", status: "Asignado" },
  { label: "Contactados", status: "Contactado" },
  { label: "Interesados", status: "Interesado" },
];

export function LeadsInbox() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [branchFilter, setBranchFilter] = useState<BranchFilter>(ALL_BRANCHES);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [sellerFilter, setSellerFilter] = useState(ALL_SELLERS);
  const [originFilter, setOriginFilter] = useState(ALL_ORIGINS);
  const [dateFilter, setDateFilter] = useState("");
  const [query, setQuery] = useState("");
  const [showManualForm, setShowManualForm] = useState(false);

  useEffect(() => {
    setSession(readDemoSession());
    const storedLeads = readLeadInboxLeads();
    setLeads(storedLeads);
    setSelectedLeadId(storedLeads[0]?.id ?? "");
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  const scopedLeads = useMemo(
    () => filterLeadsBySession(leads, session),
    [leads, session],
  );

  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return scopedLeads.filter((lead) => {
      const matchesBranch =
        !session ||
        session.role !== "Administrador" ||
        branchFilter === ALL_BRANCHES ||
        lead.sucursalDeseada === branchFilter;
      const matchesStatus =
        statusFilter === ALL_STATUSES || lead.estado === statusFilter;
      const matchesSeller =
        sellerFilter === ALL_SELLERS || lead.vendedorAsignado === sellerFilter;
      const matchesOrigin =
        originFilter === ALL_ORIGINS || lead.canalOrigen === originFilter;
      const matchesDate = !dateFilter || lead.fechaCreacion.slice(0, 10) === dateFilter;
      const matchesQuery =
        !normalizedQuery ||
        lead.nombre.toLowerCase().includes(normalizedQuery) ||
        lead.telefono.toLowerCase().includes(normalizedQuery);

      return matchesBranch && matchesStatus && matchesSeller && matchesOrigin && matchesDate && matchesQuery;
    });
  }, [branchFilter, dateFilter, originFilter, query, scopedLeads, sellerFilter, session, statusFilter]);

  const selectedLead =
    filteredLeads.find((lead) => lead.id === selectedLeadId) ??
    filteredLeads[0] ??
    null;

  useEffect(() => {
    if (!selectedLead && filteredLeads[0]) {
      setSelectedLeadId(filteredLeads[0].id);
    }
  }, [filteredLeads, selectedLead]);

  function commitLeads(nextLeads: PublicLead[]) {
    setLeads(nextLeads);
    writeLeadInboxLeads(nextLeads);
  }

  function updateLead(
    leadId: string,
    updater: (lead: PublicLead) => PublicLead,
  ) {
    commitLeads(leads.map((lead) => (lead.id === leadId ? updater(lead) : lead)));
  }

  function assignSeller(leadId: string, seller: DemoSeller | "") {
    if (!session || session.role !== "Gerente") return;

    updateLead(leadId, (lead) => {
      if (lead.sucursalDeseada !== session.branchId) return lead;

      return {
        ...lead,
        vendedorAsignado: seller || null,
        estado: seller && lead.estado === NEW_LEAD_STATUS ? "Asignado" : lead.estado,
      };
    });
  }

  function changeStatus(leadId: string, status: LeadStatus) {
    if (!session) return;

    updateLead(leadId, (lead) => {
      if (!canChangeLeadStatus(lead, session)) return lead;
      return { ...lead, estado: status };
    });
  }

  function saveFollowUp(leadId: string, seguimiento: string) {
    if (!session || session.role !== "Vendedor") return;

    updateLead(leadId, (lead) => {
      if (!isLeadAssignedToSessionSeller(lead, session)) return lead;
      return { ...lead, seguimiento: seguimiento.trim() || null };
    });
  }

  function createFileFromLead(leadId: string, observaciones: string) {
    if (!session || session.role !== "Vendedor") return;

    const lead = leads.find((item) => item.id === leadId);
    if (!lead || !canCreateFileFromLead(lead, session)) return;
    const sellerSession = session as DemoSession & { role: "Vendedor" };

    const result = createCustomerFileFromLead({
      lead,
      observaciones,
      session: sellerSession,
    });

    if (!result.ok) return;

    const { customer, file } = result;

    updateLead(leadId, (currentLead) => ({
      ...currentLead,
      estado: "Expediente",
      clienteId: customer.id,
      expedienteId: file.id,
      numeroExpediente: file.numeroExpediente,
    }));
  }

  function addManualLead(input: ManualLeadInput) {
    if (!session || session.role !== "Vendedor" || session.branchId === "all") {
      return;
    }

    const lead = createManualLead(input, {
      ...session,
      branchId: session.branchId,
      role: "Vendedor",
    });
    const nextLeads = [lead, ...leads];
    commitLeads(nextLeads);
    setSelectedLeadId(lead.id);
  }

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-400" />
        <h2 className="mt-4 text-xl font-semibold text-slate-900">
          Inicia sesión para continuar
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
          Inicia sesión como Vendedor, Gerente o Administrador para acceder a
          la gestión comercial.
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

  const showBranchFilter = session.role === "Administrador";
  const managerSellerOptions =
    session.role === "Gerente" && session.branchId !== "all"
      ? getSellersForBranch(session.branchId)
      : [];

  return (
    <section className="space-y-6">
      <PageHeader
        actions={<Badge tone="slate">{session.branchName}</Badge>}
        description={scopeCopy(session)}
        eyebrow={session.role}
        title={session.role === "Vendedor" ? "Mis leads asignados" : "Leads recibidos"}
      />

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          {showBranchFilter ? (
            <FilterSelect
              ariaLabel="Filtrar por sucursal"
              onChange={(value) => setBranchFilter(value as BranchFilter)}
              value={branchFilter}
            >
              <option value={ALL_BRANCHES}>Todas las sucursales</option>
              {desiredBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </FilterSelect>
          ) : (
            <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-600">
              {session.branchName}
            </div>
          )}

          <FilterSelect
            ariaLabel="Filtrar por estado"
            onChange={(value) => setStatusFilter(value as StatusFilter)}
            value={statusFilter}
          >
            <option value={ALL_STATUSES}>Todos los estados</option>
            {leadStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </FilterSelect>
          {session.role === "Gerente" ? (
            <>
              <FilterSelect
                ariaLabel="Filtrar por vendedor"
                onChange={setSellerFilter}
                value={sellerFilter}
              >
                <option value={ALL_SELLERS}>Todos los vendedores</option>
                {managerSellerOptions.map((seller) => (
                  <option key={seller} value={seller}>
                    {seller}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect
                ariaLabel="Filtrar por origen"
                onChange={setOriginFilter}
                value={originFilter}
              >
                <option value={ALL_ORIGINS}>Todos los origenes</option>
                {manualLeadOriginChannels.map((channel) => (
                  <option key={channel} value={channel}>
                    {channel}
                  </option>
                ))}
              </FilterSelect>
              <Input
                aria-label="Filtrar por fecha"
                className="h-11 min-w-[170px]"
                onChange={(event) => setDateFilter(event.target.value)}
                type="date"
                value={dateFilter}
              />
            </>
          ) : null}
        </div>
      </Card>

      {session.role === "Vendedor" ? (
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Bandeja de atencion</h3>
              <p className="mt-1 text-sm text-slate-500">
                Primero contacta leads asignados. El registro manual queda como accion secundaria para visitas, WhatsApp o atencion presencial.
              </p>
            </div>
            <Button onClick={() => setShowManualForm((value) => !value)} variant="secondary">
              <UserPlus className="h-4 w-4" />
              {showManualForm ? "Ocultar registro" : "Registrar lead"}
            </Button>
          </div>
          {showManualForm ? (
            <div className="mt-5">
              <ManualLeadForm onCreateLead={addManualLead} session={session} />
            </div>
          ) : null}
        </Card>
      ) : null}

      {session.role === "Gerente" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <WorkloadPanel leads={scopedLeads} session={session} />
          <AssignmentRecommendation leads={scopedLeads} session={session} />
        </div>
      ) : null}

      {session.role === "Administrador" ? (
        <Card className="border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-4">
            <UserCheck className="mt-1 h-5 w-5 text-blue-700" />
            <p className="text-sm leading-6 text-slate-600">
              Vista global de supervision. El Administrador puede ver toda la
              operación, pero la asignación diaria de leads queda orientada al
              Gerente de cada sucursal.
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        {metricItems.map((item) => (
          <MetricCard
            key={item.status}
            label={item.label}
            value={scopedLeads.filter((lead) => lead.estado === item.status).length}
          />
        ))}
      </div>

      <Card className="p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-11"
            name="lead-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o teléfono"
            value={query}
          />
        </label>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr] border-b border-slate-200 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 lg:grid">
            <div>Lead</div>
            <div>Moto</div>
            <div>Sucursal</div>
            <div>Estado</div>
            <div>Vendedor</div>
          </div>

          {filteredLeads.length ? (
            filteredLeads.map((lead) => (
              <button
                className={cn(
                  "grid w-full gap-4 border-b border-slate-100 px-6 py-5 text-left transition last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] lg:items-center",
                  selectedLead?.id === lead.id
                    ? "bg-red-50"
                    : "hover:bg-slate-100",
                )}
                key={lead.id}
                onClick={() => setSelectedLeadId(lead.id)}
                type="button"
              >
                <div>
                  <div className="font-semibold text-slate-900">{lead.nombre}</div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{lead.telefono}</span>
                    <span>{lead.id}</span>
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-600">
                  {lead.motoInteres}
                </div>
                <div className="text-sm text-slate-500">{lead.sucursalNombre}</div>
                <div>
                  <Badge tone={statusTone(lead.estado)}>{lead.estado}</Badge>
                </div>
                <div className="text-sm text-slate-500">
                  {lead.vendedorAsignado ?? "Sin asignar"}
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">
              Aún no hay leads para este alcance. Cuando recibas o asignes una solicitud, aparecerá aquí.
            </div>
          )}
        </Card>

        <LeadDetail
          lead={selectedLead}
          onAssignSeller={assignSeller}
          onChangeStatus={changeStatus}
          onCreateFile={createFileFromLead}
          onSaveFollowUp={saveFollowUp}
          session={session}
        />
      </div>
    </section>
  );
}

function canChangeLeadStatus(lead: PublicLead, session: DemoSession) {
  if (lead.estado === "Expediente") return false;
  if (session.role === "Gerente") return lead.sucursalDeseada === session.branchId;
  if (session.role === "Vendedor") {
    return isLeadAssignedToSessionSeller(lead, session);
  }
  return false;
}

function canCreateFileFromLead(lead: PublicLead, session: DemoSession) {
  return (
    session.role === "Vendedor" &&
    isLeadAssignedToSessionSeller(lead, session) &&
    !lead.expedienteId &&
    (lead.estado === "Contactado" || lead.estado === "Interesado")
  );
}

function scopeCopy(session: DemoSession) {
  if (session.role === "Vendedor") {
    return "Solo se muestran leads asignados o creados por ti. La prioridad es contactar, registrar actividad, marcar interes y crear expediente cuando el prospecto avance.";
  }

  if (session.role === "Gerente") {
    return "Se muestran leads de tu sucursal, incluyendo solicitudes sin asignar. La asignación a vendedores se realiza manualmente.";
  }

  return "Vista global de supervision. No convierte al Administrador en operador principal de asignacion diaria.";
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
          <ClipboardList className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function WorkloadPanel({
  leads,
  session,
}: {
  leads: PublicLead[];
  session: DemoSession;
}) {
  if (session.branchId === "all") return null;

  const sellers = getSellersForBranch(session.branchId);

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Carga de vendedores
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Referencia para asignacion manual dentro de {session.branchName}.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {sellers.map((seller) => (
            <div
              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              key={seller}
            >
              <div className="text-sm font-semibold text-slate-900">{seller}</div>
              <div className="mt-1 text-xs text-slate-500">
                {
                  leads.filter(
                    (lead) =>
                      lead.vendedorAsignado === seller &&
                      lead.estado !== "Descartado",
                  ).length
                }{" "}
                leads activos
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function AssignmentRecommendation({
  leads,
  session,
}: {
  leads: PublicLead[];
  session: DemoSession;
}) {
  if (session.branchId === "all") return null;

  const pendingAssignment = leads.filter((lead) => !lead.vendedorAsignado);
  const sellers = getSellersForBranch(session.branchId);
  const recommendation = sellers
    .map((seller) => ({
      activeLeads: leads.filter(
        (lead) =>
          lead.vendedorAsignado === seller &&
          lead.estado !== "Descartado" &&
          lead.estado !== "Expediente",
      ).length,
      contacted: leads.filter(
        (lead) =>
          lead.vendedorAsignado === seller &&
          (lead.estado === "Contactado" || lead.estado === "Interesado" || lead.estado === "Expediente"),
      ).length,
      name: seller,
      total: leads.filter((lead) => lead.vendedorAsignado === seller).length,
    }))
    .sort((a, b) => a.activeLeads - b.activeLeads || b.contacted - a.contacted)[0];

  return (
    <Card className="border-blue-200 bg-blue-50 p-5">
      <Badge tone={pendingAssignment.length ? "red" : "green"}>
        {pendingAssignment.length ? `${pendingAssignment.length} por asignar` : "Asignacion al dia"}
      </Badge>
      <h3 className="mt-4 text-base font-semibold text-slate-900">Recomendacion de asignacion</h3>
      {pendingAssignment.length && recommendation ? (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Asigna el siguiente lead a <strong>{recommendation.name}</strong>: tiene menos leads activos, pertenece a la misma sucursal y mantiene disponibilidad relativa.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-slate-600">
          No hay leads pendientes de asignacion en esta sucursal.
        </p>
      )}
      {recommendation ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          {recommendation.activeLeads} activos / {recommendation.contacted} contactados / {recommendation.total} totales
        </div>
      ) : null}
    </Card>
  );
}

function ManualLeadForm({
  onCreateLead,
  session,
}: {
  onCreateLead: (input: ManualLeadInput) => void;
  session: DemoSession;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [motoSlug, setMotoSlug] = useState(motorcycles[0]?.slug ?? "");
  const [canalOrigen, setCanalOrigen] = useState<LeadOriginChannel>("Presencial");
  const [observacionInicial, setObservacionInicial] = useState("");
  const [error, setError] = useState("");

  const selectedMotorcycle = motorcycles.find(
    (motorcycle) => motorcycle.slug === motoSlug,
  );

  function submitManualLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!nombre.trim() || !telefono.trim() || !selectedMotorcycle) {
      setError("Completa nombre, teléfono y moto de interés.");
      return;
    }

    onCreateLead({
      nombre,
      telefono,
      correo,
      motoInteres: selectedMotorcycle.name,
      motoSlug: selectedMotorcycle.slug,
      canalOrigen,
      observacionInicial,
    });

    setNombre("");
    setTelefono("");
    setCorreo("");
    setObservacionInicial("");
    setCanalOrigen("Presencial");
  }

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge tone="blue">Registro manual</Badge>
          <h3 className="mt-4 text-xl font-semibold text-slate-900">
            Registrar lead de sucursal
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            El lead queda en {session.branchName}, asignado a {session.userName} y
            con estado inicial Asignado. No crea cliente, expediente ni crédito.
          </p>
        </div>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={submitManualLead}>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Nombre">
            <Input
              name="manual-nombre"
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Nombre completo"
              required
              value={nombre}
            />
          </Field>
          <Field label="Teléfono">
            <Input
              name="manual-telefono"
              onChange={(event) => setTelefono(event.target.value)}
              placeholder="Numero de contacto"
              required
              type="tel"
              value={telefono}
            />
          </Field>
          <Field label="Correo opcional">
            <Input
              name="manual-correo"
              onChange={(event) => setCorreo(event.target.value)}
              placeholder="correo@ejemplo.com"
              type="email"
              value={correo}
            />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Moto de interes">
            <FilterSelect
              ariaLabel="Moto de interes"
              name="manual-moto"
              onChange={setMotoSlug}
              value={motoSlug}
            >
              {motorcycles.map((motorcycle) => (
                <option key={motorcycle.slug} value={motorcycle.slug}>
                  {motorcycle.name}
                </option>
              ))}
            </FilterSelect>
          </Field>
          <Field label="Canal de origen">
            <FilterSelect
              ariaLabel="Canal de origen"
              name="manual-canal"
              onChange={(value) => setCanalOrigen(value as LeadOriginChannel)}
              value={canalOrigen}
            >
              {manualLeadOriginChannels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </FilterSelect>
          </Field>
        </div>

        <Field label="Observacion inicial">
          <textarea
            className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            name="manual-observacion"
            onChange={(event) => setObservacionInicial(event.target.value)}
            placeholder="Contexto inicial de la atencion"
            value={observacionInicial}
          />
        </Field>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : null}

        <Button className="w-full sm:w-auto" type="submit">
          <UserPlus className="h-4 w-4" />
          Crear lead manual
        </Button>
      </form>
    </Card>
  );
}

function LeadDetail({
  lead,
  onAssignSeller,
  onChangeStatus,
  onCreateFile,
  onSaveFollowUp,
  session,
}: {
  lead: PublicLead | null;
  onAssignSeller: (leadId: string, seller: DemoSeller | "") => void;
  onChangeStatus: (leadId: string, status: LeadStatus) => void;
  onCreateFile: (leadId: string, observaciones: string) => void;
  onSaveFollowUp: (leadId: string, seguimiento: string) => void;
  session: DemoSession;
}) {
  const [seguimiento, setSeguimiento] = useState("");

  useEffect(() => {
    setSeguimiento(lead?.seguimiento ?? "");
  }, [lead?.id, lead?.seguimiento]);

  if (!lead) {
    return (
      <Card className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-slate-400" />
        <h3 className="mt-4 text-lg font-semibold text-slate-900">Sin seleccion</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Selecciona un lead para ver el detalle operativo.
        </p>
      </Card>
    );
  }

  const canAssign =
    session.role === "Gerente" && lead.sucursalDeseada === session.branchId;
  const canChangeStatus = canChangeLeadStatus(lead, session);
  const canCreateFile = canCreateFileFromLead(lead, session);
  const canSaveFollowUp = isLeadAssignedToSessionSeller(lead, session);
  const assignableSellers = getSellersForBranch(lead.sucursalDeseada);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Badge tone={statusTone(lead.estado)}>{lead.estado}</Badge>
          <h3 className="mt-4 text-xl font-semibold text-slate-900">{lead.nombre}</h3>
          <p className="mt-1 font-mono text-xs text-slate-400">{lead.id}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-red-600">
          <UserPlus className="h-6 w-6" />
        </div>
      </div>

      <div className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <DetailLine icon={Phone} label="Teléfono" value={lead.telefono} />
        <DetailLine icon={Mail} label="Correo" value={lead.correo ?? "No indicado"} />
        <DetailLine icon={MapPin} label="Sucursal" value={lead.sucursalNombre} />
        <DetailLine label="Moto de interes" value={lead.motoInteres} />
        <DetailLine label="Canal" value={lead.canalOrigen ?? "No especificado"} />
        <DetailLine label="Fecha" value={formatLeadDate(lead.fechaCreacion)} />
        {lead.observacionInicial ? (
          <DetailLine label="Observacion inicial" value={lead.observacionInicial} />
        ) : null}
        {lead.seguimiento ? (
          <DetailLine label="Seguimiento" value={lead.seguimiento} />
        ) : null}
        {lead.numeroExpediente ? (
          <DetailLine label="Expediente" value={lead.numeroExpediente} />
        ) : null}

        <ActivityRelationshipPanel
          branchId={lead.sucursalDeseada}
          branchName={lead.sucursalNombre}
          leadIds={[lead.id]}
          session={session}
          title="Seguimiento del lead"
        />
      </div>

      <div className="mt-6 grid gap-4">
        {canAssign ? (
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Asignar vendedor
            </span>
            <FilterSelect
              ariaLabel="Asignar vendedor"
              name="assign-seller"
              onChange={(value) => onAssignSeller(lead.id, value as DemoSeller | "")}
              value={lead.vendedorAsignado ?? ""}
            >
              <option value="">Sin asignar</option>
              {assignableSellers.map((seller) => (
                <option key={seller} value={seller}>
                  {seller}
                </option>
              ))}
            </FilterSelect>
          </label>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
            {session.role === "Administrador"
              ? "Vista de supervision. La asignacion operativa corresponde al gerente de sucursal."
              : "Tu rol no permite asignar leads a otros vendedores."}
          </div>
        )}

        {canChangeStatus ? (
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Cambiar estado
            </span>
            <FilterSelect
              ariaLabel="Cambiar estado"
              name="change-status"
              onChange={(value) => onChangeStatus(lead.id, value as LeadStatus)}
              value={lead.estado}
            >
              {leadStatuses
                .filter((status) => status !== "Expediente")
                .map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </FilterSelect>
          </label>
        ) : null}

        {canSaveFollowUp ? (
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Registrar seguimiento
            </span>
            <textarea
              className="min-h-[96px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              onChange={(event) => setSeguimiento(event.target.value)}
              placeholder="Resumen del contacto o siguiente acción"
              value={seguimiento}
            />
            <Button
              className="mt-3 w-full"
              onClick={() => onSaveFollowUp(lead.id, seguimiento)}
              variant="secondary"
            >
              Guardar seguimiento
            </Button>
          </div>
        ) : null}

        {canCreateFile ? (
          <Card className="border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-semibold text-slate-900">
              Convertir a cliente y expediente
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Crea o reutiliza el cliente por teléfono y genera un expediente
              basico para continuar el proceso comercial.
            </p>
            <Button
              className="mt-4 w-full"
              onClick={() => onCreateFile(lead.id, seguimiento)}
              variant="success"
            >
              <ClipboardList className="h-4 w-4" />
              Crear expediente
            </Button>
          </Card>
        ) : null}

        {lead.numeroExpediente ? (
          <Card className="border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Expediente creado
            </div>
            <div className="mt-2 font-mono text-sm font-semibold text-slate-900">
              {lead.numeroExpediente}
            </div>
            <Link
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-slate-100 px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
              href="/panel/expedientes"
            >
              Ver expedientes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        ) : null}
      </div>
    </Card>
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
      <span className="max-w-[210px] text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
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
  name?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="h-11 min-w-[190px] rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      name={name}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  );
}

function statusTone(status: LeadStatus) {
  if (status === "Interesado" || status === "Expediente") return "green" as const;
  if (status === "Contactado" || status === "Asignado") return "blue" as const;
  if (status === "Descartado") return "gray" as const;
  return "red" as const;
}

function formatLeadDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
