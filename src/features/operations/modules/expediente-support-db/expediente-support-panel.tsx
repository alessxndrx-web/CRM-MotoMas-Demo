"use client";

import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  FolderCheck,
  Plus,
  XCircle,
} from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  activityPriorityLabels,
  activityPriorityValues,
  activityTypeLabels,
  activityTypeValues,
  isActivityOverdue,
  type ActivityListItemDTO,
  type ActivityPriorityValue,
  type ActivityStatusValue,
} from "@/server/crm/shared";
import {
  addExpedienteDocumentAction,
  cancelActivityAction,
  changeCreditStatusAction,
  changeQuoteStatusAction,
  completeActivityAction,
  createActivityAction,
  saveCreditApplicationAction,
  saveQuoteAction,
  seedExpedienteChecklistAction,
  updateExpedienteDocumentAction,
} from "@/server/expedientes/actions";
import {
  creditFinancingTypeLabels,
  creditFinancingTypeValues,
  creditStatusLabels,
  creditStatusValues,
  expedienteDocumentStatusLabels,
  expedienteDocumentStatusValues,
  expedienteDocumentTypeLabels,
  expedienteDocumentTypeValues,
  quoteStatusLabels,
  quoteSaleTypeValues,
  resolvedCreditStatuses,
  supportedCurrencies,
  type CreditStatusValue,
  type ExpedienteDocumentDTO,
  type ExpedienteDocumentStatusValue,
  type ExpedienteSupportDTO,
  type QuoteStatusValue,
} from "@/server/expedientes/shared";
import { cn } from "@/lib/utils";

/**
 * Database-backed expediente support (Patch 3.3C): proforma, document checklist
 * and manual credit follow-up for one expediente.
 *
 * Every mutation goes through a server action, which re-checks the session role
 * and re-resolves scope against the owning expediente. `canReview` only hides
 * buttons — the server is what actually enforces the rule. After each write we
 * `router.refresh()` so the server component re-reads the scoped data.
 */

const selectClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

/** Which statuses a proforma may move to from where it is now. */
const quoteNextStatuses: Record<QuoteStatusValue, QuoteStatusValue[]> = {
  BORRADOR: ["EMITIDA", "CANCELADA"],
  EMITIDA: ["ACEPTADA", "VENCIDA", "CANCELADA"],
  ACEPTADA: [],
  VENCIDA: [],
  CANCELADA: [],
};

const editableQuoteStatuses: QuoteStatusValue[] = ["BORRADOR", "EMITIDA"];

