import * as React from "react";

import { cn } from "@/lib/utils";

const tones = {
  red: "border-red-500/30 bg-red-500/10 text-red-400",
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  yellow: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  gray: "border-white/10 bg-white/[0.06] text-zinc-300",
};

export function Badge({
  className,
  tone = "gray",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
