"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — campo de formulario (Patch POS2.0-C).
 *
 * ## Qué le faltaba a `Field`
 *
 * `Field` (en `form-section.tsx`) envuelve el control en un `<label>`, lo cual
 * asocia el rótulo correctamente. Pero la pista y el error **quedaban sueltos**:
 * texto suelto debajo del control, sin `aria-describedby` y sin `aria-invalid`.
 * Para quien ve la pantalla eso funciona; para quien la escucha, el campo está
 * bien y el motivo del fallo no existe.
 *
 * `Field` se conserva tal cual —lo usan decenas de pantallas y su salida no
 * cambia—. `FormField` es el que se usa donde el error importa.
 *
 * ## Por qué `children` es una función
 *
 * El campo genera los identificadores y se los entrega al control:
 *
 * ```tsx
 * <FormField error={error} label="Costo unitario" required>
 *   {(field) => <MoneyInput {...field} value={v} onChange={...} />}
 * </FormField>
 * ```
 *
 * La alternativa habitual —clonar el hijo y colarle props— parece más cómoda y
 * falla en cuanto el control va envuelto en cualquier cosa. Y modificar `Input`
 * para leer un contexto obligaría a tocar los cuarenta sitios que ya lo usan.
 * Explícito y sin magia: el control recibe lo que necesita y se ve en el código.
 *
 * **El error sustituye a la pista, no se le suma.** Dos líneas de ayuda bajo un
 * campo en rojo son una línea de ayuda de más.
 */
export type FormFieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": boolean | undefined;
  required: boolean | undefined;
};

export function FormField({
  label,
  hint,
  error,
  required,
  disabled,
  children,
  className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  /** Por qué está deshabilitado. Un control gris sin explicación es un callejón. */
  disabled?: boolean;
  children: (field: FormFieldControlProps) => React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const invalid = Boolean(error);

  return (
    <div className={cn("block", disabled && "opacity-60", className)}>
      <label
        className="mb-1.5 block text-sm font-medium text-slate-700"
        htmlFor={id}
      >
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-orange-500">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (obligatorio)</span> : null}
      </label>

      {children({
        id,
        "aria-describedby": invalid ? errorId : hint ? hintId : undefined,
        "aria-invalid": invalid || undefined,
        required: required || undefined,
      })}

      {invalid ? (
        <p className="mt-1 block text-xs text-red-600" id={errorId} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 block text-xs text-slate-500" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
