"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { ActivityRecord } from "@/data/operations/activities";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import type { InventoryUnit } from "@/data/operations/inventory";
import type { PublicLead } from "@/data/operations/leads";
import type { ReservationRecord } from "@/data/operations/reservations";
import type { SaleRecord } from "@/data/operations/sales";
import type { QuoteRecord } from "@/data/operations/quotes";
import type { CustomerFileDocumentRecord } from "@/data/operations/customer-file-documents";
import type { CreditApplicationRecord } from "@/data/operations/credit-applications";
import { readActivities, isActivityOverdue } from "@/features/operations/services/activity-service";
import { readCustomerFiles } from "@/features/operations/services/customer-files-service";
import { readCreditApplications } from "@/features/operations/services/credit-application-service";
import { readInventoryUnits } from "@/features/operations/services/inventory-service";
import { readLeadInboxLeads } from "@/features/operations/services/leads-service";
import {
  filterActivitiesBySession,
  filterCustomerFilesBySession,
  filterCustomerFileDocumentsBySession,
  filterCreditApplicationsBySession,
  filterInventoryUnitsBySession,
  filterLeadsBySession,
  filterQuotesBySession,
  filterReservationsBySession,
  filterSalesBySession,
} from "@/features/operations/services/operation-scope-service";
import { readReservations } from "@/features/operations/services/reservation-service";
import { isQuoteExpired, readQuotes } from "@/features/operations/services/quote-service";
import {
  getScopedDocumentProgress,
  readCustomerFileDocuments,
} from "@/features/operations/services/customer-file-documents-service";
import { readSales } from "@/features/operations/services/sales-service";
import { readDemoSession, subscribeToDemoSession } from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";

