"use client";

import Link from "next/link";
import {
  Bike,
  CalendarCheck,
  ClipboardList,
  FolderKanban,
  Globe2,
  Store,
  Truck,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ActivityRecord } from "@/data/operations/activities";
import type {
  CustomerFileRecord,
  CustomerRecord,
} from "@/data/operations/customer-files";
import type { InventoryUnit } from "@/data/operations/inventory";
import { NEW_LEAD_STATUS, type PublicLead } from "@/data/operations/leads";
import type { ReservationRecord } from "@/data/operations/reservations";
import type { SaleRecord } from "@/data/operations/sales";
import type { TransferOrder } from "@/data/operations/transfers";
import type { QuoteRecord } from "@/data/operations/quotes";
import type { CustomerFileDocumentRecord } from "@/data/operations/customer-file-documents";
import type { CreditApplicationRecord } from "@/data/operations/credit-applications";
import {
  readCustomerFiles,
  readCustomers,
} from "@/features/operations/services/customer-files-service";
import {
  isActivityOverdue,
  isActivityScheduledToday,
  readActivities,
} from "@/features/operations/services/activity-service";
import { readInventoryUnits } from "@/features/operations/services/inventory-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import {
  filterBranchInventoryUnits,
  filterCustomerFilesBySession,
  filterCustomerFileDocumentsBySession,
  filterCreditApplicationsBySession,
  filterCustomersBySession,
  filterInventoryUnitsBySession,
  filterLeadsBySession,
  filterQuotesBySession,
  filterReservationsBySession,
  filterActivitiesBySession,
  filterSalesBySession,
  filterTransferOrdersBySession,
} from "@/features/operations/services/operation-scope-service";
import { readCreditApplications } from "@/features/operations/services/credit-application-service";
import { readReservations } from "@/features/operations/services/reservation-service";
import { isQuoteExpired, readQuotes } from "@/features/operations/services/quote-service";
import {
  getScopedDocumentProgress,
  readCustomerFileDocuments,
} from "@/features/operations/services/customer-file-documents-service";
import { readSales } from "@/features/operations/services/sales-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import { readTransferOrders } from "@/features/operations/services/transfer-service";
import type { DemoSession } from "@/features/operations/types";

