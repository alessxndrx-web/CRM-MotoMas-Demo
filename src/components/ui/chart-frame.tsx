import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — chart frame and palette (Patch POS2.0-A).
 *
 * ## There is no charting library, and this patch does not add one
 *
 * The repository has no chart dependency, and POS2.0-A is scoped to the design
 * system — picking a charting library is a real architectural decision (bundle
 * size, SSR behaviour, accessibility of the rendered output) that deserves its
 * own patch and its own justification.
 *
 * What the design system **can** settle now is everything around the plot: the
 * frame, the palette, the empty state, and the rule that a chart always states
 * its own numbers. When a library arrives it renders inside `ChartFrame` and
 * consumes `chartSeriesColors`; nothing here changes.
 *
 * ## The rules
 *
 * - **A chart never stands alone.** Every chart carries the figure it visualises
 *   as text, because a bar the user cannot read a number off is decoration. The
 *   inspiration screenshots show this failing: several charts render an empty
 *   axis with no value anywhere on screen.
 * - **Colour is not the only encoding.** Series are distinguished by order and
 *   label too; ~8% of men cannot separate the red and green in a margin chart.
 * - **The empty state says why**, not just that. "Sin ventas en el período" is
 *   actionable; a blank grid is not.
 */

/**
 * Categorical series colours, in the order they should be assigned.
 *
 * Ordered for **maximum separation between neighbours**, so a two-series chart
 * — the common case — is blue against amber, which stays distinguishable in
 * greyscale and under the most frequent forms of colour blindness. Reds are late
 * in the list on purpose: red carries meaning elsewhere in this system, and a
 * neutral series painted red reads as a problem.
 */
export const chartSeriesColors = [
  "#2563eb",
  "#f59e0b",
  "#0d9488",
  "#7c3aed",
  "#0284c7",
  "#65a30d",
] as const;

/** Semantic colours for charts that encode direction rather than category. */
export const chartSemanticColors = {
  positive: "#059669",
  negative: "#dc2626",
  neutral: "#94a3b8",
  projected: "#cbd5e1",
} as const;

export function ChartFrame({
  title,
  description,
  actions,
  /** The headline figure. Required in spirit: a chart without one is a picture. */
  value,
  valueHint,
  height = 260,
  empty,
  emptyLabel = "Sin datos en el período seleccionado.",
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  value?: React.ReactNode;
  valueHint?: React.ReactNode;
  height?: number;
  empty?: boolean;
  emptyLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </header>

      {value !== undefined ? (
        <p className="sb-numeric mt-3 text-2xl font-semibold text-slate-900">
          {value}
          {valueHint ? (
            <span className="ml-2 text-xs font-medium text-slate-500">{valueHint}</span>
          ) : null}
        </p>
      ) : null}

      <div className="mt-4" style={{ height }}>
        {empty ? (
          <div className="grid h-full place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60">
            <p className="px-6 text-center text-sm text-slate-500">{emptyLabel}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/**
 * The legend, as a component, so every chart labels its series the same way.
 *
 * Swatches are squares with a border rather than bare fills: a 10px unbordered
 * dot of a light colour disappears on a white card.
 */
export function ChartLegend({
  series,
  className,
}: {
  series: Array<{ label: string; color: string; value?: React.ReactNode }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1", className)}>
      {series.map((item) => (
        <li className="flex items-center gap-2 text-xs text-slate-600" key={item.label}>
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10"
            style={{ backgroundColor: item.color }}
          />
          {item.label}
          {item.value !== undefined ? (
            <span className="sb-numeric font-semibold text-slate-900">{item.value}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
