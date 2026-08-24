"use client";

import { BookOpenCheck, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { FinancialAuditTimeline } from "@/features/operations/components/financial-audit-timeline";
import {
  CancelButton,
} from "@/features/operations/modules/contabilidad-db/contabilidad-documents-db-panel";
import {
  ContaErrorNotice,
  ContaSectionCard,
  ContaTotal,
  LedgerRestrictedNotice,
  formatContaAmount,
  formatContaDate,
  journalStatusTone,
  parseAmount,
  selectClass,
  useContaRunner,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  addJournalEntryLineAction,
  cancelJournalEntryAction,
  createJournalEntryAction,
  postJournalEntryAction,
  reconcileJournalEntryAction,
  removeJournalEntryLineAction,
} from "@/server/contabilidad/actions";
import type {
  ChartAccountDTO,
  JournalEntryDetailDTO,
} from "@/server/contabilidad/shared";
import type { FinancialAuditEventDTO } from "@/server/financial-audit/shared";

/**
 * Database-backed asientos contables (`/panel/contabilidad/diarios`). A draft
 * may be unbalanced; posting requires at least one line and debit == credit.
 * Debit, credit and difference come straight from the persisted lines.
 */
export function ContabilidadJournalsDbPanel({
  accounts,
  auditEvents,
  canOperate,
  canReview,
  canViewLedger,
  enabled,
  entries,
  scopeLabel,
  supervision,
}: {
  accounts: ChartAccountDTO[];
  auditEvents: FinancialAuditEventDTO[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  entries: JournalEntryDetailDTO[];
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Asientos contables con sus líneas de debe y haber. Un borrador puede quedar descuadrado; contabilizar exige que cuadre."
        enabled={enabled}
        icon={BookOpenCheck}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Asientos"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? <JournalForm disabled={pending} onRun={run} /> : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Asientos</h2>
          {entries.length ? (
            <div className="mt-4 space-y-4">
              {entries.map((entry) => (
                <JournalRow
                  accounts={accounts}
                  auditEvents={auditEvents.filter(
                    (event) => event.entityCode === entry.entryNumber,
                  )}
                  canOperate={canOperate}
                  canReview={canReview}
                  disabled={pending}
                  entry={entry}
                  key={entry.id}
                  onRun={run}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra el primer asiento y agrega sus líneas."
              icon={BookOpenCheck}
              title="Sin asientos registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function JournalRow({
  accounts,
  auditEvents,
  canOperate,
  canReview,
  disabled,
  entry,
  onRun,
}: {
  accounts: ChartAccountDTO[];
  auditEvents: FinancialAuditEventDTO[];
  canOperate: boolean;
  canReview: boolean;
  disabled: boolean;
  entry: JournalEntryDetailDTO;
  onRun: ContaRunner;
}) {
  const isDraft = entry.status === "BORRADOR";

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={journalStatusTone(entry.status)}>{entry.statusLabel}</Badge>
            <span className="text-sm font-semibold text-slate-900">
              {entry.entryNumber}
            </span>
            <Badge tone="slate">{entry.sourceLabel}</Badge>
            <Badge tone={entry.isBalanced ? "green" : "amber"}>
              {entry.isBalanced ? "Cuadrado" : "Descuadrado"}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {formatContaDate(entry.entryDate)}
            {entry.supplier ? ` · ${entry.supplier}` : ""}
            {entry.accountingDocumentNumber
              ? ` · Doc. ${entry.accountingDocumentNumber}`
              : ""}
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ContaTotal label="Debe" value={formatContaAmount(entry.debitTotal)} />
        <ContaTotal label="Haber" value={formatContaAmount(entry.creditTotal)} />
        <ContaTotal emphasis label="Diferencia" value={formatContaAmount(entry.difference)} />
      </div>

      {entry.lines.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-3">Cuenta</th>
                <th className="py-1.5 pr-3">Concepto</th>
                <th className="py-1.5 pr-3 text-right">Debe</th>
                <th className="py-1.5 pr-3 text-right">Haber</th>
                {canOperate && isDraft ? <th className="py-1.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line) => (
                <tr className="border-t border-slate-100" key={line.id}>
                  <td className="py-1.5 pr-3">
                    {line.accountCode} · {line.accountName}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-500">{line.concept ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatContaAmount(line.debit)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatContaAmount(line.credit)}
                  </td>
                  {canOperate && isDraft ? (
                    <td className="py-1.5 text-right">
                      <Button
                        disabled={disabled}
                        onClick={() =>
                          onRun(() =>
                            removeJournalEntryLineAction({ lineId: line.id }),
                          )
                        }
                        size="sm"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {canOperate && isDraft ? (
        <AddLineForm accounts={accounts} disabled={disabled} entryId={entry.id} onRun={onRun} />
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {canReview && isDraft ? (
          <Button
            disabled={disabled}
            onClick={() => onRun(() => postJournalEntryAction({ entryId: entry.id }))}
            size="sm"
            variant="secondary"
          >
            Contabilizar
          </Button>
        ) : null}
        {canReview && entry.status === "CONTABILIZADO" ? (
          <Button
            disabled={disabled}
            onClick={() => onRun(() => reconcileJournalEntryAction({ entryId: entry.id }))}
            size="sm"
            variant="success"
          >
            Conciliar
          </Button>
        ) : null}
        {canOperate && isDraft ? (
          <CancelButton
            disabled={disabled}
            onCancel={(reason) =>
              onRun(() => cancelJournalEntryAction({ entryId: entry.id, reason }))
            }
          />
        ) : null}
      </div>

      <FinancialAuditTimeline events={auditEvents} title="Historial financiero" />
    </div>
  );
}

function AddLineForm({
  accounts,
  disabled,
  entryId,
  onRun,
}: {
  accounts: ChartAccountDTO[];
  disabled: boolean;
  entryId: string;
  onRun: ContaRunner;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [concept, setConcept] = useState("");
  const [debit, setDebit] = useState("0");
  const [credit, setCredit] = useState("0");

  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_auto] sm:items-end">
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-500">Cuenta</span>
        <select
          className={selectClass}
          onChange={(event) => setAccountId(event.target.value)}
          value={accountId}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} · {account.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-500">Concepto</span>
        <Input onChange={(event) => setConcept(event.target.value)} value={concept} />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-500">Debe</span>
        <Input inputMode="decimal" onChange={(event) => setDebit(event.target.value)} value={debit} />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block font-medium text-slate-500">Haber</span>
        <Input inputMode="decimal" onChange={(event) => setCredit(event.target.value)} value={credit} />
      </label>
      <Button
        disabled={disabled || !accountId}
        onClick={() =>
          onRun(
            () =>
              addJournalEntryLineAction({
                entryId,
                accountId,
                concept: concept || null,
                debit: parseAmount(debit),
                credit: parseAmount(credit),
              }),
            () => {
              setConcept("");
              setDebit("0");
              setCredit("0");
            },
          )
        }
        size="sm"
      >
        <Plus className="h-4 w-4" />
        Línea
      </Button>
    </div>
  );
}

function JournalForm({
  disabled,
  onRun,
}: {
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="mt-6">
      <FormSection
        description="Crea el asiento en borrador; luego agrega sus líneas de debe y haber."
        title="Registrar asiento"
      >
        <Field label="Fecha" required>
          <Input
            onChange={(event) => setEntryDate(event.target.value)}
            type="date"
            value={entryDate}
          />
        </Field>
        <Field hint="Opcional." label="Proveedor / tercero">
          <Input onChange={(event) => setSupplier(event.target.value)} value={supplier} />
        </Field>
        <Field hint="Opcional." label="# Factura">
          <Input
            onChange={(event) => setInvoiceNumber(event.target.value)}
            value={invoiceNumber}
          />
        </Field>
        <Field hint="Opcional." label="Observaciones">
          <Input onChange={(event) => setNotes(event.target.value)} value={notes} />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={disabled}
          onClick={() =>
            onRun(
              () =>
                createJournalEntryAction({
                  entryDate,
                  supplier: supplier || null,
                  invoiceNumber: invoiceNumber || null,
                  notes: notes || null,
                }),
              () => {
                setSupplier("");
                setInvoiceNumber("");
                setNotes("");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar asiento
        </Button>
      </div>
    </div>
  );
}
