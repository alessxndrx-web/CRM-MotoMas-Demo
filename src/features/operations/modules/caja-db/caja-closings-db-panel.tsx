"use client";

import { ClipboardList, Clock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { FinancialAuditTimeline } from "@/features/operations/components/financial-audit-timeline";
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
  type CashClosingMethodTotal,
  cashPaymentMethodLabels,
  cashPaymentMethodValues,
  type CashClosingDTO,
  type CashSessionDetailDTO,
} from "@/server/caja/shared";
import type { FinancialAuditEventDTO } from "@/server/financial-audit/shared";

/**
 * Database-backed Caja closings for `/panel/caja/cierres`. Additive to the
 * legacy `CashierPanel` rendered below it.
 *
 * Patch FF1.1-B: counted amounts are the cashier's; the expected amounts come
 * from the payments registered against the turno's issued documents and are
 * computed server-side. The preview and the persisted arqueo run the same
 * `calculateCashClosingTotals`, so they cannot disagree. Review belongs to Admin
 * and Gerente only — the Cashier never sees the control and the server rejects
 * it anyway.
 */

export function CajaClosingsDbPanel({
  canOperate,
  canReview,
  closings,
  closingAuditEvents,
  enabled,
  historicalClosingAuditEvents,
  scopeLabel,
  sessionDetail,
  sessionAuditEvents,
  supervision,
}: {
  canOperate: boolean;
  canReview: boolean;
  closings: CashClosingDTO[];
  closingAuditEvents: FinancialAuditEventDTO[];
  enabled: boolean;
  historicalClosingAuditEvents: FinancialAuditEventDTO[];
  scopeLabel: string;
  /** The reader's own open turno with its documents, when there is one. */
  sessionDetail: CashSessionDetailDTO | null;
  sessionAuditEvents: FinancialAuditEventDTO[];
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
              ? "Cuenta lo recibido por forma de pago y compáralo con lo cobrado en el turno. La diferencia se calcula por forma de pago, no contra la facturación."
              : "Revisa los cierres del alcance que supervisas: lo esperado, lo contado y la diferencia de cada turno por forma de pago."
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
                  closingAuditEvents={closingAuditEvents}
                  detail={sessionDetail}
                  disabled={pending}
                  onRun={run}
                  sessionAuditEvents={sessionAuditEvents}
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
                  auditEvents={historicalClosingAuditEvents.filter(
                    (event) =>
                      event.entityCode === `CIERRE-${closing.preparedAt}`,
                  )}
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

/**
 * Arqueo per payment method (Patch FF1.1-B). A single global difference hides
 * offsetting errors: a C$500 cash overage against a C$500 card shortage used to
 * report a perfectly balanced shift.
 */
function ArqueoByMethod({ lines }: { lines: CashClosingMethodTotal[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Forma de pago</th>
            <th className="px-4 py-2 text-right font-semibold">Esperado</th>
            <th className="px-4 py-2 text-right font-semibold">Contado</th>
            <th className="px-4 py-2 text-right font-semibold">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr className="border-t border-slate-200" key={line.method}>
              <td className="px-4 py-2 text-slate-700">{line.methodLabel}</td>
              <td className="px-4 py-2 text-right text-slate-600">
                {formatCajaAmount(line.expected)}
              </td>
              <td className="px-4 py-2 text-right text-slate-600">
                {formatCajaAmount(line.counted)}
              </td>
              <td
                className={`px-4 py-2 text-right font-semibold ${
                  line.difference === 0
                    ? "text-slate-500"
                    : line.difference > 0
                      ? "text-emerald-700"
                      : "text-red-700"
                }`}
              >
                {formatCajaAmount(line.difference)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Cierre del turno abierto --------------------------------------------

function CurrentSessionClosing({
  closingAuditEvents,
  detail,
  disabled,
  onRun,
  sessionAuditEvents,
}: {
  closingAuditEvents: FinancialAuditEventDTO[];
  detail: CashSessionDetailDTO;
  disabled: boolean;
  onRun: CajaRunner;
  sessionAuditEvents: FinancialAuditEventDTO[];
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

  // Literally the same function the server runs when the closing is persisted
  // (Patch FF1.1-B). The expected side comes from the server too — the panel
  // never derives it from documents, which is what used to make the preview and
  // the stored arqueo disagree.
  const preview = useMemo(
    () =>
      calculateCashClosingTotals({
        counted: {
          EFECTIVO: parseAmount(cashAmount),
          TRANSFERENCIA: parseAmount(transferAmount),
          CHEQUE: parseAmount(checkAmount),
          TARJETA: parseAmount(cardAmount),
        },
        expected: breakdown,
        invoicedTotal: detail.totals.invoicedTotal,
        retentionTotal: detail.totals.retentionTotal,
      }),
    [
      breakdown,
      cardAmount,
      cashAmount,
      checkAmount,
      detail.totals.invoicedTotal,
      detail.totals.retentionTotal,
      transferAmount,
    ],
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
            label={`${cashPaymentMethodLabels[method]} cobrado`}
            value={formatCajaAmount(breakdown[method])}
          />
        ))}
      </div>

      {closing ? (
        <div className="mt-6">
          <ArqueoByMethod lines={closing.byMethod} />
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CajaTotal
              label="Esperado"
              value={formatCajaAmount(closing.expectedTotal)}
            />
            <CajaTotal
              label="Contado"
              value={formatCajaAmount(closing.receivedTotal)}
            />
            <CajaTotal
              label="Facturado"
              value={formatCajaAmount(closing.invoicedTotal)}
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
            description="Registra lo contado por forma de pago. Lo esperado son los cobros registrados en los documentos emitidos del turno; la diferencia se calcula contra ellos."
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

          <div className="mt-4">
            <ArqueoByMethod lines={preview.byMethod} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CajaTotal
              label="Esperado"
              value={formatCajaAmount(preview.expectedTotal)}
            />
            <CajaTotal
              label="Contado"
              value={formatCajaAmount(preview.receivedTotal)}
            />
            <CajaTotal
              label="Facturado"
              value={formatCajaAmount(preview.invoicedTotal)}
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

      <FinancialAuditTimeline
        events={[...closingAuditEvents, ...sessionAuditEvents].sort((left, right) =>
          right.timestamp.localeCompare(left.timestamp),
        )}
      />
    </div>
  );
}

// --- Historial -----------------------------------------------------------

function ClosingRow({
  auditEvents,
  canReview,
  closing,
  disabled,
  onRun,
}: {
  auditEvents: FinancialAuditEventDTO[];
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
          label="Esperado"
          value={formatCajaAmount(closing.expectedTotal)}
        />
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

      <FinancialAuditTimeline events={auditEvents} />
    </div>
  );
}
