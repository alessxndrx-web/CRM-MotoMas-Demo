import * as React from "react";

import { cn } from "@/lib/utils";

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

export function Badge({
  className,
  tone = "gray",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
