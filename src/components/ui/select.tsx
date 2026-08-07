import { ChevronDown } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — select (Patch POS2.0-A).
 *
 * **A native `<select>`, deliberately.**
 *
 * Before POS2.0-A every screen hand-rolled the same 200-character class string
 * onto a bare `<select>` — the cart, the cash panel, the purchases screen — and
 * they had already drifted apart. This is that string, once.
 *
 * The native element is not a fallback here, it is the right choice: it gets
 * type-ahead, mobile wheel pickers, screen-reader support and keyboard handling
 * from the platform, none of which a custom listbox reproduces for free. When a
 * picker genuinely needs search or rich rows, that is a `SearchSelect` built on
 * `DropdownMenu` — a different component for a different problem, not a
 * replacement for this one.
 */
export function Select({
  className,
  size = "md",
  invalid,
  children,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  /**
   * Renamed away from the native `size`, which is a row count on `<select>`.
   * Keeping both names on one prop would make `size="sm"` mean "one row" to the
   * platform and "compact" to us.
   */
  size?: "sm" | "md";
  /** Draws the danger border. Pair it with the error text on `Field`. */
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(
          "sb-focus w-full appearance-none rounded-md border bg-white pl-3 pr-9 text-sm text-slate-900 transition-colors",
          "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
          size === "sm" ? "h-8 text-xs" : "h-10",
          invalid
            ? "border-red-400 hover:border-red-500"
            : "border-slate-300 hover:border-slate-400",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
}
