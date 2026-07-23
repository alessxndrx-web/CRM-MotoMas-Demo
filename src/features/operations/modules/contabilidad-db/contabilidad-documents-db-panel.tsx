"use client";

import { FileText, Plus } from "lucide-react";
import { useMemo, useState } from "react";

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
  documentStatusTone,
  formatContaAmount,
  formatContaDate,
  parseAmount,
  selectClass,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  cancelAccountingDocumentAction,
  createAccountingDocumentAction,
  issueAccountingDocumentAction,
  postAccountingDocumentAction,
  reconcileAccountingDocumentAction,
  reviewAccountingDocumentAction,
} from "@/server/contabilidad/actions";
import {
  accountingDocumentTypeLabels,
  accountingDocumentTypeValues,
  calculateAccountingDocumentTotal,
  type AccountingDocumentDTO,
} from "@/server/contabilidad/shared";
import type { FinancialAuditEventDTO } from "@/server/financial-audit/shared";

/**
 * Database-backed documentos contables (`/panel/contabilidad/documentos`).
 * The document lifecycle is BORRADOR → EMITIDO → REVISADO → CONTABILIZADO →
 * CONCILIADO, with internal cancellation requiring a reason. Every transition
 * is a server action that re-checks role and current state.
 */
export function ContabilidadDocumentsDbPanel({
  auditEvents,
  branches,
  canOperate,
  canReview,
  canViewLedger,
  documents,
  enabled,
  scopeLabel,
  supervision,
}: {
  auditEvents: FinancialAuditEventDTO[];
  branches: BranchOption[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  documents: AccountingDocumentDTO[];
  enabled: boolean;
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Documentos contables con su ciclo de revisión, contabilización y conciliación. La anulación es interna y requiere un motivo."
        enabled={enabled}
        icon={FileText}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Documentos"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <DocumentForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Documentos</h2>
          {documents.length ? (
            <div className="mt-4 space-y-3">
              {documents.map((document) => (
                <DocumentRow
                  auditEvents={auditEvents.filter(
                    (event) => event.entityCode === document.documentNumber,
                  )}
                  canOperate={canOperate}
                  canReview={canReview}
                  disabled={pending}
                  document={document}
                  key={document.id}
                  onRun={run}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra el primer documento contable del periodo."
              icon={FileText}
              title="Sin documentos registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function DocumentRow({
  auditEvents,
  canOperate,
  canReview,
  disabled,
  document,
  onRun,
}: {
  auditEvents: FinancialAuditEventDTO[];
  canOperate: boolean;
  canReview: boolean;
  disabled: boolean;
  document: AccountingDocumentDTO;
  onRun: ContaRunner;
}) {
  const status = document.status;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={documentStatusTone(status)}>{document.statusLabel}</Badge>
            <span className="text-sm font-semibold text-slate-900">
              {document.documentNumber}
            </span>
            <Badge tone="slate">{document.typeLabel}</Badge>
            {document.origin === "CAJA" ? <Badge tone="blue">Caja</Badge> : null}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {document.thirdPartyName} · {document.branchName} ·{" "}
            {formatContaDate(document.documentDate)}
            {document.cashDocumentNumber
              ? ` · Ref. Caja ${document.cashDocumentNumber}`
              : ""}
          </div>
        </div>
        <div className="text-right text-sm font-semibold tabular-nums text-slate-900">
          {formatContaAmount(document.total)}
        </div>
      </div>

      {status !== "ANULADO" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {canOperate && status === "BORRADOR" ? (
            <Button
              disabled={disabled}
              onClick={() =>
                onRun(() => issueAccountingDocumentAction({ documentId: document.id }))
              }
              size="sm"
              variant="secondary"
            >
              Emitir
            </Button>
          ) : null}
          {canReview && (status === "BORRADOR" || status === "EMITIDO") ? (
            <Button
              disabled={disabled}
              onClick={() =>
                onRun(() => reviewAccountingDocumentAction({ documentId: document.id }))
              }
              size="sm"
              variant="secondary"
            >
              Revisar
            </Button>
          ) : null}
          {canReview && status === "REVISADO" ? (
            <Button
              disabled={disabled}
              onClick={() =>
                onRun(() => postAccountingDocumentAction({ documentId: document.id }))
              }
              size="sm"
              variant="secondary"
            >
              Contabilizar
            </Button>
          ) : null}
          {canReview && status === "CONTABILIZADO" ? (
            <Button
              disabled={disabled}
              onClick={() =>
                onRun(() =>
                  reconcileAccountingDocumentAction({ documentId: document.id }),
                )
              }
              size="sm"
              variant="success"
            >
              Conciliar
            </Button>
          ) : null}
          {canOperate &&
          (status === "BORRADOR" ||
            status === "EMITIDO" ||
            status === "REVISADO") ? (
            <CancelButton
              disabled={disabled}
              onCancel={(reason) =>
                onRun(() =>
                  cancelAccountingDocumentAction({ documentId: document.id, reason }),
                )
              }
            />
          ) : null}
        </div>
      ) : document.cancelReason ? (
        <p className="mt-2 text-xs text-slate-500">Motivo: {document.cancelReason}</p>
      ) : null}

      <FinancialAuditTimeline events={auditEvents} title="Historial financiero" />
    </div>
  );
}

/** Cancellation always collects a reason before it fires the server action. */
export function CancelButton({
  disabled,
  onCancel,
}: {
  disabled: boolean;
  onCancel: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="sm"
        variant="ghost"
      >
        Anular
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Input
        className="max-w-xs"
        onChange={(event) => setReason(event.target.value)}
        placeholder="Motivo de la anulación interna"
        value={reason}
      />
      <Button
        disabled={disabled || !reason.trim()}
        onClick={() => {
          onCancel(reason);
          setOpen(false);
          setReason("");
        }}
        size="sm"
        variant="danger"
      >
        Confirmar
      </Button>
      <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
        Cancelar
      </Button>
    </div>
  );
}

function DocumentForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [type, setType] = useState(accountingDocumentTypeValues[0]);
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [concept, setConcept] = useState("");
  const [subtotal, setSubtotal] = useState("0");
  const [retention1, setRetention1] = useState("0");
  const [retention2, setRetention2] = useState("0");
  const [appliedPayment, setAppliedPayment] = useState("0");

  const total = useMemo(
    () =>
      calculateAccountingDocumentTotal({
        appliedPayment: parseAmount(appliedPayment),
        retention1: parseAmount(retention1),
        retention2: parseAmount(retention2),
        subtotal: parseAmount(subtotal),
      }),
    [appliedPayment, retention1, retention2, subtotal],
  );

  return (
    <div className="mt-6">
      <FormSection
        description="El documento se crea en borrador. El total se calcula: subtotal menos abono y retenciones."
        title="Registrar documento"
      >
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Tipo" required>
          <select
            className={selectClass}
            onChange={(event) => setType(event.target.value as typeof type)}
            value={type}
          >
            {accountingDocumentTypeValues.map((value) => (
              <option key={value} value={value}>
                {accountingDocumentTypeLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tercero" required>
          <Input
            onChange={(event) => setThirdPartyName(event.target.value)}
            value={thirdPartyName}
          />
        </Field>
        <Field label="Concepto" required>
          <Input onChange={(event) => setConcept(event.target.value)} value={concept} />
        </Field>
        <Field label="Subtotal" required>
          <Input
            inputMode="decimal"
            onChange={(event) => setSubtotal(event.target.value)}
            value={subtotal}
          />
        </Field>
        <Field label="Abono">
          <Input
            inputMode="decimal"
            onChange={(event) => setAppliedPayment(event.target.value)}
            value={appliedPayment}
          />
        </Field>
        <Field label="Retención 1%">
          <Input
            inputMode="decimal"
            onChange={(event) => setRetention1(event.target.value)}
            value={retention1}
          />
        </Field>
        <Field label="Retención 2%">
          <Input
            inputMode="decimal"
            onChange={(event) => setRetention2(event.target.value)}
            value={retention2}
          />
        </Field>
      </FormSection>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContaTotal emphasis label="Total" value={formatContaAmount(total)} />
      </div>

      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !thirdPartyName.trim() || !concept.trim()}
          onClick={() =>
            onRun(
              () =>
                createAccountingDocumentAction({
                  branchCode,
                  type,
                  thirdPartyName,
                  concept,
                  subtotal: parseAmount(subtotal),
                  retention1: parseAmount(retention1),
                  retention2: parseAmount(retention2),
                  appliedPayment: parseAmount(appliedPayment),
                }),
              () => {
                setThirdPartyName("");
                setConcept("");
                setSubtotal("0");
                setRetention1("0");
                setRetention2("0");
                setAppliedPayment("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar documento
        </Button>
      </div>
    </div>
  );
}
