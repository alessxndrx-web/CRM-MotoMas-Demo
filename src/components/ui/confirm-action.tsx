"use client";

import * as React from "react";

import { Button, type ButtonProps } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";

/**
 * SmartBitz Design System — acción que pide confirmación (Patch POS2.0-C).
 *
 * ## La jerarquía completa
 *
 * | Grado | Cómo se expresa |
 * |---|---|
 * | Primaria | `<Button>` — la razón por la que existe la pantalla |
 * | Secundaria | `<Button variant="secondary">` — todo lo seguro, Cancelar incluido |
 * | En fila | `<Button variant="ghost">` — dentro de tablas y barras |
 * | Peligrosa | `<Button variant="danger">` — **solo irreversible** |
 * | Peligrosa **con confirmación** | esto |
 *
 * Los cuatro primeros grados ya existían. El quinto no era un componente sino
 * una costumbre: cada pantalla declaraba su `useState`, su `open`, su `pending`
 * y su `ConfirmDialog`. Cinco líneas de estado repetidas es donde una acaba
 * olvidando cerrar el diálogo al fallar.
 *
 * **No sustituye a `ConfirmDialog`.** Lo compone. Un flujo que necesite recoger
 * algo dentro del diálogo —un motivo obligatorio, por ejemplo— sigue usando
 * `ConfirmDialog` directamente, porque entonces el diálogo tiene estado propio y
 * ya no es «pulsar y confirmar».
 *
 * ## Dos reglas que el componente hace cumplir
 *
 * **Cancelar a la izquierda, confirmar a la derecha, siempre**, que es lo que ya
 * hace `ConfirmDialog`. Y **el título nombra la consecuencia**: `title` es
 * obligatorio y sin valor por omisión, porque «¿Estás seguro?» no le dice al
 * usuario nada que no supiera ya.
 */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone = "danger",
  variant,
  size = "sm",
  disabled,
  icon,
  children,
  "data-testid": testId,
}: {
  /** Texto del botón que dispara. Verbo con objeto: «Anular orden». */
  label: string;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /**
   * Puede ser asíncrona. Mientras corre, el diálogo queda en `pending` y no se
   * puede confirmar dos veces — la doble pulsación es el modo de fallo real de
   * una confirmación, no el clic accidental.
   */
  onConfirm: () => void | Promise<void>;
  tone?: "danger" | "default";
  /** Por omisión hereda del tono; se puede bajar a `ghost` dentro de una fila. */
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  disabled?: boolean;
  icon?: React.ReactNode;
  /** Contenido extra dentro del diálogo: qué se va a perder exactamente. */
  children?: React.ReactNode;
  "data-testid"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      // **Siempre**: si la operación falla, el diálogo debe volver a ser usable.
      // Dejarlo bloqueado obliga a recargar para reintentar.
      setPending(false);
    }
  }

  return (
    <>
      <Button
        data-testid={testId}
        disabled={disabled}
        onClick={() => setOpen(true)}
        size={size}
        variant={variant ?? (tone === "danger" ? "danger" : "default")}
      >
        {icon}
        {label}
      </Button>
      <ConfirmDialog
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        description={description}
        onClose={() => (pending ? undefined : setOpen(false))}
        onConfirm={confirm}
        open={open}
        pending={pending}
        title={title}
        tone={tone}
      >
        {children}
      </ConfirmDialog>
    </>
  );
}
