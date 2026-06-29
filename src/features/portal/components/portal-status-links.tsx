"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

export type PortalStatusItem = {
  href: string;
  label: string;
};

const preservedParams = ["codigo", "expediente", "telefono", "cedula"] as const;

export function PortalStatusLinks({ items }: { items: PortalStatusItem[] }) {
  const searchParams = useSearchParams();
  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    preservedParams.forEach((key) => {
      const value = searchParams.get(key);
      if (value?.trim()) params.set(key, value.trim());
    });

    const value = params.toString();
    return value ? `?${value}` : "";
  }, [searchParams]);

  return <PortalStaticStatusLinks items={items} queryString={queryString} />;
}

export function PortalStaticStatusLinks({
  items,
  queryString = "",
}: {
  items: PortalStatusItem[];
  queryString?: string;
}) {
  return (
    <>
      {items.map((item) => (
        <Link
          className={cn(
            "rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-300 transition",
            "hover:border-red-500/35 hover:text-white",
          )}
          href={`${item.href}${queryString}`}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </>
  );
}
