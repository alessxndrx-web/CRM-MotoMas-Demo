import * as React from "react";
import { FilterX, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — vacío.
 *
 * ## Dos vacíos, dos mensajes (Patch POS2.0-C)
 *
 * «No hay nada todavía» y «tu filtro no encontró nada» se parecen en la pantalla
 * y **no se parecen en nada para el usuario**: el primero dice «empieza aquí», el
 * segundo dice «tu filtro es demasiado estrecho». Escribir «No hay datos» en los
 * dos casos deja al segundo usuario buscando datos que sí existen.
 *
 * - `variant="empty"` (por omisión) — la sección nunca ha tenido datos. Lleva la
 *   acción que la llena.
 * - `variant="no-results"` — hay datos, los filtros los excluyeron. Lleva la
 *   acción que los quita, y **nunca** una acción de crear: crear un registro no
 *   es la respuesta a una búsqueda sin resultados.
 *
 * `TableEmptyRow` sigue siendo la forma correcta dentro de una tabla ya
 * dibujada; esto es para cuando no hay tabla que dibujar.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "empty",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** La acción que resuelve el vacío. */
  action?: React.ReactNode;
  /** Una salida alternativa: ver la documentación, importar, cambiar de vista. */
  secondaryAction?: React.ReactNode;
  variant?: "empty" | "no-results";
  className?: string;
}) {
  // El icono de «sin resultados» es fijo a propósito: es siempre el mismo hecho,
  // y reconocerlo de un vistazo ahorra leer el texto.
  const ResolvedIcon = variant === "no-results" ? (Icon ?? FilterX) : Icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center",
        className,
      )}
      data-testid={variant === "no-results" ? "sin-resultados" : "vacio"}
    >
      {ResolvedIcon ? (
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100">
          <ResolvedIcon aria-hidden className="h-5 w-5 text-slate-400" />
        </span>
      ) : null}
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      ) : null}
      {action || secondaryAction ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
