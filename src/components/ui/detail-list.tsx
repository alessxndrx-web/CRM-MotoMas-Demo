import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — pares campo/valor (Patch POS2.0-C).
 *
 * El contenido de un cajón de detalle es casi siempre lo mismo: una lista de
 * «qué» y «cuánto». Sin una primitiva, cada pantalla la arma con `div`s y cada
 * una alinea distinto — y un cajón que se abre desde una tabla se compara
 * inevitablemente con el anterior.
 *
 * Es `<dl>` de verdad. Un lector de pantalla anuncia entonces «término /
 * definición» y el usuario sabe qué está oyendo; una rejilla de `div`s le
 * entrega una lista de palabras sueltas.
 *
 * **[R] Los números llevan `sb-numeric`**, igual que en las tablas: un valor
 * alineado a la derecha con dígitos proporcionales no se puede comparar con el
 * de arriba.
 */
export type DetailItem = {
  label: string;
  value: React.ReactNode;
  /** Cifras tabulares y alineación a la derecha. */
  numeric?: boolean;
  /** Ocupa la fila entera: notas, motivos, direcciones. */
  wide?: boolean;
};

export function DetailList({
  items,
  columns = 2,
  className,
}: {
  items: DetailItem[];
  /** Una columna en un cajón estrecho; dos en una tarjeta ancha. */
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4 text-sm",
        columns === 2 ? "sm:grid-cols-2" : null,
        className,
      )}
    >
      {items.map((item) => (
        <div
          className={cn("min-w-0", item.wide && columns === 2 && "sm:col-span-2")}
          key={item.label}
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {item.label}
          </dt>
          <dd
            className={cn(
              "mt-1 break-words text-slate-800",
              item.numeric && "sb-numeric",
            )}
          >
            {/* Un valor ausente se dice; un hueco en blanco parece un fallo. */}
            {item.value === null || item.value === undefined || item.value === ""
              ? "—"
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
