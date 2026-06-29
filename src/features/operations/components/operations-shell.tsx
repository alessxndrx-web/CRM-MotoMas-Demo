"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
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
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  clearDemoSession,
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
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
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["Vendedor", "Gerente", "Administrador"],
  },
  {
    href: "/panel/leads",
    label: "Leads",
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

  useEffect(() => {
    setSession(readDemoSession());
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  const visibleNavItems = useMemo(() => {
    if (!session) return [];
    return operationsNavItems.filter((item) => item.roles.includes(session.role));
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

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-56 max-w-5xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.5),rgba(239,35,45,0.12)_34%,transparent_70%)] blur-2xl" />
      <div className="relative z-10 lg:flex">
        <aside className="border-b border-white/10 bg-[#0b0b0c]/95 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:w-[276px] lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col">
            <div className="border-b border-white/10 px-5 py-7">
              <Link className="flex items-center gap-3" href="/panel/dashboard">
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
                    <span className="lg:text-lg">{item.label}</span>
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
