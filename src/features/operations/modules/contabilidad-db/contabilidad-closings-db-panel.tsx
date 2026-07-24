"use client";

import { CalendarCheck, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  BranchSelect,
  ContaErrorNotice,
  ContaSectionCard,
  ContaTotal,
  LedgerRestrictedNotice,
  closingStatusTone,
  formatContaAmount,
  parseAmount,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  closeAccountingClosingAction,
  createAccountingClosingAction,
  reopenAccountingClosingAction,
  reviewAccountingClosingAction,
} from "@/server/contabilidad/actions";
import {
  calculateAccountingClosingDifference,
  type AccountingClosingDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed cierres contables (`/panel/contabilidad/cierres`). A closed
 * period is frozen; reopening requires a reason. Every transition is a server
 * action that re-checks role and current state.
 */
export function ContabilidadClosingsDbPanel({
  branches,
  canOperate,
  canReview,
  canViewLedger,
  closings,
  enabled,
  scopeLabel,
  supervision,
}: {
  branches: BranchOption[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  closings: AccountingClosingDTO[];
  enabled: boolean;
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Cierres por sucursal y periodo. Un periodo cerrado queda congelado hasta que se reabra con un motivo."
        enabled={enabled}
        icon={CalendarCheck}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Cierres"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <ClosingForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Cierres</h2>
          {closings.length ? (
            <div className="mt-4 space-y-3">
              {closings.map((closing) => (
                <div className="rounded-xl border border-slate-200 p-4" key={closing.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={closingStatusTone(closing.status)}>
                      {closing.statusLabel}
                    </Badge>
                    <span className="text-sm font-semibold text-slate-900">
                      {closing.period}
                    </span>
                    <Badge tone="slate">{closing.branchName}</Badge>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ContaTotal label="Ingresos" value={formatContaAmount(closing.incomeTotal)} />
                    <ContaTotal label="Gastos" value={formatContaAmount(closing.expenseTotal)} />
                    <ContaTotal label="Efectivo" value={formatContaAmount(closing.cashTotal)} />
                    <ContaTotal emphasis label="Diferencia" value={formatContaAmount(closing.difference)} />
                  </div>

                  {canReview ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(closing.status === "ABIERTO" || closing.status === "REABIERTO") ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              reviewAccountingClosingAction({ closingId: closing.id }),
                            )
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Revisar
                        </Button>
                      ) : null}
                      {closing.status === "EN_REVISION" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              closeAccountingClosingAction({ closingId: closing.id }),
                            )
                          }
                          size="sm"
                          variant="success"
                        >
                          Cerrar periodo
                        </Button>
                      ) : null}
                      {closing.status === "CERRADO" ? (
                        <p className="w-full text-xs text-slate-500">
                          Período bloqueado: no admite contabilizar asientos ni
                          documentos con fecha dentro de {closing.period} en
                          esta sucursal. Reabrir con motivo restaura la
                          operación.
                        </p>
                      ) : null}
                      {closing.status === "CERRADO" ? (
                        <ReopenButton
                          disabled={pending}
                          onReopen={(reason) =>
                            run(() =>
                              reopenAccountingClosingAction({
                                closingId: closing.id,
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
              description="Registra el primer cierre del periodo."
              icon={CalendarCheck}
              title="Sin cierres registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ReopenButton({
  disabled,
  onReopen,
}: {
  disabled: boolean;
  onReopen: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button disabled={disabled} onClick={() => setOpen(true)} size="sm" variant="secondary">
        Reabrir
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Input
        className="max-w-xs"
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo de la reapertura"
        value={reason}
      />
      <Button
        disabled={disabled || !reason.trim()}
        onClick={() => {
          onReopen(reason);
          setOpen(false);
          setReason("");
        }}
        size="sm"
        variant="secondary"
      >
        Confirmar reapertura
      </Button>
      <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
        Cancelar
      </Button>
    </div>
  );
}

function ClosingForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [incomeTotal, setIncomeTotal] = useState("0");
  const [expenseTotal, setExpenseTotal] = useState("0");
  const [retentionTotal, setRetentionTotal] = useState("0");
  const [appliedTotal, setAppliedTotal] = useState("0");
  const [cashTotal, setCashTotal] = useState("0");

  const difference = useMemo(
    () =>
      calculateAccountingClosingDifference({
        cashTotal: parseAmount(cashTotal),
        incomeTotal: parseAmount(incomeTotal),
      }),
    [cashTotal, incomeTotal],
  );

  return (
    <div className="mt-6">
      <FormSection description="La diferencia se deriva: efectivo menos ingresos. El periodo usa AAAA-MM." title="Registrar cierre">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Periodo" required>
          <Input onChange={(event) => setPeriod(event.target.value)} type="month" value={period} />
        </Field>
        <Field label="Ingresos">
          <Input inputMode="decimal" onChange={(event) => setIncomeTotal(event.target.value)} value={incomeTotal} />
        </Field>
        <Field label="Gastos">
          <Input inputMode="decimal" onChange={(event) => setExpenseTotal(event.target.value)} value={expenseTotal} />
        </Field>
        <Field label="Retenciones">
          <Input inputMode="decimal" onChange={(event) => setRetentionTotal(event.target.value)} value={retentionTotal} />
        </Field>
        <Field label="Abonos aplicados">
          <Input inputMode="decimal" onChange={(event) => setAppliedTotal(event.target.value)} value={appliedTotal} />
        </Field>
        <Field label="Efectivo recibido">
          <Input inputMode="decimal" onChange={(event) => setCashTotal(event.target.value)} value={cashTotal} />
        </Field>
      </FormSection>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContaTotal emphasis label="Diferencia" value={formatContaAmount(difference)} />
      </div>

      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode}
          onClick={() =>
            onRun(
              () =>
                createAccountingClosingAction({
                  branchCode,
                  period,
                  incomeTotal: parseAmount(incomeTotal),
                  expenseTotal: parseAmount(expenseTotal),
                  retentionTotal: parseAmount(retentionTotal),
                  appliedTotal: parseAmount(appliedTotal),
                  cashTotal: parseAmount(cashTotal),
                }),
              () => {
                setIncomeTotal("0");
                setExpenseTotal("0");
                setRetentionTotal("0");
                setAppliedTotal("0");
                setCashTotal("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar cierre
        </Button>
      </div>
    </div>
  );
}
