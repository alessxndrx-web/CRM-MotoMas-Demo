"use client";

import { Plus, Users } from "lucide-react";
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
  formatContaAmount,
  parseAmount,
  payrollStatusTone,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  createPayrollRecordAction,
  markPayrollRecordPaidAction,
  preparePayrollRecordAction,
} from "@/server/contabilidad/actions";
import {
  calculatePayrollNetPay,
  type PayrollRecordDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed planilla (`/panel/contabilidad/planilla`). A flat record:
 * BORRADOR → PREPARADA → PAGADA. Every amount is captured manually; no payroll
 * tax rule is applied.
 */
export function ContabilidadPayrollDbPanel({
  branches,
  canOperate,
  canReview,
  canViewLedger,
  enabled,
  payroll,
  scopeLabel,
  supervision,
}: {
  branches: BranchOption[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  payroll: PayrollRecordDTO[];
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Planilla por empleado y periodo. El neto se calcula: salario más comisiones y bonos, menos deducciones y adelantos."
        enabled={enabled}
        icon={Users}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Planilla"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <PayrollForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Planilla</h2>
          {payroll.length ? (
            <div className="mt-4 space-y-3">
              {payroll.map((record) => (
                <div className="rounded-xl border border-slate-200 p-4" key={record.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={payrollStatusTone(record.status)}>
                          {record.statusLabel}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">
                          {record.employeeName}
                        </span>
                        <Badge tone="slate">{record.period}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {record.branchName}
                        {record.position ? ` · ${record.position}` : ""}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatContaAmount(record.netPay)}
                    </div>
                  </div>
                  {canReview ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {record.status === "BORRADOR" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              preparePayrollRecordAction({
                                payrollRecordId: record.id,
                              }),
                            )
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Preparar
                        </Button>
                      ) : null}
                      {record.status === "PREPARADA" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              markPayrollRecordPaidAction({
                                payrollRecordId: record.id,
                              }),
                            )
                          }
                          size="sm"
                          variant="success"
                        >
                          Marcar pagada
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra la primera planilla del periodo."
              icon={Users}
              title="Sin planilla registrada"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function PayrollForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [employeeName, setEmployeeName] = useState("");
  const [position, setPosition] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [baseSalary, setBaseSalary] = useState("0");
  const [commissions, setCommissions] = useState("0");
  const [bonuses, setBonuses] = useState("0");
  const [deductions, setDeductions] = useState("0");
  const [advances, setAdvances] = useState("0");

  const netPay = useMemo(
    () =>
      calculatePayrollNetPay({
        advances: parseAmount(advances),
        baseSalary: parseAmount(baseSalary),
        bonuses: parseAmount(bonuses),
        commissions: parseAmount(commissions),
        deductions: parseAmount(deductions),
      }),
    [advances, baseSalary, bonuses, commissions, deductions],
  );

  return (
    <div className="mt-6">
      <FormSection description="El periodo usa el formato AAAA-MM." title="Registrar planilla">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Empleado" required>
          <Input onChange={(event) => setEmployeeName(event.target.value)} value={employeeName} />
        </Field>
        <Field hint="Opcional." label="Cargo">
          <Input onChange={(event) => setPosition(event.target.value)} value={position} />
        </Field>
        <Field label="Periodo" required>
          <Input onChange={(event) => setPeriod(event.target.value)} type="month" value={period} />
        </Field>
        <Field label="Salario base" required>
          <Input inputMode="decimal" onChange={(event) => setBaseSalary(event.target.value)} value={baseSalary} />
        </Field>
        <Field label="Comisiones">
          <Input inputMode="decimal" onChange={(event) => setCommissions(event.target.value)} value={commissions} />
        </Field>
        <Field label="Bonos">
          <Input inputMode="decimal" onChange={(event) => setBonuses(event.target.value)} value={bonuses} />
        </Field>
        <Field label="Deducciones">
          <Input inputMode="decimal" onChange={(event) => setDeductions(event.target.value)} value={deductions} />
        </Field>
        <Field label="Adelantos">
          <Input inputMode="decimal" onChange={(event) => setAdvances(event.target.value)} value={advances} />
        </Field>
      </FormSection>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContaTotal emphasis label="Neto a pagar" value={formatContaAmount(netPay)} />
      </div>

      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !employeeName.trim()}
          onClick={() =>
            onRun(
              () =>
                createPayrollRecordAction({
                  branchCode,
                  employeeName,
                  position: position || null,
                  period,
                  baseSalary: parseAmount(baseSalary),
                  commissions: parseAmount(commissions),
                  bonuses: parseAmount(bonuses),
                  deductions: parseAmount(deductions),
                  advances: parseAmount(advances),
                }),
              () => {
                setEmployeeName("");
                setPosition("");
                setBaseSalary("0");
                setCommissions("0");
                setBonuses("0");
                setDeductions("0");
                setAdvances("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar planilla
        </Button>
      </div>
    </div>
  );
}
