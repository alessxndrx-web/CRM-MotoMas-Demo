"use client";

import * as React from "react";

/**
 * SmartBitz Design System — shared overlay behaviour (Patch POS2.0-A).
 *
 * Dialogs, drawers and menus differ in **where they sit**, not in **how they
 * behave**: all three close on Escape, close when you click outside, and must
 * not leak focus to the page behind. Writing that three times would be three
 * places for the focus trap to drift.
 *
 * This module owns the behaviour. The visual surfaces compose it.
 *
 * The repository has no Radix and no headless-UI dependency, and POS2.0-A adds
 * none — so this is written against the platform directly.
 */

/** Elements that can hold focus, in document order. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Closes the surface on Escape.
 *
 * Bound to `keydown` on the document rather than the surface: a menu opened from
 * a button often has focus still on the button, and a listener on the panel
 * would never hear the key.
 */
export function useEscapeToClose(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return;
    function handle(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handle, true);
    return () => document.removeEventListener("keydown", handle, true);
  }, [open, onClose]);
}

/**
 * Closes the surface when a pointer lands outside it.
 *
 * Listens on `pointerdown`, not `click`: waiting for `click` lets the press
 * select text or focus a field behind the surface before it closes, which reads
 * as a lag the user did not cause.
 */
export function useOutsideToClose(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  React.useEffect(() => {
    if (!open) return;
    function handle(event: PointerEvent) {
      const node = ref.current;
      if (node && !node.contains(event.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handle, true);
    return () => document.removeEventListener("pointerdown", handle, true);
  }, [open, ref, onClose]);
}

/**
 * Keeps Tab inside the surface and restores focus on close.
 *
 * **Restoring focus is the half everyone forgets.** Closing a dialog and
 * dropping focus to `<body>` means the next Tab starts from the top of the page,
 * which for a keyboard user is worse than never having opened it.
 */
export function useFocusTrap(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;

    // Focus the first control, or the surface itself when it has none.
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    function handle(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const surface = ref.current;
      if (!surface) return;
      const items = Array.from(surface.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const start = items[0]!;
      const end = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    }

    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus?.();
    };
  }, [open, ref]);
}

/**
 * Stops the page behind a modal surface from scrolling.
 *
 * The scrollbar is replaced with equivalent padding so the layout does not jump
 * sideways the instant a dialog opens — a shift users read as a glitch.
 */
export function useScrollLock(open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const gap = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);
}

/** Everything a modal surface needs, in one call. */
export function useModalSurface(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEscapeToClose(open, onClose);
  useFocusTrap(open, ref);
  useScrollLock(open);
}

/** The dimmed backdrop shared by dialog and drawer. */
export function OverlayScrim({
  onClose,
  className,
}: {
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={[
        "sb-animate-overlay fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClose}
    />
  );
}
