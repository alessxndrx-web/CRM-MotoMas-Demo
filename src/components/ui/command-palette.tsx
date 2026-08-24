"use client";

import { CornerDownLeft, Search } from "lucide-react";
import * as React from "react";

import { useModalSurface, useOutsideToClose, OverlayScrim } from "@/components/ui/overlay";
import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — command palette foundation (Patch POS2.0-A).
 *
 * ## Why an ERP wants one
 *
 * The panel already carries sixteen navigation entries and will carry more. A
 * sidebar answers "what exists"; it answers "take me to the purchase order I was
 * just looking at" very badly. Counter staff work with a scanner in one hand —
 * for them, `Ctrl-K → three letters → Enter` is faster than any pointer path,
 * and it stays fast as the menu grows.
 *
 * ## Foundation, not a feature
 *
 * This ships the **surface and the interaction**: open, filter, move, choose,
 * close. It ships **no commands**. What the palette can do is a product decision
 * per module — jump to a route, run an action, search a record — and POS2.0-A is
 * explicitly forbidden from touching workflows. A later patch registers commands
 * by passing them in; nothing here needs to change for that.
 *
 * ## The matching is deliberately dumb
 *
 * Case- and accent-insensitive substring, over label plus keywords. Fuzzy
 * matching is worse here than it looks: with a Spanish catalogue full of similar
 * SKUs, a fuzzy ranker surfaces confident wrong answers, and a wrong answer the
 * user accepts at speed is the one failure mode a palette must not have.
 */
export type Command = {
  id: string;
  label: string;
  /** Extra terms to match on: synonyms, codes, the English name. */
  keywords?: string;
  /** The group heading. Commands are shown grouped, in insertion order. */
  group?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Right-aligned hint: a shortcut, a status, a branch. */
  hint?: string;
  onRun: () => void;
};

/** Strips accents so "devolucion" finds "Devolución". */
function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = "Buscar acciones, módulos y registros…",
  emptyLabel = "Sin coincidencias",
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
  emptyLabel?: string;
}) {
  // **Mount/unmount is the reset.** Rendering nothing while closed destroys the
  // surface and recreates it on open, so its query and cursor start clean
  // without an effect writing state — an effect that resets state on an `open`
  // prop is the classic source of cascading renders, and not having the state at
  // all beats clearing it.
  if (!open) return null;
  return (
    <CommandPaletteSurface
      commands={commands}
      emptyLabel={emptyLabel}
      onClose={onClose}
      placeholder={placeholder}
    />
  );
}

function CommandPaletteSurface({
  onClose,
  commands,
  placeholder,
  emptyLabel,
}: {
  onClose: () => void;
  commands: Command[];
  placeholder: string;
  emptyLabel: string;
}) {
  const surface = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);

  useModalSurface(true, surface, onClose);
  useOutsideToClose(true, surface, onClose);

  const matches = React.useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return commands;
    return commands.filter((command) =>
      fold(`${command.label} ${command.keywords ?? ""}`).includes(needle),
    );
  }, [commands, query]);

  // Clamped on read, never stored clamped: the list shrinks as the user types,
  // and deriving keeps the cursor valid without a second render.
  const active = Math.min(cursor, Math.max(matches.length - 1, 0));
  const setActive = setCursor;

  function handleKey(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current) => (current + 1) % Math.max(matches.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (current) => (current - 1 + Math.max(matches.length, 1)) % Math.max(matches.length, 1),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = matches[active];
      if (command) {
        command.onRun();
        onClose();
      }
    }
  }

  // Group headings, in the order the caller declared them.
  const groups: Array<{ name: string | undefined; items: Command[] }> = [];
  for (const command of matches) {
    const bucket = groups.find((group) => group.name === command.group);
    if (bucket) bucket.items.push(command);
    else groups.push({ name: command.group, items: [command] });
  }

  return (
    <div
      className="fixed inset-0 flex items-start justify-center p-4 pt-[12vh]"
      style={{ zIndex: "var(--sb-z-dialog)" }}
    >
      <OverlayScrim onClose={onClose} />
      <div
        aria-label="Paleta de comandos"
        aria-modal="true"
        className="sb-animate-dialog relative flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white"
        onKeyDown={handleKey}
        ref={surface}
        role="dialog"
        style={{ boxShadow: "var(--sb-shadow-overlay)" }}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            aria-activedescendant={matches[active] ? `sb-command-${matches[active].id}` : undefined}
            aria-controls="sb-command-list"
            aria-expanded
            autoFocus
            className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            role="combobox"
            value={query}
          />
          <kbd className="hidden shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 sm:block">
            Esc
          </kbd>
        </div>

        <div
          className="sb-scroll max-h-[50vh] overflow-y-auto py-1"
          id="sb-command-list"
          role="listbox"
        >
          {matches.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyLabel}</p>
          ) : (
            groups.map((group) => (
              <div key={group.name ?? "sin-grupo"}>
                {group.name ? (
                  <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {group.name}
                  </p>
                ) : null}
                {group.items.map((command) => {
                  const index = matches.indexOf(command);
                  const isActive = index === active;
                  const Icon = command.icon;
                  return (
                    <button
                      aria-selected={isActive}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                        isActive ? "bg-blue-50 text-blue-900" : "text-slate-700 hover:bg-slate-50",
                      )}
                      id={`sb-command-${command.id}`}
                      key={command.id}
                      onClick={() => {
                        command.onRun();
                        onClose();
                      }}
                      onMouseEnter={() => setActive(index)}
                      role="option"
                      type="button"
                    >
                      {Icon ? <Icon className="h-4 w-4 shrink-0 opacity-70" /> : null}
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.hint ? (
                        <span className="shrink-0 text-xs text-slate-400">{command.hint}</span>
                      ) : null}
                      {isActive ? (
                        <CornerDownLeft aria-hidden className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Binds the palette to Ctrl/⌘-K.
 *
 * The listener ignores the shortcut while focus is in a text field, so typing
 * "k" in a search box never opens it. `⌘-K` and `Ctrl-K` both work, because the
 * counter runs Windows and the office does not.
 */
export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    function handle(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      event.preventDefault();
      setOpen((value) => !value);
    }
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, []);

  return {
    open,
    setOpen,
    close: React.useCallback(() => setOpen(false), []),
  };
}
