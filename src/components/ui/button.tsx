import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/70",
  {
    variants: {
      variant: {
        default:
          "bg-red-600 text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] hover:bg-red-500",
        secondary:
          "border border-white/10 bg-white/[0.06] text-zinc-100 hover:bg-white/[0.1]",
        ghost: "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
        danger:
          "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
        success:
          "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-xs",
        icon: "h-11 w-11",
        wide: "h-12 px-8",
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
