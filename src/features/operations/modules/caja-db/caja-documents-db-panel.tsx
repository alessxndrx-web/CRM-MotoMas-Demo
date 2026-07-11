"use client";

import Link from "next/link";
import {
  Ban,
  Banknote,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Receipt,
  Save,
  StickyNote,
  Trash2,
} from "lucide-react";
import { useState } from "react";

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
  documentStatusTone,
  formatCajaAmount,
  formatCajaDateTime,
  parseAmount,
  selectClass,
  useCajaRunner,
  type CajaRunner,
} from "@/features/operations/modules/caja-db/caja-db-shared";
import {
  addCashDocumentItemAction,
  addCashPaymentAction,
  cancelCashDocumentAction,
  createCashDocumentAction,
  issueCashDocumentAction,
  removeCashDocumentItemAction,
  removeCashPaymentAction,
  updateCashDocumentAction,
  updateCashDocumentItemAction,
  updateCashPaymentAction,
} from "@/server/caja/actions";
import {
  cashDocumentTypeLabels,
  cashPaymentMethodLabels,
  cashPaymentMethodValues,
  type CashDocumentDetailDTO,
  type CashDocumentDTO,
  type CashDocumentItemDTO,
  type CashDocumentTypeValue,
  type CashPaymentDTO,
  type CashSessionDTO,
} from "@/server/caja/shared";

/**
 * Database-backed document workflow shared by `/panel/caja/facturacion`,
 * `/panel/caja/recibos` and `/panel/caja/notas`. Additive to the legacy
 * `CashierPanel` rendered below it.
 *
 * Editing is offered only for a draft belonging to the reader's own open turno,
 * which mirrors what the server actions allow — a closed turno, an issued
 * document and a cancelled document all reject writes server-side.
 */

export type CajaDocumentsSection = "facturacion" | "recibos" | "notas";

type SectionConfig = {
  basePath: string;
  businessLabel: string;
  createTitle: string;
  emptyDescription: string;
  icon: typeof FileText;
  operationText: string;
  supervisionText: string;
  supportsItems: boolean;
  supportsPayments: boolean;
  supportsRetentions: boolean;
  title: string;
  types: CashDocumentTypeValue[];
};

const sections: Record<CajaDocumentsSection, SectionConfig> = {
  facturacion: {
    basePath: "/panel/caja/facturacion",
    businessLabel: "Facturación",
    createTitle: "Nueva factura",
    emptyDescription: "Crea una factura para registrar la venta del turno.",
    icon: FileText,
    operationText:
      "Registra la factura, agrega sus ítems y sus pagos, y emítela cuando el detalle esté completo.",
    supervisionText:
      "Consulta las facturas del alcance que supervisas, con su detalle, sus pagos y su saldo.",
    supportsItems: true,
    supportsPayments: true,
    supportsRetentions: true,
    title: "Facturación",
    types: ["FACTURA"],
  },
  recibos: {
    basePath: "/panel/caja/recibos",
    businessLabel: "Recibos",
    createTitle: "Nuevo recibo",
    emptyDescription: "Crea un recibo para respaldar un pago recibido.",
    icon: Receipt,
    operationText:
      "Registra el recibo por el monto acordado, agrega los pagos recibidos y emítelo.",
    supervisionText:
      "Consulta los recibos del alcance que supervisas, con su monto y sus pagos.",
    supportsItems: false,
    supportsPayments: true,
    supportsRetentions: false,
    title: "Recibos",
    types: ["RECIBO"],
  },
  notas: {
    basePath: "/panel/caja/notas",
    businessLabel: "Notas",
    createTitle: "Nueva nota",
    emptyDescription: "Crea una nota de débito o de crédito para ajustar un documento.",
    icon: StickyNote,
    operationText:
      "Registra la nota de débito o de crédito que ajusta un documento. Las notas no registran pagos directos.",
    supervisionText:
      "Consulta las notas de débito y de crédito del alcance que supervisas.",
    supportsItems: false,
    supportsPayments: false,
    supportsRetentions: false,
    title: "Notas",
    types: ["NOTA_DEBITO", "NOTA_CREDITO"],
  },
};

