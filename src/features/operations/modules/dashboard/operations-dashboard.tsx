"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bike,
  Building2,
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
import {
  desiredBranches,
  NEW_LEAD_STATUS,
  type DesiredBranchId,
  type PublicLead,
} from "@/data/operations/leads";
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
import { cn } from "@/lib/utils";

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
  const overdueActivities = visibleActivities.filter((activity) =>
    isActivityOverdue(activity),
  ).length;
  const documentProgress = getScopedDocumentProgress(visibleFiles, visibleDocuments);

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

  if (session.role !== "Administrador") {
    return (
      <section className="space-y-6">
        <div>
          <Badge tone="red">{session.role}</Badge>
          <h2 className="mt-4 text-3xl font-black text-white">
            {dashboardTitle[session.role]}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            {dashboardCopy[session.role]}
          </p>
        </div>
      </section>
    );
  }

  const totalBranches = desiredBranches.length;
  const activeLeads = visibleLeads.filter(
    (lead) => lead.estado !== "Descartado" && lead.estado !== "Expediente",
  ).length;
  const unassignedLeadsCount = visibleLeads.filter((lead) => !lead.vendedorAsignado).length;
  const monthlySales = visibleSales.filter((sale) => isCurrentMonth(sale.fechaVenta)).length;
  const pendingDeliveries = visibleSales.filter((sale) => sale.estado !== "Entregada").length;
  const reservationsWithoutFile = visibleReservations.filter(
    (reservation) => reservation.estado === "Activa" && !reservation.expedienteId,
  ).length;

  const branchRows = buildAdminBranchRows({
    activities: visibleActivities,
    leads: visibleLeads,
    reservations: visibleReservations,
    sales: visibleSales,
    transfers: visibleTransfers,
    units: visibleInventoryUnits,
  });
  const sellerRows = buildAdminSellerRows({
    activities: visibleActivities,
    leads: visibleLeads,
    reservations: visibleReservations,
    sales: visibleSales,
  });
  const topSellers = [...sellerRows]
    .sort((a, b) => b.conversion - a.conversion || b.salesThisMonth - a.salesThisMonth)
    .slice(0, 3);
  const attentionSellers = sellerRows
    .filter((seller) => seller.overdueActivities > 0 || seller.workload === "alta")
    .sort((a, b) => b.overdueActivities - a.overdueActivities)
    .slice(0, 4);
  const lowStockBranches = branchRows.filter((branch) => branch.availableInventory <= 3).length;
  const branchesWithOverdue = branchRows.filter((branch) => branch.overdueActivities > 0).length;
  const highWorkloadSellers = sellerRows.filter((seller) => seller.workload === "alta").length;

  const decisionQueue = buildAdminDecisionQueue({
    branchesWithOverdue,
    highWorkloadSellers,
    lowStockBranches,
    pendingDeliveries,
    pendingTransfers,
    reservationsWithoutFile,
    unassignedLeads: unassignedLeadsCount,
  });

  const alertTiles = [
    { label: "Sucursales con stock bajo", value: lowStockBranches },
    { label: "Traslados pendientes", value: pendingTransfers },
    { label: "Leads sin asignar", value: unassignedLeadsCount },
    { label: "Seguimientos vencidos", value: overdueActivities },
    { label: "Reservas sin expediente", value: reservationsWithoutFile },
    { label: "Ventas por entregar", value: pendingDeliveries },
  ];

  const recentActivity = buildAdminRecentActivity({
    reservations: visibleReservations,
    sales: visibleSales,
    transfers: visibleTransfers,
  });

  const summaryTiles = [
    { icon: Building2, label: "Sucursales", value: totalBranches },
    { icon: ClipboardList, label: "Leads activos", value: activeLeads },
    { icon: UserCheck, label: "Leads sin asignar", value: unassignedLeadsCount },
    { icon: Users, label: "Clientes", value: visibleCustomers.length },
    { icon: FolderKanban, label: "Expedientes activos", value: visibleFiles.length },
    { icon: CalendarCheck, label: "Reservas activas", value: activeReservations },
    { icon: Store, label: "Ventas del mes", value: monthlySales },
    { icon: Bike, label: "Inventario disponible", value: visibleAvailableInventory },
    { icon: Truck, label: "Traslados pendientes", value: pendingTransfers },
    { icon: PackageSearch, label: "Entregas pendientes", value: pendingDeliveries },
  ];

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="red">Administrador</Badge>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300">
              <Globe2 className="h-3.5 w-3.5" />
              Vista global
            </span>
          </div>
          <h2 className="mt-4 text-3xl font-black text-white">Supervisión global</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
            Control general de sucursales, operación comercial, inventario,
            vendedores y alertas del sistema.
          </p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
          href="/panel/reportes"
        >
          Ver reportes globales
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* 1. Global company summary */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryTiles.map((tile) => (
          <MetricCard icon={tile.icon} key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </div>

      {/* 2. Global decision queue + 5. Operational alerts */}
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-white">Cola global de decisiones</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Prioridades de supervisión con acceso directo al módulo relacionado.
              </p>
            </div>
            <Badge tone={decisionQueue.length ? "red" : "green"}>
              {decisionQueue.length ? `${decisionQueue.length} pendientes` : "Sin alertas"}
            </Badge>
          </div>
          <div className="mt-5 grid gap-3">
            {decisionQueue.length ? decisionQueue.map((item) => (
              <Link
                className="rounded-xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-red-500/30 hover:bg-red-500/8"
                href={item.href}
                key={item.title}
              >
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
                No hay decisiones críticas pendientes a nivel global.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <h3 className="text-xl font-black text-white">Alertas operativas</h3>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {alertTiles.map((alert) => (
              <div
                className={cn(
                  "rounded-xl border p-4",
                  alert.value > 0
                    ? "border-red-500/25 bg-red-500/8"
                    : "border-white/10 bg-white/[0.045]",
                )}
                key={alert.label}
              >
                <div className="text-xs leading-4 text-zinc-500">{alert.label}</div>
                <div
                  className={cn(
                    "mt-2 text-2xl font-black",
                    alert.value > 0 ? "text-red-200" : "text-white",
                  )}
                >
                  {alert.value}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 3. Branch performance */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/10 p-6">
          <Building2 className="h-5 w-5 text-red-400" />
          <div>
            <h3 className="text-xl font-black text-white">Desempeño por sucursal</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Comparativo global de leads, reservas, ventas, inventario y alertas.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Sucursal</th>
                <th className="px-5 py-3 text-right">Leads</th>
                <th className="px-5 py-3 text-right">Reservas</th>
                <th className="px-5 py-3 text-right">Ventas mes</th>
                <th className="px-5 py-3 text-right">Disponibles</th>
                <th className="px-5 py-3 text-right">Traslados</th>
                <th className="px-5 py-3 text-right">Vencidas</th>
                <th className="px-5 py-3 text-right">Conversión</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {branchRows.map((branch) => (
                <tr className="hover:bg-white/[0.02]" key={branch.id}>
                  <td className="px-5 py-4 font-bold text-white">{branch.name}</td>
                  <td className="px-5 py-4 text-right text-zinc-300">{branch.leads}</td>
                  <td className="px-5 py-4 text-right text-zinc-300">{branch.activeReservations}</td>
                  <td className="px-5 py-4 text-right text-zinc-300">{branch.monthlySales}</td>
                  <td
                    className={cn(
                      "px-5 py-4 text-right",
                      branch.availableInventory <= 3 ? "text-amber-300" : "text-zinc-300",
                    )}
                  >
                    {branch.availableInventory}
                  </td>
                  <td className="px-5 py-4 text-right text-zinc-300">{branch.pendingTransfers}</td>
                  <td
                    className={cn(
                      "px-5 py-4 text-right",
                      branch.overdueActivities > 0 ? "text-red-300" : "text-zinc-300",
                    )}
                  >
                    {branch.overdueActivities}
                  </td>
                  <td className="px-5 py-4 text-right font-bold text-white">{branch.conversion}%</td>
                  <td className="px-5 py-4">
                    <Badge tone={branch.tone}>{branchStatusLabel(branch.tone)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Seller and branch supervision */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-red-400" />
            <h3 className="text-xl font-black text-white">Vendedores destacados</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {topSellers.length ? topSellers.map((seller) => (
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4" key={seller.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-white">{seller.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">{seller.branchName}</div>
                  </div>
                  <Badge tone="green">{seller.conversion}% conv.</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniMetric label="Ventas mes" value={seller.salesThisMonth} />
                  <MiniMetric label="Leads" value={seller.activeLeads} />
                  <MiniMetric label="Reservas" value={seller.reservations} />
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5 text-sm text-zinc-500">
                Aún no hay datos suficientes para destacar vendedores.
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-red-400" />
            <h3 className="text-xl font-black text-white">Vendedores que requieren atención</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {attentionSellers.length ? attentionSellers.map((seller) => (
              <Link
                className="rounded-xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-red-500/30 hover:bg-red-500/8"
                href="/panel/vendedores"
                key={seller.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-white">{seller.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">{seller.branchName}</div>
                  </div>
                  <Badge tone={seller.workloadTone}>Carga {seller.workload}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <MiniMetric label="Vencidas" value={seller.overdueActivities} />
                  <MiniMetric label="Seguim." value={seller.pendingFollowUps} />
                  <MiniMetric label="Leads" value={seller.activeLeads} />
                </div>
              </Link>
            )) : (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-5 text-sm text-emerald-100">
                Ningún vendedor tiene carga alta o seguimientos vencidos.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 6. Recent activity */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-red-400" />
          <h3 className="text-xl font-black text-white">Actividad reciente</h3>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recentActivity.length ? recentActivity.map((item) => (
            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4" key={item.id}>
              <div className="flex items-center gap-3">
                <item.icon className="h-4 w-4 text-red-300" />
                <div className="text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
                  {item.label}
                </div>
              </div>
              <div className="mt-3 text-sm font-black text-white">{item.title}</div>
              <div className="mt-1 text-xs text-zinc-500">{item.meta}</div>
            </div>
          )) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5 text-sm text-zinc-500">
              Aún no hay actividad operativa reciente para supervisar.
            </div>
          )}
        </div>
      </Card>
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

type AdminBranchRow = {
  id: DesiredBranchId;
  name: string;
  leads: number;
  activeReservations: number;
  monthlySales: number;
  availableInventory: number;
  pendingTransfers: number;
  overdueActivities: number;
  conversion: number;
  tone: "green" | "yellow" | "red";
};

function buildAdminBranchRows({
  activities,
  leads,
  reservations,
  sales,
  transfers,
  units,
}: {
  activities: ActivityRecord[];
  leads: PublicLead[];
  reservations: ReservationRecord[];
  sales: SaleRecord[];
  transfers: TransferOrder[];
  units: InventoryUnit[];
}): AdminBranchRow[] {
  return desiredBranches
    .map((branch) => {
      const branchLeads = leads.filter((lead) => lead.sucursalDeseada === branch.id);
      const branchSales = sales.filter((sale) => sale.sucursalId === branch.id);
      const availableInventory = units.filter(
        (unit) => unit.sucursalActualId === branch.id && unit.estado === "Disponible",
      ).length;
      const pendingTransfers = transfers.filter(
        (transfer) =>
          (transfer.sucursalDestinoId === branch.id ||
            transfer.sucursalOrigenId === branch.id) &&
          transfer.estado === "Pendiente",
      ).length;
      const overdueActivities = activities.filter(
        (activity) => activity.sucursalId === branch.id && isActivityOverdue(activity),
      ).length;
      const activeReservations = reservations.filter(
        (reservation) =>
          reservation.sucursalId === branch.id && reservation.estado === "Activa",
      ).length;
      const monthlySales = branchSales.filter((sale) => isCurrentMonth(sale.fechaVenta)).length;
      const conversion = branchLeads.length
        ? Math.round((branchSales.length / branchLeads.length) * 100)
        : 0;
      const tone: AdminBranchRow["tone"] =
        availableInventory === 0 || overdueActivities >= 3
          ? "red"
          : overdueActivities > 0 || availableInventory <= 3 || pendingTransfers > 0
            ? "yellow"
            : "green";

      return {
        id: branch.id,
        name: branch.name,
        leads: branchLeads.length,
        activeReservations,
        monthlySales,
        availableInventory,
        pendingTransfers,
        overdueActivities,
        conversion,
        tone,
      };
    })
    .sort((a, b) => b.monthlySales - a.monthlySales || b.leads - a.leads);
}

function branchStatusLabel(tone: AdminBranchRow["tone"]) {
  return tone === "red" ? "Crítico" : tone === "yellow" ? "Atención" : "En control";
}

type AdminSellerRow = {
  id: string;
  name: string;
  branchName: string;
  activeLeads: number;
  overdueActivities: number;
  pendingFollowUps: number;
  reservations: number;
  salesThisMonth: number;
  conversion: number;
  workload: "baja" | "normal" | "alta";
  workloadTone: "green" | "blue" | "red";
};

function buildAdminSellerRows({
  activities,
  leads,
  reservations,
  sales,
}: {
  activities: ActivityRecord[];
  leads: PublicLead[];
  reservations: ReservationRecord[];
  sales: SaleRecord[];
}): AdminSellerRow[] {
  const sellers = getUsersByRole("Vendedor");

  return sellers.map((seller: InternalUser) => {
    const sellerLeads = leads.filter((lead) => lead.vendedorAsignado === seller.userName);
    const sellerActivities = activities.filter(
      (activity) =>
        activity.vendedorId === seller.userId || activity.vendedorNombre === seller.userName,
    );
    const sellerReservations = reservations.filter(
      (reservation) =>
        reservation.vendedorId === seller.userId ||
        reservation.vendedorNombre === seller.userName,
    );
    const sellerSales = sales.filter(
      (sale) => sale.vendedorId === seller.userId || sale.vendedorNombre === seller.userName,
    );
    const activeLeads = sellerLeads.filter(
      (lead) => lead.estado !== "Descartado" && lead.estado !== "Expediente",
    ).length;
    const pendingFollowUps = sellerActivities.filter(
      (activity) => activity.estado === "Pendiente",
    ).length;
    const overdueActivities = sellerActivities.filter((activity) =>
      isActivityOverdue(activity),
    ).length;
    const activeReservations = sellerReservations.filter(
      (reservation) => reservation.estado === "Activa",
    ).length;
    const salesThisMonth = sellerSales.filter((sale) => isCurrentMonth(sale.fechaVenta)).length;
    const conversion = sellerLeads.length
      ? Math.round((sellerSales.length / sellerLeads.length) * 100)
      : 0;
    const workloadScore = activeLeads + pendingFollowUps + activeReservations;
    const workload = workloadScore >= 10 ? "alta" : workloadScore <= 3 ? "baja" : "normal";

    return {
      id: seller.userId,
      name: seller.userName,
      branchName: seller.branchName,
      activeLeads,
      overdueActivities,
      pendingFollowUps,
      reservations: activeReservations,
      salesThisMonth,
      conversion,
      workload,
      workloadTone: workload === "alta" ? "red" : workload === "baja" ? "green" : "blue",
    };
  });
}

function buildAdminDecisionQueue({
  branchesWithOverdue,
  highWorkloadSellers,
  lowStockBranches,
  pendingDeliveries,
  pendingTransfers,
  reservationsWithoutFile,
  unassignedLeads,
}: {
  branchesWithOverdue: number;
  highWorkloadSellers: number;
  lowStockBranches: number;
  pendingDeliveries: number;
  pendingTransfers: number;
  reservationsWithoutFile: number;
  unassignedLeads: number;
}) {
  return [
    {
      count: unassignedLeads,
      description: "Leads sin vendedor responsable en las sucursales.",
      href: "/panel/leads",
      title: "Asignar leads sin responsable",
      tone: "red" as const,
    },
    {
      count: pendingTransfers,
      description: "Solicitudes de traslado pendientes de aprobación o recepción.",
      href: "/panel/traslados",
      title: "Aprobar o recibir traslados",
      tone: "red" as const,
    },
    {
      count: branchesWithOverdue,
      description: "Sucursales con seguimientos comerciales vencidos.",
      href: "/panel/actividades",
      title: "Sucursales con actividades vencidas",
      tone: "yellow" as const,
    },
    {
      count: highWorkloadSellers,
      description: "Vendedores con carga alta que pueden requerir redistribución.",
      href: "/panel/vendedores",
      title: "Revisar vendedores con carga alta",
      tone: "yellow" as const,
    },
    {
      count: reservationsWithoutFile,
      description: "Reservas activas sin expediente asociado.",
      href: "/panel/reservas",
      title: "Reservas con riesgo",
      tone: "yellow" as const,
    },
    {
      count: lowStockBranches,
      description: "Sucursales con disponibilidad baja; evaluar traslados.",
      href: "/panel/inventario",
      title: "Sucursales con inventario bajo",
      tone: "yellow" as const,
    },
    {
      count: pendingDeliveries,
      description: "Ventas completadas pendientes de entrega.",
      href: "/panel/ventas",
      title: "Ventas por entregar",
      tone: "blue" as const,
    },
  ].filter((item) => item.count > 0);
}

type AdminActivityItem = {
  id: string;
  icon: LucideIcon;
  label: string;
  title: string;
  meta: string;
  date: string;
};

function buildAdminRecentActivity({
  reservations,
  sales,
  transfers,
}: {
  reservations: ReservationRecord[];
  sales: SaleRecord[];
  transfers: TransferOrder[];
}): AdminActivityItem[] {
  const items: AdminActivityItem[] = [
    ...sales.map((sale) => ({
      id: `sale-${sale.id}`,
      icon: sale.estado === "Entregada" ? PackageSearch : Store,
      label: sale.estado === "Entregada" ? "Entrega" : "Venta",
      title: sale.numeroVenta,
      meta: `${sale.estado} / ${sale.sucursalNombre}`,
      date: sale.fechaEntrega ?? sale.fechaVenta,
    })),
    ...reservations.map((reservation) => ({
      id: `res-${reservation.id}`,
      icon: CalendarCheck,
      label: "Reserva",
      title: reservation.numeroReserva,
      meta: `${reservation.estado} / ${reservation.sucursalNombre}`,
      date: reservation.fechaReserva,
    })),
    ...transfers.map((transfer) => ({
      id: `tr-${transfer.id}`,
      icon: Truck,
      label: "Traslado",
      title: transfer.numeroTraslado,
      meta: `${transfer.estado} / ${transfer.sucursalDestinoNombre}`,
      date: transfer.fechaAprobacion ?? transfer.fechaSolicitud,
    })),
  ];

  return items
    .filter((item) => Boolean(item.date))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, 6);
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
