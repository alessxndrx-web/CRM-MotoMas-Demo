"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SectionTabItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
};

export function SectionTabs({
  items,
  activeHref,
  className,
}: {
  items: SectionTabItem[];
  activeHref: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Secciones"
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-slate-200",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.href === activeHref;
        return (
          <Link
            className={cn(
              "flex min-w-max items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900",
            )}
            href={item.href}
            key={item.href}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
