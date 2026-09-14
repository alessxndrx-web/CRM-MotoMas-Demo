"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Patch CRM-AUD2 — pasar de página en un listado del CRM.
 *
 * ## Por qué el número de página va en la URL
 *
 * Por lo mismo que `?q=` y `?estado=` en {@link ListSearchBar}: **el servidor
 * recalcula la consulta**. La página sobrevive a una recarga, el botón de atrás
 * del navegador hace lo que la gente espera, y el enlace se puede pegar.
 *
 * **Conserva los demás parámetros.** Cambiar de página no puede perder la
 * búsqueda ni el filtro de estado — se copia `searchParams` entero y sólo se
 * reescribe `pagina`.
 *
 * ## Por qué no hay salto a la última página
 *
 * Se muestra el total y el rango, que es lo que responde «¿vale la pena seguir
 * pasando o mejor busco?». Un saltador de páginas numeradas en una lista que se
 * recorre buscando, no paginando, sería adorno.
 */
export function ListPagination({
  page,
  pageSize,
  total,
  label,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** Plural del registro: «leads», «clientes». */
  label: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Una página pedida más allá del final no se corrige en silencio: se muestra
  // vacía y los botones llevan de vuelta. Corregirla escondería el hecho.
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  function goTo(next: number) {
    const search = new URLSearchParams(params.toString());
    if (next <= 1) search.delete("pagina");
    else search.set("pagina", String(next));
    const qs = search.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  if (total === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        {first}–{last} de {total} {label}
      </p>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            aria-label="Página anterior"
            disabled={page <= 1}
            onClick={() => goTo(page - 1)}
            size="sm"
            variant="secondary"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm tabular-nums text-slate-600">
            {page} / {totalPages}
          </span>
          <Button
            aria-label="Página siguiente"
            disabled={page >= totalPages}
            onClick={() => goTo(page + 1)}
            size="sm"
            variant="secondary"
          >
            Siguiente
            <ChevronRight aria-hidden className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
