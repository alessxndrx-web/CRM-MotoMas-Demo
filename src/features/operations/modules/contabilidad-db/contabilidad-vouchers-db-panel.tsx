"use client";

import { Plus, Receipt } from "lucide-react";
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
  LedgerRestrictedNotice,
  formatContaAmount,
  formatContaDate,
  parseAmount,
  selectClass,
  useContaRunner,
  voucherStatusTone,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  cancelAccountingVoucherAction,
  createAccountingVoucherAction,
  reconcileAccountingVoucherAction,
} from "@/server/contabilidad/actions";
import {
  voucherTypeLabels,
  voucherTypeValues,
  type AccountingVoucherDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed comprobantes (`/panel/contabilidad/comprobantes`). A voucher
 * is registered, reconciled or cancelled — there is no approval flow, matching
 * the model.
 */
export function ContabilidadVouchersDbPanel({
  branches,
  canOperate,
  canReview,
  canViewLedger,
  enabled,
  scopeLabel,
  supervision,
  vouchers,
}: {
  branches: BranchOption[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  scopeLabel: string;
  supervision: boolean;
  vouchers: AccountingVoucherDTO[];
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Comprobantes de ingreso, egreso y ajuste con su estado de conciliación."
        enabled={enabled}
        icon={Receipt}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Comprobantes"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <VoucherForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Comprobantes</h2>
          {vouchers.length ? (
            <div className="mt-4 space-y-3">
              {vouchers.map((voucher) => (
                <div className="rounded-xl border border-slate-200 p-4" key={voucher.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={voucherStatusTone(voucher.status)}>
                          {voucher.statusLabel}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">
                          {voucher.voucherNumber}
                        </span>
                        <Badge tone="slate">{voucher.typeLabel}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {voucher.beneficiary} · {voucher.branchName} ·{" "}
                        {formatContaDate(voucher.voucherDate)}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatContaAmount(voucher.total)}
                    </div>
                  </div>
                  {voucher.status !== "ANULADO" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canReview && voucher.status === "REGISTRADO" ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              reconcileAccountingVoucherAction({
                                voucherId: voucher.id,
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
                              cancelAccountingVoucherAction({
                                voucherId: voucher.id,
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
              description="Registra el primer comprobante del periodo."
              icon={Receipt}
              title="Sin comprobantes registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function VoucherForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [type, setType] = useState(voucherTypeValues[0]);
  const [beneficiary, setBeneficiary] = useState("");
  const [concept, setConcept] = useState("");
  const [amount, setAmount] = useState("0");

  return (
    <div className="mt-6">
      <FormSection description="Define tipo, beneficiario, monto y concepto." title="Registrar comprobante">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Tipo" required>
          <select
            className={selectClass}
            onChange={(event) => setType(event.target.value as typeof type)}
            value={type}
          >
            {voucherTypeValues.map((value) => (
              <option key={value} value={value}>
                {voucherTypeLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Beneficiario" required>
          <Input
            onChange={(event) => setBeneficiary(event.target.value)}
            value={beneficiary}
          />
        </Field>
        <Field label="Monto" required>
          <Input
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            value={amount}
          />
        </Field>
        <Field className="sm:col-span-2" label="Concepto" required>
          <Input onChange={(event) => setConcept(event.target.value)} value={concept} />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={
            disabled ||
            !branchCode ||
            !beneficiary.trim() ||
            !concept.trim() ||
            parseAmount(amount) <= 0
          }
          onClick={() =>
            onRun(
              () =>
                createAccountingVoucherAction({
                  branchCode,
                  type,
                  beneficiary,
                  concept,
                  amount: parseAmount(amount),
                }),
              () => {
                setBeneficiary("");
                setConcept("");
                setAmount("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar comprobante
        </Button>
      </div>
    </div>
  );
}
