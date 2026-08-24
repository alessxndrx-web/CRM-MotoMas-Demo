import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — text input.
 *
 * The base field every other one composes: `SearchField`, `MoneyInput`,
 * `QuantityInput` and `DateInput` all wrap this rather than redeclaring it.
 *
 * Patch POS2.0-A added the shared `.sb-focus` ring and a hover border, and kept
 * the resting appearance identical so no existing form shifts.
 */
type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "sb-focus h-10 w-full rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
