import * as React from "react";

import { Breadcrumbs, type Crumb } from "@/components/ui/navigation";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — cabecera de página.
 *
 * Una sola jerarquía para todo el panel: **miga → título → descripción →
 * acciones**. Los campos son opcionales; el orden no.
 *
 * Patch POS2.0-B añade la miga, que hasta ahora ninguna pantalla tenía: la
 * primitiva `Breadcrumbs` existía desde POS2.0-A y nadie la consumía, así que
 * las rutas anidadas —el detalle de una compra, por ejemplo— no ofrecían camino
 * de vuelta salvo el botón del navegador.
 *
 * **[R] Miga solo a partir del segundo nivel.** En una pantalla de primer nivel
 * es decoración, y la decoración en una interfaz densa es ruido.
 *
 * Una página no debe recrear a mano el espaciado del título, la alineación de
 * las acciones ni cómo se apilan en móvil. Eso vive aquí.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      <div aria-hidden className="brand-rule h-1 w-full" />
      <div className="header-tint flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {breadcrumbs?.length ? (
            <Breadcrumbs className="mb-2" items={breadcrumbs} />
          ) : null}
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-600">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