export function CajaDocumentsDbPanel({
  canOperate,
  detail,
  documents,
  enabled,
  scopeLabel,
  section,
  sessions,
  supervision,
}: {
  canOperate: boolean;
  /** The selected document, already re-scoped by the server. */
  detail: CashDocumentDetailDTO | null;
  documents: CashDocumentDTO[];
  enabled: boolean;
  scopeLabel: string;
  section: CajaDocumentsSection;
  /** Open turnos in scope; a global role may supervise more than one. */
  sessions: CashSessionDTO[];
  supervision: boolean;
}) {
  const config = sections[section];
  const { error, pending, run } = useCajaRunner();
  const Icon = config.icon;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PrimarySectionBadge
              businessLabel={`${config.businessLabel} · ${supervision ? "Supervisión" : "Operación"}`}
              technicalLabel={`${config.businessLabel} · Base de datos (fuente principal)`}
            />
            <CajaScopeChip label={scopeLabel} />
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <PrimarySectionDescription
          businessText={
            supervision && !canOperate
              ? config.supervisionText
              : config.operationText
          }
          technicalText={`${config.businessLabel} respaldada por PostgreSQL. Los documentos anteriores siguen disponibles debajo mientras se completa su migración.`}
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
              sessions.length ? (
                <div className="mt-6">
                  <CreateDocumentForm
                    config={config}
                    disabled={pending}
                    onRun={run}
                    sessions={sessions}
                  />
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-700">
                  Abre un turno en Caja para registrar documentos.
                </div>
              )
            ) : null}

            <DocumentList
              config={config}
              documents={documents}
              selectedId={detail?.id ?? null}
            />
          </>
        )}
      </Card>

      {enabled && detail ? (
        <DocumentDetailCard
          canOperate={canOperate}
          config={config}
          detail={detail}
          disabled={pending}
          onRun={run}
          sessions={sessions}
        />
      ) : null}
    </div>
  );
}

// --- Crear documento -----------------------------------------------------

