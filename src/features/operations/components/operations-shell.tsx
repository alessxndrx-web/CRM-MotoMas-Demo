"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Calculator,
  ClipboardList,
  ClipboardCheck,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Package,
  PackageCheck,
  Settings,
  Store,
  Truck,
  UserPlus,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  clearDemoSession,
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import { getDefaultRouteForSession } from "@/data/operations/users";
import type { DemoSession, OperationRole } from "@/features/operations/types";
import { cn } from "@/lib/utils";

type OperationsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: OperationRole[];
};

const operationsNavItems: OperationsNavItem[] = [
  {
    href: "/panel/dashboard",
    label: "Inicio",
    icon: LayoutDashboard,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/leads",
    label: "Mis leads",
    icon: UserPlus,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/clientes",
    label: "Clientes",
    icon: Users,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/expedientes",
    label: "Expedientes",
    icon: ClipboardCheck,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/actividades",
    label: "Actividades",
    icon: ClipboardList,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/creditos",
    label: "Créditos",
    icon: CreditCard,
    roles: ["Gerente", "Administrador"],
  },
  {
    href: "/panel/inventario",
    label: "Inventario",
    icon: Package,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/reservas",
    label: "Reservas",
    icon: PackageCheck,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/traslados",
    label: "Traslados",
    icon: Truck,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/ventas",
    label: "Ventas",
    icon: Store,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/vendedores",
    label: "Vendedores",
    icon: Users,
    roles: ["Gerente", "Administrador"],
  },
  {
    href: "/panel/reportes",
    label: "Reportes",
    icon: BarChart3,
    roles: ["Gerente", "Administrador"],
  },
  {
    href: "/panel/marketing",
    label: "Marketing",
    icon: Megaphone,
    roles: ["Gerente", "Administrador"],
  },
  {
    href: "/panel/configuracion",
    label: "Configuración",
    icon: Settings,
    roles: ["Administrador"],
  },
  {
    href: "/panel/contabilidad",
    label: "Contabilidad",
    icon: Calculator,
    roles: ["Contador", "Administrador", "Gerente"],
  },
  {
    href: "/panel/caja",
    label: "Caja",
    icon: WalletCards,
    roles: ["Cajero", "Administrador"],
  },
];

function titleFromPath(pathname: string) {
  const current = operationsNavItems.find((item) => pathname.startsWith(item.href));
  return current?.label ?? "Centro de Operaciones";
}

