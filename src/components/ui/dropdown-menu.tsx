"use client";

import { Check, ChevronDown } from "lucide-react";
import * as React from "react";

import { useEscapeToClose, useOutsideToClose } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — dropdown and context menus (Patch POS2.0-A).
 *
 * A menu is **actions on one thing**. It is not navigation (that is the sidebar)
 * and not a value picker (that is `Select`). When a menu starts holding the only
 * route to a screen, the navigation is wrong, not the menu.
 *
 * ## Keyboard first
 *
 * Arrow keys move, Home and End jump, Escape closes and returns focus, Enter
 * activates. A menu you can only reach with a mouse is a menu the counter staff
 * will not use — they work with one hand on the keyboard and one on the scanner.
 *
 * ## Not a modal
 *
 * A menu does **not** trap focus and does **not** lock scroll: it is a
 * lightweight surface that yields the moment attention moves. Only dialogs and
 * drawers earn the right to block the page.
 */
export type MenuItem = {
  label: string;
  onSelect: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  /** Danger renders red. Reserve it for what cannot be undone. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Renders a check on the left. For "which of these is active" menus. */
  selected?: boolean;
};

export function DropdownMenu({
  trigger,
  items,
  align = "end",
  label,
  className,
}: {
  /** Any element. The menu wires the aria attributes onto its own wrapper. */
  trigger: React.ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  /** Accessible name for the menu itself, when the trigger is an icon. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const close = React.useCallback(() => setOpen(false), []);

  useEscapeToClose(open, close);
  useOutsideToClose(open, wrapper, close);

  return (
    <div className={cn("relative inline-flex", className)} ref={wrapper}>
      <span
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </span>

      {open ? (
        <MenuList align={align} items={items} label={label} onClose={close} />
      ) : null}
    </div>
  );
}

/**
 * Mounted only while open, so the cursor starts on the first item without an
 * effect writing state — the same reason `CommandPalette` splits in two.
 */
function MenuList({
  items,
  align,
  label,
  onClose,
}: {
  items: MenuItem[];
  align: "start" | "end";
  label?: string;
  onClose: () => void;
}) {
  const [active, setActive] = React.useState(0);
  const list = React.useRef<HTMLDivElement>(null);
  const enabled = items.filter((item) => !item.disabled);

  // Focusing the list is DOM synchronisation, which is what an effect is for.
  React.useEffect(() => {
    list.current?.focus();
  }, []);

  function move(delta: number) {
    if (!enabled.length) return;
    setActive((current) => {
      const next = current + delta;
      if (next < 0) return enabled.length - 1;
      if (next >= enabled.length) return 0;
      return next;
    });
  }

  function handleKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(enabled.length - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = enabled[active];
      if (item) {
        item.onSelect();
        onClose();
      }
    }
  }

  return (
    <div
      aria-label={label}
      className={cn(
        "sb-animate-menu absolute top-full mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 outline-none",
        align === "end" ? "right-0" : "left-0",
      )}
      onKeyDown={handleKey}
      ref={list}
      role="menu"
      style={{
        zIndex: "var(--sb-z-dropdown)",
        boxShadow: "var(--sb-shadow-raised)",
      }}
      tabIndex={-1}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const position = enabled.indexOf(item);
        const isActive = position === active && position !== -1;
        return (
          <button
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
              item.disabled
                ? "cursor-not-allowed text-slate-300"
                : item.tone === "danger"
                  ? "text-red-600 hover:bg-red-50"
                  : "text-slate-700 hover:bg-slate-50",
              isActive && !item.disabled
                ? item.tone === "danger"
                  ? "bg-red-50"
                  : "bg-slate-50"
                : null,
            )}
            disabled={item.disabled}
            key={`${item.label}-${index}`}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
            onMouseEnter={() => position !== -1 && setActive(position)}
            role="menuitem"
            type="button"
          >
            {item.selected !== undefined ? (
              <Check
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  item.selected ? "text-blue-600" : "text-transparent",
                )}
              />
            ) : Icon ? (
              <Icon className="h-4 w-4 shrink-0 opacity-70" />
            ) : null}
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Separator for menus long enough to need grouping. Rare, on purpose. */
export function MenuSeparator() {
  // `role="none"` already removes it from the accessibility tree; adding
  // `aria-hidden` on top is unsupported for that role, not merely redundant.
  return <div className="my-1 h-px bg-slate-100" role="none" />;
}

/** The default trigger: a quiet button that reads as "there is more here". */
export function MenuTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "sb-focus inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50",
        className,
      )}
      type="button"
    >
      {children}
      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
    </button>
  );
}
