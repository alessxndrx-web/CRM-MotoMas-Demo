"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/fields";
import { Select } from "@/components/ui/select";

/**
 * Patch CRM-AUD1 — buscar dentro de un listado del CRM.
 *
 * ## Por qué el estado va en la URL
 *
 * Igual que `?periodo=` en Inicio y `?expediente=` en Expedientes: **el servidor
 * recalcula la consulta**, el filtro sobrevive a una recarga y el enlace se
 * puede pegar en un chat para que otra persona vea exactamente la misma lista.
 * Un filtro en estado de cliente no hace ninguna de las tres cosas.
 *
 * ## Por qué busca el servidor y no el navegador
 *
 * Porque la lista está paginada: filtrar en el cliente buscaría dentro de la
 * página que ya se trajo, que es justo donde el registro buscado no está.
 *
 * Patch CRM-AUD2 retiró de aquí el aviso de truncamiento. Lo puso CRM-AUD1
 * cuando las listas cortaban en silencio a 200 filas; ahora `ListPagination`
 * dice «1–25 de 340», que responde lo mismo y además deja llegar al resto.
 *
 * ## Por qué al enviar y no al teclear
 *
 * Cada pulsación sería un viaje a la base por letra. El formulario se envía con
 * Intro o con el botón, que es el gesto que la gente ya hace en un buscador.
 */
export function ListSearchBar({
  placeholder,
  statusOptions,
  statusParam = "estado",
  statusLabel = "Estado",
}: {
  placeholder: string;
  /** Opcional: cuando el listado tiene un estado por el que filtrar. */
  statusOptions?: Array<{ value: string; label: string }>;
  statusParam?: string;
  statusLabel?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const currentQuery = params.get("q") ?? "";
  const currentStatus = params.get(statusParam) ?? "";
  const [query, setQuery] = useState(currentQuery);

  function navigate(next: { q?: string; status?: string }) {
    const search = new URLSearchParams(params.toString());
    const q = (next.q ?? currentQuery).trim();
    const status = next.status ?? currentStatus;

    if (q) search.set("q", q);
    else search.delete("q");
    if (status) search.set(statusParam, status);
    else search.delete(statusParam);
    // Patch CRM-AUD2. Buscar vuelve a la primera página: quedarse en la 7 de un
    // resultado de dos páginas mostraría una lista vacía que parece un error.
    search.delete("pagina");

    const qs = search.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const hasFilters = Boolean(currentQuery || currentStatus);

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({ q: query });
      }}
    >
      <div className="min-w-[240px] flex-1">
        <SearchField
          onValueChange={setQuery}
          placeholder={placeholder}
          value={query}
        />
      </div>

      {statusOptions?.length ? (
        <div className="min-w-[170px]">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            {statusLabel}
          </span>
          <Select
            onChange={(event) => navigate({ status: event.target.value })}
            value={currentStatus}
          >
            <option value="">Todos</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <Button type="submit" variant="secondary">
        Buscar
      </Button>
      {hasFilters ? (
        <Button
          onClick={() => {
            setQuery("");
            navigate({ q: "", status: "" });
          }}
          type="button"
          variant="ghost"
        >
          Limpiar
        </Button>
      ) : null}
    </form>
  );
}
