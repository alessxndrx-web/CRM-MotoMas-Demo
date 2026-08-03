"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  BadgeDollarSign,
  BarChart3,
  BookmarkCheck,
  CreditCard,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  PackageSearch,
  Settings,
  UserPlus,
  UserRoundCog,
  Users,
  Barcode,
  WalletCards,
  Warehouse,
  Wrench,
  X,
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
import { logoutAction } from "@/server/auth/actions";
import { getDefaultRouteForSession } from "@/data/operations/users";
import {
  navGroupLabelForRole,
  navGroupRank,
  shellSubtitle,
} from "@/features/operations/lib/role-copy";
import type { DemoSession, OperationRole } from "@/features/operations/types";
import { cn } from "@/lib/utils";

type OperationsNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: OperationRole[];
};

type OperationsNavGroup = {
  key: string;
  items: OperationsNavItem[];
};

const navGroups: OperationsNavGroup[] = [
  {
    key: "Inicio",
    items: [
      {
        href: "/panel/dashboard",
        label: "Inicio",
        icon: LayoutDashboard,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Gestión Comercial",
    items: [
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
        icon: FolderOpen,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/actividades",
        label: "Actividades",
        icon: ListChecks,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/creditos",
        label: "Créditos",
        icon: CreditCard,
        roles: ["Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Operación",
    items: [
      {
        href: "/panel/inventario",
        label: "Inventario",
        icon: PackageSearch,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/inventario/movimientos",
        label: "Movimientos de inventario",
        icon: Warehouse,
        roles: ["Gerente", "Administrador"],
      },
      {
        href: "/panel/reservas",
        label: "Reservas",
        icon: BookmarkCheck,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/traslados",
        label: "Traslados",
        icon: ArrowRightLeft,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
      {
        href: "/panel/ventas",
        label: "Ventas",
        icon: BadgeDollarSign,
        roles: ["Vendedor", "Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Supervisión",
    items: [
      {
        href: "/panel/vendedores",
        label: "Vendedores",
        icon: UserRoundCog,
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
        roles: ["Marketing", "Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Sistema",
    items: [
      {
        href: "/panel/configuracion",
        label: "Configuración",
        icon: Settings,
        roles: ["Gerente", "Administrador"],
      },
    ],
  },
  {
    key: "Soporte",
    items: [
      {
        href: "/panel/ayuda",
        label: "Tickets y ayuda",
        icon: LifeBuoy,
        roles: [
          "Administrador",
          "Gerente",
          "Vendedor",
          "Cajero",
          "Contador",
          "Marketing",
          "Soporte Técnico",
        ],
      },
      {
        href: "/panel/soporte",
        label: "Centro de soporte",
        icon: Wrench,
        roles: ["Soporte Técnico"],
      },
      {
        href: "/panel/soporte/tickets",
        label: "Bandeja de tickets",
        icon: ListChecks,
        roles: ["Soporte Técnico"],
      },
    ],
  },
  {
    key: "Finanzas",
    items: [
      {
        href: "/panel/contabilidad",
        label: "Contabilidad",
        icon: Landmark,
        roles: ["Contador", "Administrador", "Gerente"],
      },
      {
        href: "/panel/caja",
        label: "Caja",
        icon: WalletCards,
        roles: ["Cajero", "Administrador"],
      },
      // Patch POS1.0-B. Mismos roles que Caja porque el POS reutiliza
      // `canOperateCaja`: quien opera el mostrador es quien opera la caja.
      {
        href: "/panel/pos/productos",
        label: "Catálogo POS",
        icon: Barcode,
        roles: ["Cajero", "Administrador"],
      },
    ],
  },
];

const allNavItems = navGroups.flatMap((group) => group.items);

function navLabelForRole(item: OperationsNavItem, role: OperationRole) {
  if (item.href === "/panel/leads" && role !== "Vendedor") return "Leads";
  return item.label;
}

function isItemActive(item: OperationsNavItem, pathname: string) {
  if (pathname === item.href) return true;
  if (!pathname.startsWith(`${item.href}/`)) return false;
  // Prefer the most specific match (e.g. /panel/inventario/movimientos over
  // /panel/inventario).
  return !allNavItems.some(
    (other) =>
      other.href !== item.href &&
      other.href.startsWith(`${item.href}/`) &&
      (pathname === other.href || pathname.startsWith(`${other.href}/`)),
  );
}

function currentContext(pathname: string, role: OperationRole | null) {
  for (const group of navGroups) {
    for (const item of group.items) {
      if (isItemActive(item, pathname)) {
        return {
          group: role ? navGroupLabelForRole(group.key, role) : group.key,
          title: role ? navLabelForRole(item, role) : item.label,
        };
      }
    }
  }
  return { group: null, title: "Centro de Operaciones" };
}

function isHelpPath(pathname: string): boolean {
  return pathname === "/panel/ayuda" || pathname.startsWith("/panel/ayuda/");
}

function BrandMark({ href }: { href: string }) {
  return (
    <Link className="flex items-center gap-3" href={href}>
      <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-navy">
        <span className="text-sm font-bold leading-none text-white">
          M<span className="text-orange-400">m</span>
        </span>
      </span>
      <span>
        <span className="block text-base font-semibold leading-tight text-slate-900">
          MotoMas
        </span>
        <span className="block text-xs text-slate-500">Centro de Operaciones</span>
      </span>
    </Link>
  );
}

function RestrictedScreen({
  role,
  title,
  message,
  actionHref,
  actionLabel,
}: {
  role: string;
  title: string;
  message: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="app-canvas min-h-screen text-slate-900">
      <main className="mx-auto max-w-[900px] px-4 py-16 sm:px-8">
        <Card className="overflow-hidden p-8 text-center">
          <Badge tone="slate">{role}</Badge>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {message}
          </p>
          <Link
            className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            href={actionHref}
          >
            {actionLabel}
          </Link>
        </Card>
      </main>
    </div>
  );
}

export function OperationsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const homeHref = session ? getDefaultRouteForSession(session) : "/panel";
  const context = currentContext(pathname, session?.role ?? null);
  const helpPath = isHelpPath(pathname);

  useEffect(() => {
    setSession(readDemoSession());
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const visibleGroups = useMemo(() => {
    if (!session) return [];
    const role = session.role;
    return navGroups
      .map((group) => ({
        ...group,
        label: navGroupLabelForRole(group.key, role),
        items: group.items.filter((item) => {
          if (!item.roles.includes(role)) return false;
          if (role === "Vendedor" && item.href === "/panel/traslados") {
            return false;
          }
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => navGroupRank(a.key, role) - navGroupRank(b.key, role));
  }, [session]);

  async function closeSession() {
    try {
      await logoutAction();
    } catch {
      // Best-effort: still clear the local mirror and return to login.
    }
    clearDemoSession();
    setSession(null);
    router.push("/login");
    router.refresh();
  }

  if (!session) {
    return (
      <div className="app-canvas min-h-screen text-slate-900">
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <BrandMark href="/panel" />
            <Badge tone="slate">Acceso interno</Badge>
          </header>
          {children}
        </main>
      </div>
    );
  }

  if (
    session.role === "Contador" &&
    pathname !== "/panel" &&
    !pathname.startsWith("/panel/contabilidad") &&
    !helpPath
  ) {
    return (
      <RestrictedScreen
        actionHref="/panel/contabilidad"
        actionLabel="Ir a contabilidad"
        message="El Contador trabaja en el área contable separada. No puede crear leads, reservas, traslados, ventas ni asignaciones comerciales."
        role="Rol Contador"
        title="Acceso comercial restringido"
      />
    );
  }

  if (
    session.role === "Cajero" &&
    pathname !== "/panel" &&
    !pathname.startsWith("/panel/caja") &&
    !helpPath
  ) {
    return (
      <RestrictedScreen
        actionHref="/panel/caja"
        actionLabel="Ir a caja"
        message="El Cajero trabaja en el área de caja. No puede crear leads, reservas, traslados, ventas comerciales, modificar inventario ni acceder a contabilidad completa."
        role="Rol Cajero"
        title="Acceso operativo restringido"
      />
    );
  }

  if (
    session.role === "Marketing" &&
    pathname !== "/panel" &&
    !pathname.startsWith("/panel/marketing") &&
    !helpPath
  ) {
    return (
      <RestrictedScreen
        actionHref="/panel/marketing"
        actionLabel="Ir a Marketing"
        message="Marketing opera únicamente campañas y atribución. No puede acceder a CRM, inventario, ventas, finanzas, configuración ni soporte."
        role="Rol Marketing"
        title="Acceso fuera del área de Marketing"
      />
    );
  }

  if (
    session.role === "Soporte Técnico" &&
    pathname !== "/panel" &&
    !pathname.startsWith("/panel/soporte") &&
    !helpPath
  ) {
    return (
      <RestrictedScreen
        actionHref="/panel/soporte"
        actionLabel="Ir a Soporte"
        message="Soporte Técnico opera únicamente diagnósticos seguros y auditoría técnica de solo lectura. No puede acceder a áreas comerciales, inventario, finanzas, configuración ni Marketing."
        role="Rol Soporte Técnico"
        title="Acceso fuera del área de Soporte"
      />
    );
  }

  const navigation = (
    <nav aria-label="Navegación interna" className="flex-1 overflow-y-auto px-3 py-4">
      {visibleGroups.map((group, index) => (
        <div className={index > 0 ? "mt-6" : undefined} key={group.key}>
          {group.label ? (
            <div className="mb-2 flex items-center gap-2 px-3">
              <span className="h-1 w-1 rounded-full bg-orange-400" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </span>
            </div>
          ) : null}
          <div className="grid gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item, pathname);
              return (
                <Link
                  className={cn(
                    "relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700 shadow-[inset_0_0_0_1px_rgb(191_219_254)]"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                  href={item.href}
                  key={item.href}
                  aria-current={active ? "page" : undefined}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-orange-500" />
                  ) : null}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-blue-600" : "text-slate-400",
                    )}
                  />
                  <span className="truncate">{navLabelForRole(item, session.role)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const userFooter = (
    <div className="border-t border-slate-200 p-4">
      <div className="text-sm font-medium text-slate-900">{session.userName}</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="slate">{session.role}</Badge>
        <Badge tone="orange">{session.branchName}</Badge>
      </div>
      <Button className="mt-3 w-full" onClick={closeSession} size="sm" variant="secondary">
        <LogOut className="h-4 w-4" />
        Salir
      </Button>
    </div>
  );

  return (
    <div className="app-canvas min-h-screen text-slate-900">
      <aside className="nav-surface fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-slate-200 lg:flex">
        <div aria-hidden className="brand-rule h-1 shrink-0" />
        <div className="border-b border-slate-200 px-5 py-5">
          <BrandMark href={homeHref} />
        </div>
        {navigation}
        {userFooter}
      </aside>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            aria-hidden
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="nav-surface absolute inset-y-0 left-0 flex w-72 flex-col shadow-md">
            <div aria-hidden className="brand-rule h-1 shrink-0" />
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <BrandMark href={homeHref} />
              <button
                aria-label="Cerrar menú"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setMobileNavOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {navigation}
            {userFooter}
          </div>
        </div>
      ) : null}

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div aria-hidden className="brand-rule h-0.5 w-full" />
          <div className="header-tint mx-auto flex min-h-16 max-w-[1400px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Abrir menú"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 lg:hidden"
                onClick={() => setMobileNavOpen(true)}
                type="button"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                {context.group ? (
                  <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {context.group}
                  </div>
                ) : null}
                <h1 className="truncate text-lg font-semibold text-slate-900">
                  {context.title}
                </h1>
                <p className="hidden truncate text-xs text-slate-500 sm:block">
                  {shellSubtitle(session.role)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                aria-label="Reportar problema"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                href={`/panel/ayuda/nuevo-ticket?ruta=${encodeURIComponent(pathname)}`}
              >
                <LifeBuoy className="h-4 w-4" />
                <span className="hidden xl:inline">Reportar problema</span>
              </Link>
              <span className="hidden md:inline-flex">
                <Badge tone="slate">{session.role}</Badge>
              </span>
              <span className="hidden md:inline-flex">
                <Badge tone="orange">{session.branchName}</Badge>
              </span>
              <span className="hidden max-w-[160px] truncate text-sm font-medium text-slate-700 sm:block">
                {session.userName}
              </span>
              <Button
                aria-label="Cerrar sesión"
                onClick={closeSession}
                size="icon"
                variant="ghost"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