export function ReportsPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [documents, setDocuments] = useState<CustomerFileDocumentRecord[]>([]);
  const [credits, setCredits] = useState<CreditApplicationRecord[]>([]);
  const [leads, setLeads] = useState<PublicLead[]>([]);
  const [files, setFiles] = useState<CustomerFileRecord[]>([]);
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [units, setUnits] = useState<InventoryUnit[]>([]);

  useEffect(() => {
    function sync() {
      setSession(readDemoSession());
      setActivities(readActivities());
      setQuotes(readQuotes());
      setDocuments(readCustomerFileDocuments());
      setCredits(readCreditApplications());
      setLeads(readLeadInboxLeads());
      setFiles(readCustomerFiles());
      setReservations(readReservations());
      setSales(readSales());
      setUnits(readInventoryUnits());
    }

    sync();
    return subscribeToDemoSession(sync);
  }, []);

  const scoped = useMemo(
    () => ({
      activities: filterActivitiesBySession(activities, session),
      quotes: filterQuotesBySession(quotes, session),
      documents: filterCustomerFileDocumentsBySession(documents, session),
      credits: filterCreditApplicationsBySession(credits, session),
      leads: filterLeadsBySession(leads, session),
      files: filterCustomerFilesBySession(files, leads, session),
      reservations: filterReservationsBySession(reservations, session),
      sales: filterSalesBySession(sales, session),
      units: filterInventoryUnitsBySession(units, session),
    }),
    [activities, credits, documents, files, leads, quotes, reservations, sales, session, units],
  );

  if (!session || session.role === "Vendedor") {
    return (
      <Card className="p-8 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">Reportes restringidos</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Los reportes comerciales estan disponibles para Gerente y Administrador.
        </p>
      </Card>
    );
  }

  const funnel = [
    ["Solicitudes", scoped.leads.length],
    ["Expedientes", scoped.files.length],
    ["Reservas", scoped.reservations.length],
    ["Ventas", scoped.sales.length],
    ["Entregas", scoped.sales.filter((sale) => sale.estado === "Entregada").length],
  ] as const;

  return (
    <section className="space-y-6">
      <div>
        <Badge tone="red">Reportes comerciales</Badge>
        <h2 className="mt-4 text-3xl font-black text-white">Seguimiento y conversion</h2>
        <p className="mt-2 text-sm text-zinc-500">
          {session.role === "Administrador"
            ? "Vista global por sucursal, vendedor y canal, calculada desde la operación actual."
            : `Datos de ${session.branchName} calculados desde la operación actual.`}
        </p>
      </div>

      <ReportGroupTitle subtitle="Origen, campaña, sucursal y vendedor." title="Captación de leads" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Chart title="Leads por canal" data={group(scoped.leads, (lead) => lead.canalOrigen ?? "Sin canal")} />
        <Chart title="Leads por campana" data={group(scoped.leads, (lead) => lead.campaignName ?? "Sin campana")} />
        <Chart title="Leads por sucursal" data={group(scoped.leads, (lead) => lead.sucursalNombre)} />
        <Chart title="Leads por vendedor" data={group(scoped.leads, (lead) => lead.vendedorAsignado ?? "Sin asignar")} />
      </div>

      <ReportGroupTitle subtitle="Ventas, reservas e inventario por estado." title="Ventas e inventario" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Chart title="Ventas por sucursal" data={group(scoped.sales, (sale) => sale.sucursalNombre)} />
        <Chart title="Ventas por vendedor" data={group(scoped.sales, (sale) => sale.vendedorNombre)} />
        <Chart title="Reservas por estado" data={group(scoped.reservations, (reservation) => reservation.estado)} />
        <Chart title="Inventario por estado" data={group(scoped.units, (unit) => unit.estado)} />
      </div>

      <ReportGroupTitle subtitle="Tipo, vendedor, sucursal y resumen." title="Actividad comercial" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Chart title="Actividades por tipo" data={group(scoped.activities, (activity) => activity.tipo)} />
        <Chart title="Actividades por vendedor" data={group(scoped.activities, (activity) => activity.vendedorNombre)} />
        <Chart title="Actividades por sucursal" data={group(scoped.activities, (activity) => activity.sucursalNombre)} />
        <ActivitySummary activities={scoped.activities} />
      </div>

      <ReportGroupTitle subtitle="Estado, vendedor, sucursal y modelo." title="Proformas" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Chart title="Proformas por estado" data={group(scoped.quotes, quoteStatusLabel)} />
        <Chart title="Proformas por vendedor" data={group(scoped.quotes, (quote) => quote.vendedorNombre)} />
        <Chart title="Proformas por sucursal" data={group(scoped.quotes, (quote) => quote.sucursalNombre)} />
        <Chart title="Proformas por moto" data={group(scoped.quotes, (quote) => quote.modeloNombre)} />
      </div>

      <QuoteSummary quotes={scoped.quotes} />

      <DocumentSummary files={scoped.files} documents={scoped.documents} />

      <ReportGroupTitle subtitle="Estado, sucursal y vendedor." title="Créditos" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Chart title="Créditos por estado" data={group(scoped.credits, (credit) => credit.estado)} />
        <Chart title="Créditos por sucursal" data={group(scoped.credits, (credit) => credit.sucursalNombre)} />
        <Chart title="Créditos por vendedor" data={group(scoped.credits, (credit) => credit.vendedorNombre)} />
      </div>

      <CreditSummary credits={scoped.credits} />

      <ReportGroupTitle subtitle="Estado y rechazos por sucursal y vendedor." title="Documentación" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Chart title="Documentos por estado" data={group(scoped.documents, (document) => document.estado)} />
        <Chart title="Documentos rechazados por sucursal" data={group(scoped.documents.filter((document) => document.estado === "Rechazado"), (document) => document.sucursalNombre)} />
        <Chart title="Documentos rechazados por vendedor" data={group(scoped.documents.filter((document) => document.estado === "Rechazado"), (document) => document.vendedorNombre)} />
      </div>

      <ReportGroupTitle subtitle="Tendencia diaria y conversión del embudo." title="Tendencia y embudo" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Chart
          title="Leads por dia"
          data={group(scoped.leads, (lead) => new Date(lead.fechaCreacion).toLocaleDateString("es-NI"))}
        />
        <Card className="p-6">
          <h3 className="text-xl font-black text-white">Embudo comercial</h3>
          <div className="mt-5 space-y-3">
            {funnel.map(([label, value], index) => (
              <div key={label}>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">{label}</span>
                  <span className="font-black text-white">{value}</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded bg-white/10">
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${funnel[0][1] ? Math.round((value / funnel[0][1]) * 100) : 0}%` }}
                  />
                </div>
                {index > 0 ? (
                  <div className="mt-1 text-xs text-zinc-600">
                    {funnel[index - 1][1] ? Math.round((value / funnel[index - 1][1]) * 100) : 0}% del paso anterior
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

function ReportGroupTitle({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 pb-2">
      <h3 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-300">{title}</h3>
      <span className="text-xs text-zinc-600">{subtitle}</span>
    </div>
  );
}

function ActivitySummary({ activities }: { activities: ActivityRecord[] }) {
  const completed = activities.filter((activity) => activity.estado === "Completada").length;
  const overdue = activities.filter((activity) => isActivityOverdue(activity)).length;
  const highPriority = activities.filter(
    (activity) => activity.estado === "Pendiente" && activity.prioridad === "Alta",
  ).length;
  const manualWhatsApp = activities.filter((activity) => activity.tipo === "WhatsApp").length;

  return (
    <Card className="p-5">
      <h3 className="text-lg font-black text-white">Resumen de actividades</h3>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <ActivityMetric label="Completadas" value={completed} />
        <ActivityMetric label="Vencidas" value={overdue} />
        <ActivityMetric label="Prioridad Alta" value={highPriority} />
        <ActivityMetric label="WhatsApp manual" value={manualWhatsApp} />
      </div>
    </Card>
  );
}

function ActivityMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-black text-white">{value}</div>
    </div>
  );
}

function QuoteSummary({ quotes }: { quotes: QuoteRecord[] }) {
  const accepted = quotes.filter((quote) => quote.estado === "Aceptada").length;
  const expired = quotes.filter((quote) => isQuoteExpired(quote)).length;
  const total = quotes.reduce(
    (amount, quote) => amount + (quote.precioReferencial ?? 0),
    0,
  );

  return (
    <Card className="p-5">
      <h3 className="text-lg font-black text-white">Resumen de proformas</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ActivityMetric label="Aceptadas" value={accepted} />
        <ActivityMetric label="Vencidas" value={expired} />
        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
          <div className="text-xs text-zinc-500">Monto referencial cotizado</div>
          <div className="mt-1 text-xl font-black text-white">{formatAmount(total)}</div>
        </div>
      </div>
    </Card>
  );
}

function DocumentSummary({
  documents,
  files,
}: {
  documents: CustomerFileDocumentRecord[];
  files: CustomerFileRecord[];
}) {
  const progress = getScopedDocumentProgress(files, documents);
  const rejected = progress.documents.filter((document) => document.estado === "Rechazado").length;

  return (
    <Card className="p-5">
      <h3 className="text-lg font-black text-white">Validacion documental</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ActivityMetric label="Expedientes con pendientes" value={progress.filesWithPendingDocuments} />
        <ActivityMetric label="Expedientes listos" value={progress.readyFiles} />
        <ActivityMetric label="Documentos rechazados" value={rejected} />
      </div>
    </Card>
  );
}

function CreditSummary({ credits }: { credits: CreditApplicationRecord[] }) {
  const approved = credits.filter((credit) => credit.estado === "Aprobado").length;
  const rejected = credits.filter((credit) => credit.estado === "Rechazado").length;
  const pendingDocuments = credits.filter(
    (credit) => credit.estado === "Documentacion pendiente",
  ).length;
  const totalRequested = credits.reduce(
    (amount, credit) => amount + (credit.montoSolicitado ?? 0),
    0,
  );

  return (
    <Card className="p-5">
      <h3 className="text-lg font-black text-white">Resumen de créditos</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <ActivityMetric label="Aprobados" value={approved} />
        <ActivityMetric label="Rechazados" value={rejected} />
        <ActivityMetric label="Documentación pendiente" value={pendingDocuments} />
        <div className="rounded-lg border border-white/10 bg-white/[0.045] p-3">
          <div className="text-xs text-zinc-500">Monto total solicitado</div>
          <div className="mt-1 text-xl font-black text-white">{formatAmount(totalRequested)}</div>
        </div>
      </div>
    </Card>
  );
}

function quoteStatusLabel(quote: QuoteRecord) {
  return isQuoteExpired(quote) ? "Vencida" : quote.estado;
}

function group<T>(items: T[], key: (item: T) => string) {
  return Object.entries(
    items.reduce<Record<string, number>>((accumulator, item) => {
      const label = key(item);
      accumulator[label] = (accumulator[label] ?? 0) + 1;
      return accumulator;
    }, {}),
  ).sort((left, right) => right[1] - left[1]);
}

function Chart({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(...data.map(([, value]) => value), 1);

  return (
    <Card className="p-5">
      <h3 className="text-lg font-black text-white">{title}</h3>
      <div className="mt-4 space-y-3">
        {data.length ? data.map(([label, value]) => (
          <div key={label}>
            <div className="flex justify-between gap-3 text-xs">
              <span className="truncate text-zinc-400">{label}</span>
              <span className="font-black text-white">{value}</span>
            </div>
            <div className="mt-1 h-2 rounded bg-white/10">
              <div className="h-full rounded bg-red-500" style={{ width: `${Math.round((value / max) * 100)}%` }} />
            </div>
          </div>
        )) : (
          <div className="text-sm text-zinc-500">Aún no hay datos para este reporte. Los resultados aparecerán cuando exista actividad dentro de este alcance.</div>
        )}
      </div>
    </Card>
  );
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 2 }).format(value);
}
