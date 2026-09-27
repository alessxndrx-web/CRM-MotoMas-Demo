import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BookmarkCheck,
  PackageSearch,
  ShoppingBag,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { canViewCommercialOverview } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { listActiveBranches } from "@/server/branches/queries";
import { leadStatusLabels, leadStatusValues } from "@/server/crm/shared";
import { isDatabaseConfigured } from "@/server/db/prisma";
import {
  getCommercialOverview,
  isOverviewPeriod,
  overviewPeriodLabels,
  type OverviewPeriod,
} from "@/server/marketing/overview";
import { getPosOverview, type PosOverviewDTO } from "@/server/marketing/overview-pos";
import { posPurchaseOrderStatusLabels, posPurchaseOrderStatusValues } from "@/server/pos/shared";

export const dynamic = "force-dynamic";

/**
 * Patch CRM-INT1 — `/panel/marketing/vision`.
 *
 * La visibilidad global que Marketing necesita sobre el negocio —leads,
 * clientes, reservas, ventas e inventario de todas las sucursales— **en una
 * pantalla de sólo lectura y sin datos personales**. Ver
 * `src/server/marketing/overview.ts` para qué se selecciona y qué no.
 *
 * Vive bajo `/panel/marketing` a propósito: el chasis encierra al rol
 * MARKETING en ese prefijo, y esta vista no le abre ninguna pantalla del CRM
 * donde se opera. Ver no es editar.
 *
 * Los filtros viajan en la URL (`?sucursal=`, `?periodo=`) y el formulario es
 * un GET corriente: funciona sin JavaScript y el enlace se puede compartir.
 *
 * Patch CRM-INT2 — `?origen=` separa las dos líneas de negocio: motocicletas
 * (Caja) y repuestos (POS). Con «todas» se muestran **una debajo de otra, nunca
 * sumadas**. Las listas del POS se paginan con `?pv=` (ventas) y `?pc=`
 * (compras).
 */

type Origin = "todas" | "motos" | "repuestos";

const originLabels: Record<Origin, string> = {
  todas: "Motocicletas y repuestos (por separado)",
  motos: "Sólo motocicletas",
  repuestos: "Sólo repuestos (POS)",
};

