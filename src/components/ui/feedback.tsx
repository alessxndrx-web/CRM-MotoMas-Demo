"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * SmartBitz Design System — loading and notification (Patch POS2.0-A).
 *
 * Four states an ERP screen is always in one of: loading, empty, populated,
 * failed. `EmptyState` already owns "empty"; this module owns the other two ends.
 */

/* -------------------------------------------------------------------------
 * Skeletons
 * ---------------------------------------------------------------------- */

/**
 * A placeholder shaped like the thing that is coming.
 *
 * **A spinner says "wait"; a skeleton says "wait, and here is what for".** The
 * second is worth more on a table of forty rows, because the user can start
 * reading the layout before the data lands.
 *
 * The rule that makes skeletons work: **match the real geometry**. A skeleton
 * whose rows are shorter than the real ones produces a visible jump on arrival,
 * which is exactly the flicker it was meant to prevent.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("sb-skeleton rounded-md", className)}
      {...props}
    />
  );
}

/** A table's worth of skeleton rows, matching `TD` padding and line height. */
export function SkeletonTable({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div aria-busy className={cn("divide-y divide-slate-100", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <div className="flex items-center gap-4 px-4 py-3" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              className="h-4"
              key={column}
              // Uneven widths: a grid of identical bars reads as a pattern, not
              // as data arriving.
              style={{ width: column === 0 ? "28%" : `${18 - column * 2}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Patch POS2.0-C — las otras tres geometrías que el panel repite.
 *
 * `SkeletonTable` cubría los listados. Una tarjeta de indicador, un formulario y
 * un bloque de texto tienen forma propia, y un esqueleto que no la respeta
 * produce el salto que venía a evitar.
 *
 * Todos heredan `sb-skeleton`, que el bloque de `prefers-reduced-motion` de
 * `globals.css` ya desactiva: no se añade ninguna animación nueva.
 */

/** Una fila de tarjetas de indicador. */
export function SkeletonCards({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          key={index}
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** Un formulario de dos columnas: rótulo corto sobre control alto. */
export function SkeletonForm({
  fields = 6,
  columns = 2,
  className,
}: {
  fields?: number;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <div
      aria-busy
      className={cn("grid gap-4", columns === 2 ? "sm:grid-cols-2" : null, className)}
    >
      {Array.from({ length: fields }, (_, index) => (
        <div key={index}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-1.5 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Un bloque de prosa o de detalle: líneas de largo desigual. */
export function SkeletonBlock({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-busy className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          className="h-4"
          key={index}
          // La última línea corta: es lo que hace que se lea como párrafo.
          style={{ width: index === lines - 1 ? "58%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** La página entera: cabecera, controles y tabla. */
export function SkeletonPage({ className }: { className?: string }) {
  return (
    <div aria-busy className={cn("space-y-6", className)}>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <Skeleton className="h-10 w-64 max-w-full" />
        </div>
        <SkeletonTable />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Spinner and overlay
 * ---------------------------------------------------------------------- */

export function Spinner({
  className,
  label = "Cargando",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Loader2
      aria-label={label}
      className={cn("sb-animate-spin h-4 w-4 text-slate-400", className)}
      role="status"
    />
  );
}

/**
 * Covers a region while a write is in flight.
 *
 * **Scoped to its container, never to the page.** A full-screen block for a
 * three-second save teaches users the application freezes; covering only the
 * card they acted on tells them exactly what is busy and leaves the rest usable.
 *
 * Requires `relative` on the parent — the same contract as any absolute layer.
 */
export function LoadingOverlay({
  show,
  label = "Guardando…",
  className,
}: {
  show: boolean;
  label?: string;
  className?: string;
}) {
  if (!show) return null;
  return (
    <div
      aria-live="polite"
      className={cn(
        "sb-animate-overlay absolute inset-0 grid place-items-center rounded-[inherit] bg-white/70 backdrop-blur-[1px]",
        className,
      )}
      style={{ zIndex: "var(--sb-z-sticky)" }}
    >
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
        <Spinner />
        {label}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Inline notices
 * ---------------------------------------------------------------------- */

const noticeTones = {
  info: {
    className: "border-sky-200 bg-sky-50 text-sky-800",
    icon: Info,
    iconClass: "text-sky-500",
  },
  success: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
  },
  warning: {
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
  },
  danger: {
    className: "border-red-200 bg-red-50 text-red-800",
    icon: XCircle,
    iconClass: "text-red-500",
  },
};

/**
 * A message that belongs to a place on the page.
 *
 * **Inline for anything the user must fix; a toast for anything that already
 * happened.** A validation error in a toast disappears while the user is still
 * looking for the field it refers to — the single most common misuse of a
 * notification system.
 */
export function Notice({
  tone = "info",
  title,
  children,
  onDismiss,
  className,
}: {
  tone?: keyof typeof noticeTones;
  title?: string;
  children?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const config = noticeTones[tone];
  const Icon = config.icon;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        config.className,
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", config.iconClass)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          aria-label="Descartar"
          className="sb-focus -mr-1 -mt-1 grid h-6 w-6 shrink-0 place-items-center rounded opacity-60 transition-opacity hover:opacity-100"
          onClick={onDismiss}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Toasts
 * ---------------------------------------------------------------------- */

export type Toast = {
  id: number;
  tone: keyof typeof noticeTones;
  title: string;
  description?: string;
};

type ToastContextValue = {
  toast: (input: Omit<Toast, "id">) => void;
  dismiss: (id: number) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

/**
 * Toasts for **confirmations of things that already succeeded**.
 *
 * Deliberate constraints:
 *
 * - **They auto-dismiss**, except `danger`, which stays until dismissed. A
 *   failure the user did not read is a failure that will be repeated.
 * - **They stack, bottom-right, at most a handful.** A queue that grows without
 *   bound becomes a wall nobody reads.
 * - **`aria-live="polite"`**, so a screen reader announces them without cutting
 *   off whatever the user is doing.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { ...input, id }]);
      if (input.tone !== "danger") {
        window.setTimeout(() => dismiss(id), 4500);
      }
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 flex w-full max-w-sm flex-col gap-2"
        style={{ zIndex: "var(--sb-z-toast)" }}
      >
        {toasts.map((item) => (
          <div className="sb-animate-toast pointer-events-auto" key={item.id}>
            <Notice
              className="shadow-lg"
              onDismiss={() => dismiss(item.id)}
              title={item.title}
              tone={item.tone}
            >
              {item.description}
            </Notice>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Throws when used outside the provider, on purpose: a toast that silently does
 * nothing is worse than a crash in development, because it ships.
 */
export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast requiere <ToastProvider> por encima en el árbol.");
  }
  return context;
}
