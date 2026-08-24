"use client";

import { Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { PosPurchaseEventDTO } from "@/server/pos/shared";

/**
 * Patch POS1.2-E — la historia de una orden de compra.
 *
 * **Deliberadamente pequeño.** No rediseña el módulo de compras: es la sección
 * de actividad que faltaba, con la misma forma visual que
 * `FinancialAuditTimeline` ya usa en Contabilidad. No se extrajo un componente
 * compartido porque los dos consumen DTOs distintos y una abstracción para dos
 * usos con campos diferentes cuesta más de lo que ahorra.
 *
 * ## Lo que enseña, y lo que no
 *
 * Enseña **qué pasó, cuándo, quién, cuánto y por qué**. No enseña identificadores
 * de movimiento, ni tipos internos, ni nada del ledger: los movimientos de
 * inventario son un detalle de implementación, y el historial debe entenderse sin
 * saber que existen.
 *
 * ## La ausencia también es información
 *
 * Una orden sin eventos no muestra una lista vacía y ya: dice que su historial
 * empieza con POS1.2-E. Las órdenes anteriores no tienen eventos **y no se les
 * fabricaron**, así que decirlo es la única lectura honesta.
 */
function formatMoment(value: string) {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-NI", { maximumFractionDigits: 3 }).format(value);
}

export function PosPurchaseHistory({
  events,
  title = "Historial de la orden",
}: {
  events: PosPurchaseEventDTO[];
  title?: string;
}) {
  return (
    <section
      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      data-testid="compras-historial"
    >
      <div className="flex items-center gap-2">
        <Clock3 aria-hidden className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>

      {events.length ? (
        <ol className="mt-3 space-y-2">
          {events.map((event) => (
            <li
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              data-testid="compras-evento"
              key={event.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge dot tone={event.tone}>
                      {event.typeLabel}
                    </Badge>
                    {event.quantity !== null ? (
                      <span className="sb-numeric text-sm font-semibold text-slate-900">
                        {formatQuantity(event.quantity)}
                        {event.unitLabel ? (
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            {event.unitLabel}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {event.productName ? (
                      <span className="truncate text-sm text-slate-700">
                        {event.productName}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.actorName} · {formatMoment(event.at)}
                  </p>
                  {event.reason ? (
                    <p className="mt-1 text-xs text-slate-600">{event.reason}</p>
                  ) : null}
                </div>
                {event.productSku ? (
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    {event.productSku}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-slate-500" data-testid="compras-sin-historial">
          Esta orden no tiene historial registrado. La trazabilidad empieza con las
          operaciones hechas a partir de ahora; lo anterior no se reconstruye
          porque no quedó registrado.
        </p>
      )}
    </section>
  );
}
