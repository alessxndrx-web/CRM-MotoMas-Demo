import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, Inbox, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  TicketImpactBadge,
  TicketStatusBadge,
  TicketSummaryCard,
} from "@/features/operations/modules/tickets/ticket-summary-card";
import {
  formatTicketDate,
  ticketCategoryLabels,
  ticketCategoryOptions,
  ticketImpactOptions,
  ticketStatusOptions,
  type TicketCategoryValue,
  type TicketImpactValue,
  type TicketStatusValue,
} from "@/features/operations/modules/tickets/ticket-ui";
import { requireAuth } from "@/server/auth/context";
import { listMyTickets } from "@/server/tickets/queries";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const selectClassName =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function validOption<T extends string>(
  value: string,
  options: readonly { value: T }[],
): T | "" {
  return options.some((option) => option.value === value) ? (value as T) : "";
}

function pageHref(
  filters: { keyword: string; status: string; category: string; impact: string },
  page: number,
) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("q", filters.keyword);
  if (filters.status) params.set("estado", filters.status);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.impact) params.set("impacto", filters.impact);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/panel/ayuda/mis-tickets?${query}` : "/panel/ayuda/mis-tickets";
}

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  await requireAuth();
  const params = await searchParams;
  const keyword = first(params.q).trim().slice(0, 80);
  const status = validOption<TicketStatusValue>(
    first(params.estado),
    ticketStatusOptions,
  );
  const category = validOption<TicketCategoryValue>(
    first(params.categoria),
    ticketCategoryOptions,
  );
  const impact = validOption<TicketImpactValue>(
    first(params.impacto),
    ticketImpactOptions,
  );
  const requestedPage = Number.parseInt(first(params.pagina), 10);
  const allTickets = await listMyTickets();
  const normalizedKeyword = keyword.toLocaleLowerCase("es");
  const filtered = allTickets.filter((ticket) => {
    if (
      normalizedKeyword &&
      !`${ticket.code} ${ticket.title}`
        .toLocaleLowerCase("es")
        .includes(normalizedKeyword)
    ) {
      return false;
    }
    if (status && ticket.status !== status) return false;
    if (category && ticket.category !== category) return false;
    if (impact && ticket.impact !== impact) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), pageCount)
    : 1;
  const tickets = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filters = { keyword, status, category, impact };
  const hasFilters = Boolean(keyword || status || category || impact);

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            href="/panel/ayuda/nuevo-ticket"
          >
            <Plus className="h-4 w-4" />
            Reportar problema
          </Link>
        }
        description="Consulta únicamente los tickets que creaste o en los que participas."
        eyebrow="Tickets y ayuda"
        title="Mis tickets"
      />

      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(150px,0.55fr))_auto]"
        method="get"
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Buscar
          </span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              defaultValue={keyword}
              maxLength={80}
              name="q"
              placeholder="Código o título"
            />
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Estado
          </span>
          <select className={selectClassName} defaultValue={status} name="estado">
            <option value="">Todos</option>
            {ticketStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Categoría
          </span>
          <select
            className={selectClassName}
            defaultValue={category}
            name="categoria"
          >
            <option value="">Todas</option>
            {ticketCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Impacto
          </span>
          <select className={selectClassName} defaultValue={impact} name="impacto">
            <option value="">Todos</option>
            {ticketImpactOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 xl:col-span-1">
          <Button className="flex-1" type="submit">
            <Filter className="h-4 w-4" />
            Filtrar
          </Button>
          {hasFilters ? (
            <Link
              aria-label="Limpiar filtros"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              href="/panel/ayuda/mis-tickets"
            >
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      {tickets.length > 0 ? (
        <>
          <div className="grid gap-4 md:hidden">
            {tickets.map((ticket) => (
              <TicketSummaryCard key={ticket.code} ticket={ticket} />
            ))}
          </div>

          <DataTableShell className="hidden md:block">
            <table className="min-w-[900px]">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Título</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th>Impacto</th>
                  <th>Última actualización</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.code}>
                    <td>
                      <Link
                        className="font-mono text-xs font-semibold text-blue-700 hover:text-blue-800"
                        href={`/panel/ayuda/tickets/${encodeURIComponent(ticket.code)}`}
                      >
                        {ticket.code}
                      </Link>
                    </td>
                    <td className="max-w-[280px]">
                      <Link
                        className="block truncate font-medium text-slate-900 hover:text-blue-700"
                        href={`/panel/ayuda/tickets/${encodeURIComponent(ticket.code)}`}
                      >
                        {ticket.title}
                      </Link>
                      {ticket.branch ? (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {ticket.branch.name}
                        </span>
                      ) : null}
                    </td>
                    <td>{ticketCategoryLabels[ticket.category]}</td>
                    <td>
                      <TicketStatusBadge ticket={ticket} />
                    </td>
                    <td>
                      <TicketImpactBadge ticket={ticket} />
                    </td>
                    <td>{formatTicketDate(ticket.updatedAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableShell>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              {filtered.length} ticket{filtered.length === 1 ? "" : "s"} · Página {page} de {pageCount}
            </p>
            <div className="flex items-center gap-2">
              <Link
                aria-disabled={page <= 1}
                className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${
                  page <= 1
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
                href={pageHref(filters, page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Link>
              <Link
                aria-disabled={page >= pageCount}
                className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${
                  page >= pageCount
                    ? "pointer-events-none border-slate-200 text-slate-300"
                    : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
                href={pageHref(filters, page + 1)}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          action={
            hasFilters ? (
              <Link
                className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                href="/panel/ayuda/mis-tickets"
              >
                Limpiar filtros
              </Link>
            ) : (
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                href="/panel/ayuda/nuevo-ticket"
              >
                <Plus className="h-4 w-4" />
                Reportar problema
              </Link>
            )
          }
          description={
            hasFilters
              ? "Prueba con otros criterios de búsqueda."
              : "Tus tickets y participaciones aparecerán aquí."
          }
          icon={Inbox}
          title={hasFilters ? "No hay resultados" : "Aún no tienes tickets"}
        />
      )}
    </section>
  );
}