export function OperationsDashboard() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [documents, setDocuments] = useState<CustomerFileDocumentRecord[]>([]);
  const [credits, setCredits] = useState<CreditApplicationRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [transfers, setTransfers] = useState<TransferOrder[]>([]);
  const [inventoryUnits, setInventoryUnits] = useState<InventoryUnit[]>([]);

  useEffect(() => {
    function syncState() {
      setSession(readDemoSession());
      setLeads(readLeadInboxLeads());
      setCustomers(readCustomers());
      setFiles(readCustomerFiles());
      setReservations(readReservations());
      setActivities(readActivities());
      setQuotes(readQuotes());
      setDocuments(readCustomerFileDocuments());
      setCredits(readCreditApplications());
      setSales(readSales());
      setTransfers(readTransferOrders());
      setInventoryUnits(readInventoryUnits());
    }

    syncState();
    return subscribeToDemoSession(syncState);
  }, []);

  const visibleLeads = useMemo(
    () => filterLeadsBySession(leads, session),
    [leads, session],
  );
  const visibleCustomers = useMemo(
    () => filterCustomersBySession(customers, files, leads, session),
    [customers, files, leads, session],
  );
  const visibleFiles = useMemo(
    () => filterCustomerFilesBySession(files, leads, session),
    [files, leads, session],
  );
  const visibleReservations = useMemo(
    () => filterReservationsBySession(reservations, session),
    [reservations, session],
  );
  const visibleActivities = useMemo(
    () => filterActivitiesBySession(activities, session),
    [activities, session],
  );
  const visibleQuotes = useMemo(
    () => filterQuotesBySession(quotes, session),
    [quotes, session],
  );
  const visibleDocuments = useMemo(
    () => filterCustomerFileDocumentsBySession(documents, session),
    [documents, session],
  );
  const visibleCredits = useMemo(
    () => filterCreditApplicationsBySession(credits, session),
    [credits, session],
  );
  const visibleTransfers = useMemo(
    () => filterTransferOrdersBySession(transfers, session),
    [session, transfers],
  );
  const visibleSales = useMemo(
    () => filterSalesBySession(sales, session),
    [sales, session],
  );
  const visibleInventoryUnits = useMemo(
    () => filterInventoryUnitsBySession(inventoryUnits, session),
    [inventoryUnits, session],
  );
  const branchInventoryUnits = useMemo(
    () => filterBranchInventoryUnits(inventoryUnits, session),
    [inventoryUnits, session],
  );

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-black text-white">Sesión requerida</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Inicia una sesión interna demo para ver el dashboard operativo.
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

  const pendingLeads = visibleLeads.filter(
    (lead) => lead.estado === NEW_LEAD_STATUS,
  ).length;
  const assignedLeads = visibleLeads.filter(
    (lead) => lead.estado === "Asignado",
  ).length;
  const contactedLeads = visibleLeads.filter(
    (lead) => lead.estado === "Contactado",
  ).length;
  const interestedLeads = visibleLeads.filter(
    (lead) => lead.estado === "Interesado",
  ).length;
  const activeReservations = visibleReservations.filter(
    (reservation) => reservation.estado === "Activa",
  ).length;
  const pendingTransfers = visibleTransfers.filter(
    (transfer) => transfer.estado === "Pendiente",
  ).length;
  const visibleAvailableInventory = visibleInventoryUnits.filter(
    (unit) => unit.estado === "Disponible",
  ).length;
  const branchAvailableInventory = branchInventoryUnits.filter(
    (unit) => unit.estado === "Disponible",
  ).length;
  const pendingActivitiesToday = visibleActivities.filter((activity) =>
    isActivityScheduledToday(activity),
  ).length;
  const overdueActivities = visibleActivities.filter((activity) =>
    isActivityOverdue(activity),
  ).length;
  const completedFollowUps = visibleActivities.filter(
    (activity) =>
      activity.estado === "Completada" && activity.tipo === "Seguimiento",
  ).length;
  const highPriorityActivities = visibleActivities.filter(
    (activity) => activity.estado === "Pendiente" && activity.prioridad === "Alta",
  ).length;
  const upcomingAppointments = visibleActivities.filter((activity) => {
    if (!activity.fechaProgramada) return false;
    const scheduledAt = new Date(activity.fechaProgramada);

    return (
      activity.estado === "Pendiente" &&
      activity.tipo === "Cita" &&
      !Number.isNaN(scheduledAt.getTime()) &&
      !isActivityOverdue(activity)
    );
  }).length;
  const emittedQuotes = visibleQuotes.filter(
    (quote) => quote.estado === "Emitida",
  ).length;
  const acceptedQuotes = visibleQuotes.filter(
    (quote) => quote.estado === "Aceptada",
  ).length;
  const expiredQuotes = visibleQuotes.filter((quote) => isQuoteExpired(quote)).length;
  const quotedAmount = visibleQuotes.reduce(
    (total, quote) => total + (quote.precioReferencial ?? 0),
    0,
  );
  const documentProgress = getScopedDocumentProgress(visibleFiles, visibleDocuments);
  const receivedDocuments = documentProgress.documents.filter(
    (document) => document.estado === "Recibido",
  ).length;
  const rejectedDocuments = documentProgress.documents.filter(
    (document) => document.estado === "Rechazado",
  ).length;
  const creditsInReview = visibleCredits.filter((credit) => credit.estado === "En revision").length;
  const creditsWithPendingDocuments = visibleCredits.filter((credit) => credit.estado === "Documentacion pendiente").length;
  const approvedCredits = visibleCredits.filter((credit) => credit.estado === "Aprobado").length;
  const rejectedCredits = visibleCredits.filter((credit) => credit.estado === "Rechazado").length;
  const activeCreditFiles = visibleCredits.filter(
    (credit) => credit.estado !== "Rechazado" && credit.estado !== "Cancelado",
  ).length;

  const primaryMetrics =
    session.role === "Vendedor"
      ? [
          {
            icon: ClipboardList,
            label: "Leads asignados",
            value: visibleLeads.length,
          },
          {
            icon: Users,
            label: "Clientes activos",
            value: visibleCustomers.length,
          },
          {
            icon: FolderKanban,
            label: "Expedientes creados",
            value: visibleFiles.length,
          },
          {
            icon: CalendarCheck,
            label: "Reservas activas",
            value: activeReservations,
          },
          {
            icon: Truck,
            label: "Traslados propios",
            value: visibleTransfers.length,
          },
          {
            icon: Bike,
            label: "Disponibles sucursal",
            value: branchAvailableInventory,
          },
          {
            icon: Store,
            label: "Ventas propias",
            value: visibleSales.length,
          },
        ]
      : session.role === "Gerente"
        ? [
            {
              icon: ClipboardList,
              label: "Leads sucursal",
              value: visibleLeads.length,
            },
            {
              icon: Users,
              label: "Clientes sucursal",
              value: visibleCustomers.length,
            },
            {
              icon: FolderKanban,
              label: "Expedientes sucursal",
              value: visibleFiles.length,
            },
            {
              icon: CalendarCheck,
              label: "Reservas visibles",
              value: activeReservations,
            },
            {
              icon: Truck,
              label: "Traslados visibles",
              value: visibleTransfers.length,
            },
          {
            icon: Bike,
            label: "Inventario sucursal",
            value: visibleInventoryUnits.length,
          },
          {
            icon: Store,
            label: "Ventas sucursal",
            value: visibleSales.length,
          },
          ]
        : [
            {
              icon: ClipboardList,
              label: "Leads globales",
              value: visibleLeads.length,
            },
            {
              icon: Users,
              label: "Clientes globales",
              value: visibleCustomers.length,
            },
            {
              icon: FolderKanban,
              label: "Expedientes globales",
              value: visibleFiles.length,
            },
            {
              icon: CalendarCheck,
              label: "Reservas activas",
              value: activeReservations,
            },
            {
              icon: Truck,
              label: "Traslados pendientes",
              value: pendingTransfers,
            },
          {
            icon: Store,
            label: "Inventario disponible",
            value: visibleAvailableInventory,
          },
          {
            icon: Store,
            label: "Ventas globales",
            value: visibleSales.length,
          },
          ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge tone="red">{session.role}</Badge>
          <h2 className="mt-4 text-3xl font-black text-white">
            {dashboardTitle[session.role]}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            {dashboardCopy[session.role]}
          </p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
          href="/panel/leads"
        >
          Ir a leads
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {primaryMetrics.map((metric) => (
          <MetricCard
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </div>

      <Card className="p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <Globe2 className="h-5 w-5 text-red-400" />
              <h3 className="text-xl font-black text-white">
                Alcance de esta sesión
              </h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              {session.role === "Administrador"
                ? "Vista global de supervision. La asignacion diaria de leads queda orientada a los gerentes de sucursal."
                : `Vista filtrada para ${session.branchName}. No se muestran datos operativos fuera del alcance del rol.`}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Sesión activa
            </div>
            <div className="mt-2 text-lg font-black text-white">
              {session.userName}
            </div>
            <div className="mt-1 text-sm text-zinc-500">
              {session.role} / {session.branchName}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <StatusCard label="Nuevos" value={pendingLeads} />
        <StatusCard label="Asignados" value={assignedLeads} />
        <StatusCard label="Contactados" value={contactedLeads} />
        <StatusCard label="Interesados" value={interestedLeads} />
      </div>

      <div>
        <div className="mb-4 flex items-center gap-3">
          <CalendarCheck className="h-5 w-5 text-red-400" />
          <h3 className="text-xl font-black text-white">Seguimiento comercial</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            icon={CalendarCheck}
            label="Actividades pendientes hoy"
            value={pendingActivitiesToday}
          />
          <MetricCard
            icon={ClipboardList}
            label="Actividades vencidas"
            value={overdueActivities}
          />
          <MetricCard
            icon={UserCheck}
            label="Seguimientos completados"
            value={completedFollowUps}
          />
          <MetricCard
            icon={CalendarCheck}
            label="Proximas citas"
            value={upcomingAppointments}
          />
          <MetricCard
            icon={ClipboardList}
            label="Actividades prioridad Alta"
            value={highPriorityActivities}
          />
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center gap-3">
          <FolderKanban className="h-5 w-5 text-red-400" />
          <h3 className="text-xl font-black text-white">Seguimiento de crédito</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={FolderKanban} label="Créditos en revisión" value={creditsInReview} />
          <MetricCard icon={ClipboardList} label="Documentación pendiente" value={creditsWithPendingDocuments} />
          <MetricCard icon={UserCheck} label="Créditos aprobados" value={approvedCredits} />
          <MetricCard icon={ClipboardList} label="Créditos rechazados" value={rejectedCredits} />
          <MetricCard icon={FolderKanban} label="Expedientes con crédito activo" value={activeCreditFiles} />
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center gap-3">
          <FolderKanban className="h-5 w-5 text-red-400" />
          <h3 className="text-xl font-black text-white">Proformas comerciales</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={FolderKanban} label="Proformas emitidas" value={emittedQuotes} />
          <MetricCard icon={FolderKanban} label="Proformas aceptadas" value={acceptedQuotes} />
          <MetricCard icon={FolderKanban} label="Proformas vencidas" value={expiredQuotes} />
          <MetricCard icon={FolderKanban} label="Monto referencial cotizado" value={formatAmount(quotedAmount)} />
        </div>
      </div>

      <div>
        <div className="mb-4 flex items-center gap-3">
          <ClipboardList className="h-5 w-5 text-red-400" />
          <h3 className="text-xl font-black text-white">Validacion documental</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={ClipboardList} label="Expedientes con documentos pendientes" value={documentProgress.filesWithPendingDocuments} />
          <MetricCard icon={ClipboardList} label="Documentos recibidos" value={receivedDocuments} />
          <MetricCard icon={ClipboardList} label="Documentos rechazados" value={rejectedDocuments} />
          <MetricCard icon={ClipboardList} label="Expedientes listos documentalmente" value={documentProgress.readyFiles} />
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-zinc-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-white">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-500/15 text-red-400">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function StatusCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
    </Card>
  );
}

const dashboardTitle = {
  Vendedor: "Mi operación comercial",
  Gerente: "Operación de sucursal",
  Administrador: "Vista global de supervision",
} as const;

const dashboardCopy = {
  Vendedor:
    "Resumen conectado a tus leads, clientes, expedientes, reservas, traslados e inventario de sucursal.",
  Gerente:
    "Resumen operativo de tu sucursal con datos reales de seguimiento comercial, inventario y traslados.",
  Administrador:
    "Resumen global para supervisión. La operación diaria se mantiene en manos de gerentes y vendedores.",
} as const;

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
  }).format(value);
}
