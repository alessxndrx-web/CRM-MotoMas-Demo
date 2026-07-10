"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useMemo, useState } from "react";

import { PortalLogo } from "@/features/portal/components/portal-logo";
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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-md">
      <div aria-hidden className="brand-rule h-0.5 w-full" />
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          className="flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          href="/"
          onClick={() => setOpen(false)}
        >
          <PortalLogo className="h-11 sm:h-12" />
          <span className="sr-only">MotoMas · Inicio</span>
        </Link>

        <nav aria-label="Navegación principal" className="hidden items-center gap-0.5 xl:flex">
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

        <div className="hidden xl:block">
          <Link className={cn(btnAccent, "h-11 px-5")} href="/solicitar-informacion">
            Solicitar información
          </Link>
        </div>

        <button
          aria-controls="portal-mobile-nav"
          aria-expanded={open}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          className="grid h-11 w-11 place-items-center rounded-lg border border-slate-300 text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 xl:hidden"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div
          className="animate-fade-in border-t border-slate-200 bg-white xl:hidden"
          id="portal-mobile-nav"
        >
          <nav
            aria-label="Navegación móvil"
            className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6"
          >
            <div className="grid gap-0.5">
              {mainNav.map((item) => (
                <MobileNavLink
                  key={item.href}
                  active={isActive(item.href)}
                  href={item.href}
                  onNavigate={() => setOpen(false)}
                >
                  {item.label}
                </MobileNavLink>
              ))}
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Seguimiento de solicitud
              </div>
              <div className="grid gap-0.5">
                {trackingNav.map((item) => (
                  <MobileNavLink
                    key={item.href}
                    active={isActive(item.href)}
                    href={`${item.href}${trackingQuery}`}
                    onNavigate={() => setOpen(false)}
                  >
                    {item.label}
                  </MobileNavLink>
                ))}
              </div>
            </div>

            <Link
              className={cn(btnAccent, "mt-5 w-full")}
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        active ? "text-slate-900" : "text-slate-600 hover:text-slate-900",
      )}
      href={href}
    >
      {children}
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-orange-500 transition-transform duration-150",
          active ? "scale-x-100" : "scale-x-0",
        )}
      />
    </Link>
  );
}

function MobileNavLink({
  active,
  href,
  children,
  onNavigate,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-xl px-4 py-3 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
        active ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50",
      )}
      href={href}
      onClick={onNavigate}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-orange-500"
        />
      ) : null}
      {children}
    </Link>
  );
}
