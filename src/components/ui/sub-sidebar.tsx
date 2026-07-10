"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

export type SubSidebarGroup = {
  label: string;
  items: { href: string; label: string }[];
};

export function SubSidebar({
  groups,
  activeHref,
  className,
}: {
  groups: SubSidebarGroup[];
  activeHref: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Navegación de sección"
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-3 shadow-sm",
        className,
      )}
    >
      {groups.map((group, index) => (
        <div className={index > 0 ? "mt-5" : undefined} key={group.label}>
          <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {group.label}
          </div>
          <div className="mt-1.5 grid gap-0.5">
            {group.items.map((item) => {
              const active = item.href === activeHref;
              return (
                <Link
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
