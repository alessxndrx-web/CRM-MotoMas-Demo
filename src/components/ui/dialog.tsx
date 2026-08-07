"use client";

import { X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { OverlayScrim, useModalSurface, useOutsideToClose } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — dialog (Patch POS2.0-A).
 *
 * A dialog interrupts. That is its cost and its only justification: use it when
 * the answer must come **before** the user does anything else. Everything that
 * can wait belongs in a drawer, a page, or an inline form.
 *
 * ## Why not a `<dialog>` element
 *
 * The native element brings its own top-layer and backdrop, which is genuinely
 * useful — but its focus and dismissal behaviour still differ enough across
 * browsers that the panel would need this same code anyway, and then have two
 * behaviours to keep aligned. One implementation, composed from
 * `components/ui/overlay`.
 */
const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = "md",
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof sizes;
  children?: React.ReactNode;
  className?: string;
}) {
  const surface = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  useModalSurface(open, surface, onClose);
  useOutsideToClose(open, surface, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 grid place-items-center p-4"
      style={{ zIndex: "var(--sb-z-dialog)" }}
    >
      <OverlayScrim onClose={onClose} />
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "sb-animate-dialog relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white",
          sizes[size],
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
              <p className="mt-1 text-sm text-slate-500" id={descriptionId}>
                {description}
              </p>
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

        <div className="sb-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
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

/**
 * The confirmation dialog, as one component instead of one per screen.
 *
 * **The tone drives the button, and the copy is the caller's job.** A dialog
 * that asks "¿Estás seguro?" tells the user nothing they did not already know;
 * the title should name the consequence — "Anular la orden OC-2026-0031" — which
 * is why `title` and `confirmLabel` are required and have no defaults worth
 * guessing.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  pending = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  pending?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      description={description}
      footer={
        <>
          <Button disabled={pending} onClick={onClose} variant="secondary">
            {cancelLabel}
          </Button>
          <Button
            disabled={pending}
            onClick={onConfirm}
            variant={tone === "danger" ? "danger" : "default"}
          >
            {confirmLabel}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="sm"
      title={title}
    >
      {children}
    </Dialog>
  );
}
