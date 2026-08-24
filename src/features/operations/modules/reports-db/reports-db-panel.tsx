import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import type { ReportSummaryDTO } from "@/server/analytics/shared";

/**
 * Server-fed Reportes panel (Patch 3.7C.2). Every chart is built from the
 * already-scoped {@link ReportSummaryDTO} — DB aggregates, no localStorage.
 * Marketing figures come from the DB marketing aggregate (read-only; no
 * campaign CRUD is wired here). Money shown is commercial (quoted / requested
 * amounts), never an inventory cost. The legacy client Reportes panel stays
 * available behind the 3.7B legacy gate.
 */

export type ReportsDbPanelProps = {
  report: ReportSummaryDTO;
  scopeIsGlobal: boolean;
  branchName: string;
  canViewMarketing: boolean;
};

export function ReportsDbPanel({
  report,
  scopeIsGlobal,
  branchName,
  canViewMarketing,
}: ReportsDbPanelProps) {
  const { lead, inventory, reservationSales, activity, credits, quotesDocuments } =
    report;

  const reservationsData: [string, number][] = [
    ["Activas", reservationSales.reservationsActive],
    ["Completadas", reservationSales.reservationsCompleted],
    ["Canceladas", reservationSales.reservationsCancelled],
  ];
  const inventoryData: [string, number][] = [
    ["Disponible", inventory.available],
    ["Reservada", inventory.reserved],
    ["En tránsito", inventory.inTransfer],
    ["Vendida", inventory.sold],
    ["Entregada", inventory.delivered],
  ];

  const funnel: readonly [string, number][] = [
    ["Solicitudes", lead.total],
    ["Expedientes", lead.converted],
    ["Reservas", reservationSales.reservationsActive + reservationSales.reservationsCompleted],
    ["Ventas", reservationSales.salesTotal],
    ["Entregas", reservationSales.salesDelivered],
  ];

  return (
    <section className="space-y-6">
      <PageHeader
        description={
          scopeIsGlobal
            ? "Vista global por sucursal, vendedor y canal, calculada desde la operación registrada."
            : `Datos de ${branchName} calculados desde la operación registrada.`
        }
        eyebrow="Reportes comerciales"
        title="Seguimiento y conversión"
      />

      <GroupTitle subtitle="Origen, campaña, estado y responsables." title="Captación de leads" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Chart title="Leads por canal" data={lead.bySource.map((row) => [row.source, row.count])} />
        <Chart title="Leads por campaña" data={lead.byCampaign.map((row) => [row.campaignName, row.count])} />
        <Chart title="Leads por estado" data={lead.byStatus.map((row) => [row.label, row.count])} />
        {report.sellers.length ? (
          <Chart title="Leads por vendedor" data={report.sellers.map((s) => [s.sellerName, s.leads])} />
        ) : (
          <Chart title="Leads por sucursal" data={report.branches.map((b) => [b.branchName, b.leads])} />
        )}
      </div>

      <GroupTitle subtitle="Ventas, reservas e inventario por estado." title="Ventas e inventario" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {report.branches.length ? (
          <Chart title="Ventas por sucursal" data={report.branches.map((b) => [b.branchName, b.salesCompleted])} />
        ) : null}
        <Chart title="Ventas por vendedor" data={report.sellers.map((s) => [s.sellerName, s.salesCompleted])} />
        <Chart title="Reservas por estado" data={reservationsData} />
        <Chart title="Inventario por estado" data={inventoryData} />
      </div>

      <GroupTitle subtitle="Resumen y carga por vendedor." title="Actividad comercial" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Resumen de actividades"
          metrics={[
            ["Pendientes", activity.pendientes],
            ["Vencidas", activity.vencidas],
            ["Próximas", activity.proximas],
            ["Completadas", activity.completadas],
          ]}
        />
        <Chart title="Pendientes por vendedor" data={report.sellers.map((s) => [s.sellerName, s.activitiesPending])} />
        <Chart title="Vencidas por vendedor" data={report.sellers.map((s) => [s.sellerName, s.activitiesOverdue])} />
        <SummaryCard
          title="Conversión de leads"
          metrics={[
            ["Convertidos", lead.converted],
            ["Descartados", lead.discarded],
            ["Sin campaña", lead.organic],
            ["Tasa %", Math.round(lead.conversionRate * 100)],
          ]}
        />
      </div>

      <GroupTitle subtitle="Proformas, créditos y documentación." title="Expediente comercial" />
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Resumen de proformas"
          metrics={[
            ["Emitidas", quotesDocuments.quotesEmitidas],
            ["Aceptadas", quotesDocuments.quotesAceptadas],
            ["Vencidas", quotesDocuments.quotesVencidas],
            ["Monto referencial", formatAmount(quotesDocuments.quotesMontoReferencial)],
          ]}
        />
        <SummaryCard
          title="Resumen de créditos"
          metrics={[
            ["En revisión", credits.enRevision],
            ["Doc. pendiente", credits.documentacionPendiente],
            ["Aprobados", credits.aprobados],
            ["Rechazados", credits.rechazados],
            ["Monto solicitado", formatAmount(credits.montoSolicitado)],
          ]}
        />
        <SummaryCard
          title="Validación documental"
          metrics={[
            ["Pendientes", quotesDocuments.documentsPendientes],
            ["Recibidos", quotesDocuments.documentsRecibidos],
            ["Revisados", quotesDocuments.documentsRevisados],
            ["Rechazados", quotesDocuments.documentsRechazados],
          ]}
        />
      </div>

      {canViewMarketing ? (
        <>
          <GroupTitle subtitle="Campañas y atribución de leads." title="Marketing" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Chart
              title="Campañas por canal"
              data={report.marketing.byChannel.map((row) => [row.channelLabel, row.count])}
            />
            <Chart
              title="Leads por campaña"
              data={report.marketing.topCampaigns.map((c) => [c.campaignName, c.leads])}
            />
            <SummaryCard
              title="Resumen de campañas"
              metrics={[
                ["Total", report.marketing.totalCampaigns],
                ["Activas", report.marketing.activeCampaigns],
                ["Pausadas", report.marketing.pausedCampaigns],
                ["Finalizadas", report.marketing.completedCampaigns],
                ["Leads atribuidos", report.marketing.attributedLeads],
              ]}
            />
          </div>
        </>
      ) : null}

      <GroupTitle subtitle="Conversión del embudo comercial." title="Embudo" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-slate-900">Embudo comercial</h3>
          <div className="mt-5 space-y-3">
            {funnel.map(([label, value], index) => (
              <div key={label}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-900">{value}</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded bg-slate-100">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${funnel[0][1] ? Math.round((value / funnel[0][1]) * 100) : 0}%` }}
                  />
                </div>
                {index > 0 ? (
                  <div className="mt-1 text-xs text-slate-400">
                    {funnel[index - 1][1]
                      ? Math.round((value / funnel[index - 1][1]) * 100)
                      : 0}
                    % del paso anterior
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

function GroupTitle({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 pb-2">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-600">{title}</h3>
      <span className="text-xs text-slate-400">{subtitle}</span>
    </div>
  );
}

function SummaryCard({
  title,
  metrics,
}: {
  title: string;
  metrics: [string, number | string][];
}) {
  return (
    <Card className="p-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        {metrics.map(([label, value]) => (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={label}>
            <div className="text-xs text-slate-500">{label}</div>
            <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Chart({ title, data }: { title: string; data: [string, number][] }) {
  const ranked = [...data].filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...ranked.map(([, value]) => value), 1);

  return (
    <Card className="p-5">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-4 space-y-3">
        {ranked.length ? (
          ranked.map(([label, value]) => (
            <div key={label}>
              <div className="flex justify-between gap-3 text-xs">
                <span className="truncate text-slate-500">{label}</span>
                <span className="font-semibold text-slate-900">{value}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100">
                <div className="h-full rounded bg-red-500" style={{ width: `${Math.round((value / max) * 100)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-slate-500">
            Aún no hay datos para este reporte. Los resultados aparecerán cuando exista actividad dentro de este alcance.
          </div>
        )}
      </div>
    </Card>
  );
}

function formatAmount(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 2 }).format(value);
}
