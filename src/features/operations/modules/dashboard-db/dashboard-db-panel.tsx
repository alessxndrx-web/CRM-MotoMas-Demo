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
  Store,
  Trophy,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type {
  BranchPerformanceDTO,
  DashboardAlertDTO,
  DashboardRecentActivityDTO,
  DashboardRoleContextDTO,
  DashboardSummaryDTO,
  LeadFunnelDTO,
  SellerPerformanceDTO,
} from "@/server/analytics/shared";
import { cn } from "@/lib/utils";

/**
 * Server-fed operations Dashboard (Patch 3.7C.2). This renders the same
 * role-aware KPI layout the legacy dashboard shows, but every number is a
 * DB-backed, already-scoped analytics DTO — no localStorage is read here. The
 * legacy client dashboard remains available behind the 3.7B legacy gate for
 * DB-unavailable fallback / explicit technical recovery.
 */

export type DashboardDbPanelProps = {
  roleContext: DashboardRoleContextDTO;
  summary: DashboardSummaryDTO;
  alerts: DashboardAlertDTO[];
  recentActivity: DashboardRecentActivityDTO[];
  branchPerformance: BranchPerformanceDTO[];
  sellerPerformance: SellerPerformanceDTO[];
  branchName: string;
};

const dashboardCta =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700";

function leadCount(funnel: LeadFunnelDTO, status: string): number {
  return funnel.byStatus.find((stage) => stage.status === status)?.count ?? 0;
}

export function DashboardDbPanel(props: DashboardDbPanelProps) {
  const { roleContext } = props;

  if (roleContext.role === "VENDEDOR") return <SellerDashboard {...props} />;
  if (roleContext.role === "GERENTE") return <ManagerDashboard {...props} />;
  if (roleContext.role === "ADMIN") return <AdminDashboard {...props} />;
  return <NonCommercialDashboard {...props} />;
}

// --- Seller --------------------------------------------------------------

function SellerDashboard({
  summary,
  alerts,
  recentActivity,
  branchName,
}: DashboardDbPanelProps) {
  const tiles = [
    {
      icon: UserCheck,
      label: "Leads nuevos asignados",
      value:
        leadCount(summary.leads, "NUEVO_LEAD") +
        leadCount(summary.leads, "ASIGNADO"),
    },
    {
      icon: ClipboardList,
      label: "Seguimientos vencidos",
      value: summary.activities.vencidas,
    },
    {
      icon: CalendarCheck,
      label: "Actividades próximas",
      value: summary.activities.proximas,
    },
    {
      icon: FolderKanban,
      label: "Expedientes activos",
      value: summary.expedientes.abiertos + summary.expedientes.enProceso,
    },
    {
      icon: CalendarCheck,
      label: "Reservas activas",
      value: summary.reservationSales.reservationsActive,
    },
    {
      icon: Store,
      label: "Ventas registradas",
      value: summary.reservationSales.salesTotal,
    },
    {
      icon: Bike,
      label: "Motos disponibles",
      value: summary.inventory.available,
    },
    {
      icon: Users,
      label: "Clientes",
      value: summary.customers,
    },
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link className={dashboardCta} href="/panel/leads">
            Registrar o contactar lead
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
        description="Prioriza contactos, seguimientos, expedientes, reservas y ventas propias. Inventario queda como consulta para ofrecer disponibilidad."
        eyebrow={`Vendedor · ${branchName}`}
        title="Mi trabajo de hoy"
      />
      <SectionTitle subtitle="Estado actual de tu cartera asignada." title="Mi operación" />
      <MetricGrid tiles={tiles} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <RecentActivityCard items={recentActivity} />
        <AlertsCard alerts={alerts} />
      </div>
    </section>
  );
}

// --- Manager -------------------------------------------------------------

function ManagerDashboard({
  summary,
  alerts,
  recentActivity,
  sellerPerformance,
  branchName,
}: DashboardDbPanelProps) {
  const tiles = [
    { icon: UserCheck, label: "Leads nuevos", value: leadCount(summary.leads, "NUEVO_LEAD") },
    { icon: Users, label: "Leads totales", value: summary.leads.total },
    { icon: ClipboardList, label: "Actividades vencidas", value: summary.activities.vencidas },
    { icon: CalendarCheck, label: "Reservas activas", value: summary.reservationSales.reservationsActive },
    { icon: Store, label: "Ventas registradas", value: summary.reservationSales.salesTotal },
    { icon: Bike, label: "Unidades disponibles", value: summary.inventory.available },
    { icon: FolderKanban, label: "Expedientes activos", value: summary.expedientes.abiertos + summary.expedientes.enProceso },
    { icon: CheckCircle2, label: "Créditos en revisión", value: summary.credits.enRevision },
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link className={dashboardCta} href="/panel/leads">
            Revisar asignaciones
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
        description="Supervisa leads, vendedores, inventario, reservas, ventas y traslados de tu sucursal."
        eyebrow={`Gerente · ${branchName}`}
        title="Operación de sucursal"
      />
      <SectionTitle subtitle="Estado actual de la sucursal." title="Rendimiento de sucursal" />
      <MetricGrid tiles={tiles} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <SellerPerformanceCard sellers={sellerPerformance} />
        <AlertsCard alerts={alerts} />
      </div>
      <RecentActivityCard items={recentActivity} />
    </section>
  );
}

