import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Filter,
  Globe2,
  Inbox,
  Plus,
  Search,
  UserRoundX,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { OperatorRestrictedState } from "@/features/operations/modules/tickets/operator-restricted-state";
import {
  formatTicketDate,
  ticketCategoryLabels,
  ticketCategoryOptions,
  ticketImpactLabels,
  ticketImpactOptions,
  ticketPriorityLabels,
  ticketPriorityOptions,
  ticketScopeLabels,
  ticketScopeOptions,
  ticketStatusLabels,
  ticketStatusOptions,
  ticketStatusTone,
} from "@/features/operations/modules/tickets/ticket-ui";
import { canOperateTickets } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import {
  getOperatorTicketMetrics,
  getOperatorTicketOptions,
  listOperatorTickets,
} from "@/server/tickets/operator-queries";
import type { OperatorTicketListInput } from "@/server/tickets/types";

export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

const selectClassName =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function first(value: SearchValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function enumValue<T extends string>(value: string, values: readonly T[]): T | "" {
  return values.includes(value as T) ? (value as T) : "";
}

function pageHref(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params);
  if (page > 1) next.set("pagina", String(page));
  else next.delete("pagina");
  const query = next.toString();
  return query ? `/panel/soporte/tickets?${query}` : "/panel/soporte/tickets";
}

