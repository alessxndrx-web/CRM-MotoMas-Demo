"use client";

import { ClipboardList, Clock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import {
  CajaErrorNotice,
  CajaScopeChip,
  CajaTotal,
  closingStatusTone,
  formatCajaAmount,
  formatCajaDateTime,
  parseAmount,
  useCajaRunner,
  type CajaRunner,
} from "@/features/operations/modules/caja-db/caja-db-shared";
import {
  closeCashSessionAction,
  createCashClosingAction,
  reviewCashClosingAction,
} from "@/server/caja/actions";
import {
  calculateCashClosingTotals,
  cashPaymentMethodLabels,
  cashPaymentMethodValues,
  type CashClosingDTO,
  type CashSessionDetailDTO,
} from "@/server/caja/shared";

/**
 * Database-backed Caja closings for `/panel/caja/cierres`. Additive to the
 * legacy `CashierPanel` rendered below it.
 *
 * Counted amounts are manual; the invoiced and retention totals are derived
 * from the issued documents of the turno, both in the preview here and again
 * inside `createCashClosingAction`. Review belongs to Admin and Gerente only —
 * the Cashier never sees the control and the server rejects it anyway.
 */

export function CajaClosingsDbPanel({
  canOperate,
  canReview,
  closings,
  enabled,
  scopeLabel,
  sessionDetail,
  supervision,
}: {
  canOperate: boolean;
  canReview: boolean;
  closings: CashClosingDTO[];
  enabled: boolean;
  scopeLabel: string;
  /** The reader's own open turno with its documents, when there is one. */
  sessionDetail: CashSessionDetailDTO | null;
  supervision: boolean;
}) {
  const { error, pending, run } = useCajaRunner();

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PrimarySectionBadge
              businessLabel={`Cierres · ${supervision ? "Supervisión" : "Operación"}`}
              technicalLabel="Cierres · Base de datos (fuente principal)"
            />
            <CajaScopeChip label={scopeLabel} />
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <ClipboardList className="h-5 w-5" />
          </div>
        </div>

        <PrimarySectionDescription
          businessText={
            canOperate
              ? "Cuenta lo recibido por forma de pago, prepara el cierre y cierra el turno. Lo facturado y las retenciones se calculan con los documentos emitidos."
              : "Revisa los cierres del alcance que supervisas: lo contado, lo facturado y la diferencia de cada turno."
          }
          technicalText="Cierres respaldados por PostgreSQL. El historial anterior sigue disponible debajo mientras se completa su migración."
        />

        {!enabled ? (
          <SectionUnavailableNotice
            businessText="Esta sección aún no está disponible."
            technicalText={
              <>
                Esta sección requiere <code>DATABASE_URL</code> configurado y una
                sucursal asignada.
              </>
            }
          />
        ) : (
          <>
            <CajaErrorNotice error={error} />

            {canOperate ? (
              sessionDetail ? (
                <CurrentSessionClosing
                  detail={sessionDetail}
                  disabled={pending}
                  onRun={run}
                />
              ) : (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-700">
                  Abre un turno en Caja para preparar su cierre.
                </div>
              )
            ) : null}
          </>
        )}
      </Card>

      {enabled ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Historial</h2>
          {closings.length ? (
            <div className="mt-4 space-y-3">
              {closings.map((closing) => (
                <ClosingRow
                  canReview={canReview}
                  closing={closing}
                  disabled={pending}
                  key={closing.id}
                  onRun={run}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Los cierres preparados y revisados aparecerán aquí."
              icon={ClipboardList}
              title="Aún no hay cierres en este alcance"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

// --- Cierre del turno abierto --------------------------------------------

function CurrentSessionClosing({
  detail,
  disabled,
  onRun,
}: {
  detail: CashSessionDetailDTO;
  disabled: boolean;
  onRun: CajaRunner;
}) {
  const breakdown = detail.totals.paymentBreakdown;
  const [cashAmount, setCashAmount] = useState(String(breakdown.EFECTIVO));
  const [transferAmount, setTransferAmount] = useState(
    String(breakdown.TRANSFERENCIA),
  );
  const [checkAmount, setCheckAmount] = useState(String(breakdown.CHEQUE));
  const [cardAmount, setCardAmount] = useState(String(breakdown.TARJETA));
  const [notes, setNotes] = useState("");

  const closing = detail.closing;
  const draftCount = detail.documents.filter(
    (document) => document.status === "BORRADOR",
  ).length;

  // Same formula the server applies when the closing is persisted.
  const preview = useMemo(
    () =>
      calculateCashClosingTotals({
        cardAmount: parseAmount(cardAmount),
        cashAmount: parseAmount(cashAmount),
        checkAmount: parseAmount(checkAmount),
        documents: detail.documents,
        transferAmount: parseAmount(transferAmount),
      }),
    [cardAmount, cashAmount, checkAmount, detail.documents, transferAmount],
  );

  return (
    <div className="mt-6 rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">Turno abierto</Badge>
        <Badge tone="slate">{detail.session.branchName}</Badge>
        <span className="text-xs text-slate-500">
          {detail.session.cashierName} · abierto el{" "}
          {formatCajaDateTime(detail.session.openedAt)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cashPaymentMethodValues.map((method) => (
          <CajaTotal
            key={method}
            label={`${cashPaymentMethodLabels[method]} registrado`}
            value={formatCajaAmount(breakdown[method])}
          />
        ))}
      </div>

      {closing ? (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CajaTotal
              label="Contado"
              value={formatCajaAmount(closing.receivedTotal)}
            />
            <CajaTotal
              label="Facturado"
              value={formatCajaAmount(closing.invoicedTotal)}
            />
            <CajaTotal
              label="Retenciones"
              value={formatCajaAmount(closing.retentionTotal)}
            />
            <CajaTotal
              emphasis
              label="Diferencia"
              value={formatCajaAmount(closing.difference)}
            />
          </div>

          {draftCount ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Emite o anula los {draftCount} documentos en borrador antes de
              cerrar el turno.
            </p>
          ) : null}

          <div className="mt-4">
            <Button
              disabled={disabled || Boolean(draftCount) || closing.status !== "ABIERTO"}
              onClick={() =>
                onRun(() =>
                  closeCashSessionAction({ cashSessionId: detail.session.id }),
                )
              }
              size="sm"
            >
              <Clock className="h-4 w-4" />
              Cerrar turno
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <FormSection
            description="Registra lo contado por forma de pago. Lo facturado y las retenciones se calculan con los documentos emitidos del turno."
            title="Preparar cierre"
          >
            <Field label="Efectivo contado" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setCashAmount(event.target.value)}
                value={cashAmount}
              />
            </Field>
            <Field label="Transferencias" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setTransferAmount(event.target.value)}
                value={transferAmount}
              />
            </Field>
            <Field label="Cheques" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setCheckAmount(event.target.value)}
                value={checkAmount}
              />
            </Field>
            <Field label="Tarjetas" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setCardAmount(event.target.value)}
                value={cardAmount}
              />
            </Field>
            <Field className="sm:col-span-2" hint="Opcional." label="Observaciones">
              <Input
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </Field>
          </FormSection>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CajaTotal
              label="Contado"
              value={formatCajaAmount(preview.receivedTotal)}
            />
            <CajaTotal
              label="Facturado"
              value={formatCajaAmount(preview.invoicedTotal)}
            />
            <CajaTotal
              label="Retenciones"
              value={formatCajaAmount(preview.retentionTotal)}
            />
            <CajaTotal
              emphasis
              label="Diferencia"
              value={formatCajaAmount(preview.difference)}
            />
          </div>

          <div className="mt-4">
            <Button
              disabled={disabled}
              onClick={() =>
                onRun(
                  () =>
                    createCashClosingAction({
                      cardAmount: parseAmount(cardAmount),
                      cashAmount: parseAmount(cashAmount),
                      cashSessionId: detail.session.id,
                      checkAmount: parseAmount(checkAmount),
                      notes: notes || null,
                      transferAmount: parseAmount(transferAmount),
                    }),
                  () => setNotes(""),
                )
              }
              size="sm"
            >
              <ClipboardList className="h-4 w-4" />
              Preparar cierre
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Historial -----------------------------------------------------------

function ClosingRow({
  canReview,
  closing,
  disabled,
  onRun,
}: {
  canReview: boolean;
  closing: CashClosingDTO;
  disabled: boolean;
  onRun: CajaRunner;
}) {
  // Review is only meaningful once the turno and its closing are closed.
  const reviewable = canReview && closing.status === "CERRADO";

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={closingStatusTone(closing.status)}>
              {closing.statusLabel}
            </Badge>
            <Badge tone="slate">{closing.branchName}</Badge>
          </div>
          <p className="mt-2 text-sm font-medium text-slate-900">
            {closing.cashierName}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Preparado por {closing.preparedByName} el{" "}
            {formatCajaDateTime(closing.preparedAt)}
            {closing.reviewedByName
              ? ` · revisado por ${closing.reviewedByName}`
              : ""}
          </p>
        </div>

        {reviewable ? (
          <Button
            disabled={disabled}
            onClick={() =>
              onRun(() => reviewCashClosingAction({ closingId: closing.id }))
            }
            size="sm"
            variant="success"
          >
            <ShieldCheck className="h-4 w-4" />
            Revisar
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CajaTotal
          label="Contado"
          value={formatCajaAmount(closing.receivedTotal)}
        />
        <CajaTotal
          label="Facturado"
          value={formatCajaAmount(closing.invoicedTotal)}
        />
        <CajaTotal
          label="Retenciones"
          value={formatCajaAmount(closing.retentionTotal)}
        />
        <CajaTotal
          emphasis
          label="Diferencia"
          value={formatCajaAmount(closing.difference)}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cashPaymentMethodValues.map((method) => (
          <p className="text-xs text-slate-500" key={method}>
            {cashPaymentMethodLabels[method]}:{" "}
            <span className="font-semibold text-slate-700">
              {formatCajaAmount(
                method === "EFECTIVO"
                  ? closing.cashAmount
                  : method === "TRANSFERENCIA"
                    ? closing.transferAmount
                    : method === "CHEQUE"
                      ? closing.checkAmount
                      : closing.cardAmount,
              )}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}