// --- Admin ---------------------------------------------------------------

function AdminDashboard({
  summary,
  alerts,
  recentActivity,
  branchPerformance,
  sellerPerformance,
}: DashboardDbPanelProps) {
  const topSellers = sellerPerformance.slice(0, 3);
  const summaryTiles = [
    { icon: Building2, label: "Sucursales", value: branchPerformance.length },
    { icon: ClipboardList, label: "Leads totales", value: summary.leads.total },
    { icon: FolderKanban, label: "Conversión lead", value: `${Math.round(summary.leads.conversionRate * 100)}%` },
    { icon: Users, label: "Clientes", value: summary.customers },
    { icon: FolderKanban, label: "Expedientes activos", value: summary.expedientes.abiertos + summary.expedientes.enProceso },
    { icon: CalendarCheck, label: "Reservas activas", value: summary.reservationSales.reservationsActive },
    { icon: Store, label: "Ventas registradas", value: summary.reservationSales.salesTotal },
    { icon: Bike, label: "Inventario disponible", value: summary.inventory.available },
    { icon: CheckCircle2, label: "Créditos en revisión", value: summary.credits.enRevision },
    { icon: Store, label: "Ventas entregadas", value: summary.reservationSales.salesDelivered },
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
              <Globe2 className="h-3.5 w-3.5" />
              Vista global
            </span>
            <Link className={dashboardCta} href="/panel/reportes">
              Ver reportes globales
              <ArrowRight className="h-4 w-4" />
            </Link>
          </>
        }
        description="Control general de sucursales, operación comercial, inventario, vendedores y alertas del sistema."
        eyebrow="Administrador"
        title="Supervisión global"
      />

      <SectionTitle subtitle="Estado consolidado de todas las sucursales." title="Panel general" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryTiles.map((tile) => (
          <MetricCard icon={tile.icon} key={tile.label} label={tile.label} value={tile.value} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <BranchPerformanceCard branches={branchPerformance} />
        <AlertsCard alerts={alerts} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-slate-900">Vendedores destacados</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {topSellers.length ? (
              topSellers.map((seller) => (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={seller.sellerId}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{seller.sellerName}</div>
                      <div className="mt-1 text-xs text-slate-500">{seller.branchName}</div>
                    </div>
                    <Badge tone="green">{seller.salesCompleted} ventas</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <MiniMetric label="Leads" value={seller.leads} />
                    <MiniMetric label="Reservas" value={seller.reservationsActive} />
                    <MiniMetric label="Expedientes" value={seller.expedientes} />
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>Aún no hay datos suficientes para destacar vendedores.</EmptyState>
            )}
          </div>
        </Card>
        <RecentActivityCard items={recentActivity} />
      </div>
    </section>
  );
}

// --- Cashier / Accountant (no commercial dashboard) ----------------------

const nonCommercialCopy: Record<string, { title: string; description: string }> = {
  CAJERO: {
    title: "Área de caja",
    description:
      "El Cajero trabaja desde el área de caja para emitir documentos y preparar los cierres diarios.",
  },
  CONTADOR: {
    title: "Área contable",
    description:
      "El Contador trabaja desde el área contable y no participa en el flujo comercial.",
  },
};

function NonCommercialDashboard({ roleContext, branchName }: DashboardDbPanelProps) {
  const copy = nonCommercialCopy[roleContext.role] ?? {
    title: "Panel",
    description: "Este rol no participa en el flujo comercial.",
  };
  return (
    <section className="space-y-6">
      <PageHeader
        actions={<Badge tone="slate">{branchName}</Badge>}
        description={copy.description}
        eyebrow={roleContext.roleLabel}
        title={copy.title}
      />
    </section>
  );
}

// --- Shared presentational helpers ---------------------------------------

function SectionTitle({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <div className="-mb-2 flex items-center gap-2.5">
      <span aria-hidden className="h-7 w-1 rounded-full bg-orange-500" />
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

type Tile = { icon: LucideIcon; label: string; value: number | string };

function MetricGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <MetricCard icon={tile.icon} key={tile.label} label={tile.label} value={tile.value} />
      ))}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: Tile) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="truncate text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
      {children}
    </div>
  );
}

