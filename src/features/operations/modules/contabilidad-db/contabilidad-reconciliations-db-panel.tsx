"use client";

import { Plus, Scale } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { CancelButton } from "@/features/operations/modules/contabilidad-db/contabilidad-documents-db-panel";
import {
  BranchSelect,
  ContaErrorNotice,
  ContaSectionCard,
  ContaTotal,
  LedgerRestrictedNotice,
  formatContaAmount,
  formatContaDate,
  parseAmount,
  reconciliationStatusTone,
  selectClass,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  cancelBankReconciliationAction,
  createBankReconciliationAction,
  reviewBankReconciliationAction,
} from "@/server/contabilidad/actions";
import type {
  BankAccountDTO,
  BankReconciliationDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed conciliaciones (`/panel/contabilidad/conciliacion`). The
 * status is derived server-side: a movement matching its linked document total
 * becomes CONCILIADO, otherwise DIFERENCIA — never client-supplied.
 */
export function ContabilidadReconciliationsDbPanel({
  bankAccounts,
  branches,
  canOperate,
  canReview,
  canViewLedger,
  enabled,
  records,
  scopeLabel,
  supervision,
}: {
  bankAccounts: BankAccountDTO[];
  branches: BranchOption[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  records: BankReconciliationDTO[];
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Movimientos bancarios frente al documento contable vinculado. La diferencia y el estado se derivan del sistema."
        enabled={enabled}
        icon={Scale}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Conciliaciones"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <ReconciliationForm
                bankAccounts={bankAccounts}
                branches={branches}
                disabled={pending}
                onRun={run}
              />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Movimientos</h2>
          {records.length ? (
            <div className="mt-4 space-y-3">
              {records.map((record) => (
                <div className="rounded-xl border border-slate-200 p-4" key={record.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={reconciliationStatusTone(record.status)}>
                          {record.statusLabel}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">
                          {record.bankName}
                        </span>
                        <Badge tone="slate">{record.accountNumber}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {record.branchName} · {formatContaDate(record.movementDate)}
                        {record.accountingDocumentNumber
                          ? ` · Doc. ${record.accountingDocumentNumber}`
                          : ""}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <ContaTotal
                      label="Monto del sistema"
                      value={
                        record.accountingDocumentTotal === null
                          ? "—"
                          : formatContaAmount(record.accountingDocumentTotal)
                      }
                    />
                    <ContaTotal
                      label="Monto del banco"
                      value={formatContaAmount(record.amount)}
                    />
                    <ContaTotal
                      emphasis
                      label="Diferencia"
                      value={
                        record.difference === null
                          ? "—"
                          : formatContaAmount(record.difference)
                      }
                    />
                  </div>

                  {record.status !== "ANULADO" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canReview && record.status === "PENDIENTE" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              reviewBankReconciliationAction({
                                reconciliationId: record.id,
                              }),
                            )
                          }
                          size="sm"
                          variant="success"
                        >
                          Conciliar
                        </Button>
                      ) : null}
                      {canOperate ? (
                        <CancelButton
                          disabled={pending}
                          onCancel={(reason) =>
                            run(() =>
                              cancelBankReconciliationAction({
                                reconciliationId: record.id,
                                reason,
                              }),
                            )
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra el primer movimiento bancario a conciliar."
              icon={Scale}
              title="Sin movimientos registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ReconciliationForm({
  bankAccounts,
  branches,
  disabled,
  onRun,
}: {
  bankAccounts: BankAccountDTO[];
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [movementDate, setMovementDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState("0");
  const [reference, setReference] = useState("");

  if (!bankAccounts.length) {
    return (
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
        Registra una cuenta bancaria antes de conciliar movimientos.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <FormSection description="La diferencia y el estado los deriva el sistema al conciliar." title="Registrar movimiento">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Cuenta bancaria" required>
          <select
            className={selectClass}
            onChange={(event) => setBankAccountId(event.target.value)}
            value={bankAccountId}
          >
            {bankAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName} · {account.accountNumber}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha" required>
          <Input
            onChange={(event) => setMovementDate(event.target.value)}
            type="date"
            value={movementDate}
          />
        </Field>
        <Field label="Monto del banco" required>
          <Input inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
        </Field>
        <Field className="sm:col-span-2" hint="Opcional." label="Referencia">
          <Input onChange={(event) => setReference(event.target.value)} value={reference} />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !bankAccountId}
          onClick={() =>
            onRun(
              () =>
                createBankReconciliationAction({
                  branchCode,
                  bankAccountId,
                  movementDate,
                  amount: parseAmount(amount),
                  reference: reference || null,
                }),
              () => {
                setAmount("0");
                setReference("");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar movimiento
        </Button>
      </div>
    </div>
  );
}
