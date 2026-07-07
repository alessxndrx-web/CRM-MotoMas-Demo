"use client";

import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FolderKanban,
  Search,
  Store,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ActivityRecord } from "@/data/operations/activities";
import type { CreditApplicationRecord } from "@/data/operations/credit-applications";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import { desiredBranches } from "@/data/operations/leads";
import type { ReservationRecord } from "@/data/operations/reservations";
import type { SaleRecord } from "@/data/operations/sales";
import { getUsersByRole } from "@/data/operations/users";
import { isActivityOverdue, readActivities } from "@/features/operations/services/activity-service";
import { readCreditApplications } from "@/features/operations/services/credit-application-service";
import { readCustomerFiles } from "@/features/operations/services/customer-files-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import { readReservations } from "@/features/operations/services/reservation-service";
import { readSales } from "@/features/operations/services/sales-service";
import { readDemoSession, subscribeToDemoSession } from "@/features/operations/services/session-service";
import type { DemoSession, InternalUser } from "@/features/operations/types";
import type { PublicLead } from "@/data/operations/leads";
import { cn } from "@/lib/utils";

const ALL = "todas";
const sellerStatuses = ["Activo", "Inactivo"] as const;

type SellerStatus = (typeof sellerStatuses)[number];

type SellerMetrics = {
  leads: PublicLead[];
  activities: ActivityRecord[];
  files: CustomerFileRecord[];
  reservations: ReservationRecord[];
  sales: SaleRecord[];
  credits: CreditApplicationRecord[];
};

