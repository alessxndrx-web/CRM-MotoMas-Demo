"use client";

import { AlertCircle, Lock, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import type {
  AccountingClosingStatusValue,
  AccountingDocumentStatusValue,
  BankReconciliationStatusValue,
  ExpenseStatusValue,
  JournalEntryStatusValue,
  PayrollStatusValue,
  VoucherStatusValue,
} from "@/server/contabilidad/shared";

/**
 * Presentation helpers shared by the database-backed Contabilidad sections
 * (Patch 3.5C). The panels never enforce permissions with them: every mutation
 * re-checks role and scope inside its server action, and every list re-applies
 * the reader's scope inside its query.
 */

export type BranchOption = { code: string; name: string };

export const selectClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export type ContaRunner = (
  action: () => Promise<{ ok: boolean; error?: string }>,
  onSuccess?: () => void,
) => void;

export function useContaRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run: ContaRunner = (action, onSuccess) => {
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

export function ContaErrorNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {error}
    </div>
  );
}

/** Uppercase chip that states the reader's Contabilidad scope. */
export function ContaScopeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-600">
      {label}
    </span>
  );
}

/** Label + value pair used across the Contabilidad summaries. */
export function ContaTotal({
  emphasis,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
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

/**
 * Standard header + gating wrapper for a database-backed Contabilidad section.
 * Renders the business badge, scope chip, description and (when disabled) an
 * unavailable notice; children render only when `enabled`.
 */
export function ContaSectionCard({
  businessDescription,
  children,
  enabled,
  icon: Icon,
  scopeLabel,
  supervision,
  title,
}: {
  businessDescription: string;
  children: ReactNode;
  enabled: boolean;
  icon: LucideIcon;
  scopeLabel: string;
  supervision: boolean;
  title: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel={`${title} · ${supervision ? "Supervisión" : "Operación"}`}
            technicalLabel={`${title} · Base de datos (fuente principal)`}
          />
          <ContaScopeChip label={scopeLabel} />
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <PrimarySectionDescription
        businessText={businessDescription}
        technicalText="Sección respaldada por PostgreSQL. El historial anterior sigue disponible debajo mientras se completa su migración."
      />

      {enabled ? (
        children
      ) : (
        <SectionUnavailableNotice
          businessText="Esta sección aún no está disponible."
          technicalText={
            <>
              Esta sección requiere <code>DATABASE_URL</code> configurado y una
              sucursal asignada.
            </>
          }
        />
      )}
    </Card>
  );
}

/** Shown on ledger sections that a Manager (branch-read-only) cannot enter. */
export function LedgerRestrictedNotice() {
  return (
    <div className="mt-5 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      Esta sección está reservada para Contabilidad. Tu rol solo consulta el
      resumen y los costos de inventario de tu sucursal.
    </div>
  );
}

export function formatContaAmount(value: number) {
  return new Intl.NumberFormat("es-NI", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatContaDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Parses a money field, treating an empty input as zero. */
export function parseAmount(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function documentStatusTone(status: AccountingDocumentStatusValue) {
  if (status === "CONCILIADO" || status === "CONTABILIZADO") return "green" as const;
  if (status === "ANULADO") return "red" as const;
  if (status === "REVISADO") return "blue" as const;
  return "amber" as const;
}

export function journalStatusTone(status: JournalEntryStatusValue) {
  if (status === "CONCILIADO" || status === "CONTABILIZADO") return "green" as const;
  if (status === "ANULADO") return "red" as const;
  return "amber" as const;
}

export function voucherStatusTone(status: VoucherStatusValue) {
  if (status === "CONCILIADO") return "green" as const;
  if (status === "ANULADO") return "red" as const;
  return "amber" as const;
}

export function expenseStatusTone(status: ExpenseStatusValue) {
  return status === "REVISADO" ? ("green" as const) : ("amber" as const);
}

export function payrollStatusTone(status: PayrollStatusValue) {
  if (status === "PAGADA") return "green" as const;
  if (status === "PREPARADA") return "blue" as const;
  return "amber" as const;
}

export function reconciliationStatusTone(status: BankReconciliationStatusValue) {
  if (status === "CONCILIADO") return "green" as const;
  if (status === "DIFERENCIA") return "amber" as const;
  if (status === "ANULADO") return "red" as const;
  return "slate" as const;
}

export function closingStatusTone(status: AccountingClosingStatusValue) {
  if (status === "CERRADO") return "green" as const;
  if (status === "EN_REVISION") return "blue" as const;
  if (status === "REABIERTO") return "amber" as const;
  return "slate" as const;
}

/** Branch <select> for the global roles; branch-read-only roles never see it. */
export function BranchSelect({
  branches,
  onChange,
  value,
}: {
  branches: BranchOption[];
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      className={selectClass}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">Selecciona una sucursal…</option>
      {branches.map((branch) => (
        <option key={branch.code} value={branch.code}>
          {branch.name}
        </option>
      ))}
    </select>
  );
}
