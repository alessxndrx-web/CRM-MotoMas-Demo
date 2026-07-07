"use client";

import Link from "next/link";
import {
  Bike,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FolderKanban,
  Globe2,
  MessageCircle,
  PhoneCall,
  PackageSearch,
  Store,
  Trophy,
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
import {
  inventoryUnitStatuses,
  type InventoryUnit,
} from "@/data/operations/inventory";
import { NEW_LEAD_STATUS, type PublicLead } from "@/data/operations/leads";
import type { ReservationRecord } from "@/data/operations/reservations";
import type { SaleRecord } from "@/data/operations/sales";
import {
  TRANSFER_IN_TRANSIT_STATUS,
  type TransferOrder,
} from "@/data/operations/transfers";
import type { QuoteRecord } from "@/data/operations/quotes";
import type { CustomerFileDocumentRecord } from "@/data/operations/customer-file-documents";
import type { CreditApplicationRecord } from "@/data/operations/credit-applications";
import { getUsersByRole } from "@/data/operations/users";
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
import type { DemoSession, InternalUser } from "@/features/operations/types";

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

  if (session.role === "Vendedor") {
    const newAssignedLeads = visibleLeads.filter(
      (lead) => lead.estado === NEW_LEAD_STATUS || lead.estado === "Asignado",
    );
    const uncontactedLeads = visibleLeads.filter(
      (lead) => lead.estado === NEW_LEAD_STATUS || lead.estado === "Asignado",
    );
    const todayActivities = visibleActivities.filter((activity) =>
      isActivityScheduledToday(activity),
    );
    const activeFiles = visibleFiles;
    const activeSales = visibleSales.filter((sale) => sale.estado !== "Entregada");
    const pendingDocuments = documentProgress.documents.filter(
      (document) => document.estado === "Pendiente" || document.estado === "Rechazado",
    );
    const workItems = buildSellerWorkItems({
      activities: visibleActivities,
      documents: pendingDocuments,
      files: visibleFiles,
      leads: visibleLeads,
      reservations: visibleReservations,
      sales: visibleSales,
    });
    const recentActivity = [
      ...visibleActivities
        .slice()
        .sort((a, b) => Date.parse(b.fechaCreacion) - Date.parse(a.fechaCreacion))
        .slice(0, 5)
        .map((activity) => ({
          icon: activity.tipo === "WhatsApp" ? MessageCircle : activity.tipo === "Llamada" ? PhoneCall : ClipboardList,
          label: activity.tipo,
          title: activity.titulo,
          meta: `${activity.estado} / ${formatDashboardDate(activity.fechaCreacion)}`,
        })),
      ...visibleFiles.slice(0, 2).map((file) => ({
        icon: FolderKanban,
        label: "Expediente",
        title: file.numeroExpediente,
        meta: `${file.motoInteres} / ${formatDashboardDate(file.fechaCreacion)}`,
      })),
    ].slice(0, 6);

    return (
      <section className="space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Badge tone="red">Vendedor</Badge>
            <h2 className="mt-4 text-3xl font-black text-white">Mi trabajo de hoy</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Prioriza contactos, seguimientos, expedientes, reservas y ventas propias. Inventario queda como consulta para ofrecer disponibilidad.
            </p>
          </div>
          <Link className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500" href="/panel/leads">
            Registrar o contactar lead
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={UserCheck} label="Leads nuevos asignados" value={newAssignedLeads.length} />
          <MetricCard icon={PhoneCall} label="Leads sin contactar" value={uncontactedLeads.length} />
          <MetricCard icon={ClipboardList} label="Seguimientos vencidos" value={overdueActivities} />
          <MetricCard icon={CalendarCheck} label="Actividades de hoy" value={todayActivities.length} />
          <MetricCard icon={FolderKanban} label="Expedientes activos" value={activeFiles.length} />
          <MetricCard icon={CalendarCheck} label="Reservas activas" value={activeReservations} />
          <MetricCard icon={Store} label="Ventas en proceso" value={activeSales.length} />
          <MetricCard icon={Bike} label="Motos disponibles" value={branchAvailableInventory} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-white">Tu trabajo de hoy</h3>
                <p className="mt-1 text-sm text-zinc-500">Cola comercial sugerida con accesos directos al modulo relacionado.</p>
              </div>
              <Badge tone={workItems.length ? "red" : "green"}>{workItems.length ? `${workItems.length} pendientes` : "Al dia"}</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {workItems.length ? (
                workItems.map((item) => (
                  <Link className="block rounded-xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-red-500/30 hover:bg-red-500/8" href={item.href} key={`${item.title}-${item.customer}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-black text-white">{item.title}</div>
                        <div className="mt-1 text-sm text-zinc-400">{item.customer}</div>
                        <div className="mt-1 text-xs text-zinc-500">{item.motorcycle}</div>
                      </div>
                      <Badge tone={item.tone}>{item.urgency}</Badge>
                    </div>
                    <div className="mt-3 text-sm font-semibold text-red-200">{item.action}</div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-5 text-sm leading-6 text-emerald-100">
                  Tu agenda comercial esta al dia. Registra una actividad para programar el proximo contacto.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-xl font-black text-white">Acciones rapidas</h3>
            <div className="mt-5 grid gap-3">
              {sellerQuickActions.map((action) => (
                <Link className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-red-500/30 hover:bg-white/[0.075]" href={action.href} key={action.label}>
                  {action.label}
                  <action.icon className="h-4 w-4 text-red-300" />
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-red-400" />
            <h3 className="text-xl font-black text-white">Actividad reciente</h3>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recentActivity.length ? recentActivity.map((item) => (
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4" key={`${item.label}-${item.title}-${item.meta}`}>
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 text-red-300" />
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{item.label}</div>
                </div>
                <div className="mt-3 text-sm font-black text-white">{item.title}</div>
                <div className="mt-1 text-xs text-zinc-500">{item.meta}</div>
              </div>
            )) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5 text-sm text-zinc-500">
                Registra una actividad para programar el proximo contacto.
              </div>
            )}
          </div>
        </Card>
      </section>
    );
  }

  if (session.role === "Gerente") {
    const unassignedLeads = visibleLeads.filter((lead) => !lead.vendedorAsignado);
    const uncontactedLeads = visibleLeads.filter(
      (lead) => lead.estado === NEW_LEAD_STATUS || lead.estado === "Asignado",
    );
    const activeSales = visibleSales.filter((sale) => sale.estado !== "Entregada");
    const monthlySales = visibleSales.filter((sale) => isCurrentMonth(sale.fechaVenta));
    const inTransitTransfers = visibleTransfers.filter(
      (transfer) => transfer.estado === TRANSFER_IN_TRANSIT_STATUS,
    );
    const reservedUnits = visibleInventoryUnits.filter((unit) => unit.estado === "Reservada").length;
    const inTransitUnits = visibleInventoryUnits.filter(
      (unit) => unit.estado === inventoryUnitStatuses[3],
    ).length;
    const soldUnits = visibleInventoryUnits.filter((unit) => unit.estado === "Vendida" || unit.estado === "Entregada").length;
    const sellerRows = buildManagerSellerRows({
      activities: visibleActivities,
      leads: visibleLeads,
      reservations: visibleReservations,
      sales: visibleSales,
      session,
    });
    const recommendedSeller = recommendSeller(sellerRows);
    const decisionItems = buildManagerDecisionItems({
      activeSales,
      branchAvailableInventory,
      overdueActivities,
      pendingTransfers,
      sellerRows,
      unassignedLeads,
      visibleReservations,
    });
    const conversion = visibleLeads.length
      ? Math.round((visibleFiles.length / visibleLeads.length) * 100)
      : 0;
    const bestSeller = [...sellerRows].sort((a, b) => b.conversion - a.conversion || b.salesThisMonth - a.salesThisMonth)[0];
    const topModels = topModelRows([...visibleReservations.map((reservation) => reservation.modelo), ...visibleSales.map((sale) => sale.modelo)]);
    const recentOps = [
      ...visibleTransfers.slice(0, 2).map((transfer) => ({
        icon: Truck,
        title: transfer.numeroTraslado,
        meta: `${transfer.estado} / ${transfer.sucursalOrigenNombre} -> ${transfer.sucursalDestinoNombre}`,
      })),
      ...visibleReservations.slice(0, 2).map((reservation) => ({
        icon: CalendarCheck,
        title: reservation.numeroReserva,
        meta: `${reservation.estado} / ${reservation.clienteNombre}`,
      })),
      ...visibleSales.slice(0, 2).map((sale) => ({
        icon: Store,
        title: sale.numeroVenta,
        meta: `${sale.estado} / ${sale.clienteNombre}`,
      })),
      ...visibleActivities.slice(0, 2).map((activity) => ({
        icon: ClipboardList,
        title: activity.titulo,
        meta: `${activity.estado} / ${activity.vendedorNombre}`,
      })),
    ].slice(0, 6);

    return (
      <section className="space-y-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Badge tone="red">Gerente / {session.branchName}</Badge>
            <h2 className="mt-4 text-3xl font-black text-white">Operacion de sucursal</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Supervisa leads, vendedores, inventario, reservas, ventas y traslados de tu sucursal.
            </p>
          </div>
          <Link className="inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500" href="/panel/leads">
            Revisar asignaciones
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={UserCheck} label="Leads nuevos" value={pendingLeads} />
          <MetricCard icon={Users} label="Leads sin asignar" value={unassignedLeads.length} />
          <MetricCard icon={PhoneCall} label="Leads sin contactar" value={uncontactedLeads.length} />
          <MetricCard icon={ClipboardList} label="Actividades vencidas" value={overdueActivities} />
          <MetricCard icon={CalendarCheck} label="Reservas activas" value={activeReservations} />
          <MetricCard icon={Store} label="Ventas del mes" value={monthlySales.length} />
          <MetricCard icon={Bike} label="Unidades disponibles" value={branchAvailableInventory} />
          <MetricCard icon={Truck} label="Traslados pendientes" value={pendingTransfers} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <Card className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-white">Decisiones pendientes</h3>
                <p className="mt-1 text-sm text-zinc-500">Cola de supervision para asignacion, carga, traslados, reservas, inventario y ventas.</p>
              </div>
              <Badge tone={decisionItems.length ? "red" : "green"}>{decisionItems.length ? `${decisionItems.length} decisiones` : "Sin alertas"}</Badge>
            </div>
            <div className="mt-5 grid gap-3">
              {decisionItems.length ? decisionItems.map((item) => (
                <Link className="rounded-xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-red-500/30 hover:bg-red-500/8" href={item.href} key={item.title}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-black text-white">{item.title}</div>
                      <div className="mt-1 text-sm leading-6 text-zinc-500">{item.description}</div>
                    </div>
                    <Badge tone={item.tone}>{item.count}</Badge>
                  </div>
                </Link>
              )) : (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-5 text-sm text-emerald-100">
                  La sucursal no tiene decisiones criticas pendientes.
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-xl font-black text-white">Asignacion recomendada</h3>
            {unassignedLeads.length && recommendedSeller ? (
              <div className="mt-5 rounded-xl border border-blue-500/20 bg-blue-500/8 p-4">
                <div className="text-sm font-black text-white">{recommendedSeller.name}</div>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Recomendado por menor carga activa, conversion relativa y disponibilidad dentro de {session.branchName}.
                </p>
                <div className="mt-3 text-xs text-zinc-500">
                  {recommendedSeller.activeLeads} leads activos / {recommendedSeller.conversion}% conversion demo.
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-zinc-500">
                No hay leads pendientes de asignacion o no hay vendedores disponibles para recomendar.
              </div>
            )}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <StatusCard label="Reservadas" value={reservedUnits} />
              <StatusCard label="En transito" value={inTransitUnits} />
              <StatusCard label="Vendidas/entregadas" value={soldUnits} />
              <StatusCard label="Traslados en ruta" value={inTransitTransfers.length} />
            </div>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-red-400" />
            <h3 className="text-xl font-black text-white">Carga y rendimiento de vendedores</h3>
          </div>
          <div className="mt-5 grid gap-3 xl:grid-cols-3">
            {sellerRows.map((seller) => (
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4" key={seller.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-white">{seller.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">{seller.salesThisMonth} ventas del mes / {seller.conversion}% conversion</div>
                  </div>
                  <Badge tone={seller.workloadTone}>{seller.workload}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <MiniMetric label="Leads" value={seller.activeLeads} />
                  <MiniMetric label="Contactados" value={seller.contactedLeads} />
                  <MiniMetric label="Vencidas" value={seller.overdueActivities} />
                  <MiniMetric label="Reservas" value={seller.reservations} />
                  <MiniMetric label="Seguim." value={seller.pendingFollowUps} />
                  <MiniMetric label="Ventas" value={seller.salesThisMonth} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-red-400" />
              <h3 className="text-xl font-black text-white">Desempeno de sucursal</h3>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <MetricCard icon={Store} label="Ventas mensuales" value={monthlySales.length} />
              <MetricCard icon={CalendarCheck} label="Reservas activas" value={activeReservations} />
              <MetricCard icon={FolderKanban} label="Conversion lead-expediente" value={`${conversion}%`} />
              <MetricCard icon={UserCheck} label="Mejor vendedor" value={bestSeller?.name ?? "Sin datos"} />
            </div>
            <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.045] p-4">
              <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Modelos con mas movimiento</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {topModels.length ? topModels.map((model) => (
                  <MiniMetric key={model.label} label={model.label} value={model.value} />
                )) : <div className="text-sm text-zinc-500">Sin reservas o ventas para calcular modelos principales.</div>}
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3">
              <PackageSearch className="h-5 w-5 text-red-400" />
              <h3 className="text-xl font-black text-white">Actividad reciente</h3>
            </div>
            <div className="mt-5 space-y-3">
              {recentOps.length ? recentOps.map((item) => (
                <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4" key={`${item.title}-${item.meta}`}>
                  <div className="flex items-center gap-3">
                    <item.icon className="h-4 w-4 text-red-300" />
                    <div className="text-sm font-black text-white">{item.title}</div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">{item.meta}</div>
                </div>
              )) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4 text-sm text-zinc-500">
                  No hay actividad reciente para esta sucursal.
                </div>
              )}
            </div>
          </Card>
        </div>
      </section>
    );
  }

  const primaryMetrics =
    [
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
  Contador: "Area contable",
  Cajero: "Área de caja",
} as const;

const dashboardCopy = {
  Vendedor:
    "Resumen conectado a tus leads, clientes, expedientes, reservas, traslados e inventario de sucursal.",
  Gerente:
    "Resumen operativo de tu sucursal con datos reales de seguimiento comercial, inventario y traslados.",
  Administrador:
    "Resumen global para supervisión. La operación diaria se mantiene en manos de gerentes y vendedores.",
  Contador:
    "El rol Contador opera desde /panel/contabilidad y no participa en el flujo comercial.",
  Cajero:
    "El rol Cajero opera desde /panel/caja para emitir documentos demo y preparar cierres diarios.",
} as const;

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
  }).format(value);
}

type ManagerSellerRow = {
  activeLeads: number;
  contactedLeads: number;
  conversion: number;
  id: string;
  name: string;
  overdueActivities: number;
  pendingFollowUps: number;
  reservations: number;
  salesThisMonth: number;
  workload: "baja" | "normal" | "alta";
  workloadTone: "green" | "blue" | "red";
};

function buildManagerSellerRows({
  activities,
  leads,
  reservations,
  sales,
  session,
}: {
  activities: ActivityRecord[];
  leads: PublicLead[];
  reservations: ReservationRecord[];
  sales: SaleRecord[];
  session: DemoSession;
}): ManagerSellerRow[] {
  const sellers = getUsersByRole("Vendedor").filter(
    (seller) => seller.branchId === session.branchId,
  );

  return sellers.map((seller: InternalUser) => {
    const sellerLeads = leads.filter((lead) => lead.vendedorAsignado === seller.userName);
    const sellerActivities = activities.filter(
      (activity) => activity.vendedorId === seller.userId || activity.vendedorNombre === seller.userName,
    );
    const sellerReservations = reservations.filter(
      (reservation) => reservation.vendedorId === seller.userId || reservation.vendedorNombre === seller.userName,
    );
    const sellerSales = sales.filter(
      (sale) => sale.vendedorId === seller.userId || sale.vendedorNombre === seller.userName,
    );
    const activeLeads = sellerLeads.filter((lead) => lead.estado !== "Descartado" && lead.estado !== "Expediente").length;
    const contactedLeads = sellerLeads.filter((lead) => lead.estado === "Contactado" || lead.estado === "Interesado" || lead.estado === "Expediente").length;
    const pendingFollowUps = sellerActivities.filter((activity) => activity.estado === "Pendiente").length;
    const overdueActivities = sellerActivities.filter((activity) => isActivityOverdue(activity)).length;
    const salesThisMonth = sellerSales.filter((sale) => isCurrentMonth(sale.fechaVenta)).length;
    const conversion = sellerLeads.length ? Math.round((sellerSales.length / sellerLeads.length) * 100) : 0;
    const workloadScore = activeLeads + pendingFollowUps + sellerReservations.filter((reservation) => reservation.estado === "Activa").length;
    const workload = workloadScore >= 10 ? "alta" : workloadScore <= 3 ? "baja" : "normal";

    return {
      activeLeads,
      contactedLeads,
      conversion,
      id: seller.userId,
      name: seller.userName,
      overdueActivities,
      pendingFollowUps,
      reservations: sellerReservations.filter((reservation) => reservation.estado === "Activa").length,
      salesThisMonth,
      workload,
      workloadTone: workload === "alta" ? "red" : workload === "baja" ? "green" : "blue",
    };
  });
}

function recommendSeller(rows: ManagerSellerRow[]) {
  return [...rows].sort(
    (a, b) => a.activeLeads - b.activeLeads || b.conversion - a.conversion || a.pendingFollowUps - b.pendingFollowUps,
  )[0] ?? null;
}

function buildManagerDecisionItems({
  activeSales,
  branchAvailableInventory,
  overdueActivities,
  pendingTransfers,
  sellerRows,
  unassignedLeads,
  visibleReservations,
}: {
  activeSales: SaleRecord[];
  branchAvailableInventory: number;
  overdueActivities: number;
  pendingTransfers: number;
  sellerRows: ManagerSellerRow[];
  unassignedLeads: PublicLead[];
  visibleReservations: ReservationRecord[];
}) {
  const highWorkload = sellerRows.filter((seller) => seller.workload === "alta").length;
  const manualReservations = visibleReservations.filter(
    (reservation) => reservation.estado === "Activa" && !reservation.expedienteId,
  ).length;
  const lowInventory = branchAvailableInventory <= 3 ? 1 : 0;

  return [
    {
      count: unassignedLeads.length,
      description: "Leads de sucursal esperando vendedor responsable.",
      href: "/panel/leads",
      title: "Asignar leads",
      tone: "red" as const,
    },
    {
      count: highWorkload,
      description: "Vendedores con carga alta que pueden requerir redistribucion.",
      href: "/panel/vendedores",
      title: "Revisar vendedores con carga alta",
      tone: "yellow" as const,
    },
    {
      count: pendingTransfers,
      description: "Solicitudes de traslado pendientes de aprobacion o seguimiento.",
      href: "/panel/traslados",
      title: "Aprobar o revisar traslados",
      tone: "red" as const,
    },
    {
      count: manualReservations,
      description: "Reservas activas sin expediente asociado.",
      href: "/panel/reservas",
      title: "Revisar reservas con riesgo",
      tone: "yellow" as const,
    },
    {
      count: overdueActivities,
      description: "Seguimientos vencidos que afectan atencion comercial.",
      href: "/panel/actividades",
      title: "Revisar actividades vencidas",
      tone: "red" as const,
    },
    {
      count: lowInventory,
      description: "Disponibilidad baja para la sucursal; evaluar traslado u oferta alternativa.",
      href: "/panel/inventario",
      title: "Revisar inventario bajo",
      tone: "yellow" as const,
    },
    {
      count: activeSales.length,
      description: "Ventas completadas o en proceso pendientes de entrega.",
      href: "/panel/ventas",
      title: "Seguimiento a ventas pendientes",
      tone: "blue" as const,
    },
  ].filter((item) => item.count > 0);
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-2">
      <div className="truncate text-[11px] text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function isCurrentMonth(value: string) {
  const date = new Date(value);
  const now = new Date();
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function topModelRows(models: string[]) {
  const counts = new Map<string, number>();
  models.forEach((model) => counts.set(model, (counts.get(model) ?? 0) + 1));

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, value]) => ({ label, value }));
}

const sellerQuickActions = [
  { href: "/panel/leads", label: "Registrar lead", icon: UserCheck },
  { href: "/panel/actividades", label: "Registrar actividad", icon: ClipboardList },
  { href: "/panel/expedientes", label: "Crear expediente", icon: FolderKanban },
  { href: "/panel/expedientes", label: "Generar proforma", icon: FolderKanban },
  { href: "/panel/inventario", label: "Consultar inventario", icon: Bike },
  { href: "/panel/reservas", label: "Crear reserva", icon: CalendarCheck },
] as const;

function buildSellerWorkItems({
  activities,
  documents,
  files,
  leads,
  reservations,
  sales,
}: {
  activities: ActivityRecord[];
  documents: CustomerFileDocumentRecord[];
  files: CustomerFileRecord[];
  leads: PublicLead[];
  reservations: ReservationRecord[];
  sales: SaleRecord[];
}) {
  const items: {
    action: string;
    customer: string;
    href: string;
    motorcycle: string;
    title: string;
    tone: "red" | "yellow" | "blue" | "green" | "gray";
    urgency: string;
  }[] = [];

  leads
    .filter((lead) => lead.estado === NEW_LEAD_STATUS || lead.estado === "Asignado")
    .slice(0, 2)
    .forEach((lead) => {
      items.push({
        action: "Contactar y registrar primer seguimiento",
        customer: lead.nombre,
        href: "/panel/leads",
        motorcycle: lead.motoInteres,
        title: "Contactar lead nuevo",
        tone: "red",
        urgency: "Hoy",
      });
    });

  activities
    .filter((activity) => activity.estado === "Pendiente")
    .sort((a, b) => Date.parse(a.fechaProgramada ?? "") - Date.parse(b.fechaProgramada ?? ""))
    .slice(0, 3)
    .forEach((activity) => {
      items.push({
        action: activity.tipo === "Cita" ? "Confirmar cita y siguiente paso" : "Registrar resultado del seguimiento",
        customer: activity.titulo,
        href: "/panel/actividades",
        motorcycle: "Actividad comercial",
        title: isActivityOverdue(activity) ? "Dar seguimiento vencido" : "Dar seguimiento a interesado",
        tone: isActivityOverdue(activity) ? "red" : "yellow",
        urgency: isActivityOverdue(activity) ? "Vencido" : formatDashboardDate(activity.fechaProgramada),
      });
    });

  documents.slice(0, 2).forEach((document) => {
    items.push({
      action: "Revisar checklist y pedir documento pendiente",
      customer: document.expedienteId,
      href: "/panel/expedientes",
      motorcycle: document.tipo,
      title: "Revisar documentos pendientes",
      tone: "yellow",
      urgency: document.estado,
    });
  });

  files.slice(0, 2).forEach((file) => {
    items.push({
      action: "Actualizar expediente y proximo paso",
      customer: file.numeroExpediente,
      href: "/panel/expedientes",
      motorcycle: file.motoInteres,
      title: "Actualizar expediente",
      tone: "blue",
      urgency: file.estado,
    });
  });

  reservations
    .filter((reservation) => reservation.estado === "Activa")
    .slice(0, 2)
    .forEach((reservation) => {
      items.push({
        action: "Confirmar continuidad o preparar venta",
        customer: reservation.clienteNombre,
        href: "/panel/reservas",
        motorcycle: reservation.modelo,
        title: "Confirmar reserva",
        tone: "green",
        urgency: "Activa",
      });
    });

  sales
    .filter((sale) => sale.estado !== "Entregada")
    .slice(0, 2)
    .forEach((sale) => {
      items.push({
        action: "Dar seguimiento hasta entrega",
        customer: sale.clienteNombre,
        href: "/panel/ventas",
        motorcycle: sale.modelo,
        title: "Dar seguimiento a venta",
        tone: "blue",
        urgency: sale.estado,
      });
    });

  return items.slice(0, 8);
}

function formatDashboardDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
  }).format(date);
}
