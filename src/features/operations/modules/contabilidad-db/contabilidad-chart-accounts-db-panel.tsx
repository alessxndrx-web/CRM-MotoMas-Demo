"use client";

import { BookOpen, Plus, PowerOff } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  ContaErrorNotice,
  ContaSectionCard,
  selectClass,
  useContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  createChartAccountAction,
  deactivateChartAccountAction,
} from "@/server/contabilidad/actions";
import {
  accountNatureLabels,
  accountNatureValues,
  accountTypeLabels,
  accountTypeValues,
  type ChartAccountDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed plan de cuentas (`/panel/contabilidad/catalogo-cuentas`).
 * Global by design — chart of accounts is not branch-scoped. Writes require the
 * operator role; the server re-checks it.
 */
export function ContabilidadChartAccountsDbPanel({
  accounts,
  canOperate,
  enabled,
  scopeLabel,
  supervision,
}: {
  accounts: ChartAccountDTO[];
  canOperate: boolean;
  enabled: boolean;
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Catálogo de cuentas contables: código, nombre, tipo y naturaleza. Las cuentas inactivas se conservan para el histórico."
        enabled={enabled}
        icon={BookOpen}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Plan de cuentas"
      >
        <ContaErrorNotice error={error} />
        {canOperate ? (
          <ChartAccountForm disabled={pending} onRun={run} />
        ) : null}
      </ContaSectionCard>

      {enabled ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Cuentas</h2>
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
                        {account.code}
                      </span>
                      <span className="text-sm text-slate-700">{account.name}</span>
                      {!account.isActive ? <Badge tone="red">Inactiva</Badge> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Badge tone="slate">{account.typeLabel}</Badge>
                      <Badge tone="slate">{account.natureLabel}</Badge>
                      {account.parentCode ? <span>Padre: {account.parentCode}</span> : null}
                    </div>
                  </div>
                  {canOperate && account.isActive ? (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          deactivateChartAccountAction({ accountId: account.id }),
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
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra la primera cuenta contable para iniciar el catálogo."
              icon={BookOpen}
              title="Sin cuentas registradas"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ChartAccountForm({
  disabled,
  onRun,
}: {
  disabled: boolean;
  onRun: ReturnType<typeof useContaRunner>["run"];
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState(accountTypeValues[0]);
  const [nature, setNature] = useState(accountNatureValues[0]);
  const [description, setDescription] = useState("");

  return (
    <div className="mt-6">
      <FormSection
        description="El código admite dígitos y puntos, como usa el catálogo actual."
        title="Registrar cuenta"
      >
        <Field label="Código" required>
          <Input onChange={(event) => setCode(event.target.value)} value={code} />
        </Field>
        <Field label="Nombre" required>
          <Input onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field label="Tipo" required>
          <select
            className={selectClass}
            onChange={(event) => setType(event.target.value as typeof type)}
            value={type}
          >
            {accountTypeValues.map((value) => (
              <option key={value} value={value}>
                {accountTypeLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Naturaleza" required>
          <select
            className={selectClass}
            onChange={(event) => setNature(event.target.value as typeof nature)}
            value={nature}
          >
            {accountNatureValues.map((value) => (
              <option key={value} value={value}>
                {accountNatureLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field className="sm:col-span-2" hint="Opcional." label="Descripción">
          <Input
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={disabled || !code.trim() || !name.trim()}
          onClick={() =>
            onRun(
              () =>
                createChartAccountAction({
                  code,
                  name,
                  type,
                  nature,
                  description: description || null,
                }),
              () => {
                setCode("");
                setName("");
                setDescription("");
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
