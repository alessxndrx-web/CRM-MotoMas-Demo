import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChartFrame } from "@/components/ui/chart-frame";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { PosMovementsTable } from "@/features/operations/modules/dashboard/pos-movements-table";
import { posPaymentMethodLabels } from "@/server/pos/shared";
import type { DashboardPeriodId, PosDashboardDTO } from "@/server/pos/dashboard";
import { dashboardPeriods } from "@/server/pos/dashboard";
import { cn } from "@/lib/utils";

/**
 * Patch POS2.1 — el tablero operativo, en pantalla.
 *
 * **Componente de servidor.** No tiene estado: el período viaja en la URL, así
 * que cambiarlo es navegar y las cifras las vuelve a calcular el servidor. Eso
 * evita el error que el encargo señala —una tarjeta con un período y otra con
 * otro— porque **hay un solo rango y todas las cifras salen de él**.
 *
 * También hace que el filtro sea compartible: un gerente puede pegar la URL de
 * «últimos 7 días» en un mensaje y quien la abra verá lo mismo.
 *
 * No construye ningún componente: consume los de POS2.0-A y POS2.0-C.
 */

const money = (value: number) =>
  new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short" }).format(
    new Date(iso),
  );

/* -------------------------------------------------------------------------
 * Selector de período
 * ---------------------------------------------------------------------- */

