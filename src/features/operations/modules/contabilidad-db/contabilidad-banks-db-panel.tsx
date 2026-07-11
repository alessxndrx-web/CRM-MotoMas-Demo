"use client";

import { Landmark, Plus, PowerOff } from "lucide-react";
import { useState } from "react";

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
  LedgerRestrictedNotice,
  formatContaAmount,
  parseAmount,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  createBankAccountAction,
  deactivateBankAccountAction,
} from "@/server/contabilidad/actions";
import type { BankAccountDTO } from "@/server/contabilidad/shared";

/**
 * Database-backed bancos (`/panel/contabilidad/bancos`). Balances are
 * maintained manually — there is no banking integration nor imported movement.
 */
export function ContabilidadBanksDbPanel({
  accounts,
  branches,
  canOperate,
  canViewLedger,
  enabled,
  scopeLabel,
  supervision,
}: {
  accounts: BankAccountDTO[];
  branches: BranchOption[];
  canOperate: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Cuentas bancarias con su saldo, mantenido manualmente."
        enabled={enabled}
        icon={Landmark}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Bancos"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <BankForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Cuentas bancarias</h2>
          {accounts.length ? (
            <div className="mt-4 space-y-2">
              {accounts.map((account) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                  key={account.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {account.bankName}
                      </span>
                      <Badge tone="slate">{account.accountNumber}</Badge>
                      {!account.isActive ? <Badge tone="red">Inactiva</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {account.branchName} · {account.currency} ·{" "}
                      {account.reconciliationCount} conciliación(es)
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatContaAmount(account.balance)}
                    </span>
                    {canOperate && account.isActive ? (
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            deactivateBankAccountAction({
                              bankAccountId: account.id,
                            }),
                          )
                        }
                        size="sm"
                        variant="secondary"
                      >
                        <PowerOff className="h-4 w-4" />
                        Desactivar
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra la primera cuenta bancaria."
              icon={Landmark}
              title="Sin cuentas bancarias"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function BankForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [balance, setBalance] = useState("0");

  return (
    <div className="mt-6">
      <FormSection description="El saldo se mantiene manualmente." title="Registrar cuenta bancaria">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Banco" required>
          <Input onChange={(event) => setBankName(event.target.value)} value={bankName} />
        </Field>
        <Field label="Número de cuenta" required>
          <Input
            onChange={(event) => setAccountNumber(event.target.value)}
            value={accountNumber}
          />
        </Field>
        <Field label="Saldo inicial">
          <Input inputMode="decimal" onChange={(event) => setBalance(event.target.value)} value={balance} />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !bankName.trim() || !accountNumber.trim()}
          onClick={() =>
            onRun(
              () =>
                createBankAccountAction({
                  branchCode,
                  bankName,
                  accountNumber,
                  balance: parseAmount(balance),
                }),
              () => {
                setBankName("");
                setAccountNumber("");
                setBalance("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar cuenta
        </Button>
      </div>
    </div>
  );
}