export function SellersPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [credits, setCredits] = useState<CreditApplicationRecord[]>([]);
  const [branchFilter, setBranchFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState<SellerStatus | typeof ALL>(ALL);
  const [query, setQuery] = useState("");
  const [selectedSellerId, setSelectedSellerId] = useState("");

  useEffect(() => {
    function sync() {
      const nextSession = readDemoSession();
      setSession(nextSession);
      setLeads(readLeadInboxLeads());
      setActivities(readActivities());
      setFiles(readCustomerFiles());
      setReservations(readReservations());
      setSales(readSales());
      setCredits(readCreditApplications());
      setBranchFilter(nextSession?.role === "Gerente" ? nextSession.branchId : ALL);
    }

    sync();
    window.addEventListener("focus", sync);
    const unsubscribe = subscribeToDemoSession(sync);

    return () => {
      window.removeEventListener("focus", sync);
      unsubscribe();
    };
  }, []);

  const scopedSellers = useMemo(() => {
    const sellers = getUsersByRole("Vendedor");
    if (!session || session.role === "Vendedor") return [];
    if (session.role === "Gerente") {
      return sellers.filter((seller) => seller.branchId === session.branchId);
    }
    return sellers;
  }, [session]);

  const visibleSellers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return scopedSellers.filter((seller) => {
      const status: SellerStatus = "Activo";
      const matchesBranch = branchFilter === ALL || seller.branchId === branchFilter;
      const matchesStatus = statusFilter === ALL || status === statusFilter;
      const matchesQuery = !normalizedQuery || seller.userName.toLowerCase().includes(normalizedQuery);

      return matchesBranch && matchesStatus && matchesQuery;
    });
  }, [branchFilter, query, scopedSellers, statusFilter]);

  const selectedSeller =
    visibleSellers.find((seller) => seller.userId === selectedSellerId) ??
    visibleSellers[0] ??
    null;

  const selectedMetrics = selectedSeller
    ? getSellerMetrics(selectedSeller, leads, activities, files, reservations, sales, credits)
    : null;

  if (!session || session.role === "Vendedor") {
    return (
      <Card className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">Supervision de vendedores restringida</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          La supervision de vendedores esta disponible para Gerente y Administrador.
          Tu operación diaria se gestiona desde leads, expedientes y actividades.
        </p>
      </Card>
    );
  }

  const activeSellers = visibleSellers.length;
  const assignedLeads = visibleSellers.reduce(
    (total, seller) => total + getSellerMetrics(seller, leads, activities, files, reservations, sales, credits).leads.length,
    0,
  );
  const overdueActivities = visibleSellers.reduce(
    (total, seller) => total + getSellerMetrics(seller, leads, activities, files, reservations, sales, credits).activities.filter((activity) => isActivityOverdue(activity)).length,
    0,
  );
  const completedSales = visibleSellers.reduce(
    (total, seller) => total + getSellerMetrics(seller, leads, activities, files, reservations, sales, credits).sales.length,
    0,
  );
  const branchOptions = session.role === "Gerente"
    ? desiredBranches.filter((branch) => branch.id === session.branchId)
    : desiredBranches;

  return (
    <section className="space-y-6">
      <div>
        <Badge tone="red">Supervision comercial</Badge>
        <h2 className="mt-4 text-3xl font-black text-white">Rendimiento y carga de vendedores</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
          Vista demo de carga de trabajo y rendimiento comercial. No administra usuarios, contrasenas ni permisos reales.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Vendedores activos" value={activeSellers} />
        <Metric label="Leads asignados" value={assignedLeads} />
        <Metric label="Actividades vencidas" value={overdueActivities} />
        <Metric label="Ventas completadas" value={completedSales} />
      </div>

      <Card className="p-5">
        <div className="grid gap-4 lg:grid-cols-4">
          <FilterSelect label="Sucursal" onChange={setBranchFilter} value={branchFilter}>
            {session.role === "Administrador" ? <option value={ALL}>Todas las sucursales</option> : null}
            {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </FilterSelect>
          <FilterSelect label="Estado" onChange={(value) => setStatusFilter(value as SellerStatus | typeof ALL)} value={statusFilter}>
            <option value={ALL}>Todos los estados</option>
            {sellerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </FilterSelect>
          <label className="relative block lg:col-span-2">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Busqueda</span>
            <Search className="pointer-events-none absolute bottom-4 left-4 h-4 w-4 text-zinc-600" />
            <Input className="pl-11" onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre" value={query} />
          </label>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1050px] w-full text-left">
              <thead className="border-b border-white/10 bg-white/[0.035] text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4">Vendedor</th>
                  <th className="px-5 py-4">Sucursal</th>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4">Leads</th>
                  <th className="px-5 py-4">Actividades</th>
                  <th className="px-5 py-4">Expedientes</th>
                  <th className="px-5 py-4">Reservas</th>
                  <th className="px-5 py-4">Ventas</th>
                  <th className="px-5 py-4">Créditos</th>
                </tr>
              </thead>
              <tbody>
                {visibleSellers.map((seller) => {
                  const metrics = getSellerMetrics(seller, leads, activities, files, reservations, sales, credits);
                  const pendingActivities = metrics.activities.filter((activity) => activity.estado === "Pendiente").length;
                  const overdue = metrics.activities.filter((activity) => isActivityOverdue(activity)).length;
                  const activeReservations = metrics.reservations.filter((reservation) => reservation.estado === "Activa").length;
                  const activeCredits = metrics.credits.filter((credit) => credit.estado !== "Cancelado").length;
                  const conversion = getConversion(metrics);
                  const workload = getWorkloadStatus(metrics);
                  const lastActivity = getLastActivityLabel(metrics.activities);
                  const isSelected = seller.userId === selectedSeller?.userId;

                  return (
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-white/7 text-sm text-zinc-300 transition last:border-b-0 hover:bg-white/[0.045]",
                        isSelected && "bg-red-500/10",
                      )}
                      key={seller.userId}
                      onClick={() => setSelectedSellerId(seller.userId)}
                    >
                      <td className="px-5 py-4"><div className="font-black text-white">{seller.userName}</div><div className="mt-1 text-xs text-zinc-500">Conversion {conversion}% / carga {workload.label}</div><div className="mt-1 text-xs text-zinc-600">Ultima actividad: {lastActivity}</div></td>
                      <td className="px-5 py-4">{seller.branchName}</td>
                      <td className="px-5 py-4"><Badge tone="green">Activo</Badge></td>
                      <td className="px-5 py-4 font-black text-white">{metrics.leads.length}</td>
                      <td className="px-5 py-4"><div>{pendingActivities} pendientes</div><div className={cn("mt-1 text-xs", overdue ? "text-red-300" : "text-zinc-500")}>{overdue} vencidas</div></td>
                      <td className="px-5 py-4 font-black text-white">{metrics.files.length}</td>
                      <td className="px-5 py-4 font-black text-white">{activeReservations}</td>
                      <td className="px-5 py-4 font-black text-white">{metrics.sales.length}</td>
                      <td className="px-5 py-4 font-black text-white">{activeCredits}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!visibleSellers.length ? <div className="p-8 text-center text-sm text-zinc-500">No hay vendedores para este alcance. Ajustá los filtros o iniciá una sesión de Gerente o Administrador.</div> : null}
        </Card>

        <SellerDetail seller={selectedSeller} metrics={selectedMetrics} />
      </div>
    </section>
  );
}

function SellerDetail({ seller, metrics }: { seller: InternalUser | null; metrics: SellerMetrics | null }) {
  if (!seller || !metrics) {
    return (
      <Card className="p-8 text-center">
        <Users className="mx-auto h-10 w-10 text-zinc-600" />
        <h3 className="mt-4 text-xl font-black text-white">Sin vendedor seleccionado</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-500">Selecciona un vendedor para revisar su supervision comercial.</p>
      </Card>
    );
  }

  const pendingActivities = metrics.activities.filter((activity) => activity.estado === "Pendiente").length;
  const overdueActivities = metrics.activities.filter((activity) => isActivityOverdue(activity)).length;
  const activeReservations = metrics.reservations.filter((reservation) => reservation.estado === "Activa").length;
  const inReviewCredits = metrics.credits.filter((credit) => credit.estado === "En revision").length;
  const pendingCreditDocuments = metrics.credits.filter((credit) => credit.estado === "Documentacion pendiente").length;
  const approvedCredits = metrics.credits.filter((credit) => credit.estado === "Aprobado").length;
  const latestActivities = [...metrics.activities]
    .sort((left, right) => activityDate(right).localeCompare(activityDate(left)))
    .slice(0, 4);

  return (
    <Card className="p-6">
      <Badge tone="green">Activo</Badge>
      <h3 className="mt-4 text-2xl font-black text-white">{seller.userName}</h3>
      <p className="mt-1 text-sm text-zinc-500">{seller.branchName} / Vendedor demo</p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <DetailMetric icon={<ClipboardList className="h-4 w-4" />} label="Leads asignados" value={metrics.leads.length} />
        <DetailMetric icon={<Activity className="h-4 w-4" />} label="Pendientes" value={pendingActivities} />
        <DetailMetric icon={<CalendarClock className="h-4 w-4" />} label="Vencidas" value={overdueActivities} tone={overdueActivities ? "red" : "default"} />
        <DetailMetric icon={<FolderKanban className="h-4 w-4" />} label="Expedientes" value={metrics.files.length} />
        <DetailMetric icon={<CheckCircle2 className="h-4 w-4" />} label="Reservas activas" value={activeReservations} />
        <DetailMetric icon={<Store className="h-4 w-4" />} label="Ventas completadas" value={metrics.sales.length} />
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.045] p-4">
        <div className="flex items-center gap-2 text-sm font-black text-white"><CreditCard className="h-4 w-4 text-red-300" />Créditos en seguimiento</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <SummaryValue label="Revision" value={inReviewCredits} />
          <SummaryValue label="Documentos" value={pendingCreditDocuments} />
          <SummaryValue label="Aprobados" value={approvedCredits} />
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Leads por estado</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {leadStatusRows(metrics.leads).map(([status, value]) => <SummaryValue key={status} label={status} value={value} />)}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Ultimas actividades</div>
        <div className="mt-3 space-y-3">
          {latestActivities.length ? latestActivities.map((activity) => (
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3" key={activity.id}>
              <div className="flex items-start justify-between gap-3"><div className="text-sm font-bold text-white">{activity.titulo}</div><Badge tone={activity.estado === "Completada" ? "green" : activity.estado === "Cancelada" ? "gray" : "blue"}>{activity.tipo}</Badge></div>
              <div className="mt-1 text-xs text-zinc-500">{activity.estado} / {formatDate(activityDate(activity))}</div>
            </div>
          )) : <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm text-zinc-500">Aún no hay actividades registradas para este vendedor.</div>}
        </div>
      </div>

      <div className="mt-6">
        <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Expedientes relacionados</div>
        <div className="mt-3 space-y-2">
          {metrics.files.length ? metrics.files.slice(0, 4).map((file) => <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3" key={file.id}><div className="font-mono text-sm font-black text-white">{file.numeroExpediente}</div><div className="mt-1 text-xs text-zinc-500">{file.motoInteres}</div></div>) : <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 text-sm text-zinc-500">Aún no hay expedientes relacionados con este vendedor.</div>}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/8 p-4">
        <div className="text-xs font-black uppercase tracking-[0.12em] text-red-300">Rendimiento comercial</div>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          {metrics.leads.length ? `${metrics.files.length} expedientes creados desde ${metrics.leads.length} leads asignados.` : "Aun no hay leads asignados para calcular conversion."}
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Monto vendido: Sin monto registrado en las ventas de la demo.</p>
      </div>
    </Card>
  );
}

function getSellerMetrics(
  seller: InternalUser,
  leads: PublicLead[],
  activities: ActivityRecord[],
  files: CustomerFileRecord[],
  reservations: ReservationRecord[],
  sales: SaleRecord[],
  credits: CreditApplicationRecord[],
): SellerMetrics {
  return {
    leads: leads.filter((lead) => lead.vendedorAsignado === seller.userName),
    activities: activities.filter((activity) => activity.vendedorId === seller.userId || activity.vendedorNombre === seller.userName),
    files: files.filter((file) => file.vendedor === seller.userName),
    reservations: reservations.filter((reservation) => reservation.vendedorId === seller.userId || reservation.vendedorNombre === seller.userName),
    sales: sales.filter((sale) => sale.vendedorId === seller.userId || sale.vendedorNombre === seller.userName),
    credits: credits.filter((credit) => credit.vendedorId === seller.userId || credit.vendedorNombre === seller.userName),
  };
}

function leadStatusRows(leads: PublicLead[]) {
  const statuses = ["Nuevo Lead", "Asignado", "Contactado", "Interesado", "Expediente", "Descartado"] as const;
  return statuses.map((status) => [status, leads.filter((lead) => lead.estado === status).length] as const);
}

function getConversion(metrics: SellerMetrics) {
  if (!metrics.leads.length) return 0;
  return Math.round((metrics.sales.length / metrics.leads.length) * 100);
}

function getWorkloadStatus(metrics: SellerMetrics): { label: "baja" | "normal" | "alta"; tone: "green" | "blue" | "red" } {
  const activeLeads = metrics.leads.filter((lead) => lead.estado !== "Descartado" && lead.estado !== "Expediente").length;
  const pendingActivities = metrics.activities.filter((activity) => activity.estado === "Pendiente").length;
  const activeReservations = metrics.reservations.filter((reservation) => reservation.estado === "Activa").length;
  const score = activeLeads + pendingActivities + activeReservations;

  if (score >= 10) return { label: "alta", tone: "red" };
  if (score <= 3) return { label: "baja", tone: "green" };
  return { label: "normal", tone: "blue" };
}

function getLastActivityLabel(activities: ActivityRecord[]) {
  const latest = [...activities].sort((a, b) => activityDate(b).localeCompare(activityDate(a)))[0];
  return latest ? `${latest.tipo} / ${formatDate(activityDate(latest))}` : "Sin actividad";
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card className="p-5"><div className="text-sm font-semibold text-zinc-500">{label}</div><div className="mt-2 text-3xl font-black text-white">{value}</div></Card>;
}

function DetailMetric({ icon, label, tone = "default", value }: { icon: React.ReactNode; label: string; tone?: "default" | "red"; value: number }) {
  return <div className={cn("rounded-xl border p-3", tone === "red" ? "border-red-500/25 bg-red-500/10" : "border-white/10 bg-white/[0.045]")}><div className={cn("flex items-center gap-2 text-xs", tone === "red" ? "text-red-300" : "text-zinc-500")}>{icon}{label}</div><div className="mt-2 text-xl font-black text-white">{value}</div></div>;
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-white/10 bg-black/20 p-2"><div className="truncate text-[11px] text-zinc-500">{label}</div><div className="mt-1 text-lg font-black text-white">{value}</div></div>;
}

function FilterSelect({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{label}</span><select className="h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none focus:border-red-500/70" onChange={(event) => onChange(event.target.value)} value={value}>{children}</select></label>;
}

function activityDate(activity: ActivityRecord) {
  return activity.fechaCompletada ?? activity.fechaProgramada ?? activity.fechaCreacion;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
