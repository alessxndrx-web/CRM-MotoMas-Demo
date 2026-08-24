"use client";

import { Plus, PowerOff, Users } from "lucide-react";
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
  selectClass,
  useContaRunner,
  type BranchOption,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  createThirdPartyAction,
  deactivateThirdPartyAction,
} from "@/server/contabilidad/actions";
import {
  thirdPartyTypeLabels,
  thirdPartyTypeValues,
  type ThirdPartyDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed terceros (`/panel/contabilidad/terceros`). Ledger section:
 * Accountant and Admin only. A Manager reaches an empty, read-only notice.
 */
export function ContabilidadThirdPartiesDbPanel({
  branches,
  canOperate,
  canViewLedger,
  enabled,
  parties,
  scopeLabel,
  supervision,
}: {
  branches: BranchOption[];
  canOperate: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  parties: ThirdPartyDTO[];
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Clientes, proveedores y empleados asociados a la contabilidad, por sucursal."
        enabled={enabled}
        icon={Users}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Terceros"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <ThirdPartyForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Terceros registrados</h2>
          {parties.length ? (
            <div className="mt-4 space-y-2">
              {parties.map((party) => (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                  key={party.id}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {party.name}
                      </span>
                      <Badge tone="slate">{party.typeLabel}</Badge>
                      {!party.isActive ? <Badge tone="red">Inactivo</Badge> : null}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {party.branchName}
                      {party.taxId ? ` · RUC ${party.taxId}` : ""}
                      {party.phone ? ` · ${party.phone}` : ""}
                      {` · ${party.documentCount} documento(s)`}
                    </div>
                  </div>
                  {canOperate && party.isActive ? (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          deactivateThirdPartyAction({ thirdPartyId: party.id }),
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
              description="Registra el primer tercero para asociarlo a documentos."
              icon={Users}
              title="Sin terceros registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ThirdPartyForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ReturnType<typeof useContaRunner>["run"];
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [type, setType] = useState(thirdPartyTypeValues[0]);
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="mt-6">
      <FormSection description="El tercero se asocia a la sucursal seleccionada." title="Registrar tercero">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Tipo" required>
          <select
            className={selectClass}
            onChange={(event) => setType(event.target.value as typeof type)}
            value={type}
          >
            {thirdPartyTypeValues.map((value) => (
              <option key={value} value={value}>
                {thirdPartyTypeLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nombre" required>
          <Input onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field hint="Opcional." label="RUC / Cédula">
          <Input onChange={(event) => setTaxId(event.target.value)} value={taxId} />
        </Field>
        <Field hint="Opcional." label="Teléfono">
          <Input onChange={(event) => setPhone(event.target.value)} value={phone} />
        </Field>
        <Field hint="Opcional." label="Correo">
          <Input onChange={(event) => setEmail(event.target.value)} value={email} />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !name.trim()}
          onClick={() =>
            onRun(
              () =>
                createThirdPartyAction({
                  branchCode,
                  type,
                  name,
                  taxId: taxId || null,
                  phone: phone || null,
                  email: email || null,
                }),
              () => {
                setName("");
                setTaxId("");
                setPhone("");
                setEmail("");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar tercero
        </Button>
      </div>
    </div>
  );
}