function PeriodPicker({ active }: { active: DashboardPeriodId }) {
  return (
    <nav
      aria-label="Período"
      className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
      data-testid="periodo"
    >
      {dashboardPeriods.map((period) => {
        const current = period.id === active;
        return (
          <Link
            aria-current={current ? "page" : undefined}
            className={cn(
              "sb-focus rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              current
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
            data-testid={`periodo-${period.id}`}
            href={`/panel/dashboard?periodo=${period.id}`}
            key={period.id}
            // El período cambia toda la página: se recarga desde el servidor en
            // vez de arrastrar estado de cliente que habría que sincronizar.
            scroll={false}
          >
            {period.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------
 * Tendencia
 * ---------------------------------------------------------------------- */

/**
 * Ventas por día, **sin librería de gráficos**.
 *
 * DS-1 sigue abierta y este parche no la resuelve: elegir una librería es una
 * decisión de arquitectura —peso, renderizado en servidor, accesibilidad de la
 * salida— que merece su propio parche. Columnas con altura proporcional cubren
 * lo que hace falta aquí sin añadir una dependencia.
 *
 * **La cifra no está en el dibujo.** El total va como texto en la cabecera del
 * marco, cada columna lleva su valor en el `title` y en su nombre accesible, y
 * el mejor día se enuncia debajo. Un gráfico que obliga a leer el gráfico para
 * saber el número es decoración.
 */
function SalesTrend({
  byDay,
  total,
  periodLabel,
}: {
  byDay: Array<{ day: string; total: number; count: number }>;
  total: number;
  periodLabel: string;
}) {
  const max = byDay.reduce((peak, row) => Math.max(peak, row.total), 0);
  const best = byDay.reduce<(typeof byDay)[number] | null>(
    (winner, row) => (!winner || row.total > winner.total ? row : winner),
    null,
  );

  return (
    <ChartFrame
      description={periodLabel}
      empty={byDay.length === 0}
      emptyLabel="No hubo ventas completadas en el período seleccionado."
      height={200}
      title="Ventas por día"
      value={`C$ ${money(total)}`}
      valueHint={
        best ? `Mejor día: ${dayLabel(best.day)} · C$ ${money(best.total)}` : undefined
      }
    >
      <ul
        aria-label="Ventas por día"
        className="flex h-full items-end gap-1"
        data-testid="tendencia"
      >
        {byDay.map((row) => {
          const height = max > 0 ? Math.max(2, (row.total / max) * 100) : 2;
          return (
            <li
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              key={row.day}
            >
              <span
                aria-label={`${dayLabel(row.day)}: C$ ${money(row.total)} en ${row.count} ventas`}
                className="w-full rounded-t bg-blue-500/80"
                style={{ height: `${height}%` }}
                title={`${dayLabel(row.day)} · C$ ${money(row.total)} · ${row.count} ventas`}
              />
              {/* Con muchas columnas la fecha no cabe; deja de escribirse en vez
                  de solaparse. */}
              {byDay.length <= 10 ? (
                <span className="truncate text-[10px] text-slate-400">
                  {dayLabel(row.day)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------------
 * Requiere atención
 * ---------------------------------------------------------------------- */

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  count: number;
  href: string;
  tone: "warning" | "danger" | "neutral";
};

function buildAttention(data: PosDashboardDTO): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (data.inventory) {
    if (data.inventory.outOfStock > 0) {
      items.push({
        id: "sin-existencia",
        title: "Artículos sin existencia",
        detail: "Saldo en cero o negativo en una bodega activa.",
        count: data.inventory.outOfStock,
        href: "/panel/pos/productos",
        tone: "danger",
      });
    }
    if (data.inventory.belowMinimum > 0) {
      items.push({
        id: "bajo-minimo",
        title: "Artículos bajo su mínimo",
        detail: `Sobre ${data.inventory.productsWithThreshold} artículos con umbral configurado.`,
        count: data.inventory.belowMinimum,
        href: "/panel/pos/productos",
        tone: "warning",
      });
    }
  }

  if (data.purchases) {
    if (data.purchases.pending > 0) {
      items.push({
        id: "compras-pendientes",
        title: "Órdenes de compra por recibir",
        detail: "Aprobadas o con recepción parcial.",
        count: data.purchases.pending,
        href: "/panel/pos/compras",
        tone: "warning",
      });
    }
    if (data.purchases.draft > 0) {
      items.push({
        id: "compras-borrador",
        title: "Órdenes en borrador",
        detail: "Creadas y todavía sin aprobar.",
        count: data.purchases.draft,
        href: "/panel/pos/compras",
        tone: "neutral",
      });
    }
  }

  return items;
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        description="Ninguna existencia bajo mínimo y ninguna orden de compra pendiente."
        icon={TrendingUp}
        title="Nada requiere atención"
      />
    );
  }

  return (
    <ul className="space-y-2" data-testid="atencion">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            className="sb-focus flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
            data-testid={`atencion-${item.id}`}
            href={item.href}
          >
            <span className="flex min-w-0 items-center gap-3">
              <Badge
                dot
                tone={
                  item.tone === "danger" ? "red" : item.tone === "warning" ? "amber" : "slate"
                }
              >
                <span className="sb-numeric">{item.count}</span>
              </Badge>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {item.detail}
                </span>
              </span>
            </span>
            <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------
 * Panel
 * ---------------------------------------------------------------------- */

export function PosOperationsPanel({ data }: { data: PosDashboardDTO }) {
  // Sin permiso para nada de esto la sección no se dibuja. El servidor tampoco
  // ha consultado: no es un `display:none`.
  if (!data.canSeeSales && !data.canSeeInventory) return null;

  const attention = buildAttention(data);
  const sales = data.sales;

  return (
    <section aria-labelledby="pos-operativo" className="space-y-6" data-testid="pos-dashboard">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900" id="pos-operativo">
            Operación de mostrador
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {data.global ? "Todas las sucursales" : data.branchName} ·{" "}
            <span data-testid="periodo-activo">{data.range.label}</span>
          </p>
        </div>
        <PeriodPicker active={data.range.id} />
      </div>

      {/* --- KPIs: como máximo cuatro ---------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpis">
        {sales ? (
          <>
            <StatCard
              hint={
                sales.changePercent === null
                  ? "Sin período anterior con el que comparar"
                  : `${sales.changePercent >= 0 ? "+" : ""}${sales.changePercent.toFixed(1)}% vs. período anterior`
              }
              icon={Receipt}
              label={`Ventas · ${data.range.label}`}
              value={`C$ ${money(sales.total)}`}
            />
            <StatCard
              hint={`${sales.count === 1 ? "1 venta completada" : `${sales.count} ventas completadas`}`}
              icon={TrendingUp}
              label={`Ticket promedio · ${data.range.label}`}
              value={`C$ ${money(sales.averageTicket)}`}
            />
          </>
        ) : null}

        {data.inventory ? (
          <StatCard
            hint={
              data.inventory.productsWithThreshold === 0
                ? "Ningún artículo tiene mínimo configurado"
                : `${data.inventory.outOfStock} sin existencia · ${data.inventory.belowMinimum} bajo mínimo`
            }
            icon={Boxes}
            label="Existencias en alerta"
            value={data.inventory.outOfStock + data.inventory.belowMinimum}
          />
        ) : null}

        {data.purchases ? (
          <StatCard
            hint={`${data.purchases.approved} aprobadas · ${data.purchases.partiallyReceived} parciales`}
            icon={ShoppingBag}
            label="Compras por recibir"
            value={data.purchases.pending}
          />
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* --- Tendencia ---------------------------------------------- */}
        {sales ? (
          <div className="min-w-0 lg:col-span-2">
            <SalesTrend
              byDay={sales.byDay}
              periodLabel={data.range.label}
              total={sales.total}
            />
          </div>
        ) : null}

        {/* --- Requiere atención -------------------------------------- */}
        <div className={cn("min-w-0", !sales && "lg:col-span-3")}>
          <Card className="p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AlertTriangle aria-hidden className="h-4 w-4 text-amber-500" />
              Requiere atención
            </h3>
            <div className="mt-3">
              <AttentionList items={attention} />
            </div>
          </Card>
        </div>
      </div>

      {/* --- Cobros y sucursales ---------------------------------------- */}
      {sales && (sales.byMethod.length > 0 || sales.byBranch.length > 0) ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {sales.byMethod.length > 0 ? (
            <Card className="min-w-0 p-5" data-testid="por-metodo">
              <h3 className="text-sm font-semibold text-slate-900">
                Cobros por método
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{data.range.label}</p>
              <dl className="mt-4 space-y-2">
                {sales.byMethod.map((row) => (
                  <div
                    className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0"
                    key={row.method}
                  >
                    <dt className="min-w-0 truncate text-sm text-slate-700">
                      {posPaymentMethodLabels[
                        row.method as keyof typeof posPaymentMethodLabels
                      ] ?? row.method}
                    </dt>
                    <dd className="sb-numeric shrink-0 text-sm font-semibold text-slate-900">
                      C$ {money(row.total)}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {row.count}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}

          {sales.byBranch.length > 0 ? (
            <Card className="min-w-0 p-5" data-testid="por-sucursal">
              <h3 className="text-sm font-semibold text-slate-900">
                Ventas por sucursal
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{data.range.label}</p>
              <dl className="mt-4 space-y-2">
                {sales.byBranch.map((row) => (
                  <div
                    className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0"
                    key={row.branchName}
                  >
                    <dt className="min-w-0 truncate text-sm text-slate-700">
                      {row.branchName}
                    </dt>
                    <dd className="sb-numeric shrink-0 text-sm font-semibold text-slate-900">
                      C$ {money(row.total)}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {row.count}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* --- Actividad reciente ----------------------------------------- */}
      {data.canSeeInventory ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Últimos movimientos de inventario
          </h3>
          <PosMovementsTable movements={data.movements} />
        </div>
      ) : null}
    </section>
  );
}
