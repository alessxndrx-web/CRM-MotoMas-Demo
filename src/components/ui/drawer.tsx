"use client";

import { X } from "lucide-react";
import * as React from "react";

import { OverlayScrim, useModalSurface, useOutsideToClose } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — drawer (Patch POS2.0-A).
 *
 * A drawer is for **detail beside context**: the row stays on screen, the record
 * opens next to it. That is the difference from a dialog, and the reason both
 * exist — a dialog blocks because the answer cannot wait, a drawer accompanies
 * because the list is still the point.
 *
 * Use it for: inspecting a record, editing one field of a row, a filter panel
 * too large for the toolbar.
 *
 * Do not use it for: destructive confirmation (that interrupts — use
 * `ConfirmDialog`), or a full form the user will spend minutes in (that is a
 * page).
 *
 * ## Width is a prop, and the widths are few
 *
 * Three sizes, because a drawer that fits its content exactly is a drawer that
 * changes width every time the data does — and a panel that resizes as you page
 * through rows is worse than one that is occasionally too wide.
 */
const widths = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};

/**
 * ## De qué lado entra (Patch POS2.0-B)
 *
 * El detalle entra por la derecha, que es donde la lectura termina. **La
 * navegación entra por la izquierda**, porque es de donde viene: un menú que
 * aparece al otro extremo de la pantalla del botón que lo abrió obliga a buscar
 * lo que se acaba de pedir.
 *
 * Es un `prop`, no un componente aparte: el comportamiento —Escape, foco
 * atrapado, pulsación fuera, bloqueo del desplazamiento— es idéntico, y
 * duplicarlo para cambiar un `inset` habría sido duplicar exactamente lo que
 * `overlay.tsx` existe para no duplicar.
 */
const sides = {
  right: "right-0 border-l sb-animate-drawer",
  left: "left-0 border-r sb-animate-drawer-left",
};

export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  side = "right",
  children,
  className,
  contentClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof widths;
  side?: keyof typeof sides;
  children?: React.ReactNode;
  className?: string;
  /**
   * Para contenido a sangre —una navegación, una tabla— que trae su propio
   * espaciado y no quiere el del cajón.
   */
  contentClassName?: string;
}) {
  const surface = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useModalSurface(open, surface, onClose);
  useOutsideToClose(open, surface, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex: "var(--sb-z-drawer)" }}>
      <OverlayScrim onClose={onClose} />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "absolute inset-y-0 flex w-full flex-col border-slate-200 bg-white",
          sides[side],
          widths[size],
          className,
        )}
        ref={surface}
        role="dialog"
        style={{ boxShadow: "var(--sb-shadow-overlay)" }}
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            aria-label="Cerrar"
            className="sb-focus -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className={cn(
            "sb-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4",
            contentClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