function AlertsCard({ alerts }: { alerts: DashboardAlertDTO[] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-red-600" />
        <h3 className="text-lg font-semibold text-slate-900">Alertas operativas</h3>
      </div>
      <div className="mt-5 grid gap-3">
        {alerts.length ? (
          alerts.map((alert) => {
            const content = (
              <div
                className={cn(
                  "flex items-start justify-between gap-4 rounded-xl border p-4",
                  alert.severity === "warning"
                    ? "border-red-200 bg-red-50"
                    : "border-slate-200 bg-slate-50",
                )}
              >
                <div className="text-sm font-semibold text-slate-900">{alert.title}</div>
                <Badge tone={alert.severity === "warning" ? "red" : "blue"}>{alert.count}</Badge>
              </div>
            );
            return alert.href ? (
              <Link href={alert.href} key={alert.id}>
                {content}
              </Link>
            ) : (
              <div key={alert.id}>{content}</div>
            );
          })
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700">
            No hay alertas críticas pendientes.
          </div>
        )}
      </div>
    </Card>
  );
}

function RecentActivityCard({ items }: { items: DashboardRecentActivityDTO[] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-red-600" />
        <h3 className="text-lg font-semibold text-slate-900">Actividad reciente</h3>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {items.length ? (
          items.map((item) => (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={item.id}>
              <div className="flex items-center gap-3">
                <ClipboardList className="h-4 w-4 text-red-700" />
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {item.typeLabel}
                </div>
              </div>
              <div className="mt-3 text-sm font-semibold text-slate-900">
                {item.description ?? item.customerName ?? item.fileNumber ?? "Actividad"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {item.statusLabel} · {formatDate(item.createdAt)}
              </div>
            </div>
          ))
        ) : (
          <EmptyState>Aún no hay actividad operativa reciente para mostrar.</EmptyState>
        )}
      </div>
    </Card>
  );
}

function SellerPerformanceCard({ sellers }: { sellers: SellerPerformanceDTO[] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-3">
        <Users className="h-5 w-5 text-red-600" />
        <h3 className="text-lg font-semibold text-slate-900">Carga y rendimiento de vendedores</h3>
      </div>
      <div className="mt-5 grid gap-3">
        {sellers.length ? (
          sellers.map((seller) => (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={seller.sellerId}>
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-slate-900">{seller.sellerName}</div>
                <Badge tone={seller.activitiesOverdue > 0 ? "red" : "green"}>
                  {seller.salesCompleted} ventas
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniMetric label="Leads" value={seller.leads} />
                <MiniMetric label="Pendientes" value={seller.activitiesPending} />
                <MiniMetric label="Vencidas" value={seller.activitiesOverdue} />
                <MiniMetric label="Reservas" value={seller.reservationsActive} />
                <MiniMetric label="Expedientes" value={seller.expedientes} />
                <MiniMetric label="Créditos" value={seller.creditsInReview} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState>Aún no hay vendedores con actividad en este alcance.</EmptyState>
        )}
      </div>
    </Card>
  );
}

function BranchPerformanceCard({ branches }: { branches: BranchPerformanceDTO[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-slate-200 p-6">
        <Building2 className="h-5 w-5 text-red-600" />
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Desempeño por sucursal</h3>
          <p className="mt-1 text-sm text-slate-500">
            Comparativo global de leads, expedientes, reservas y ventas.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">Sucursal</th>
              <th className="px-5 py-3 text-right">Leads</th>
              <th className="px-5 py-3 text-right">Expedientes</th>
              <th className="px-5 py-3 text-right">Reservas</th>
              <th className="px-5 py-3 text-right">Ventas</th>
              <th className="px-5 py-3 text-right">Entregas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {branches.length ? (
              branches.map((branch) => (
                <tr className="hover:bg-slate-100" key={branch.branchCode}>
                  <td className="px-5 py-4 font-bold text-slate-900">{branch.branchName}</td>
                  <td className="px-5 py-4 text-right text-slate-600">{branch.leads}</td>
                  <td className="px-5 py-4 text-right text-slate-600">{branch.expedientes}</td>
                  <td className="px-5 py-4 text-right text-slate-600">{branch.reservationsActive}</td>
                  <td className="px-5 py-4 text-right font-bold text-slate-900">{branch.salesCompleted}</td>
                  <td className="px-5 py-4 text-right text-slate-600">{branch.salesDelivered}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-6 text-sm text-slate-500" colSpan={6}>
                  Aún no hay datos por sucursal para comparar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short" }).format(date);
}
