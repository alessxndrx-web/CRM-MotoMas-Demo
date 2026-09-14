"use client";

import Link from "next/link";
import { AlertTriangle, UserRoundCog } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchField } from "@/components/ui/fields";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import type { SellerPerformanceDTO } from "@/server/analytics/shared";
import { cn } from "@/lib/utils";

/**
 * Patch CRM-AUD1 — el equipo de ventas, contra la base de datos.
 *
 * ## Qué reemplaza
 *
 * `/panel/vendedores` era la única pantalla del CRM **sin ninguna autorización
 * de servidor**: la página era `export default function SellersPage() { return
 * <SellersPanel /> }`, sin `requireAuth` y sin predicado. Lo único que separaba
 * a un vendedor de la supervisión de su sucursal era un `if` de cliente que leía
 * el rol de `localStorage` — un valor que el propio usuario puede editar desde
 * la consola del navegador.
 *
 * Además no mostraba datos reales: leía los servicios de `localStorage` y sacaba
 * la lista de vendedores de `demoInternalUsers`, una lista **fija de demo**. Con
 * una base configurada, la pantalla enseñaba vendedores que no existen con
 * métricas que no son de nadie, y una insignia «Activo» codificada a mano para
 * todos.
 *
 * ## Qué hace ahora
 *
 * Recibe `SellerPerformanceDTO[]` ya resuelto y acotado por el servidor. Cada
 * cifra enlaza a la pantalla donde se trabaja ese pendiente: no es un tablero
 * para mirar, es una lista de trabajo.
 */
export function SellersDbPanel({
  dbConfigured,
  scopeLabel,
  sellers,
}: {
  dbConfigured: boolean;
  scopeLabel: string;
  sellers: SellerPerformanceDTO[];
}) {
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sellers;
    return sellers.filter(
      (seller) =>
        seller.sellerName.toLowerCase().includes(needle) ||
        seller.branchName.toLowerCase().includes(needle),
    );
  }, [query, sellers]);

  const totals = useMemo(
    () =>
      sellers.reduce(
        (acc, seller) => ({
          leads: acc.leads + seller.leads,
          overdue: acc.overdue + seller.activitiesOverdue,
          reservations: acc.reservations + seller.reservationsActive,
          sales: acc.sales + seller.salesCompleted,
        }),
        { leads: 0, overdue: 0, reservations: 0, sales: 0 },
      ),
    [sellers],
  );

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel="Equipo de ventas"
            technicalLabel="Vendedores · Base de datos (fuente principal)"
          />
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
            {scopeLabel}
          </span>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <UserRoundCog className="h-5 w-5" />
        </div>
      </div>

      <PrimarySectionDescription
        businessText="La carga de trabajo de tu equipo. Cada cifra lleva a la pantalla donde se resuelve: no es un tablero para mirar, es una lista de pendientes."
        technicalText="Desempeño por vendedor respaldado por PostgreSQL, acotado por el
        alcance del solicitante. Las cifras se derivan de leads, actividades,
        expedientes, reservas, ventas y créditos reales."
      />

      {!dbConfigured ? (
        <SectionUnavailableNotice
          businessText="Esta sección aún no está disponible."
          technicalText={
            <>
              Esta sección requiere <code>DATABASE_URL</code> configurado.
            </>
          }
        />
      ) : (
        <>
          {sellers.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryTile label="Leads del equipo" value={totals.leads} />
              <SummaryTile
                href="/panel/actividades"
                label="Actividades vencidas"
                tone={totals.overdue > 0 ? "warning" : "neutral"}
                value={totals.overdue}
              />
              <SummaryTile
                href="/panel/reservas"
                label="Reservas activas"
                value={totals.reservations}
              />
              <SummaryTile
                href="/panel/ventas"
                label="Ventas cerradas"
                value={totals.sales}
              />
            </div>
          ) : null}

          <div className="mt-5">
            <SearchField
              onValueChange={setQuery}
              placeholder="Buscar por nombre o sucursal"
              value={query}
            />
          </div>

          <div className="mt-5 overflow-x-auto">
            <div className="min-w-[940px] overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[1.5fr_repeat(6,0.8fr)] border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <div>Vendedor</div>
                <div className="text-right">Leads</div>
                <div className="text-right">Pendientes</div>
                <div className="text-right">Vencidas</div>
                <div className="text-right">Expedientes</div>
                <div className="text-right">Reservas</div>
                <div className="text-right">Ventas</div>
              </div>

              {visible.length ? (
                visible.map((seller) => (
                  <div
                    className="grid grid-cols-[1.5fr_repeat(6,0.8fr)] items-center gap-2 border-b border-slate-100 px-5 py-4 last:border-b-0"
                    key={seller.sellerId}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-slate-900">
                        {seller.sellerName}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="truncate text-xs text-slate-500">
                          {seller.branchName}
                        </span>
                        {seller.roleLabel === "Líder de Ventas" ? (
                          <Badge tone="blue">Líder</Badge>
                        ) : null}
                      </div>
                    </div>
                    <Metric value={seller.leads} />
                    <Metric value={seller.activitiesPending} />
                    <Metric
                      tone={seller.activitiesOverdue > 0 ? "warning" : "neutral"}
                      value={seller.activitiesOverdue}
                    />
                    <Metric value={seller.expedientes} />
                    <Metric value={seller.reservationsActive} />
                    <Metric tone="strong" value={seller.salesCompleted} />
                  </div>
                ))
              ) : (
                <EmptyState
                  description={
                    query
                      ? "Ningún vendedor coincide con la búsqueda."
                      : "Cuando tu sucursal tenga vendedores activos, su carga de trabajo aparecerá aquí."
                  }
                  icon={UserRoundCog}
                  title={
                    query ? "Sin coincidencias" : "Aún no hay vendedores en tu alcance"
                  }
                  variant={query ? "no-results" : "empty"}
                />
              )}
            </div>
          </div>

          {sellers.some((seller) => seller.creditsInReview > 0) ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
              <AlertTriangle aria-hidden className="h-4 w-4 text-amber-500" />
              Hay créditos en revisión en el equipo.{" "}
              <Link
                className="sb-focus rounded font-semibold text-blue-700 hover:underline"
                href="/panel/creditos"
              >
                Revisarlos
              </Link>
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function Metric({
  value,
  tone = "neutral",
}: {
  value: number;
  tone?: "neutral" | "warning" | "strong";
}) {
  return (
    <div
      className={cn(
        "text-right text-sm tabular-nums",
        tone === "warning" && value > 0
          ? "font-semibold text-amber-700"
          : tone === "strong"
            ? "font-semibold text-slate-900"
            : "text-slate-600",
      )}
    >
      {value}
    </div>
  );
}

/**
 * Una cifra del encabezado. Enlaza a donde se resuelve el pendiente: un numero
 * que no lleva a sus registros obliga a buscarlos a mano, que es justo lo que
 * un panel de supervision debe ahorrar.
 */
function SummaryTile({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "neutral" | "warning";
}) {
  const body = (
    <>
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "warning" && value > 0 ? "text-amber-700" : "text-slate-900",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
    </>
  );

  if (!href) {
    return (
      <div className="rounded-xl border border-slate-200 px-4 py-3">{body}</div>
    );
  }

  return (
    <Link
      className="sb-focus rounded-xl border border-slate-200 px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
      href={href}
    >
      {body}
    </Link>
  );
}
