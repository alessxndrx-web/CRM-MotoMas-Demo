import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — button.
 *
 * ## One primary action per view
 *
 * `default` is the action the screen exists for. A screen with three blue
 * buttons has no primary action, only three things competing — which is how a
 * user ends up clicking the wrong one at the counter.
 *
 * - `default` — the one thing this screen is for.
 * - `secondary` — everything else that is safe. Cancel lives here.
 * - `ghost` — actions inside a row or a toolbar, where a border would add noise.
 * - `danger` — **irreversible only.** Not "delete a draft", which is reversible
 *   by retyping it; red is for anulaciones and destructive writes.
 * - `success` — confirmations that complete a flow. Rare on purpose: green
 *   everywhere is green nowhere.
 *
 * Sizes track `--sb-control-*`, which is why a button and an input placed side
 * by side line up.
 *
 * Patch POS2.0-A switched the focus ring to `.sb-focus`, the single ring shared
 * by every interactive element. The rendered ring is the same blue as before.
 */
const buttonVariants = cva(
  "sb-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
        secondary:
          "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
        success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "h-10 w-10",
        wide: "h-11 px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      type={type}
      {...props}
    />
  );
}