export default async function OperatorTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) return <OperatorRestrictedState />;

  const params = await searchParams;
  const keyword = first(params.q).trim().slice(0, 120);
  const status = enumValue(first(params.estado), ticketStatusOptions.map((item) => item.value));
  const priority = enumValue(first(params.prioridad), ticketPriorityOptions.map((item) => item.value));
  const impact = enumValue(first(params.impacto), ticketImpactOptions.map((item) => item.value));
  const category = enumValue(first(params.categoria), ticketCategoryOptions.map((item) => item.value));
  const scope = enumValue(first(params.alcance), ticketScopeOptions.map((item) => item.value));
  const duplicate = enumValue(first(params.duplicado), ["all", "duplicate", "primary"] as const) || "all";
  const globalRelation = enumValue(first(params.global), ["all", "linked", "unlinked", "global"] as const) || "all";
  const page = Math.max(1, Number.parseInt(first(params.pagina), 10) || 1);
  const input: OperatorTicketListInput = {
    keyword,
    status,
    priority,
    impact,
    category,
    scope,
    branch: first(params.sucursal),
    assignedOperator: first(params.asignado),
    unassignedOnly: first(params.sin_asignar) === "1",
    dateFrom: first(params.desde),
    dateTo: first(params.hasta),
    duplicate,
    globalRelation,
    page,
    pageSize: 20,
  };
  const [result, metrics, options] = await Promise.all([
    listOperatorTickets(input),
    getOperatorTicketMetrics(),
    getOperatorTicketOptions(),
  ]);
  if (!result || !metrics || !options) return <OperatorRestrictedState />;

  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const normalized = first(value);
    if (normalized && key !== "pagina") queryParams.set(key, normalized);
  }
  const hasFilters = Array.from(queryParams.keys()).length > 0;
  const metricCards = [
    ["Abiertos", metrics.open, CircleDot, "text-blue-600"],
    ["Sin asignar", metrics.unassigned, UserRoundX, "text-amber-600"],
    ["Críticos", metrics.critical, AlertTriangle, "text-red-600"],
    ["Espera usuario", metrics.waitingForUser, Inbox, "text-yellow-600"],
    ["En progreso", metrics.inProgress, CircleDot, "text-indigo-600"],
    ["Resueltos", metrics.resolved, CircleDot, "text-emerald-600"],
    ["Reabiertos", metrics.reopened, CircleDot, "text-orange-600"],
    ["Incidentes sucursal", metrics.branchIncidents, Inbox, "text-violet-600"],
    ["Incidentes globales", metrics.globalIncidents, Globe2, "text-red-600"],
  ] as const;

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <>
            {session.roleEnum === "ADMIN" ? <Badge tone="blue">Supervisión Admin</Badge> : <Badge tone="emerald">Operador activo</Badge>}
            <Link className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" href="/panel/soporte/tickets/nuevo">
              <Plus className="h-4 w-4" /> Nuevo ticket operativo
            </Link>
          </>
        }
        description="Gestión autorizada y auditada de incidentes internos. Los filtros y la paginación se ejecutan en el servidor."
        eyebrow="Centro de soporte"
        title="Bandeja de tickets"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-9">
        {metricCards.map(([label, value, Icon, color]) => (
          <Card className="p-4" key={label}>
            <Icon className={`h-4 w-4 ${color}`} />
            <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
          </Card>
        ))}
      </div>

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5" method="get">
        <FilterControl className="sm:col-span-2" label="Buscar">
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" defaultValue={keyword} maxLength={120} name="q" placeholder="Código o título" />
          </span>
        </FilterControl>
        <FilterSelect label="Estado" name="estado" value={status} options={ticketStatusOptions} />
        <FilterSelect label="Prioridad" name="prioridad" value={priority} options={ticketPriorityOptions} />
        <FilterSelect label="Impacto" name="impacto" value={impact} options={ticketImpactOptions} />
        <FilterSelect label="Categoría" name="categoria" value={category} options={ticketCategoryOptions} />
        <FilterSelect label="Alcance" name="alcance" value={scope} options={ticketScopeOptions} />
        <FilterSelect label="Sucursal" name="sucursal" value={input.branch ?? ""} options={options.branches.map((item) => ({ value: item.code, label: item.label }))} />
        <FilterSelect label="Operador asignado" name="asignado" value={input.assignedOperator ?? ""} options={options.operators.map((item) => ({ value: item.email, label: item.label }))} />
        <FilterSelect label="Duplicado" name="duplicado" value={duplicate} options={[{ value: "all", label: "Todos" }, { value: "duplicate", label: "Solo duplicados" }, { value: "primary", label: "No duplicados" }]} includeAll={false} />
        <FilterSelect label="Relación global" name="global" value={globalRelation} options={[{ value: "all", label: "Todas" }, { value: "linked", label: "Vinculadas" }, { value: "unlinked", label: "Sin vínculo" }, { value: "global", label: "Incidentes GLOBAL" }]} includeAll={false} />
        <FilterControl label="Desde"><Input defaultValue={input.dateFrom} name="desde" type="date" /></FilterControl>
        <FilterControl label="Hasta"><Input defaultValue={input.dateTo} name="hasta" type="date" /></FilterControl>
        <label className="flex h-10 items-center gap-2 self-end rounded-md border border-slate-200 px-3 text-sm text-slate-700">
          <input defaultChecked={input.unassignedOnly} name="sin_asignar" type="checkbox" value="1" /> Solo sin asignar
        </label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <Button type="submit"><Filter className="h-4 w-4" /> Aplicar filtros</Button>
          {hasFilters ? <Link className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" href="/panel/soporte/tickets">Limpiar</Link> : null}
        </div>
      </form>

      {result.tickets.length ? (
        <>
          <div className="grid gap-3 md:hidden">
            {result.tickets.map((ticket) => (
              <Link href={`/panel/soporte/tickets/${encodeURIComponent(ticket.code)}`} key={ticket.code}>
                <Card className="p-4 transition hover:border-blue-300">
                  <div className="flex items-start justify-between gap-3"><span className="font-mono text-xs font-semibold text-blue-700">{ticket.code}</span><Badge tone={ticketStatusTone[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge></div>
                  <h2 className="mt-2 font-semibold text-slate-900">{ticket.title}</h2>
                  <p className="mt-2 text-sm text-slate-500">{ticketPriorityLabels[ticket.priority]} · {ticketScopeLabels[ticket.scope]} · {ticket.assignedOperatorLabel ?? "Sin asignar"}</p>
                </Card>
              </Link>
            ))}
          </div>
          <DataTableShell className="hidden md:block">
            <table className="min-w-[1180px]">
              <thead><tr><th>Código / título</th><th>Clasificación</th><th>Prioridad</th><th>Estado</th><th>Alcance</th><th>Sucursal</th><th>Solicitante</th><th>Asignación</th><th>Actualizado</th></tr></thead>
              <tbody>{result.tickets.map((ticket) => (
                <tr key={ticket.code}>
                  <td className="max-w-[260px]"><Link className="font-mono text-xs font-semibold text-blue-700" href={`/panel/soporte/tickets/${encodeURIComponent(ticket.code)}`}>{ticket.code}</Link><Link className="mt-1 block truncate font-medium text-slate-900 hover:text-blue-700" href={`/panel/soporte/tickets/${encodeURIComponent(ticket.code)}`}>{ticket.title}</Link>{ticket.isDuplicate || ticket.hasGlobalIncident ? <p className="mt-1 text-xs text-violet-600">{ticket.isDuplicate ? "Duplicado" : ""}{ticket.isDuplicate && ticket.hasGlobalIncident ? " · " : ""}{ticket.hasGlobalIncident ? "Vinculado a global" : ""}</p> : null}</td>
                  <td><span className="block">{ticketCategoryLabels[ticket.category]}</span><span className="text-xs text-slate-500">{ticketImpactLabels[ticket.impact]}</span></td>
                  <td><Badge tone={ticket.priority === "P1_CRITICA" ? "red" : ticket.priority === "P2_ALTA" ? "orange" : "slate"}>{ticketPriorityLabels[ticket.priority]}</Badge></td>
                  <td><Badge tone={ticketStatusTone[ticket.status]}>{ticketStatusLabels[ticket.status]}</Badge></td>
                  <td><Badge tone={ticket.scope === "GLOBAL" ? "red" : ticket.scope === "BRANCH" ? "orange" : "slate"}>{ticketScopeLabels[ticket.scope]}</Badge></td>
                  <td>{ticket.branchLabel ?? "—"}</td><td>{ticket.requesterRoleLabel}</td><td>{ticket.assignedOperatorLabel ?? <span className="font-semibold text-amber-700">Sin asignar</span>}</td><td>{formatTicketDate(ticket.updatedAt, true)}</td>
                </tr>
              ))}</tbody>
            </table>
          </DataTableShell>
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">{result.total} ticket{result.total === 1 ? "" : "s"} · Página {result.page} de {result.pageCount}</p>
            <div className="flex gap-2">
              <Link aria-disabled={result.page <= 1} className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${result.page <= 1 ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`} href={pageHref(queryParams, result.page - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Link>
              <Link aria-disabled={result.page >= result.pageCount} className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${result.page >= result.pageCount ? "pointer-events-none border-slate-200 text-slate-300" : "border-slate-300 text-slate-700"}`} href={pageHref(queryParams, result.page + 1)}>Siguiente <ChevronRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </>
      ) : (
        <EmptyState action={hasFilters ? <Link className="font-semibold text-blue-700" href="/panel/soporte/tickets">Limpiar filtros</Link> : null} description="No existen tickets para los criterios autorizados seleccionados." icon={Inbox} title="No hay resultados" />
      )}
    </section>
  );
}

function FilterControl({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return <label className={className}><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}

function FilterSelect({ includeAll = true, label, name, options, value }: { includeAll?: boolean; label: string; name: string; options: readonly { value: string; label: string }[]; value: string }) {
  return <FilterControl label={label}><select className={selectClassName} defaultValue={value} name={name}>{includeAll ? <option value="">Todos</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></FilterControl>;
}