export function ExpedienteSupportPanel({
  canReview,
  fileNumber,
  nowIso,
  support,
}: {
  canReview: boolean;
  fileNumber: string;
  /** Resolved on the server so "vencida" never differs between render passes. */
  nowIso: string;
  support: ExpedienteSupportDTO;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la operación.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <div className="card-header-tint flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Seguimiento del expediente
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Proforma, documentos y crédito de{" "}
            <span className="font-mono font-medium text-slate-700">{fileNumber}</span>
          </p>
        </div>
        {pending ? (
          <span className="text-xs font-medium text-slate-500">Guardando…</span>
        ) : null}
      </div>

      {error ? (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="space-y-8 p-5">
        {/* Keyed on the server record so a refresh re-seeds the draft. */}
        <QuoteSection
          customerFileId={support.customerFileId}
          disabled={pending}
          key={support.quote ? `${support.quote.id}-${support.quote.updatedAt}` : "quote-new"}
          onRun={run}
          quote={support.quote}
        />
        <DocumentsSection
          canReview={canReview}
          customerFileId={support.customerFileId}
          disabled={pending}
          documents={support.documents}
          onRun={run}
          progress={support.documentProgress}
        />
        <CreditSection
          credit={support.creditApplication}
          customerFileId={support.customerFileId}
          disabled={pending}
          key={
            support.creditApplication
              ? `${support.creditApplication.id}-${support.creditApplication.updatedAt}`
              : "credit-new"
          }
          onRun={run}
        />
        <FollowUpSection
          activities={support.activities}
          customerFileId={support.customerFileId}
          disabled={pending}
          nowIso={nowIso}
          onRun={run}
        />
      </div>
    </Card>
  );
}

type Runner = (action: () => Promise<{ ok: boolean; error?: string }>) => void;

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h4 className="text-base font-semibold text-slate-900">{title}</h4>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

/** Renders a nullable numeric field as an empty (not zero) input value. */
function numberToInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

/** Empty string in a number input means "not provided", not zero. */
function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// --- Proforma ------------------------------------------------------------

function QuoteSection({
  customerFileId,
  disabled,
  onRun,
  quote,
}: {
  customerFileId: string;
  disabled: boolean;
  onRun: Runner;
  quote: ExpedienteSupportDTO["quote"];
}) {
  // The parent keys this section on the server record, so initial state is the
  // server value and a refresh remounts with the saved data.
  const [motorcycleModel, setMotorcycleModel] = useState(
    quote?.motorcycleModel ?? "",
  );
  const [saleType, setSaleType] = useState(quote?.saleType ?? "");
  const [price, setPrice] = useState(numberToInput(quote?.price));
  const [downPayment, setDownPayment] = useState(numberToInput(quote?.downPayment));
  const [termMonths, setTermMonths] = useState(numberToInput(quote?.termMonths));
  const [estimatedPayment, setEstimatedPayment] = useState(
    numberToInput(quote?.estimatedPayment),
  );
  const [currency, setCurrency] = useState(quote?.currency ?? "USD");
  const [expiresAt, setExpiresAt] = useState(
    quote?.expiresAt ? quote.expiresAt.slice(0, 10) : "",
  );
  const [notes, setNotes] = useState(quote?.notes ?? "");

  const status = quote?.status ?? null;
  const editable = !status || editableQuoteStatuses.includes(status);
  const nextStatuses = status ? quoteNextStatuses[status] : [];

  function save() {
    onRun(() =>
      saveQuoteAction({
        customerFileId,
        motorcycleModel,
        saleType: saleType || null,
        price: toNumber(price),
        downPayment: toNumber(downPayment),
        termMonths: toNumber(termMonths),
        estimatedPayment: toNumber(estimatedPayment),
        currency,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        notes: notes || null,
      }),
    );
  }

  return (
    <section>
      <SectionHeading
        action={
          quote ? (
            <div className="flex flex-wrap items-center gap-2">
              {quote.quoteNumber ? (
                <span className="font-mono text-xs text-slate-500">
                  {quote.quoteNumber}
                </span>
              ) : null}
              <Badge tone={quoteTone(quote.status)}>{quote.statusLabel}</Badge>
            </div>
          ) : null
        }
        description="Documento comercial único del expediente. No reserva una unidad ni completa una venta."
        icon={FileText}
        title="Proforma"
      />

      <div className="mt-5">
        {editable ? (
          <FormSection
            description="El modelo se registra como texto; no se vincula a una unidad física."
            title="Datos de la proforma"
          >
            <Field className="sm:col-span-2" label="Modelo de interés" required>
              <Input
                onChange={(event) => setMotorcycleModel(event.target.value)}
                placeholder="Ej. Pulsar NS160"
                value={motorcycleModel}
              />
            </Field>
            <Field label="Tipo de venta">
              <select
                className={selectClass}
                onChange={(event) => setSaleType(event.target.value)}
                value={saleType}
              >
                <option value="">Sin definir</option>
                {quoteSaleTypeValues.map((value) => (
                  <option key={value} value={value}>
                    {value === "CONTADO" ? "Contado" : "Financiamiento externo"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Moneda">
              <select
                className={selectClass}
                onChange={(event) => setCurrency(event.target.value)}
                value={currency}
              >
                {supportedCurrencies.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </Field>
            <Field label="Precio de referencia">
              <Input
                min="0"
                onChange={(event) => setPrice(event.target.value)}
                type="number"
                value={price}
              />
            </Field>
            <Field label="Prima">
              <Input
                min="0"
                onChange={(event) => setDownPayment(event.target.value)}
                type="number"
                value={downPayment}
              />
            </Field>
            <Field hint="Entre 1 y 120 meses." label="Plazo (meses)">
              <Input
                min="1"
                onChange={(event) => setTermMonths(event.target.value)}
                type="number"
                value={termMonths}
              />
            </Field>
            <Field label="Cuota estimada">
              <Input
                min="0"
                onChange={(event) => setEstimatedPayment(event.target.value)}
                type="number"
                value={estimatedPayment}
              />
            </Field>
            <Field label="Vencimiento">
              <Input
                onChange={(event) => setExpiresAt(event.target.value)}
                type="date"
                value={expiresAt}
              />
            </Field>
            <Field className="sm:col-span-2" label="Observaciones">
              <Input
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </Field>
          </FormSection>
        ) : (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2">
            <ReadOnly label="Modelo" value={quote?.motorcycleModel ?? "—"} />
            <ReadOnly
              label="Precio de referencia"
              value={formatMoney(quote?.price, quote?.currency)}
            />
            <ReadOnly label="Prima" value={formatMoney(quote?.downPayment, quote?.currency)} />
            <ReadOnly
              label="Cuota estimada"
              value={formatMoney(quote?.estimatedPayment, quote?.currency)}
            />
            <ReadOnly
              label="Plazo"
              value={quote?.termMonths ? `${quote.termMonths} meses` : "—"}
            />
            <ReadOnly label="Observaciones" value={quote?.notes ?? "—"} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {editable ? (
            <Button disabled={disabled || !motorcycleModel.trim()} onClick={save} size="sm">
              <Plus className="h-4 w-4" />
              {quote ? "Guardar proforma" : "Crear proforma"}
            </Button>
          ) : (
            <p className="text-sm text-slate-500">
              La proforma está cerrada y ya no puede editarse.
            </p>
          )}

          {nextStatuses.map((next) => (
            <Button
              disabled={disabled}
              key={next}
              onClick={() =>
                onRun(() =>
                  changeQuoteStatusAction({ customerFileId, status: next }),
                )
              }
              size="sm"
              variant="secondary"
            >
              {quoteStatusLabels[next]}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

function quoteTone(status: QuoteStatusValue) {
  if (status === "ACEPTADA") return "green" as const;
  if (status === "EMITIDA") return "blue" as const;
  if (status === "VENCIDA") return "yellow" as const;
  if (status === "CANCELADA") return "red" as const;
  return "slate" as const;
}

// --- Documentos ----------------------------------------------------------

function DocumentsSection({
  canReview,
  customerFileId,
  disabled,
  documents,
  onRun,
  progress,
}: {
  canReview: boolean;
  customerFileId: string;
  disabled: boolean;
  documents: ExpedienteDocumentDTO[];
  onRun: Runner;
  progress: ExpedienteSupportDTO["documentProgress"];
}) {
  const [newType, setNewType] = useState(expedienteDocumentTypeValues[0]);

  return (
    <section className="border-t border-slate-200 pt-8">
      <SectionHeading
        action={
          <Badge tone={progress.reviewedPercent === 100 ? "green" : "slate"}>
            {progress.revisados}/{progress.total} revisados
          </Badge>
        }
        description="Lista de control del expediente. Registra el estado de cada documento."
        icon={FolderCheck}
        title="Documentos"
      />

      {documents.length ? (
        <>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress.reviewedPercent}%` }}
            />
          </div>

          <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {documents.map((document) => (
              <DocumentRow
                canReview={canReview}
                disabled={disabled}
                document={document}
                key={document.id}
                onRun={onRun}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center">
          <p className="text-sm text-slate-500">
            Este expediente aún no tiene lista de documentos.
          </p>
          <Button
            className="mt-3"
            disabled={disabled}
            onClick={() =>
              onRun(() => seedExpedienteChecklistAction({ customerFileId }))
            }
            size="sm"
          >
            <CheckCircle2 className="h-4 w-4" />
            Preparar lista de documentos
          </Button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Agregar documento
          </span>
          <select
            className={cn(selectClass, "w-auto min-w-[220px]")}
            onChange={(event) =>
              setNewType(event.target.value as typeof newType)
            }
            value={newType}
          >
            {expedienteDocumentTypeValues.map((value) => (
              <option key={value} value={value}>
                {expedienteDocumentTypeLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={disabled}
          onClick={() =>
            onRun(() =>
              addExpedienteDocumentAction({
                customerFileId,
                documentType: newType,
              }),
            )
          }
          size="sm"
          variant="secondary"
        >
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>
    </section>
  );
}

function DocumentRow({
  canReview,
  disabled,
  document,
  onRun,
}: {
  canReview: boolean;
  disabled: boolean;
  document: ExpedienteDocumentDTO;
  onRun: Runner;
}) {
  // Review outcomes are Admin/Gerente only; the server rejects anyone else.
  const options = expedienteDocumentStatusValues.filter(
    (status) =>
      canReview || (status !== "REVISADO" && status !== "RECHAZADO"),
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">
          {document.documentTypeLabel}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          {document.reviewedByName
            ? `Revisado por ${document.reviewedByName}`
            : document.notes || "Sin observaciones"}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={documentTone(document.status)}>{document.statusLabel}</Badge>
        <select
          aria-label={`Estado de ${document.documentTypeLabel}`}
          className={cn(selectClass, "w-auto")}
          disabled={disabled}
          onChange={(event) =>
            onRun(() =>
              updateExpedienteDocumentAction({
                documentId: document.id,
                status: event.target.value,
                notes: document.notes,
              }),
            )
          }
          value={document.status}
        >
          {options.map((status) => (
            <option key={status} value={status}>
              {expedienteDocumentStatusLabels[status]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function documentTone(status: ExpedienteDocumentStatusValue) {
  if (status === "REVISADO") return "green" as const;
  if (status === "RECIBIDO") return "blue" as const;
  if (status === "RECHAZADO") return "red" as const;
  return "slate" as const;
}

// --- Crédito -------------------------------------------------------------

function CreditSection({
  credit,
  customerFileId,
  disabled,
  onRun,
}: {
  credit: ExpedienteSupportDTO["creditApplication"];
  customerFileId: string;
  disabled: boolean;
  onRun: Runner;
}) {
  // Keyed by the parent on the server record; see QuoteSection.
  const [financialInstitution, setFinancialInstitution] = useState(
    credit?.financialInstitution ?? "",
  );
  const [financingType, setFinancingType] = useState(credit?.financingType ?? "");
  const [amount, setAmount] = useState(numberToInput(credit?.amount));
  const [downPayment, setDownPayment] = useState(numberToInput(credit?.downPayment));
  const [termMonths, setTermMonths] = useState(numberToInput(credit?.termMonths));
  const [estimatedPayment, setEstimatedPayment] = useState(
    numberToInput(credit?.estimatedPayment),
  );
  const [currency, setCurrency] = useState(credit?.currency ?? "USD");
  const [pendingItems, setPendingItems] = useState(credit?.pendingItems ?? "");
  const [observations, setObservations] = useState(credit?.observations ?? "");

  const closed = credit
    ? resolvedCreditStatuses.includes(credit.status)
    : false;

  function save() {
    onRun(() =>
      saveCreditApplicationAction({
        customerFileId,
        financialInstitution: financialInstitution || null,
        financingType: financingType || null,
        amount: toNumber(amount),
        downPayment: toNumber(downPayment),
        termMonths: toNumber(termMonths),
        estimatedPayment: toNumber(estimatedPayment),
        currency,
        pendingItems: pendingItems || null,
        observations: observations || null,
      }),
    );
  }

  return (
    <section className="border-t border-slate-200 pt-8">
      <SectionHeading
        action={
          credit ? (
            <Badge tone={creditTone(credit.status)}>{credit.statusLabel}</Badge>
          ) : null
        }
        description="Seguimiento manual del crédito del expediente. No representa aprobación de una financiera."
        icon={CreditCard}
        title="Crédito"
      />

      <div className="mt-5">
        <FormSection
          description="Los montos y el plazo son referenciales para el seguimiento comercial."
          title="Datos del seguimiento"
        >
          <Field label="Financiera">
            <Input
              onChange={(event) => setFinancialInstitution(event.target.value)}
              placeholder="Ej. Financiera externa"
              value={financialInstitution}
            />
          </Field>
          <Field label="Tipo de financiamiento">
            <select
              className={selectClass}
              onChange={(event) => setFinancingType(event.target.value)}
              value={financingType}
            >
              <option value="">Sin definir</option>
              {creditFinancingTypeValues.map((value) => (
                <option key={value} value={value}>
                  {creditFinancingTypeLabels[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monto solicitado">
            <Input
              min="0"
              onChange={(event) => setAmount(event.target.value)}
              type="number"
              value={amount}
            />
          </Field>
          <Field label="Prima">
            <Input
              min="0"
              onChange={(event) => setDownPayment(event.target.value)}
              type="number"
              value={downPayment}
            />
          </Field>
          <Field label="Plazo (meses)">
            <Input
              min="1"
              onChange={(event) => setTermMonths(event.target.value)}
              type="number"
              value={termMonths}
            />
          </Field>
          <Field label="Cuota estimada">
            <Input
              min="0"
              onChange={(event) => setEstimatedPayment(event.target.value)}
              type="number"
              value={estimatedPayment}
            />
          </Field>
          <Field label="Moneda">
            <select
              className={selectClass}
              onChange={(event) => setCurrency(event.target.value)}
              value={currency}
            >
              {supportedCurrencies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Requisitos pendientes">
            <Input
              onChange={(event) => setPendingItems(event.target.value)}
              value={pendingItems}
            />
          </Field>
          <Field className="sm:col-span-2" label="Observaciones">
            <Input
              onChange={(event) => setObservations(event.target.value)}
              value={observations}
            />
          </Field>
        </FormSection>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <Button disabled={disabled} onClick={save} size="sm">
            {credit ? "Guardar seguimiento" : "Iniciar seguimiento"}
          </Button>

          {credit && !closed ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Cambiar estado
              </span>
              <select
                className={cn(selectClass, "w-auto min-w-[220px]")}
                disabled={disabled}
                onChange={(event) =>
                  onRun(() =>
                    changeCreditStatusAction({
                      customerFileId,
                      status: event.target.value,
                    }),
                  )
                }
                value={credit.status}
              >
                {creditStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {creditStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {closed ? (
            <p className="text-sm text-slate-500">
              El seguimiento de crédito ya está cerrado.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function creditTone(status: CreditStatusValue) {
  if (status === "APROBADO") return "green" as const;
  if (status === "PREAPROBADO") return "blue" as const;
  if (status === "RECHAZADO" || status === "CANCELADO") return "red" as const;
  if (status === "DOCUMENTACION_PENDIENTE" || status === "EN_REVISION") {
    return "yellow" as const;
  }
  return "slate" as const;
}

// --- Seguimiento ---------------------------------------------------------

/**
 * Follow-ups of this expediente (Patch 3.3C.1). Creating one here derives the
 * branch from the expediente server-side; the client never sends it.
 */
function FollowUpSection({
  activities,
  customerFileId,
  disabled,
  nowIso,
  onRun,
}: {
  activities: ActivityListItemDTO[];
  customerFileId: string;
  disabled: boolean;
  nowIso: string;
  onRun: Runner;
}) {
  const [type, setType] = useState<string>("SEGUIMIENTO");
  const [priority, setPriority] = useState<string>("MEDIA");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const now = new Date(nowIso);
  const pendientes = activities.filter(
    (activity) => activity.status === "PENDIENTE",
  ).length;

  function create() {
    onRun(async () => {
      const result = await createActivityAction({
        type,
        priority,
        description,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        customerFileId,
      });
      if (result.ok) {
        setDescription("");
        setScheduledAt("");
      }
      return result;
    });
  }

  return (
    <section className="border-t border-slate-200 pt-8">
      <SectionHeading
        action={
          <Badge tone={pendientes ? "amber" : "slate"}>
            {pendientes} pendientes
          </Badge>
        }
        description="Llamadas, visitas, notas y próximas acciones de este expediente."
        icon={CalendarClock}
        title="Seguimiento"
      />

      <div className="mt-5">
        <FormSection
          description="La fecha programada es opcional."
          title="Registrar actividad"
        >
          <Field label="Tipo">
            <select
              className={selectClass}
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              {activityTypeValues.map((value) => (
                <option key={value} value={value}>
                  {activityTypeLabels[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prioridad">
            <select
              className={selectClass}
              onChange={(event) => setPriority(event.target.value)}
              value={priority}
            >
              {activityPriorityValues.map((value) => (
                <option key={value} value={value}>
                  {activityPriorityLabels[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field className="sm:col-span-2" label="Descripción" required>
            <Input
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ej. Confirmar documentación pendiente"
              value={description}
            />
          </Field>
          <Field label="Fecha programada">
            <Input
              onChange={(event) => setScheduledAt(event.target.value)}
              type="date"
              value={scheduledAt}
            />
          </Field>
        </FormSection>

        <div className="mt-4">
          <Button
            disabled={disabled || !description.trim()}
            onClick={create}
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Registrar actividad
          </Button>
        </div>

        {activities.length ? (
          <div className="mt-5 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {activities.map((activity) => {
              const overdue = isActivityOverdue(activity, now);
              return (
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
                    overdue && "bg-red-50/40",
                  )}
                  key={activity.id}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900">
                      {activity.description ?? "Sin descripción"}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      <span>{activity.typeLabel}</span>
                      <span>{formatSchedule(activity.scheduledAt)}</span>
                      {activity.userName ? <span>{activity.userName}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={activityTone(activity.status, overdue)}>
                      {overdue ? "Vencida" : activity.statusLabel}
                    </Badge>
                    <Badge tone={activityPriorityTone(activity.priority)}>
                      {activity.priorityLabel}
                    </Badge>
                    {activity.status === "PENDIENTE" ? (
                      <>
                        <Button
                          disabled={disabled}
                          onClick={() =>
                            onRun(() =>
                              completeActivityAction({ activityId: activity.id }),
                            )
                          }
                          size="sm"
                          variant="success"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Completar
                        </Button>
                        <Button
                          disabled={disabled}
                          onClick={() =>
                            onRun(() =>
                              cancelActivityAction({ activityId: activity.id }),
                            )
                          }
                          size="sm"
                          variant="secondary"
                        >
                          <XCircle className="h-4 w-4" />
                          Cancelar
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Este expediente aún no tiene actividades registradas.
          </div>
        )}
      </div>
    </section>
  );
}

function activityTone(status: ActivityStatusValue, overdue: boolean) {
  if (overdue) return "red" as const;
  if (status === "COMPLETADA") return "green" as const;
  if (status === "CANCELADA") return "gray" as const;
  return "amber" as const;
}

function activityPriorityTone(priority: ActivityPriorityValue) {
  if (priority === "ALTA") return "orange" as const;
  if (priority === "BAJA") return "slate" as const;
  return "blue" as const;
}

function formatSchedule(scheduledAt: string | null) {
  if (!scheduledAt) return "Sin fecha programada";
  return new Date(scheduledAt).toLocaleDateString("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// --- Helpers -------------------------------------------------------------

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function formatMoney(value: number | null | undefined, currency?: string | null) {
  if (value == null) return "—";
  return `${currency ?? ""} ${value.toLocaleString("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`.trim();
}
