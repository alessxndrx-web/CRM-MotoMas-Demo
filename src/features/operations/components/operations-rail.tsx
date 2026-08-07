"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { navGroupLabelForRole, navGroupRank } from "@/features/operations/lib/role-copy";
import {
  isNavItemActive,
  navGroups,
  navLabelForRole,
} from "@/features/operations/lib/nav-model";
import type { DemoSession } from "@/features/operations/types";
import { cn } from "@/lib/utils";

/**
 * Patch POS2.0-B — la barra lateral, una sola vez.
 *
 * La escribe **un** componente y la usan dos sitios: el `aside` fijo del
 * escritorio y el cajón del móvil. Antes el JSX se declaraba una vez y se
 * insertaba en ambos, que funcionaba; separarlo en un componente propio es lo
 * que permite que el cajón sea el `Drawer` del sistema de diseño en lugar de un
 * panel a mano.
 *
 * ## Jerarquía
 *
 * Los grupos `primary` son el trabajo del usuario. Los `secondary` —configuración
 * y ayuda— van al fondo, separados por una línea y con el rótulo apagado: **el
 * chasis de la aplicación no debe competir con los módulos de negocio**.
 *
 * **La navegación no es la frontera de seguridad.** Filtrar por rol aquí es
 * cortesía visual; cada página y cada acción del servidor vuelven a autorizar.
 */
export function OperationsRail({
  session,
  pathname,
  homeHref,
  onLogout,
  onNavigate,
  brand,
}: {
  session: DemoSession;
  pathname: string;
  homeHref: string;
  onLogout: () => void;
  /** El cajón lo usa para cerrarse cuando el usuario elige un destino. */
  onNavigate?: () => void;
  /** La marca la pone el contenedor: el cajón ya trae su propia cabecera. */
  brand?: React.ReactNode;
}) {
  const groups = useMemo(() => {
    const role = session.role;
    return navGroups
      .map((group) => ({
        ...group,
        label: navGroupLabelForRole(group.key, role),
        items: group.items.filter((item) => {
          if (!item.roles.includes(role)) return false;
          if (role === "Vendedor" && item.href === "/panel/traslados") return false;
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => {
        // El chasis va siempre al final, mande lo que mande el orden por rol.
        if (a.tier !== b.tier) return a.tier === "primary" ? -1 : 1;
        return navGroupRank(a.key, role) - navGroupRank(b.key, role);
      });
  }, [session]);

  const firstSecondary = groups.findIndex((group) => group.tier === "secondary");

  return (
    <>
      {brand ? (
        <div className="border-b border-slate-200 px-5 py-5">
          <Link className="sb-focus rounded" href={homeHref} onClick={onNavigate}>
            {brand}
          </Link>
        </div>
      ) : null}

      <nav
        aria-label="Navegación interna"
        className="sb-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4"
      >
        {groups.map((group, index) => (
          <div
            className={cn(
              index > 0 && "mt-6",
              // La línea marca dónde acaba el trabajo y empieza el chasis.
              index === firstSecondary &&
                firstSecondary > 0 &&
                "mt-6 border-t border-slate-200 pt-5",
            )}
            key={group.key}
          >
            {group.label ? (
              <div className="mb-2 flex items-center gap-2 px-3">
                {group.tier === "primary" ? (
                  <span aria-hidden className="h-1 w-1 rounded-full bg-orange-400" />
                ) : null}
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider",
                    group.tier === "primary" ? "text-slate-500" : "text-slate-400",
                  )}
                >
                  {group.label}
                </span>
              </div>
            ) : null}
            <div className="grid gap-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isNavItemActive(pathname, item.href);
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "sb-focus relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                      active
                        ? "bg-blue-50 font-medium text-blue-700 shadow-[inset_0_0_0_1px_rgb(191_219_254)]"
                        : group.tier === "primary"
                          ? "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                    )}
                    href={item.href}
                    key={item.href}
                    onClick={onNavigate}
                  >
                    {active ? (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-orange-500"
                      />
                    ) : null}
                    <Icon
                      aria-hidden
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

      <div className="shrink-0 border-t border-slate-200 p-4">
        <div className="truncate text-sm font-medium text-slate-900">
          {session.userName}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone="slate">{session.role}</Badge>
          <Badge tone="orange">{session.branchName}</Badge>
        </div>
        <Button className="mt-3 w-full" onClick={onLogout} size="sm" variant="secondary">
          <LogOut className="h-4 w-4" />
          Salir
        </Button>
      </div>
    </>
  );
}
