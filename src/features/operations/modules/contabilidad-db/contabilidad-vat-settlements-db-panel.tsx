"use client";

import { Landmark, Pencil, Play, Plus, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { FinancialAuditTimeline } from "@/features/operations/components/financial-audit-timeline";
import {
  BranchSelect,
  ContaErrorNotice,
  ContaSectionCard,
  ContaTotal,
  LedgerRestrictedNotice,
  formatContaAmount,
  formatContaDate,
  parseAmount,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  createVatSettlementAction,
  executeVatSettlementAction,
  updateVatSettlementAction,
} from "@/server/contabilidad/actions";
import type { VatSettlementDTO } from "@/server/contabilidad/shared";
import type { FinancialAuditEventDTO } from "@/server/financial-audit/shared";

/**
 * Patch FF2.1-D — liquidación de IVA (`/panel/contabilidad/liquidaciones`).
 *
 * FF2.0-E dejó el modelo, las acciones y el seam de contabilización listos, y a
 * la vez sin nadie que los llamara. Esta pantalla es ese llamador.
 *
 * ## Lo que la pantalla deliberadamente NO hace
 *
 * **No calcula el IVA.** FF2.0-E documenta en §L-10 que la liquidación registra
 * una decisión humana en vez de derivarla de los saldos del mayor, y este parche
 * conserva ese contrato: el importe se escribe, se muestra tal cual se guardó, y
 * el navegador no hace ninguna aritmética contable.
 *
 * ## Identidad
 *
 * Lo que se muestra es **sucursal + período**, nunca el id de la fila. Es la
 * misma identidad que usa la clave de idempotencia del motor
 * (`LIQUIDACION_IVA:VAT_SETTLEMENT:<sucursal>:<período>`) y la que impone
 * `@@unique([branchId, period])`.
 *
 * ## Estados
 *
 * `BORRADOR → EJECUTADA`, sin vuelta atrás. Editar y ejecutar se ofrecen solo
 * en borrador porque es lo que el servidor permite: la pantalla refleja la
 * regla, no la inventa.
 */
export function ContabilidadVatSettlementsDbPanel({
  auditEvents,
  branches,
  canOperate,
  canReview,
  canViewLedger,
  enabled,
  scopeLabel,
  settlements,
  supervision,
}: {
  auditEvents: FinancialAuditEventDTO[];
  branches: BranchOption[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  scopeLabel: string;
  settlements: VatSettlementDTO[];
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState("");

  const visible = settlements.filter(
    (settlement) =>
      (!branchFilter || settlement.branchCode === branchFilter) &&
      (!periodFilter || settlement.period.includes(periodFilter.trim())),
  );

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Liquidación mensual del IVA contra la administración tributaria. El monto lo declara el contador: el sistema no lo calcula a partir del mayor."
        enabled={enabled}
        icon={Landmark}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Liquidación de IVA"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <SettlementForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-base font-bold text-slate-900">Liquidaciones</h2>
            <div
              className="flex flex-wrap items-end gap-3"
              data-testid="settlement-filters"
            >
              {branches.length ? (
                <div className="w-48">
                  <Field label="Filtrar por sucursal">
                    <BranchSelect
                      branches={branches}
                      onChange={setBranchFilter}
                      value={branchFilter}
                    />
                  </Field>
                </div>
              ) : null}
              <div className="w-40">
                <Field hint="AAAA-MM" label="Filtrar por período">
                  <Input
                    onChange={(event) => setPeriodFilter(event.target.value)}
                    placeholder="2026-05"
                    value={periodFilter}
                  />
                </Field>
              </div>
            </div>
          </div>

          {visible.length ? (
            <div className="mt-4 space-y-3">
              {visible.map((settlement) => (
                <SettlementRow
                  auditEvents={auditEvents.filter(
                    (event) => event.entityCode === settlement.period,
                  )}
                  canOperate={canOperate}
                  canReview={canReview}
                  disabled={pending}
                  editing={editingId === settlement.id}
                  key={settlement.id}
                  onRun={run}
                  onToggleEdit={() =>
                    setEditingId(editingId === settlement.id ? null : settlement.id)
                  }
                  settlement={settlement}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description={
                settlements.length
                  ? "Ninguna liquidación coincide con el filtro."
                  : "Registra la liquidación del período."
              }
              icon={Landmark}
              title="Sin liquidaciones"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function SettlementRow({
  auditEvents,
  canOperate,
  canReview,
  disabled,
  editing,
  onRun,
  onToggleEdit,
  settlement,
}: {
  auditEvents: FinancialAuditEventDTO[];
  canOperate: boolean;
  canReview: boolean;
  disabled: boolean;
  editing: boolean;
  onRun: ContaRunner;
  onToggleEdit: () => void;
  settlement: VatSettlementDTO;
}) {
  const isDraft = settlement.status === "BORRADOR";

  return (
    <div
      className="rounded-xl border border-slate-200 p-4"
      data-testid="settlement-row"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isDraft ? "amber" : "green"}>{settlement.statusLabel}</Badge>
            {/* La identidad del hecho: sucursal y período, nunca el id. */}
            <span className="font-mono text-sm font-semibold text-slate-900">
              {settlement.period}
            </span>
            <Badge tone="slate">{settlement.branchName}</Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Registrada por {settlement.createdByName}
            {settlement.executedByName
              ? ` · Ejecutada por ${settlement.executedByName} el ${formatContaDate(
                  settlement.executedAt,
                )}`
              : " · Pendiente de ejecutar"}
          </div>
          {settlement.notes ? (
            <p className="mt-1 text-xs text-slate-500">{settlement.notes}</p>
          ) : null}
        </div>
        <div
          className="text-right text-sm font-semibold tabular-nums text-slate-900"
          data-testid="settlement-amount"
        >
          {formatContaAmount(settlement.amount)}
        </div>
      </div>

      {isDraft && editing ? (
        <SettlementEditForm
          disabled={disabled}
          onClose={onToggleEdit}
          onRun={onRun}
          settlement={settlement}
        />
      ) : null}

      {isDraft ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canOperate ? (
            <Button disabled={disabled} onClick={onToggleEdit} size="sm" variant="secondary">
              {editing ? (
                <>
                  <X className="h-4 w-4" />
                  Cancelar
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Editar
                </>
              )}
            </Button>
          ) : null}
          {canReview ? (
            <Button
              disabled={disabled}
              onClick={() =>
                onRun(() =>
                  executeVatSettlementAction({ settlementId: settlement.id }),
                )
              }
              size="sm"
              variant="success"
            >
              <Play className="h-4 w-4" />
              Ejecutar
            </Button>
          ) : null}
        </div>
      ) : null}

      <FinancialAuditTimeline events={auditEvents} title="Historial financiero" />
    </div>
  );
}

/** Corrige un borrador. Solo los campos que la acción admite. */
function SettlementEditForm({
  disabled,
  onClose,
  onRun,
  settlement,
}: {
  disabled: boolean;
  onClose: () => void;
  onRun: ContaRunner;
  settlement: VatSettlementDTO;
}) {
  const [amount, setAmount] = useState(String(settlement.amount));
  const [notes, setNotes] = useState(settlement.notes ?? "");

  return (
    <div
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      data-testid="settlement-editor"
    >
      <FormSection
        description="El monto es el que declara el contador; el sistema no lo calcula."
        title="Editar liquidación en borrador"
      >
        <Field label="Monto" required>
          <Input
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            value={amount}
          />
        </Field>
        <Field hint="Opcional." label="Notas">
          <Input onChange={(event) => setNotes(event.target.value)} value={notes} />
        </Field>
      </FormSection>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContaTotal
          emphasis
          label="Monto declarado"
          value={formatContaAmount(parseAmount(amount))}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={disabled}
          onClick={() =>
            onRun(
              () =>
                updateVatSettlementAction({
                  settlementId: settlement.id,
                  amount: parseAmount(amount),
                  notes: notes || null,
                }),
              onClose,
            )
          }
          size="sm"
        >
          Guardar cambios
        </Button>
        <Button disabled={disabled} onClick={onClose} size="sm" variant="secondary">
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function SettlementForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [period, setPeriod] = useState("");
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");

  return (
    <div className="mt-6" data-testid="settlement-create-form">
      <FormSection
        description="Una liquidación por sucursal y período. El monto lo declara el contador: el sistema no lo deriva del mayor."
        title="Registrar liquidación"
      >
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field hint="AAAA-MM" label="Período" required>
          <Input
            onChange={(event) => setPeriod(event.target.value)}
            placeholder="2026-05"
            value={period}
          />
        </Field>
        <Field label="Monto" required>
          <Input
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            value={amount}
          />
        </Field>
        <Field hint="Opcional." label="Notas">
          <Input onChange={(event) => setNotes(event.target.value)} value={notes} />
        </Field>
      </FormSection>

      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !period.trim()}
          onClick={() =>
            onRun(
              () =>
                createVatSettlementAction({
                  branchCode,
                  period,
                  amount: parseAmount(amount),
                  notes: notes || null,
                }),
              () => {
                setPeriod("");
                setAmount("0");
                setNotes("");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar liquidación
        </Button>
      </div>
    </div>
  );
}
