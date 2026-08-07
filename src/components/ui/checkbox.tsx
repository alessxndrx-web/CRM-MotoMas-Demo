"use client";

import { Check, Minus } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — checkbox (Patch POS2.0-C).
 *
 * No existía. Tres pantallas lo dibujaban a mano con `type="checkbox"` suelto, y
 * ninguna podía expresar el tercer estado —**algunas filas seleccionadas**— que
 * es justo el que una cabecera de tabla necesita.
 *
 * ## Es un `input` de verdad
 *
 * El control nativo se mantiene y solo se le pinta encima. Un `div` con
 * `role="checkbox"` obliga a reimplementar la barra espaciadora, el foco, el
 * `name`, el envío del formulario y la asociación con su etiqueta — cuatro cosas
 * que el navegador ya hace bien y una quinta que casi nadie recuerda.
 *
 * `indeterminate` no es un atributo de HTML: es una propiedad del elemento, así
 * que se escribe por referencia. Sin eso, el estado mixto se vería pero no se
 * anunciaría, y un lector de pantalla diría «no marcado» sobre una tabla con
 * medio contenido seleccionado.
 */
export function Checkbox({
  className,
  indeterminate,
  checked,
  disabled,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  indeterminate?: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  const marked = Boolean(checked) || Boolean(indeterminate);

  return (
    <span className={cn("relative inline-flex h-4 w-4 shrink-0", className)}>
      <input
        checked={checked}
        className="sb-focus peer absolute inset-0 m-0 cursor-pointer appearance-none rounded border border-slate-300 bg-white transition-colors checked:border-blue-600 checked:bg-blue-600 indeterminate:border-blue-600 indeterminate:bg-blue-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
        disabled={disabled}
        ref={ref}
        type="checkbox"
        {...props}
      />
      {marked ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center text-white"
        >
          {indeterminate ? (
            <Minus className="h-3 w-3" strokeWidth={3} />
          ) : (
            <Check className="h-3 w-3" strokeWidth={3} />
          )}
        </span>
      ) : null}
    </span>
  );
}
