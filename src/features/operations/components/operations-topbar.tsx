"use client";

import { LifeBuoy, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DemoSession } from "@/features/operations/types";

/**
 * Patch POS2.0-B — la barra de contexto.
 *
 * Dice **dónde estás y con qué identidad**, y abre la navegación en móvil. Eso
 * es todo: no es una segunda navegación, y por eso no lleva enlaces de módulo.
 *
 * ## Las acciones llegan por composición
 *
 * `actions` es un hueco que rellena la página. **El chasis global no conoce
 * ninguna acción de negocio**: si «Nueva orden» viviera aquí, la barra tendría
 * que saber en qué ruta está y qué permiso hace falta, y acabaría siendo un
 * segundo enrutador con reglas duplicadas.
 *
 * ## Sucursal
 *
 * Se muestra porque la sesión ya la trae — no se añade selector. Cambiar de
 * sucursal no es un gesto de maquetación, y el repositorio no tiene hoy esa
 * operación.
 */
export function OperationsTopbar({
  session,
  eyebrow,
  title,
  subtitle,
  actions,
  helpHref,
  onOpenNav,
  onLogout,
}: {
  session: DemoSession;
  eyebrow: string | null;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  helpHref: string;
  onOpenNav: () => void;
  onLogout: () => void;
}) {
  return (
    <header
      className="sticky top-0 border-b border-slate-200 bg-white/95 backdrop-blur"
      style={{ zIndex: "var(--sb-z-sticky)" }}
    >
      <div aria-hidden className="brand-rule h-0.5 w-full" />
      <div className="header-tint flex min-h-16 items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Abrir menú"
            className="sb-focus grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
            onClick={onOpenNav}
            type="button"
          >
            <Menu aria-hidden className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            {eyebrow ? (
              <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {eyebrow}
              </div>
            ) : null}
            <h1 className="truncate text-lg font-semibold text-slate-900">{title}</h1>
            <p className="hidden truncate text-xs text-slate-500 sm:block">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Link
            aria-label="Reportar problema"
            className="sb-focus inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            href={helpHref}
          >
            <LifeBuoy aria-hidden className="h-4 w-4" />
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
          <Button aria-label="Cerrar sesión" onClick={onLogout} size="icon" variant="ghost">
            <LogOut aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
