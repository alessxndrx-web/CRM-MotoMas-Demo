"use client";

import { Boxes, Plus } from "lucide-react";
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
  formatContaAmount,
  parseAmount,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import { createAccountingInventoryCostAction } from "@/server/contabilidad/actions";
import type { AccountingInventoryCostDTO } from "@/server/contabilidad/shared";

/**
 * Database-backed inventario contable (`/panel/contabilidad/inventario`). The
 * only cost-bearing section. Admin and Contador write global costs; a Gerente
 * reads their own branch read-only; Cashier and Seller never reach it (the
 * server returns no rows and blocks writes regardless).
 */
export function ContabilidadInventoryDbPanel({
  branches,
  canOperate,
  canViewCosts,
  costs,
  enabled,
  scopeLabel,
  supervision,
}: {
  branches: BranchOption[];
  canOperate: boolean;
  canViewCosts: boolean;
  costs: AccountingInventoryCostDTO[];
  enabled: boolean;
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();
  const totalCost = costs.reduce((sum, cost) => sum + cost.unitCost, 0);

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Costo unitario registrado por modelo y sucursal. La visibilidad de costos sigue el rol; el resto de la contabilidad no expone costos."
        enabled={enabled}
        icon={Boxes}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Inventario contable"
      >
        {!canViewCosts ? (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            Tu rol no tiene acceso a los costos de inventario.
          </div>
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <InventoryForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewCosts ? (
        <Card className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">Costos registrados</h2>
            <Badge tone="slate">Costo total {formatContaAmount(totalCost)}</Badge>
          </div>
          {costs.length ? (
            <div className="mt-4 space-y-2">
              {costs.map((cost) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                  key={cost.id}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {cost.modelName}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {cost.branchName} · saldo mínimo {cost.minimumStock}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums text-slate-900">
                    {formatContaAmount(cost.unitCost)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra el costo unitario de los modelos de tu alcance."
              icon={Boxes}
              title="Sin costos registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function InventoryForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [modelName, setModelName] = useState("");
  const [unitCost, setUnitCost] = useState("0");
  const [minimumStock, setMinimumStock] = useState("0");

  const modelSlug = modelName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    <div className="mt-6">
      <FormSection description="El costo se asocia al modelo y a la sucursal seleccionada." title="Registrar costo">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Modelo" required>
          <Input onChange={(event) => setModelName(event.target.value)} value={modelName} />
        </Field>
        <Field label="Costo unitario" required>
          <Input inputMode="decimal" onChange={(event) => setUnitCost(event.target.value)} value={unitCost} />
        </Field>
        <Field label="Saldo mínimo">
          <Input inputMode="numeric" onChange={(event) => setMinimumStock(event.target.value)} value={minimumStock} />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !modelName.trim()}
          onClick={() =>
            onRun(
              () =>
                createAccountingInventoryCostAction({
                  branchCode,
                  modelSlug,
                  modelName,
                  unitCost: parseAmount(unitCost),
                  minimumStock: Math.trunc(parseAmount(minimumStock)),
                }),
              () => {
                setModelName("");
                setUnitCost("0");
                setMinimumStock("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar costo
        </Button>
      </div>
    </div>
  );
}
