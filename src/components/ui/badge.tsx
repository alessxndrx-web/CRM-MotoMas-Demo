import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — badge, and the status chip.
 *
 * ## One component, two jobs
 *
 * A badge labels; a status chip labels **a state in a lifecycle**. They render
 * identically, so they are one component — adding `StatusChip` as a separate
 * file would be the duplication this system exists to prevent.
 *
 * ## Canonical tones
 *
 * `slate` neutral · `blue` in progress · `green` settled · `amber` needs
 * attention · `red` failed or cancelled.
 *
 * `emerald`, `yellow` and `gray` are aliases kept because screens already use
 * them; they render the same as their canonical name. New code should use the
 * canonical set. See `docs/design-system.md`.
 */
const tones = {
  red: "border-red-200 bg-red-50 text-red-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  yellow: "border-amber-200 bg-amber-50 text-amber-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  gray: "border-slate-200 bg-slate-100 text-slate-600",
  slate: "border-slate-200 bg-slate-100 text-slate-600",
};

const dotTones: Record<keyof typeof tones, string> = {
  red: "bg-red-500",
  green: "bg-emerald-500",
  emerald: "bg-emerald-500",
  yellow: "bg-amber-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  orange: "bg-orange-500",
  gray: "bg-slate-400",
  slate: "bg-slate-400",
};

export function Badge({
  className,
  tone = "gray",
  dot,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: keyof typeof tones;
  /**
   * Patch POS2.0-A. Adds a leading dot, for a column of states read at speed.
   *
   * It also carries the meaning **without colour**: in a status column, the dot
   * plus the word is legible to a user who cannot separate the green from the
   * amber, which the fill alone is not.
   */
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTones[tone])}
        />
      ) : null}
      {children}
    </span>
  );
}
