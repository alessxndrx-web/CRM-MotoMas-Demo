import * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
