"use client";

import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  activityPriorities,
  activityStatuses,
  activityTypes,
  type ActivityRecord,
  type ActivityStatus,
} from "@/data/operations/activities";
import type { CustomerFileRecord, CustomerRecord } from "@/data/operations/customer-files";
import { desiredBranches, type DesiredBranchId, type PublicLead } from "@/data/operations/leads";
import { findCustomerById, readCustomerFiles, readCustomers } from "@/features/operations/services/customer-files-service";
import {
  cancelActivity,
  completeActivity,
  isActivityOverdue,
  readActivities,
} from "@/features/operations/services/activity-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import { filterActivitiesBySession } from "@/features/operations/services/operation-scope-service";
import { readDemoSession, subscribeToDemoSession } from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

const ALL = "todas";

export function ActivitiesPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [branchFilter, setBranchFilter] = useState<string>(ALL);
  const [sellerFilter, setSellerFilter] = useState<string>(ALL);
  const [dateFilter, setDateFilter] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    function syncState() {
      const nextSession = readDemoSession();
      const storedActivities = readActivities();
      setSession(nextSession);
      setActivities(storedActivities);
      setLeads(readLeadInboxLeads());
      setCustomers(readCustomers());
      setFiles(readCustomerFiles());
      setSelectedActivityId(storedActivities[0]?.id ?? "");
      setBranchFilter(nextSession?.role === "Gerente" ? nextSession.branchId : ALL);
    }

    syncState();
    return subscribeToDemoSession(syncState);
  }, []);

  const scopedActivities = useMemo(
    () => filterActivitiesBySession(activities, session),
    [activities, session],
  );
  const sellerNames = useMemo(
    () => [...new Set(scopedActivities.map((activity) => activity.vendedorNombre))],
    [scopedActivities],
  );
  const filteredActivities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return scopedActivities.filter((activity) => {
      const subject = getSearchText(activity, leads, customers, files);
      const matchesQuery =
        !normalizedQuery ||
        subject.includes(normalizedQuery) ||
        activity.titulo.toLowerCase().includes(normalizedQuery) ||
        (activity.descripcion ?? "").toLowerCase().includes(normalizedQuery) ||
        (activity.resultado ?? "").toLowerCase().includes(normalizedQuery);

      return (
        matchesQuery &&
        (statusFilter === ALL || activity.estado === statusFilter) &&
        (typeFilter === ALL || activity.tipo === typeFilter) &&
        (priorityFilter === ALL || activity.prioridad === priorityFilter) &&
        (branchFilter === ALL || activity.sucursalId === branchFilter) &&
        (sellerFilter === ALL || activity.vendedorNombre === sellerFilter) &&
        (!dateFilter || activity.fechaProgramada?.slice(0, 10) === dateFilter)
      );
    });
  }, [branchFilter, customers, dateFilter, files, leads, priorityFilter, query, scopedActivities, sellerFilter, statusFilter, typeFilter]);

  const selectedActivity =
    filteredActivities.find((activity) => activity.id === selectedActivityId) ??
    filteredActivities[0] ??
    null;
  const pending = scopedActivities.filter((activity) => activity.estado === "Pendiente").length;
  const completed = scopedActivities.filter((activity) => activity.estado === "Completada").length;
  const overdue = scopedActivities.filter((activity) => isActivityOverdue(activity)).length;

  function complete(activityId: string) {
    if (!session) return;
    const result = completeActivity(activityId, "", session);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setActivities(result.activities);
  }

  function cancel(activityId: string) {
    if (!session) return;
    const result = cancelActivity(activityId, session);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setActivities(result.activities);
  }

  if (!session) {
    return <SessionRequired />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge tone="red">Seguimiento comercial</Badge>
          <h2 className="mt-4 text-3xl font-black text-white">Actividades</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Organiza llamadas, WhatsApp, visitas, citas y próximas acciones de la operación comercial.
          </p>
        </div>
        <div className="flex gap-3">
          <Metric label="Pendientes" value={pending} />
          <Metric label="Vencidas" value={overdue} />
          <Metric label="Completadas" value={completed} />
        </div>
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <label className="relative block xl:col-span-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input className="pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, teléfono, expediente o actividad" value={query} />
          </label>
          <Filter value={statusFilter} onChange={setStatusFilter}>
            <option value={ALL}>Todos los estados</option>
            {activityStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </Filter>
          <Filter value={typeFilter} onChange={setTypeFilter}>
            <option value={ALL}>Todos los tipos</option>
            {activityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </Filter>
          <Filter value={priorityFilter} onChange={setPriorityFilter}>
            <option value={ALL}>Todas las prioridades</option>
            {activityPriorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </Filter>
          <Filter value={sellerFilter} onChange={setSellerFilter}>
            <option value={ALL}>Todos los vendedores</option>
            {sellerNames.map((seller) => <option key={seller} value={seller}>{seller}</option>)}
          </Filter>
          <Input
            aria-label="Fecha programada"
            onChange={(event) => setDateFilter(event.target.value)}
            type="date"
            value={dateFilter}
          />
          {session.role === "Administrador" ? (
            <Filter value={branchFilter} onChange={setBranchFilter}>
              <option value={ALL}>Todas las sucursales</option>
              {desiredBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Filter>
          ) : null}
        </div>
      </Card>

      {error ? <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm font-semibold text-red-200">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr] border-b border-white/10 px-6 py-4 text-xs font-black uppercase tracking-[0.12em] text-zinc-500 lg:grid">
            <div>Actividad</div><div>Contacto</div><div>Programada</div><div>Estado</div><div>Responsable</div>
          </div>
          {filteredActivities.length ? filteredActivities.map((activity) => (
            <button className={cn("grid w-full gap-4 border-b border-white/7 px-6 py-5 text-left transition last:border-b-0 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] lg:items-center", selectedActivity?.id === activity.id ? "bg-red-500/10" : "hover:bg-white/[0.045]")} key={activity.id} onClick={() => setSelectedActivityId(activity.id)} type="button">
              <div><div className="font-black text-white">{activity.titulo}</div><div className="mt-1 text-xs text-zinc-500">{activity.tipo} / {activity.prioridad}</div></div>
              <div className="text-sm text-zinc-400">{getSubject(activity, leads, customers, files)}</div>
              <div className="text-sm text-zinc-400">{formatDate(activity.fechaProgramada)}</div>
              <div className="flex flex-wrap gap-2"><Badge tone={statusTone(activity.estado)}>{activity.estado}</Badge>{isActivityOverdue(activity) ? <Badge tone="red">Vencida</Badge> : null}</div>
              <div className="text-sm text-zinc-400">{activity.vendedorNombre}</div>
            </button>
          )) : <div className="p-8 text-center text-sm text-zinc-500">Aún no hay actividades para este alcance. Registrá una próxima acción desde un lead, cliente o expediente.</div>}
        </Card>
        <ActivityDetail activity={selectedActivity} canManage={selectedActivity ? canManage(selectedActivity, session) : false} onCancel={cancel} onComplete={complete} subject={selectedActivity ? getSubject(selectedActivity, leads, customers, files) : ""} />
      </div>
    </section>
  );
}

function ActivityDetail({ activity, canManage, onCancel, onComplete, subject }: { activity: ActivityRecord | null; canManage: boolean; onCancel: (id: string) => void; onComplete: (id: string) => void; subject: string }) {
  if (!activity) return <Card className="p-8 text-center"><ClipboardList className="mx-auto h-10 w-10 text-zinc-600" /><h3 className="mt-4 text-xl font-black text-white">Sin seleccion</h3><p className="mt-2 text-sm text-zinc-500">Selecciona una actividad para revisar el seguimiento.</p></Card>;
  return <Card className="p-6"><div className="flex items-start justify-between gap-4"><div><Badge tone={statusTone(activity.estado)}>{activity.estado}</Badge><h3 className="mt-4 text-2xl font-black text-white">{activity.titulo}</h3><p className="mt-1 text-sm text-zinc-500">{activity.tipo} / {activity.prioridad}</p></div><CalendarClock className="h-6 w-6 text-red-400" /></div><div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/[0.045] p-5"><Detail label="Contacto" value={subject} /><Detail label="Sucursal" value={activity.sucursalNombre} /><Detail label="Responsable" value={activity.vendedorNombre} /><Detail label="Programada" value={formatDate(activity.fechaProgramada)} /><Detail label="Creada" value={formatDate(activity.fechaCreacion)} /></div>{activity.descripcion ? <p className="mt-5 text-sm leading-6 text-zinc-300">{activity.descripcion}</p> : null}{activity.resultado ? <p className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm text-emerald-100">Resultado: {activity.resultado}</p> : null}{canManage && activity.estado === "Pendiente" ? <div className="mt-6 grid gap-3"><Button onClick={() => onComplete(activity.id)} variant="success"><CheckCircle2 className="h-4 w-4" />Marcar completada</Button><Button onClick={() => onCancel(activity.id)} variant="danger"><XCircle className="h-4 w-4" />Cancelar actividad</Button></div> : null}</Card>;
}

function SessionRequired() { return <Card className="p-8 text-center"><Users className="mx-auto h-10 w-10 text-zinc-600" /><h2 className="mt-4 text-2xl font-black text-white">Sesión interna requerida</h2><p className="mt-2 text-sm text-zinc-500">Inicia sesión demo para consultar actividades comerciales.</p><Link className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white" href="/panel">Ir a inicio de sesión</Link></Card>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3"><div className="text-xs text-zinc-500">{label}</div><div className="mt-1 text-xl font-black text-white">{value}</div></div>; }
function Filter({ children, onChange, value }: { children: React.ReactNode; onChange: (value: string) => void; value: string }) { return <select className="h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-3 text-sm font-semibold text-zinc-100 outline-none focus:border-red-500/70" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 last:border-b-0 last:pb-0"><span className="text-sm text-zinc-500">{label}</span><span className="max-w-[220px] text-right text-sm font-black text-white">{value}</span></div>; }
function getSubject(activity: ActivityRecord, leads: PublicLead[], customers: CustomerRecord[], files: CustomerFileRecord[]) { const customer = activity.customerId ? findCustomerById(customers, activity.customerId) : null; if (customer) return `${customer.nombre} / ${customer.telefono}`; const lead = activity.leadId ? leads.find((item) => item.id === activity.leadId) : null; if (lead) return `${lead.nombre} / ${lead.telefono}`; const file = activity.expedienteId ? files.find((item) => item.id === activity.expedienteId) : null; return file?.numeroExpediente ?? "Seguimiento comercial"; }
function getSearchText(activity: ActivityRecord, leads: PublicLead[], customers: CustomerRecord[], files: CustomerFileRecord[]) { const lead = activity.leadId ? leads.find((item) => item.id === activity.leadId) : null; const customer = activity.customerId ? findCustomerById(customers, activity.customerId) : null; const file = activity.expedienteId ? files.find((item) => item.id === activity.expedienteId) : null; return [getSubject(activity, leads, customers, files), lead?.nombre, lead?.telefono, customer?.nombre, customer?.telefono, file?.numeroExpediente].filter(Boolean).join(" ").toLowerCase(); }
function canManage(activity: ActivityRecord, session: DemoSession) { if (session.role === "Administrador") return false; if (session.role === "Gerente") return activity.sucursalId === session.branchId; return activity.vendedorId === session.userId; }
function statusTone(status: ActivityStatus) { if (status === "Completada") return "green" as const; if (status === "Cancelada") return "gray" as const; return "yellow" as const; }
function formatDate(value: string | null) { if (!value) return "Sin fecha programada"; const date = new Date(value); if (Number.isNaN(date.getTime())) return value; return new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date); }
