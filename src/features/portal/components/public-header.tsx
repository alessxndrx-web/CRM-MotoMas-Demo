"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useMemo, useState } from "react";

import { btnAccent } from "@/features/portal/components/ui";
import { cn } from "@/lib/utils";

const mainNav = [
  { href: "/", label: "Inicio" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/consultar-expediente", label: "Consultar solicitud" },
];

const trackingNav = [
  { href: "/mi-credito", label: "Mi crédito" },
  { href: "/mi-reserva", label: "Mi reserva" },
  { href: "/mi-entrega", label: "Mi entrega" },
];

const preservedParams = ["codigo", "expediente", "telefono", "cedula"] as const;

export function PublicHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const trackingQuery = useMemo(() => {
    const params = new URLSearchParams();
    preservedParams.forEach((key) => {
      const value = searchParams.get(key);
      if (value?.trim()) params.set(key, value.trim());
    });
    const value = params.toString();
    return value ? `?${value}` : "";
  }, [searchParams]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link className="flex shrink-0 items-center gap-2" href="/" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="MotoMas"
            className="h-9 w-auto object-contain"
            src="/showroom/logo/motomas-logo.png"
          />
        </Link>

        <nav aria-label="Navegación" className="hidden items-center gap-1 lg:flex">
          {mainNav.map((item) => (
            <NavLink key={item.href} active={isActive(item.href)} href={item.href}>
              {item.label}
            </NavLink>
          ))}
          {trackingNav.map((item) => (
            <NavLink
              key={item.href}
              active={isActive(item.href)}
              href={`${item.href}${trackingQuery}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden lg:block">
          <Link className={cn(btnAccent, "h-10 px-4")} href="/solicitar-informacion">
            Solicitar información
          </Link>
        </div>

        <button
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 text-slate-700 lg:hidden"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <nav aria-label="Navegación móvil" className="mx-auto grid max-w-[1240px] gap-1 px-4 py-4 sm:px-6">
            {[...mainNav, ...trackingNav].map((item) => {
              const isTracking = trackingNav.some((entry) => entry.href === item.href);
              return (
                <Link
                  key={item.href}
                  className={cn(
                    "rounded-xl px-4 py-3 text-base font-semibold transition",
                    isActive(item.href)
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-slate-50",
                  )}
                  href={`${item.href}${isTracking ? trackingQuery : ""}`}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              className={cn(btnAccent, "mt-2 w-full")}
              href="/solicitar-informacion"
              onClick={() => setOpen(false)}
            >
              Solicitar información
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

function NavLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-semibold transition",
        active ? "text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}
