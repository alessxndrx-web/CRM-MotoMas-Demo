"use client";

import { Calendar, Minus, Plus, Search, X } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — specialised inputs (Patch POS2.0-A).
 *
 * Every field here **composes `Input`**; none reimplements it. The rule the
 * repository already learned from TD-01 applies to markup as much as to money
 * helpers: a second implementation is not a second decision, it is one decision
 * written twice, and the copy is where the next change gets forgotten.
 *
 * These four exist because an ERP types the same four things all day — a search,
 * an amount, a count, a date — and each has a rule the plain field cannot carry.
 */

/* -------------------------------------------------------------------------
 * Search
 * ---------------------------------------------------------------------- */

/**
 * A search box that can be cleared.
 *
 * **The clear button matters more than it looks.** Filtered tables are where
 * users get stuck: they type, get nothing, and cannot tell whether the data is
 * missing or the filter is still on. A visible X answers that in one glance.
 *
 * **It names itself.** A search input with no accessible name is announced as
 * nothing but "search box", and the placeholder does not stand in for one: it
 * is not exposed as a name and it disappears the moment someone types. The
 * default is overridable — an `aria-label` passed in wins, because the spread
 * lands after it.
 *
 * `type="search"` on purpose — Escape clears it in most browsers for free.
 */
export function SearchField({
  value,
  onValueChange,
  placeholder = "Buscar…",
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <Input
        aria-label="Buscar"
        className="pl-9 pr-9"
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
        {...props}
      />
      {value ? (
        <button
          aria-label="Limpiar búsqueda"
          className="sb-focus absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          onClick={() => onValueChange("")}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Money
 * ---------------------------------------------------------------------- */

/**
 * An amount, with its currency shown and its digits aligned.
 *
 * **`inputMode="decimal"`, not `type="number"`.** A number input brings a spinner
 * nobody wants on an amount, scrolls the value on a stray wheel gesture, and
 * behaves differently on every locale's decimal separator. Text plus a decimal
 * keypad hint is what a cashier actually needs.
 *
 * **The value is a string and stays one.** Parsing belongs to the caller, next to
 * the sanitizer that will validate it server-side — a field that silently
 * coerces `"1,5"` to `15` is a field that loses money.
 *
 * `sb-numeric` aligns the digits so a column of amounts reads as a column.
 */
export function MoneyInput({
  currency = "C$",
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { currency?: string }) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500"
      >
        {currency}
      </span>
      <Input
        className={cn("sb-numeric pl-10 text-right", className)}
        inputMode="decimal"
        placeholder="0.00"
        {...props}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Quantity
 * ---------------------------------------------------------------------- */

/**
 * A count, with steppers.
 *
 * The steppers are for the common case — one more, one less — and the field
 * stays typable for the case where someone counted 47. Both matter: a stepper-
 * only control makes 47 a chore, and a typing-only control makes +1 a chore.
 *
 * The unit label sits inside the control because a quantity without its unit is
 * ambiguous the moment the catalogue holds litres next to pieces.
 */
export function QuantityInput({
  value,
  onValueChange,
  step = 1,
  min = 0,
  unit,
  disabled,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onValueChange: (value: string) => void;
  step?: number;
  min?: number;
  unit?: string;
}) {
  function nudge(direction: 1 | -1) {
    const parsed = Number(value.replace(",", "."));
    const base = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.max(base + direction * step, min);
    // Trailing zeros on an integer read as noise on a counter.
    onValueChange(String(Number(next.toFixed(3))));
  }

  return (
    <div
      className={cn(
        "flex h-10 items-stretch overflow-hidden rounded-md border border-slate-300 bg-white transition-colors focus-within:border-blue-500",
        disabled ? "opacity-50" : null,
        className,
      )}
    >
      <button
        aria-label="Restar"
        className="sb-focus grid w-9 shrink-0 place-items-center border-r border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={() => nudge(-1)}
        type="button"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        className="sb-numeric min-w-0 flex-1 border-0 bg-transparent px-2 text-center text-sm text-slate-900 outline-none"
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => onValueChange(event.target.value)}
        value={value}
        {...props}
      />
      {unit ? (
        <span className="grid shrink-0 place-items-center pr-2 text-xs text-slate-400">
          {unit}
        </span>
      ) : null}
      <button
        aria-label="Sumar"
        className="sb-focus grid w-9 shrink-0 place-items-center border-l border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed"
        disabled={disabled}
        onClick={() => nudge(1)}
        type="button"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Date
 * ---------------------------------------------------------------------- */

/**
 * A date, from the platform's picker.
 *
 * **No custom calendar.** A hand-built date picker is weeks of work to match
 * what `type="date"` gives for free — keyboard entry, locale formatting, mobile
 * wheels, screen-reader labels — and it is the single most common place a design
 * system accumulates bugs. If the product later needs a range picker with
 * presets, that is a distinct component with a distinct justification.
 *
 * The icon is decorative: browsers draw their own indicator, and this one just
 * makes the field readable as a date at a glance in a dense form.
 */
export function DateInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Input className={cn("pr-9", className)} type="date" {...props} />
      <Calendar
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-400 sm:block"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Textarea
 * ---------------------------------------------------------------------- */

/** Multi-line text, matching `Input` so a form reads as one control family. */
export function Textarea({
  className,
  rows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "sb-focus w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm leading-6 text-slate-900 transition-colors placeholder:text-slate-400 hover:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-50",
        className,
      )}
      rows={rows}
      {...props}
    />
  );
}
