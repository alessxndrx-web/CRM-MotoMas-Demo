"use client";

import { useId, useMemo, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { SearchField } from "@/components/ui/fields";

/**
 * Patch CRM-INT1 — elegir varias opciones de una lista, con búsqueda.
 *
 * Lo necesitan las sucursales y los modelos de una campaña y el alcance de un
 * permiso delegado. Es una lista de casillas de verdad (no un `<select
 * multiple>`, que en escritorio exige Ctrl para no perder lo ya elegido y en
 * un teléfono es casi inutilizable).
 *
 * `allLabel` añade la opción «todas»: **una selección vacía significa todas**,
 * que es como el dominio lo guarda (una campaña sin sucursales cubre todas).
 * La casilla lo hace explícito en lugar de dejarlo implícito en una lista
 * vacía.
 */
export function MultiSelectList({
  allLabel,
  disabled,
  emptyText = "No hay opciones.",
  label,
  onChange,
  options,
  searchPlaceholder = "Buscar…",
  selected,
}: {
  allLabel?: string;
  disabled?: boolean;
  emptyText?: string;
  label: string;
  onChange: (next: string[]) => void;
  options: Array<{ value: string; label: string; hint?: string }>;
  searchPlaceholder?: string;
  selected: string[];
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text
      ? options.filter((option) => option.label.toLowerCase().includes(text))
      : options;
  }, [options, query]);

  const all = Boolean(allLabel) && selected.length === 0;

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </legend>
      {options.length > 6 ? (
        <SearchField
          className="mb-2"
          onValueChange={setQuery}
          placeholder={searchPlaceholder}
          value={query}
        />
      ) : null}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {allLabel ? (
          <label
            className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            htmlFor={`${id}-all`}
          >
            <Checkbox
              checked={all}
              id={`${id}-all`}
              onChange={() => onChange([])}
            />
            {allLabel}
          </label>
        ) : null}
        {visible.length ? (
          visible.map((option) => (
            <label
              className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              htmlFor={`${id}-${option.value}`}
              key={option.value}
            >
              <Checkbox
                checked={selected.includes(option.value)}
                id={`${id}-${option.value}`}
                onChange={() => toggle(option.value)}
              />
              <span className="min-w-0">
                <span className="block truncate">{option.label}</span>
                {option.hint ? (
                  <span className="block truncate text-xs text-slate-400">{option.hint}</span>
                ) : null}
              </span>
            </label>
          ))
        ) : (
          <p className="px-3 py-3 text-sm text-slate-500">
            {query ? "Nada coincide con la búsqueda." : emptyText}
          </p>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {all
          ? allLabel
          : selected.length
            ? `${selected.length} seleccionada(s)`
            : "Ninguna seleccionada"}
      </p>
    </fieldset>
  );
}
