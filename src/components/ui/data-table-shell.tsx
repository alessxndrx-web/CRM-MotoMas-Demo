import * as React from "react";

import { cn } from "@/lib/utils";

export function DataTableShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm",
        "[&_table]:w-full [&_table]:text-sm",
        "[&_thead]:bg-slate-50 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500",
        "[&_tbody_tr]:border-t [&_tbody_tr]:border-slate-100 [&_tbody_tr:hover]:bg-slate-50",
        "[&_td]:px-4 [&_td]:py-3 [&_td]:text-slate-700",
        className,
      )}
    >
      {children}
    </div>
  );
}
