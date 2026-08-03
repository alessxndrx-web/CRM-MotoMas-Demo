"use client";

import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import type {
  CashClosingStatusValue,
  CashDocumentStatusValue,
  CashSessionStatusValue,
} from "@/server/caja/shared";

/**
 * Presentation helpers shared by the database-backed Caja sections. The panels
 * never enforce permissions with them: every mutation re-checks role and scope
 * inside its server action.
 */

export const selectClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export type CajaRunner = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  onSuccess?: () => void,
) => void;

export function useCajaRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run: CajaRunner = (action, onSuccess) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      onSuccess?.();
      router.refresh();
    });
  };

  return { error, pending, run, setError };
}

export function CajaErrorNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div
      className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
      data-testid="caja-error"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      {error}
    </div>
  );
}

/** Uppercase chip that states the reader's Caja scope. */
export function CajaScopeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
      {label}
    </span>
  );
}

/** Label + value pair used across document, turno and cierre summaries. */
export function CajaTotal({
  emphasis,
  label,
  testId,
  value,
}: {
  emphasis?: boolean;
  label: string;
  /** Patch FF2.1-C. Stable anchor for the browser suite. */
  testId?: string;
  value: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3"
      data-testid={testId}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={
          emphasis
            ? "mt-1 text-lg font-bold text-slate-900"
            : "mt-1 text-sm font-semibold text-slate-700"
        }
      >
        {value}
      </p>
    </div>
  );
}

export function formatCajaAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatCajaDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-NI", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Parses a money field, treating an empty input as zero. */
export function parseAmount(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function documentStatusTone(status: CashDocumentStatusValue) {
  if (status === "EMITIDO") return "green" as const;
  if (status === "ANULADO") return "red" as const;
  return "amber" as const;
}

export function sessionStatusTone(status: CashSessionStatusValue) {
  if (status === "ABIERTO") return "green" as const;
  if (status === "ANULADO") return "red" as const;
  return "slate" as const;
}

export function closingStatusTone(status: CashClosingStatusValue) {
  if (status === "REVISADO_CONTABILIDAD") return "green" as const;
  if (status === "CERRADO") return "blue" as const;
  if (status === "ANULADO") return "red" as const;
  return "amber" as const;
}