function CreateDocumentForm({
  config,
  disabled,
  onRun,
  sessions,
}: {
  config: SectionConfig;
  disabled: boolean;
  onRun: CajaRunner;
  sessions: CashSessionDTO[];
}) {
  const [type, setType] = useState<CashDocumentTypeValue>(config.types[0]);
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [concept, setConcept] = useState("");
  const [description, setDescription] = useState("");
  const [motorcycleDescription, setMotorcycleDescription] = useState("");
  const [relatedDocumentNumber, setRelatedDocumentNumber] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [appliedPayment, setAppliedPayment] = useState("");
  const [retention1, setRetention1] = useState("");
  const [retention2, setRetention2] = useState("");
  const [notes, setNotes] = useState("");

  // An invoice takes its subtotal from its items, added after the draft exists.
  const showSubtotal = !config.supportsItems;
  const isNota = config.types.length > 1;

  function submit() {
    onRun(
      () =>
        createCashDocumentAction({
          appliedPayment: config.supportsRetentions
            ? parseAmount(appliedPayment)
            : 0,
          cashSessionId: sessionId,
          concept,
          description: description || null,
          motorcycleDescription: config.supportsItems
            ? motorcycleDescription || null
            : null,
          notes: notes || null,
          relatedDocumentNumber: isNota ? relatedDocumentNumber || null : null,
          retention1: config.supportsRetentions ? parseAmount(retention1) : 0,
          retention2: config.supportsRetentions ? parseAmount(retention2) : 0,
          subtotal: showSubtotal ? parseAmount(subtotal) : 0,
          taxId: taxId || null,
          thirdPartyName,
          type,
        }),
      () => {
        setThirdPartyName("");
        setTaxId("");
        setConcept("");
        setDescription("");
        setMotorcycleDescription("");
        setRelatedDocumentNumber("");
        setSubtotal("");
        setAppliedPayment("");
        setRetention1("");
        setRetention2("");
        setNotes("");
      },
    );
  }

  return (
    <>
      <FormSection
        description="El documento se crea en borrador: puedes completarlo antes de emitirlo."
        title={config.createTitle}
      >
        {sessions.length > 1 ? (
          <Field label="Turno" required>
            <select
              className={selectClass}
              onChange={(event) => setSessionId(event.target.value)}
              value={sessionId}
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.branchName} · {session.cashierName}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {isNota ? (
          <Field label="Tipo de nota" required>
            <select
              className={selectClass}
              onChange={(event) =>
                setType(event.target.value as CashDocumentTypeValue)
              }
              value={type}
            >
              {config.types.map((value) => (
                <option key={value} value={value}>
                  {cashDocumentTypeLabels[value]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Cliente o tercero" required>
          <Input
            onChange={(event) => setThirdPartyName(event.target.value)}
            placeholder="Nombre del cliente"
            value={thirdPartyName}
          />
        </Field>
        <Field hint="Opcional." label="RUC o cédula">
          <Input
            onChange={(event) => setTaxId(event.target.value)}
            value={taxId}
          />
        </Field>
        <Field className="sm:col-span-2" label="Concepto" required>
          <Input
            onChange={(event) => setConcept(event.target.value)}
            placeholder="Ej. Abono de motocicleta"
            value={concept}
          />
        </Field>
        {config.supportsItems ? (
          <Field className="sm:col-span-2" hint="Opcional." label="Motocicleta">
            <Input
              onChange={(event) => setMotorcycleDescription(event.target.value)}
              placeholder="Marca, modelo y chasis"
              value={motorcycleDescription}
            />
          </Field>
        ) : null}
        {isNota ? (
          <Field hint="Opcional." label="Documento relacionado">
            <Input
              onChange={(event) => setRelatedDocumentNumber(event.target.value)}
              placeholder="Número del documento ajustado"
              value={relatedDocumentNumber}
            />
          </Field>
        ) : null}
        {showSubtotal ? (
          <Field label="Monto" required>
            <Input
              inputMode="decimal"
              onChange={(event) => setSubtotal(event.target.value)}
              value={subtotal}
            />
          </Field>
        ) : null}
        {config.supportsRetentions ? (
          <>
            <Field hint="Opcional." label="Abono">
              <Input
                inputMode="decimal"
                onChange={(event) => setAppliedPayment(event.target.value)}
                value={appliedPayment}
              />
            </Field>
            <Field hint="Opcional." label="Retención 1">
              <Input
                inputMode="decimal"
                onChange={(event) => setRetention1(event.target.value)}
                value={retention1}
              />
            </Field>
            <Field hint="Opcional." label="Retención 2">
              <Input
                inputMode="decimal"
                onChange={(event) => setRetention2(event.target.value)}
                value={retention2}
              />
            </Field>
          </>
        ) : null}
        <Field className="sm:col-span-2" hint="Opcional." label="Observaciones">
          <Input
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </Field>
      </FormSection>

      <div className="mt-4">
        <Button
          disabled={
            disabled || !sessionId || !thirdPartyName.trim() || !concept.trim()
          }
          onClick={submit}
          size="sm"
        >
          <Plus className="h-4 w-4" />
          {config.createTitle}
        </Button>
      </div>
    </>
  );
}

// --- Listado -------------------------------------------------------------

function DocumentList({
  config,
  documents,
  selectedId,
}: {
  config: SectionConfig;
  documents: CashDocumentDTO[];
  selectedId: string | null;
}) {
  if (!documents.length) {
    return (
      <EmptyState
        className="mt-6"
        description={config.emptyDescription}
        icon={config.icon}
        title="Aún no hay documentos en este alcance"
      />
    );
  }

  return (
    <div className="mt-6 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
      {documents.map((document) => (
        <Link
          className={
            document.id === selectedId
              ? "flex flex-wrap items-center justify-between gap-4 bg-blue-50/60 px-4 py-4"
              : "flex flex-wrap items-center justify-between gap-4 px-4 py-4 transition hover:bg-slate-50"
          }
          href={`${config.basePath}?documento=${document.id}`}
          key={document.id}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="slate">{document.typeLabel}</Badge>
              <Badge tone={documentStatusTone(document.status)}>
                {document.statusLabel}
              </Badge>
              <span className="font-mono text-xs font-medium text-slate-600">
                {document.documentNumber}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {document.thirdPartyName}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {document.concept} · {document.branchName} ·{" "}
              {formatCajaDateTime(document.issuedAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">
              {formatCajaAmount(document.total)}
            </p>
            <p className="text-xs text-slate-500">
              Pagado {formatCajaAmount(document.paidTotal)} · Saldo{" "}
              {formatCajaAmount(document.balance)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

// --- Detalle -------------------------------------------------------------

function DocumentDetailCard({
  canOperate,
  config,
  detail,
  disabled,
  onRun,
  sessions,
}: {
  canOperate: boolean;
  config: SectionConfig;
  detail: CashDocumentDetailDTO;
  disabled: boolean;
  onRun: CajaRunner;
  sessions: CashSessionDTO[];
}) {
  const [reason, setReason] = useState("");

  // The server allows writes only while the document's own turno is open.
  const inOpenSession = sessions.some(
    (session) => session.id === detail.cashSessionId,
  );
  const editable = canOperate && inOpenSession && detail.status === "BORRADOR";
  const cancellable = canOperate && inOpenSession && detail.status !== "ANULADO";

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="slate">{detail.typeLabel}</Badge>
            <Badge tone={documentStatusTone(detail.status)}>
              {detail.statusLabel}
            </Badge>
          </div>
          <p className="mt-2 font-mono text-sm font-semibold text-slate-900">
            {detail.documentNumber}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {detail.thirdPartyName}
            {detail.taxId ? ` · ${detail.taxId}` : ""} · {detail.branchName} ·{" "}
            {detail.issuedByName}
          </p>
          {detail.relatedDocumentNumber ? (
            <p className="mt-1 text-xs text-slate-500">
              Ajusta a {detail.relatedDocumentNumber}
            </p>
          ) : null}
        </div>

        {editable ? (
          <Button
            disabled={disabled}
            onClick={() =>
              onRun(() => issueCashDocumentAction({ documentId: detail.id }))
            }
            size="sm"
            variant="success"
          >
            <CheckCircle2 className="h-4 w-4" />
            Emitir
          </Button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <CajaTotal label="Subtotal" value={formatCajaAmount(detail.subtotal)} />
        <CajaTotal label="Abono" value={formatCajaAmount(detail.appliedPayment)} />
        <CajaTotal
          label="Retención 1"
          value={formatCajaAmount(detail.retention1)}
        />
        <CajaTotal
          label="Retención 2"
          value={formatCajaAmount(detail.retention2)}
        />
        <CajaTotal emphasis label="Total" value={formatCajaAmount(detail.total)} />
        <CajaTotal
          label="Saldo"
          value={`${formatCajaAmount(detail.balance)} · pagado ${formatCajaAmount(detail.paidTotal)}`}
        />
      </div>

      {detail.status === "ANULADO" ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
          Documento anulado el {formatCajaDateTime(detail.cancelledAt)}.
        </div>
      ) : null}

      {editable ? (
        <div className="mt-6">
          <UpdateDocumentForm
            config={config}
            detail={detail}
            disabled={disabled}
            onRun={onRun}
          />
        </div>
      ) : null}

      {config.supportsItems ? (
        <ItemsSection
          disabled={disabled}
          editable={editable}
          items={detail.items}
          onRun={onRun}
          documentId={detail.id}
        />
      ) : null}

      {config.supportsPayments ? (
        <PaymentsSection
          disabled={disabled}
          documentId={detail.id}
          editable={editable}
          onRun={onRun}
          payments={detail.payments}
        />
      ) : null}

      {cancellable ? (
        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4">
          <div className="min-w-[16rem] flex-1">
            <Field label="Motivo de anulación" required>
              <Input
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej. Error en el monto"
                value={reason}
              />
            </Field>
          </div>
          <Button
            disabled={disabled || !reason.trim()}
            onClick={() =>
              onRun(
                () =>
                  cancelCashDocumentAction({ documentId: detail.id, reason }),
                () => setReason(""),
              )
            }
            size="sm"
            variant="danger"
          >
            <Ban className="h-4 w-4" />
            Anular
          </Button>
        </div>
      ) : null}

      {!canOperate ? (
        <p className="mt-6 text-xs text-slate-500">
          Supervisión: este documento es de solo lectura en tu alcance.
        </p>
      ) : !inOpenSession && detail.status === "BORRADOR" ? (
        <p className="mt-6 flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          El turno de este documento no está abierto.
        </p>
      ) : null}
    </Card>
  );
}

// --- Editar borrador -----------------------------------------------------

function UpdateDocumentForm({
  config,
  detail,
  disabled,
  onRun,
}: {
  config: SectionConfig;
  detail: CashDocumentDetailDTO;
  disabled: boolean;
  onRun: CajaRunner;
}) {
  const [thirdPartyName, setThirdPartyName] = useState(detail.thirdPartyName);
  const [taxId, setTaxId] = useState(detail.taxId ?? "");
  const [concept, setConcept] = useState(detail.concept);
  const [description, setDescription] = useState(detail.description ?? "");
  const [subtotal, setSubtotal] = useState(String(detail.subtotal));
  const [appliedPayment, setAppliedPayment] = useState(
    String(detail.appliedPayment),
  );
  const [retention1, setRetention1] = useState(String(detail.retention1));
  const [retention2, setRetention2] = useState(String(detail.retention2));

  // An invoice subtotal is recalculated from its items, never typed here.
  const showSubtotal = !config.supportsItems;

  return (
    <>
      <FormSection title="Editar borrador">
        <Field label="Cliente o tercero" required>
          <Input
            onChange={(event) => setThirdPartyName(event.target.value)}
            value={thirdPartyName}
          />
        </Field>
        <Field hint="Opcional." label="RUC o cédula">
          <Input onChange={(event) => setTaxId(event.target.value)} value={taxId} />
        </Field>
        <Field className="sm:col-span-2" label="Concepto" required>
          <Input
            onChange={(event) => setConcept(event.target.value)}
            value={concept}
          />
        </Field>
        <Field className="sm:col-span-2" hint="Opcional." label="Descripción">
          <Input
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </Field>
        {showSubtotal ? (
          <Field label="Monto" required>
            <Input
              inputMode="decimal"
              onChange={(event) => setSubtotal(event.target.value)}
              value={subtotal}
            />
          </Field>
        ) : null}
        {config.supportsRetentions ? (
          <>
            <Field label="Abono">
              <Input
                inputMode="decimal"
                onChange={(event) => setAppliedPayment(event.target.value)}
                value={appliedPayment}
              />
            </Field>
            <Field label="Retención 1">
              <Input
                inputMode="decimal"
                onChange={(event) => setRetention1(event.target.value)}
                value={retention1}
              />
            </Field>
            <Field label="Retención 2">
              <Input
                inputMode="decimal"
                onChange={(event) => setRetention2(event.target.value)}
                value={retention2}
              />
            </Field>
          </>
        ) : null}
      </FormSection>

      <div className="mt-4">
        <Button
          disabled={disabled || !thirdPartyName.trim() || !concept.trim()}
          onClick={() =>
            onRun(() =>
              updateCashDocumentAction({
                appliedPayment: config.supportsRetentions
                  ? parseAmount(appliedPayment)
                  : undefined,
                concept,
                description: description || null,
                documentId: detail.id,
                retention1: config.supportsRetentions
                  ? parseAmount(retention1)
                  : undefined,
                retention2: config.supportsRetentions
                  ? parseAmount(retention2)
                  : undefined,
                subtotal: showSubtotal ? parseAmount(subtotal) : undefined,
                taxId: taxId || null,
                thirdPartyName,
              }),
            )
          }
          size="sm"
          variant="secondary"
        >
          <Save className="h-4 w-4" />
          Guardar cambios
        </Button>
      </div>
    </>
  );
}

// --- Ítems ---------------------------------------------------------------

function ItemsSection({
  disabled,
  documentId,
  editable,
  items,
  onRun,
}: {
  disabled: boolean;
  documentId: string;
  editable: boolean;
  items: CashDocumentItemDTO[];
  onRun: CajaRunner;
}) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-slate-900">Detalle</h3>

      {items.length ? (
        <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {items.map((item) => (
            <ItemRow
              disabled={disabled}
              editable={editable}
              item={item}
              key={item.id}
              onRun={onRun}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Agrega al menos un ítem antes de emitir la factura.
        </p>
      )}

      {editable ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4">
          <div className="min-w-[14rem] flex-1">
            <Field label="Descripción" required>
              <Input
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ej. Motocicleta modelo 2026"
                value={description}
              />
            </Field>
          </div>
          <div className="w-28">
            <Field label="Cantidad" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setQuantity(event.target.value)}
                value={quantity}
              />
            </Field>
          </div>
          <div className="w-36">
            <Field label="Precio" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setUnitPrice(event.target.value)}
                value={unitPrice}
              />
            </Field>
          </div>
          <Button
            disabled={disabled || !description.trim()}
            onClick={() =>
              onRun(
                () =>
                  addCashDocumentItemAction({
                    description,
                    documentId,
                    quantity: parseAmount(quantity),
                    unitPrice: parseAmount(unitPrice),
                  }),
                () => {
                  setDescription("");
                  setQuantity("1");
                  setUnitPrice("");
                },
              )
            }
            size="sm"
          >
            <Plus className="h-4 w-4" />
            Agregar ítem
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ItemRow({
  disabled,
  editable,
  item,
  onRun,
}: {
  disabled: boolean;
  editable: boolean;
  item: CashDocumentItemDTO;
  onRun: CajaRunner;
}) {
  const [description, setDescription] = useState(item.description);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice));

  if (!editable) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-slate-700">
          {item.description}
          <span className="ml-2 text-xs text-slate-500">
            {item.quantity} × {formatCajaAmount(item.unitPrice)}
          </span>
        </p>
        <p className="text-sm font-semibold text-slate-900">
          {formatCajaAmount(item.total)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Input
        aria-label="Descripción del ítem"
        className="min-w-[12rem] flex-1"
        disabled={disabled}
        onChange={(event) => setDescription(event.target.value)}
        value={description}
      />
      <Input
        aria-label="Cantidad"
        className="w-24"
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => setQuantity(event.target.value)}
        value={quantity}
      />
      <Input
        aria-label="Precio unitario"
        className="w-32"
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => setUnitPrice(event.target.value)}
        value={unitPrice}
      />
      <span className="w-28 text-right text-sm font-semibold text-slate-900">
        {formatCajaAmount(item.total)}
      </span>
      <Button
        disabled={disabled || !description.trim()}
        onClick={() =>
          onRun(() =>
            updateCashDocumentItemAction({
              description,
              itemId: item.id,
              quantity: parseAmount(quantity),
              unitPrice: parseAmount(unitPrice),
            }),
          )
        }
        size="sm"
        variant="secondary"
      >
        <Save className="h-4 w-4" />
      </Button>
      <Button
        disabled={disabled}
        onClick={() =>
          onRun(() => removeCashDocumentItemAction({ itemId: item.id }))
        }
        size="sm"
        variant="ghost"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

// --- Pagos ---------------------------------------------------------------

function PaymentsSection({
  disabled,
  documentId,
  editable,
  onRun,
  payments,
}: {
  disabled: boolean;
  documentId: string;
  editable: boolean;
  onRun: CajaRunner;
  payments: CashPaymentDTO[];
}) {
  const [method, setMethod] = useState<string>("EFECTIVO");
  const [amount, setAmount] = useState("");
  const [bank, setBank] = useState("");
  const [reference, setReference] = useState("");

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-slate-900">Pagos</h3>

      {payments.length ? (
        <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {payments.map((payment) => (
            <PaymentRow
              disabled={disabled}
              editable={editable}
              key={payment.id}
              onRun={onRun}
              payment={payment}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Aún no hay pagos registrados.
        </p>
      )}

      {editable ? (
        <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4">
          <div className="w-44">
            <Field label="Forma de pago" required>
              <select
                className={selectClass}
                onChange={(event) => setMethod(event.target.value)}
                value={method}
              >
                {cashPaymentMethodValues.map((value) => (
                  <option key={value} value={value}>
                    {cashPaymentMethodLabels[value]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="w-36">
            <Field label="Monto" required>
              <Input
                inputMode="decimal"
                onChange={(event) => setAmount(event.target.value)}
                value={amount}
              />
            </Field>
          </div>
          <div className="w-40">
            <Field hint="Opcional." label="Banco">
              <Input
                onChange={(event) => setBank(event.target.value)}
                value={bank}
              />
            </Field>
          </div>
          <div className="w-40">
            <Field hint="Opcional." label="Referencia">
              <Input
                onChange={(event) => setReference(event.target.value)}
                value={reference}
              />
            </Field>
          </div>
          <Button
            disabled={disabled || !amount.trim()}
            onClick={() =>
              onRun(
                () =>
                  addCashPaymentAction({
                    amount: parseAmount(amount),
                    bank: bank || null,
                    documentId,
                    method,
                    reference: reference || null,
                  }),
                () => {
                  setAmount("");
                  setBank("");
                  setReference("");
                },
              )
            }
            size="sm"
          >
            <Banknote className="h-4 w-4" />
            Registrar pago
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PaymentRow({
  disabled,
  editable,
  onRun,
  payment,
}: {
  disabled: boolean;
  editable: boolean;
  onRun: CajaRunner;
  payment: CashPaymentDTO;
}) {
  const [method, setMethod] = useState<string>(payment.method);
  const [amount, setAmount] = useState(String(payment.amount));

  if (!editable) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm text-slate-700">{payment.methodLabel}</p>
          <p className="text-xs text-slate-500">
            {formatCajaDateTime(payment.paidAt)}
            {payment.reference ? ` · ${payment.reference}` : ""}
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-900">
          {formatCajaAmount(payment.amount)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <select
        aria-label="Forma de pago"
        className={`${selectClass} w-44`}
        disabled={disabled}
        onChange={(event) => setMethod(event.target.value)}
        value={method}
      >
        {cashPaymentMethodValues.map((value) => (
          <option key={value} value={value}>
            {cashPaymentMethodLabels[value]}
          </option>
        ))}
      </select>
      <Input
        aria-label="Monto del pago"
        className="w-36"
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => setAmount(event.target.value)}
        value={amount}
      />
      <span className="flex-1 text-xs text-slate-500">
        {formatCajaDateTime(payment.paidAt)}
        {payment.bank ? ` · ${payment.bank}` : ""}
        {payment.reference ? ` · ${payment.reference}` : ""}
      </span>
      <Button
        disabled={disabled || !amount.trim()}
        onClick={() =>
          onRun(() =>
            updateCashPaymentAction({
              amount: parseAmount(amount),
              method,
              paymentId: payment.id,
            }),
          )
        }
        size="sm"
        variant="secondary"
      >
        <Save className="h-4 w-4" />
      </Button>
      <Button
        disabled={disabled}
        onClick={() =>
          onRun(() => removeCashPaymentAction({ paymentId: payment.id }))
        }
        size="sm"
        variant="ghost"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
