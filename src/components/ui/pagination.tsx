"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — pagination (Patch POS2.0-A).
 *
 * ## It states the range, not just the page
 *
 * "Página 3 de 12" tells the user nothing actionable. **"41–60 de 237"** tells
 * them how far in they are, how much is left, and whether the filter worked —
 * three questions a page number cannot answer.
 *
 * ## The page size belongs here
 *
 * Every table in the panel already offers rows-per-page, and every one of them
 * drew its own select. This is that control, once, next to the numbers it
 * changes.
 *
 * ## Windowed page buttons
 *
 * At 237 pages a full list of buttons is unusable, so the window shows the
 * current page with a neighbour either side plus the first and last, and marks
 * the gaps. First and last stay because "jump to the end" is a real intent —
 * that is where the oldest records are.
 */
function buildWindow(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1]);
  const ordered = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((left, right) => left - right);

  const output: Array<number | "gap"> = [];
  let previous = 0;
  for (const value of ordered) {
    if (previous && value - previous > 1) output.push("gap");
    output.push(value);
    previous = value;
  }
  return output;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 25, 50, 100],
  className,
}: {
  /** 1-indexed. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  className?: string;
}) {
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const window = buildWindow(page, pageCount);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3",
        className,
      )}
    >
      <p className="sb-numeric text-xs text-slate-500">
        {total === 0 ? (
          "Sin resultados"
        ) : (
          <>
            <span className="font-semibold text-slate-700">
              {from}–{to}
            </span>{" "}
            de {total}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Filas
            <Select
              className="w-[4.5rem]"
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              size="sm"
              value={pageSize}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
        ) : null}

        <nav aria-label="Paginación" className="flex items-center gap-1">
          <PageButton
            aria-label="Página anterior"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </PageButton>

          {window.map((entry, index) =>
            entry === "gap" ? (
              <span
                aria-hidden
                className="px-1 text-xs text-slate-400"
                key={`gap-${index}`}
              >
                …
              </span>
            ) : (
              <PageButton
                aria-current={entry === page ? "page" : undefined}
                active={entry === page}
                key={entry}
                onClick={() => onPageChange(entry)}
              >
                {entry}
              </PageButton>
            ),
          )}

          <PageButton
            aria-label="Página siguiente"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </PageButton>
        </nav>
      </div>
    </div>
  );
}

function PageButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "sb-focus grid h-8 min-w-8 place-items-center rounded-md px-2 text-xs font-semibold transition-colors",
        active
          ? "bg-blue-600 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      type="button"
      {...props}
    />
  );
}