function pageParam(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 && page < 10_000 ? page : 1;
}
export default async function CommercialOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    sucursal?: string;
    periodo?: string;
    origen?: string;
    pv?: string;
    pc?: string;
  }>;
}) {
  const session = await requireAuth();
  if (!canViewCommercialOverview(session.roleEnum)) notFound();
  if (!isDatabaseConfigured()) notFound();

  const params = await searchParams;
  const period: OverviewPeriod =
    params.periodo && isOverviewPeriod(params.periodo) ? params.periodo : "30d";
  const branchCode = params.sucursal?.trim() || null;
  const origin: Origin =
    params.origen === "motos" || params.origen === "repuestos" ? params.origen : "todas";
  const showMotos = origin !== "repuestos";
  const showPos = origin !== "motos";

  const [branches, overview, pos] = await Promise.all([
    listActiveBranches(),
    showMotos ? getCommercialOverview({ branchCode, period }) : null,
    showPos
      ? getPosOverview({
          branchCode,
          period,
          salesPage: pageParam(params.pv),
          purchasesPage: pageParam(params.pc),
        })
      : null,
  ]);
  const baseQuery = {
    ...(branchCode ? { sucursal: branchCode } : {}),
    periodo: period,
    origen: origin,
  };
  const missingBranch = (showMotos && !overview) || (showPos && !pos);

  return (
    <section className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Marketing", href: "/panel/marketing" },
          { label: "Visión comercial" },
        ]}
        description="Lo que pasa en cada sucursal, en cifras y registros sin datos de contacto. Sólo lectura."
        title="Visión comercial"
      />

      <Card className="p-5">
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="block min-w-[220px] flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Sucursal</span>
            <select
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              defaultValue={branchCode ?? ""}
              name="sucursal"
            >
              <option value="">Todas las sucursales (consolidado)</option>
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[200px]">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Periodo</span>
            <select
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              defaultValue={period}
              name="periodo"
            >
              {Object.entries(overviewPeriodLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[240px]">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Línea de negocio</span>
            <select
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
              defaultValue={origin}
              name="origen"
            >
              {Object.entries(originLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Aplicar</Button>
        </form>
        <p className="mt-3 text-xs text-slate-500">
          El periodo aplica a leads, clientes nuevos, reservas, ventas, devoluciones y
          compras. Reservas vigentes e inventario disponible son siempre el estado actual.
          Motocicletas y repuestos son líneas de negocio distintas: sus cifras no se suman.
        </p>
      </Card>

      {missingBranch ? (
        <EmptyState
          description="La sucursal indicada no existe."
          title="Sin datos para ese filtro"
          variant="no-results"
        />
      ) : null}

      {missingBranch || !overview ? null : (
        <>
          <SectionTitle
            description="Leads, clientes, reservas, ventas e inventario de motocicletas. Facturado por Caja."
            icon={ShoppingBag}
            title="Motocicletas"
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              hint={`${overview.kpis.leadsWithCampaign} atribuidos a una campaña`}
              icon={UserPlus}
              label="Leads"
              value={overview.kpis.leads}
            />
            <StatCard icon={Users} label="Clientes nuevos" value={overview.kpis.newCustomers} />
            <StatCard
              hint="Pendientes de pago y activas"
              icon={BookmarkCheck}
              label="Reservas vigentes"
              value={overview.kpis.liveReservations}
            />
            <StatCard icon={ShoppingBag} label="Ventas" value={overview.kpis.sales} />
            <StatCard
              icon={PackageSearch}
              label="Unidades disponibles"
              value={overview.kpis.availableUnits}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <h3 className="text-base font-semibold text-slate-900">Por sucursal</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Sucursal</th>
                    <th className="px-4 py-3 text-right font-semibold">Leads</th>
                    <th className="px-4 py-3 font-semibold">Leads por estado</th>
                    <th className="px-4 py-3 text-right font-semibold">Clientes nuevos</th>
                    <th className="px-4 py-3 text-right font-semibold">Reservas vigentes</th>
                    <th className="px-4 py-3 text-right font-semibold">Ventas</th>
                    <th className="px-4 py-3 text-right font-semibold">Disponibles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.byBranch.map((row) => (
                    <tr key={row.branchCode}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{row.branchName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.leads}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {leadStatusValues
                            .filter((status) => row.leadsByStatus[status])
                            .map((status) => (
                              <Badge key={status} tone="slate">
                                {leadStatusLabels[status]}: {row.leadsByStatus[status]}
                              </Badge>
                            ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.newCustomers}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.liveReservations}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.sales}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.availableUnits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <h3 className="text-base font-semibold text-slate-900">Leads por canal de origen</h3>
              {overview.leadsByChannel.length ? (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {overview.leadsByChannel.map((row) => (
                    <li className="flex justify-between py-2" key={row.channel}>
                      <span className="text-slate-700">{row.channel}</span>
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Sin leads en el periodo.</p>
              )}
            </Card>
            <Card className="p-5">
              <h3 className="text-base font-semibold text-slate-900">Inventario disponible por modelo</h3>
              {overview.inventoryByModel.length ? (
                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                  {overview.inventoryByModel.map((row) => (
                    <li className="py-2" key={row.model}>
                      <div className="flex justify-between">
                        <span className="text-slate-700">{row.model}</span>
                        <span className="font-semibold tabular-nums">{row.total}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {row.branches.map((item) => `${item.branchName}: ${item.count}`).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Sin unidades disponibles.</p>
              )}
            </Card>
          </div>

          <RecentTable
            columns={["Código", "Fecha", "Sucursal", "Canal / campaña", "Moto", "Estado", "Vendedor"]}
            empty="Sin leads en el periodo."
            rows={overview.recentLeads.map((lead) => [
              lead.code,
              formatDate(lead.createdAt),
              lead.branchName,
              [lead.channel, lead.campaignName].filter(Boolean).join(" · ") || "—",
              lead.motorcycle ?? "—",
              lead.statusLabel,
              lead.sellerName ?? "Sin asignar",
            ])}
            title="Leads recientes"
          />
          <RecentTable
            columns={["Reserva", "Fecha", "Sucursal", "Unidad", "Estado"]}
            empty="Sin reservas en el periodo."
            rows={overview.recentReservations.map((row) => [
              row.code,
              formatDate(row.reservedAt),
              row.branchName,
              row.unit,
              row.statusLabel,
            ])}
            title="Reservas recientes"
          />
          <RecentTable
            columns={["Venta", "Fecha", "Sucursal", "Unidad", "Tipo", "Estado"]}
            empty="Sin ventas en el periodo."
            rows={overview.recentSales.map((row) => [
              row.code,
              formatDate(row.soldAt),
              row.branchName,
              row.unit,
              row.typeLabel,
              row.statusLabel,
            ])}
            title="Ventas recientes"
          />
        </>
      )}

      {!missingBranch && pos ? <PosSection baseQuery={baseQuery} pos={pos} /> : null}
    </section>
  );
}

function SectionTitle({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof ShoppingBag;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-200 pb-2 pt-2">
      <Icon aria-hidden className="mt-1 h-5 w-5 text-slate-400" />
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

const cordobas = new Intl.NumberFormat("es-NI", {
  style: "currency",
  currency: "NIO",
  minimumFractionDigits: 2,
});

function formatMoney(value: string): string {
  return cordobas.format(Number(value));
}

/**
 * Patch CRM-INT2 — el mostrador de repuestos. Sección propia: nada de aquí se
 * suma con las cifras de motocicletas. Sin clientes, cajeros, proveedores ni
 * costos; ver `src/server/marketing/overview-pos.ts`.
 */
function PosSection({
  baseQuery,
  pos,
}: {
  baseQuery: Record<string, string>;
  pos: PosOverviewDTO;
}) {
  const href = (extra: Record<string, string>) =>
    `?${new URLSearchParams({
      ...baseQuery,
      pv: String(pos.sales.page),
      pc: String(pos.purchases.page),
      ...extra,
    }).toString()}`;
  const purchaseHint =
    posPurchaseOrderStatusValues
      .filter((status) => pos.kpis.purchasesByStatus[status])
      .map((status) => `${posPurchaseOrderStatusLabels[status]}: ${pos.kpis.purchasesByStatus[status]}`)
      .join(" · ") || "Sin órdenes en el periodo";
  return (
    <>
      <SectionTitle
        description="Ventas de mostrador, devoluciones y compras de repuestos. Otra línea de negocio: no se suma con motocicletas."
        icon={Wrench}
        title="Repuestos (POS)"
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint={`${pos.kpis.completedSales} ventas completadas`}
          label="Ventas brutas"
          value={formatMoney(pos.kpis.grossSales)}
        />
        <StatCard
          hint={`${pos.kpis.returns} devoluciones · ${formatMoney(pos.kpis.cashRefunded)} en efectivo`}
          label="Devuelto"
          value={formatMoney(pos.kpis.returnedValue)}
        />
        <StatCard
          hint="Brutas menos lo devuelto en el periodo"
          label="Ventas netas"
          value={formatMoney(pos.kpis.netSales)}
        />
        <StatCard hint={purchaseHint} label="Órdenes de compra" value={pos.kpis.purchaseOrders} />
      </div>
      {pos.kpis.cancelledSales ? (
        <p className="text-xs text-slate-500">
          {pos.kpis.cancelledSales} ventas anuladas en el periodo: no suman en las brutas.
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5">
          <h3 className="text-base font-semibold text-slate-900">Repuestos por sucursal</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Sucursal</th>
                <th className="px-4 py-3 text-right font-semibold">Ventas</th>
                <th className="px-4 py-3 text-right font-semibold">Brutas</th>
                <th className="px-4 py-3 text-right font-semibold">Devoluciones</th>
                <th className="px-4 py-3 text-right font-semibold">Devuelto</th>
                <th className="px-4 py-3 text-right font-semibold">Netas</th>
                <th className="px-4 py-3 text-right font-semibold">Anuladas</th>
                <th className="px-4 py-3 text-right font-semibold">Compras (recibidas)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pos.byBranch.map((row) => (
                <tr key={row.branchCode}>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.branchName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.completedSales}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.grossSales)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.returns}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(row.returnedValue)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(row.netSales)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.cancelledSales}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {row.purchaseOrders} ({row.receivedOrders})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <RecentTable
        columns={["Venta", "Fecha", "Sucursal", "Estado", "Líneas", "Total", "Devuelto"]}
        empty="Sin ventas de mostrador en el periodo."
        footer={<Pager href={(page) => href({ pv: String(page) })} page={pos.sales} />}
        rows={pos.sales.rows.map((row) => [
          row.code,
          formatDate(row.date),
          row.branchName,
          row.statusLabel,
          String(row.lines),
          formatMoney(row.total),
          formatMoney(row.returnedValue),
        ])}
        title="Ventas de mostrador"
      />
      <RecentTable
        columns={["Orden", "Fecha", "Sucursal", "Estado", "Líneas", "Cantidad pedida", "Cantidad recibida"]}
        empty="Sin órdenes de compra en el periodo."
        footer={<Pager href={(page) => href({ pc: String(page) })} page={pos.purchases} />}
        rows={pos.purchases.rows.map((row) => [
          row.code,
          formatDate(row.createdAt),
          row.branchName,
          row.statusLabel,
          String(row.lines),
          row.orderedQuantity,
          row.receivedQuantity,
        ])}
        title="Compras de repuestos"
      />
    </>
  );
}

function Pager({
  href,
  page,
}: {
  href: (page: number) => string;
  page: { page: number; pageSize: number; total: number };
}) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-600"
    >
      <span>
        Página {Math.min(page.page, pages)} de {pages} · {page.total} registros
      </span>
      <span className="flex gap-3">
        {page.page > 1 ? (
          <Link className="font-semibold text-blue-700 hover:underline" href={href(page.page - 1)}>
            Anterior
          </Link>
        ) : null}
        {page.page < pages ? (
          <Link className="font-semibold text-blue-700 hover:underline" href={href(page.page + 1)}>
            Siguiente
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

function RecentTable({
  columns,
  empty,
  footer,
  rows,
  title,
}: {
  columns: string[];
  empty: string;
  footer?: React.ReactNode;
  rows: string[][];
  title: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 p-5">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th className="px-4 py-3 font-semibold" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td
                      className={index === 0 ? "px-4 py-3 font-mono text-xs text-slate-700" : "px-4 py-3 text-slate-600"}
                      key={`${row[0]}-${index}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-5 text-sm text-slate-500">{empty}</p>
      )}
      {footer}
    </Card>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es-NI", { dateStyle: "medium" }).format(new Date(value));
}
