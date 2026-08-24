import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — table primitives (Patch POS2.0-A).
 *
 * The table is the product. A dashboard is looked at once a day; a table is
 * worked in for hours, and everything here is chosen for that.
 *
 * `DataTableShell` already styled tables through descendant selectors, which is
 * fine for a plain table and gives no way to say "this column is numeric" or
 * "this row is cancelled". These primitives make those statements explicit
 * **without replacing the shell**: `DataTableShell` still owns the frame, and
 * every existing table keeps rendering exactly as it does.
 *
 * ## Rules the components enforce
 *
 * - **Numbers right, text left.** A number column read left-aligned cannot be
 *   scanned for magnitude, which is the only reason to put numbers in a column.
 * - **Headers are labels, not sentences.** Uppercase, small, muted — they should
 *   disappear once you know the table.
 * - **One action column, on the right**, because that is where the eye ends.
 */

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table
      className={cn("w-full border-collapse text-sm", className)}
      {...props}
    />
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("border-b border-slate-200 bg-slate-50", className)}
      {...props}
    />
  );
}

export function TBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}

/**
 * A header cell.
 *
 * `align="right"` is the numeric column. `align="center"` exists for a single
 * icon or a checkbox and nothing else — centred text in a table is unreadable
 * down the page because its left edge moves with every row.
 */
export function TH({
  className,
  align = "left",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
        className,
      )}
      scope="col"
      {...props}
    />
  );
}

/**
 * A row.
 *
 * `muted` is for records that still exist but no longer act — a cancelled order,
 * a deactivated product. **It dims, it does not hide**: an ERP that hides
 * cancelled documents is an ERP whose users cannot audit anything.
 */
export function TR({
  className,
  muted,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  muted?: boolean;
  interactive?: boolean;
}) {
  return (
    <tr
      className={cn(
        "border-b border-slate-100 last:border-b-0",
        interactive ? "cursor-pointer transition-colors hover:bg-slate-50" : null,
        muted ? "bg-slate-50/60 text-slate-400" : null,
        className,
      )}
      {...props}
    />
  );
}

/**
 * A body cell.
 *
 * `numeric` right-aligns **and** switches on tabular figures, because the two
 * always travel together: a right-aligned column of proportional digits still
 * fails to line up at the decimal point.
 */
export function TD({
  className,
  align,
  numeric,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
  numeric?: boolean;
}) {
  const resolved = align ?? (numeric ? "right" : "left");
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle text-slate-700",
        numeric ? "sb-numeric" : null,
        resolved === "right"
          ? "text-right"
          : resolved === "center"
            ? "text-center"
            : "text-left",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The actions cell: right-aligned, tight, never wrapping.
 *
 * Two actions inline; three or more belong in a `DropdownMenu`. A row with five
 * links is a row the eye has to parse before it can move on.
 */
export function TDActions({
  className,
  children,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-2 text-right", className)} {...props}>
      <div className="flex items-center justify-end gap-1">{children}</div>
    </td>
  );
}

/**
 * The full-width message row used for "no results" inside a rendered table.
 *
 * Distinct from `EmptyState`: that one is for a section that has never held
 * data, this one is for a table whose filters excluded everything. The
 * difference matters to the user — one says "start here", the other says "your
 * filter is too narrow".
 */
export function TableEmptyRow({
  colSpan,
  children = "No hay resultados con los filtros aplicados.",
}: {
  colSpan: number;
  children?: React.ReactNode;
}) {
  return (
    <tr>
      <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={colSpan}>
        {children}
      </td>
    </tr>
  );
}