export function OperationsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);
  const title = titleFromPath(pathname);
  const homeHref = session ? getDefaultRouteForSession(session) : "/panel";

  useEffect(() => {
    setSession(readDemoSession());
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  const visibleNavItems = useMemo(() => {
    if (!session) return [];
    return operationsNavItems.filter((item) => {
      if (!item.roles.includes(session.role)) return false;
      if (session.role === "Vendedor" && item.href === "/panel/traslados") {
        return false;
      }
      return true;
    });
  }, [session]);

  function closeSession() {
    clearDemoSession();
    setSession(null);
    router.push("/panel");
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100">
        <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-56 max-w-5xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.5),rgba(239,35,45,0.12)_34%,transparent_70%)] blur-2xl" />
        <main className="relative z-10 mx-auto max-w-[1520px] px-4 py-6 sm:px-8 lg:px-10">
          <header className="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
            <Link className="flex items-center gap-3" href="/panel">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-600 shadow-[0_18px_40px_rgba(239,35,45,0.32)]">
                <FileText className="h-6 w-6 text-white" />
              </span>
              <span>
                <span className="block text-lg font-black text-white">MotoMas</span>
                <span className="block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Operaciones
                </span>
              </span>
            </Link>
            <Badge tone="gray">Acceso interno</Badge>
          </header>
          {children}
        </main>
      </div>
    );
  }

  if (
    session.role === "Contador" &&
    pathname !== "/panel" &&
    !pathname.startsWith("/panel/contabilidad")
  ) {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100">
        <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-56 max-w-5xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.5),rgba(239,35,45,0.12)_34%,transparent_70%)] blur-2xl" />
        <main className="relative z-10 mx-auto max-w-[900px] px-4 py-12 sm:px-8 lg:px-10">
          <Card className="p-8 text-center">
            <Badge tone="gray">Rol Contador</Badge>
            <h1 className="mt-4 text-2xl font-black text-white">
              Acceso comercial restringido
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
              El Contador trabaja en el área contable separada. No puede crear
              leads, reservas, traslados, ventas ni asignaciones comerciales.
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
              href="/panel/contabilidad"
            >
              Ir a contabilidad
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  if (
    session.role === "Cajero" &&
    pathname !== "/panel" &&
    !pathname.startsWith("/panel/caja")
  ) {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100">
        <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-56 max-w-5xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.5),rgba(239,35,45,0.12)_34%,transparent_70%)] blur-2xl" />
        <main className="relative z-10 mx-auto max-w-[900px] px-4 py-12 sm:px-8 lg:px-10">
          <Card className="p-8 text-center">
            <Badge tone="gray">Rol Cajero</Badge>
            <h1 className="mt-4 text-2xl font-black text-white">
              Acceso operativo restringido
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
              El Cajero trabaja en el área de caja. No puede crear leads,
              reservas, traslados, ventas comerciales, modificar inventario ni
              acceder a contabilidad completa.
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
              href="/panel/caja"
            >
              Ir a caja
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-56 max-w-5xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.5),rgba(239,35,45,0.12)_34%,transparent_70%)] blur-2xl" />
      <div className="relative z-10 lg:flex">
        <aside className="border-b border-white/10 bg-[#0b0b0c]/95 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-[276px] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-7">
              <Link className="flex items-center gap-3" href={homeHref}>
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-red-600 shadow-[0_18px_40px_rgba(239,35,45,0.32)]">
                  <FileText className="h-6 w-6 text-white" />
                </span>
                <span>
                  <span className="block text-lg font-black text-white">MotoMas</span>
                  <span className="block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Operaciones
                  </span>
                </span>
              </Link>
            </div>

            <nav
              aria-label="Navegación interna"
              className="flex gap-2 overflow-x-auto px-4 py-4 lg:flex-1 lg:flex-col lg:gap-3 lg:overflow-visible lg:py-8"
            >
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    className={cn(
                    "flex min-w-max items-center gap-4 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition lg:min-w-0",
                      active
                        ? "border-red-500/35 bg-red-500/13 text-red-400"
                        : "border-transparent text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100",
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="lg:text-lg">{navLabelForRole(item, session.role)}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="hidden border-t border-white/10 p-5 lg:block">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <div className="text-sm font-bold text-white">
                  {session.userName}
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {session.role} / {session.branchName}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="red">Privado /panel</Badge>
                  <Button onClick={closeSession} size="sm" variant="secondary">
                    <LogOut className="h-4 w-4" />
                    Salir
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 lg:pl-[276px]">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b0c]/88 backdrop-blur-xl">
            <div className="mx-auto flex min-h-[92px] max-w-[1520px] items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-10">
              <div>
                <h1 className="text-2xl font-black tracking-normal text-white sm:text-3xl">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-zinc-500">
                  {session.role === "Administrador"
                    ? "Vista global del Centro de Operaciones"
                    : session.role === "Contador"
                      ? "Área contable separada del flujo comercial"
                      : session.role === "Cajero"
                        ? "Área de caja separada del flujo comercial"
                    : `Operación de ${session.branchName}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  aria-label="Notificaciones"
                  className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.055] text-zinc-300"
                  type="button"
                >
                  <Bell className="h-5 w-5" />
                </button>
                <div className="hidden rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm font-bold text-zinc-300 sm:block">
                  {session.userName}
                </div>
                <Button onClick={closeSession} size="icon" variant="secondary">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1520px] px-4 py-6 sm:px-8 lg:px-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function navLabelForRole(item: OperationsNavItem, role: OperationRole) {
  if (item.href === "/panel/leads" && role !== "Vendedor") return "Leads";
  return item.label;
}
