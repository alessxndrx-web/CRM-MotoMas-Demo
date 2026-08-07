"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — in-page navigation (Patch POS2.0-A).
 *
 * `SectionTabs` already covers **link** tabs, where each tab is a route. These
 * cover the two cases it cannot: tabs that switch state without navigating, and
 * the trail that says where you are.
 */

/* -------------------------------------------------------------------------
 * Tabs (state, not routes)
 * ---------------------------------------------------------------------- */

export type TabItem = {
  id: string;
  label: string;
  /** Rendered as a count pill. Zero is shown — "0 pendientes" is information. */
  count?: number;
  disabled?: boolean;
};

/**
 * Tabs that switch a panel without changing the URL.
 *
 * **Use routes when the view is worth linking to**, which in an ERP is most of
 * the time: a colleague should be able to paste the URL of "facturas vencidas".
 * These are for the remaining case — two views of the same data where nobody
 * would ever share the second.
 *
 * Arrow keys move between tabs, as the tab pattern requires: `Tab` itself must
 * move **out** of the tablist, not along it.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  className?: string;
}) {
  const enabled = items.filter((item) => !item.disabled);

  function handleKey(event: React.KeyboardEvent) {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const index = enabled.findIndex((item) => item.id === value);
    const next = enabled[(index + delta + enabled.length) % enabled.length];
    if (next) onValueChange(next.id);
  }

  return (
    <div
      className={cn("flex gap-1 overflow-x-auto border-b border-slate-200", className)}
      onKeyDown={handleKey}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            aria-selected={active}
            className={cn(
              "sb-focus flex min-w-max items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900",
              item.disabled ? "cursor-not-allowed opacity-40" : null,
            )}
            disabled={item.disabled}
            key={item.id}
            onClick={() => onValueChange(item.id)}
            role="tab"
            tabIndex={active ? 0 : -1}
            type="button"
          >
            {item.label}
            {item.count !== undefined ? (
              <span
                className={cn(
                  "sb-numeric rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Breadcrumbs
 * ---------------------------------------------------------------------- */

export type Crumb = { label: string; href?: string };

/**
 * The trail back up.
 *
 * **Only for screens more than one level deep.** A breadcrumb on a top-level
 * page is decoration, and decoration in a dense interface is noise.
 *
 * The last crumb is the current page: not a link, and marked `aria-current`.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Ruta" className={cn("flex items-center gap-1 text-xs", className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-slate-300" />
            ) : null}
            {last || !item.href ? (
              <span
                aria-current={last ? "page" : undefined}
                className={cn(
                  "truncate",
                  last ? "font-semibold text-slate-700" : "text-slate-500",
                )}
              >
                {item.label}
              </span>
            ) : (
              <Link
                className="sb-focus truncate rounded text-slate-500 transition-colors hover:text-slate-900"
                href={item.href}
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* -------------------------------------------------------------------------
 * Toolbar
 * ---------------------------------------------------------------------- */

/**
 * The strip above a table: search on the left, filters beside it, actions right.
 *
 * **The order is the point.** Every list screen in the panel had invented its own
 * arrangement, so moving between Clientes and Compras meant re-finding the search
 * box. One layout, everywhere: the eye stops hunting.
 */
export function Toolbar({
  children,
  actions,
  className,
}: {
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
