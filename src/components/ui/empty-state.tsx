import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100">
          <Icon className="h-5 w-5 text-slate-400" />
        </span>
      ) : null}
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
