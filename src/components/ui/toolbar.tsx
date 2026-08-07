"use client";

import { FilterX, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/fields";
import { Toolbar } from "@/components/ui/navigation";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — controles de trabajo de una pantalla (Patch POS2.0-C).
 *
 * ## Dónde acaba `PageHeader` y empieza esto
 *
 * `PageHeader` es **contexto**: dónde estoy y qué es esta pantalla. Esto son los
 * **controles**: qué estoy mirando ahora mismo. La distinción importa porque el
 * contexto no cambia mientras se trabaja y los controles no paran de cambiar; si
 * viven en el mismo bloque, cada filtro repinta el título.
 *
 * `Toolbar` de POS2.0-A ya coloca «contenido a la izquierda, acciones a la
 * derecha». `FilterBar` **lo compone**, no lo reemplaza, y le añade lo que toda
 * pantalla de listado acababa escribiendo a mano: el buscador, el hueco de
 * filtros, y el botón de limpiar.
 */

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filters,
  onClear,
  activeCount = 0,
  actions,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Los selectores del módulo. La biblioteca no sabe qué se filtra. */
  filters?: React.ReactNode;
  /** Se ofrece solo cuando hay algo que limpiar. */
  onClear?: () => void;
  /**
   * Cuántos filtros están puestos.
   *
   * **Es la respuesta a «¿por qué no veo nada?»**, la pregunta en la que más se
   * atasca un usuario de listados: la tabla está vacía y no puede distinguir si
   * faltan datos o sobra filtro. El número lo dice sin abrir nada.
   */
  activeCount?: number;
  actions?: React.ReactNode;
  className?: string;
}) {
  const searchable = search !== undefined && onSearchChange !== undefined;
  const clearable = Boolean(onClear) && activeCount > 0;

  return (
    <Toolbar actions={actions} className={cn("flex-col sm:flex-row", className)}>
      {searchable ? (
        // A ancho completo en móvil: un buscador de 160px en un teléfono no se
        // puede leer mientras se escribe.
        <div className="w-full sm:w-64">
          <SearchField
            data-testid="filtros-busqueda"
            onValueChange={onSearchChange}
            placeholder={searchPlaceholder}
            value={search}
          />
        </div>
      ) : null}

      {filters ? (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">{filters}</div>
      ) : null}

      {clearable ? (
        <Button
          data-testid="filtros-limpiar"
          onClick={onClear}
          size="sm"
          variant="ghost"
        >
          <FilterX aria-hidden className="h-4 w-4" />
          Limpiar
          <span className="sb-numeric rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold text-slate-600">
            {activeCount}
          </span>
        </Button>
      ) : null}
    </Toolbar>
  );
}

/**
 * La barra que aparece cuando hay filas seleccionadas.
 *
 * **Sustituye a los filtros, no se apila encima.** Mientras hay una selección
 * activa la pregunta del usuario ya no es «qué estoy mirando» sino «qué le hago
 * a esto»; dejar las dos barras a la vez añade altura y ninguna claridad.
 *
 * `role="status"` para que un lector de pantalla anuncie cuántas filas hay
 * elegidas sin interrumpir lo que se esté haciendo.
 */
export function BulkActionBar({
  count,
  onClear,
  children,
  noun = "seleccionados",
  className,
}: {
  count: number;
  onClear: () => void;
  /** Las acciones masivas. La biblioteca no decide cuáles son. */
  children?: React.ReactNode;
  /** «3 seleccionados», «3 documentos». El módulo pone la palabra. */
  noun?: string;
  className?: string;
}) {
  if (count === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-b border-blue-200 bg-blue-50 px-4 py-3",
        className,
      )}
      data-testid="barra-masiva"
      role="status"
    >
      <div className="flex items-center gap-2 text-sm text-blue-900">
        <span className="sb-numeric font-semibold">{count}</span>
        <span>{noun}</span>
        <button
          aria-label="Quitar la selección"
          className="sb-focus grid h-6 w-6 place-items-center rounded text-blue-700 transition-colors hover:bg-blue-100"
          data-testid="barra-masiva-limpiar"
          onClick={onClear}
          type="button"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
