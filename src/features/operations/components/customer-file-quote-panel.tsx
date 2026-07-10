"use client";

import {
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  Printer,
  Send,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motorcycles } from "@/data/catalog/motorcycles";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import {
  quoteCurrencies,
  quoteSaleTypes,
  type QuoteRecord,
} from "@/data/operations/quotes";
import {
  changeQuoteStatus,
  createQuote,
  getQuoteByCustomerFileId,
  isQuoteExpired,
  readQuotes,
  type QuoteInput,
  updateQuote,
} from "@/features/operations/services/quote-service";
import type { DemoSession } from "@/features/operations/types";

type QuoteDraft = {
  modeloId: string;
  tipoVenta: QuoteInput["tipoVenta"];
  precioReferencial: string;
  prima: string;
  plazoMeses: string;
  cuotaEstimada: string;
  moneda: QuoteInput["moneda"];
  fechaVencimiento: string;
  observaciones: string;
};

export function CustomerFileQuotePanel({
  file,
  session,
}: {
  file: CustomerFileRecord;
  session: DemoSession;
}) {
  const [quote, setQuote] = useState<QuoteRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuoteDraft>(() => createDraft(file));
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedQuote = getQuoteByCustomerFileId(readQuotes(), file.id);
    setQuote(storedQuote);
    setDraft(createDraft(file, storedQuote));
    setEditing(false);
    setMessage("");
  }, [file]);

  const canEdit = session.role === "Vendedor" && file.vendedor === session.userName;
  const expired = quote ? isQuoteExpired(quote) : false;

  function save(initialStatus: "Borrador" | "Emitida") {
    const input = toQuoteInput(draft, file);
    const result = quote
      ? updateQuote(quote.id, file, input, session)
      : createQuote(file, input, session, initialStatus);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setQuote(result.quote);
    setDraft(createDraft(file, result.quote));
    setEditing(false);
    setMessage(quote ? "Proforma actualizada." : "Proforma comercial creada.");
  }

  function updateStatus(status: "Emitida" | "Aceptada" | "Cancelada") {
    if (!quote) return;
    const result = changeQuoteStatus(quote.id, file, status, session);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setQuote(result.quote);
    setDraft(createDraft(file, result.quote));
    setMessage(
      status === "Emitida"
        ? "Proforma emitida."
        : status === "Aceptada"
          ? "Proforma aceptada."
          : "Proforma cancelada.",
    );
  }

  return (
    <section className="mt-6 border-t border-slate-200 pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <FileText className="mt-1 h-5 w-5 text-red-600" />
          <div>
            <h4 className="text-lg font-black text-slate-900">Proforma comercial</h4>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Documento comercial único del expediente. No reserva una unidad ni completa una venta.
            </p>
          </div>
        </div>
        {quote ? <Badge tone={quoteTone(quote, expired)}>{expired ? "Vencida" : quote.estado}</Badge> : null}
      </div>

      {message ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      {!quote && !editing ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-sm leading-6 text-slate-500">
            Aún no hay una proforma comercial para este expediente. Creala para registrar una propuesta de atención.
          </p>
          {canEdit ? (
            <Button className="mt-4" onClick={() => setEditing(true)} variant="secondary">
              <Plus className="h-4 w-4" />
              Crear proforma
            </Button>
          ) : null}
        </div>
      ) : null}

      {quote && !editing ? (
        <QuoteSummary
          canEdit={canEdit}
          expired={expired}
          onAccept={() => updateStatus("Aceptada")}
          onCancel={() => updateStatus("Cancelada")}
          onEdit={() => setEditing(true)}
          onEmit={() => updateStatus("Emitida")}
          onPrint={() => window.print()}
          quote={quote}
        />
      ) : null}

      {editing ? (
        <QuoteForm
          draft={draft}
          file={file}
          hasQuote={Boolean(quote)}
          onCancel={() => {
            setEditing(false);
            setDraft(createDraft(file, quote));
          }}
          onChange={setDraft}
          onSave={save}
        />
      ) : null}
    </section>
  );
}

function QuoteSummary({
  canEdit,
  expired,
  onAccept,
  onCancel,
  onEdit,
  onEmit,
  onPrint,
  quote,
}: {
  canEdit: boolean;
  expired: boolean;
  onAccept: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onEmit: () => void;
  onPrint: () => void;
  quote: QuoteRecord;
}) {
  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="font-mono text-lg font-black text-slate-900">{quote.numeroProforma}</div>
          <div className="mt-1 text-sm text-slate-500">{quote.modeloNombre}</div>
        </div>
        <Button onClick={onPrint} size="sm" variant="secondary">
          <Printer className="h-4 w-4" />
          Imprimir proforma
        </Button>
      </div>

      <div className="mt-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <Detail label="Forma de pago" value={quote.tipoVenta} />
        <Detail label="Moneda" value={quote.moneda} />
        <Detail label="Precio referencial" value={formatAmount(quote.precioReferencial, quote.moneda)} />
        <Detail label="Prima" value={formatAmount(quote.prima, quote.moneda)} />
        <Detail label="Plazo" value={quote.plazoMeses === null ? "No indicado" : `${quote.plazoMeses} meses`} />
        <Detail label="Cuota estimada" value={formatAmount(quote.cuotaEstimada, quote.moneda)} />
        <Detail label="Emision" value={formatDate(quote.fechaEmision)} />
        <Detail label="Vencimiento" value={expired ? `${formatDate(quote.fechaVencimiento)} (vencida)` : formatDate(quote.fechaVencimiento)} />
      </div>

      <div className="mt-4 text-xs font-black uppercase tracking-[0.12em] text-slate-500">Observaciones</div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{quote.observaciones ?? "Sin observaciones registradas."}</p>

      {canEdit ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {quote.estado !== "Cancelada" ? (
            <Button onClick={onEdit} size="sm" variant="secondary">
              <Pencil className="h-4 w-4" />
              Editar proforma
            </Button>
          ) : null}
          {quote.estado === "Borrador" ? (
            <Button onClick={onEmit} size="sm" variant="secondary">
              <Send className="h-4 w-4" />
              Marcar como emitida
            </Button>
          ) : null}
          {quote.estado === "Emitida" ? (
            <Button onClick={onAccept} size="sm" variant="success">
              <CheckCircle2 className="h-4 w-4" />
              Marcar como aceptada
            </Button>
          ) : null}
          {(quote.estado === "Borrador" || quote.estado === "Emitida") ? (
            <Button onClick={onCancel} size="sm" variant="danger">
              <XCircle className="h-4 w-4" />
              Cancelar proforma
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function QuoteForm({
  draft,
  file,
  hasQuote,
  onCancel,
  onChange,
  onSave,
}: {
  draft: QuoteDraft;
  file: CustomerFileRecord;
  hasQuote: boolean;
  onCancel: () => void;
  onChange: (draft: QuoteDraft) => void;
  onSave: (status: "Borrador" | "Emitida") => void;
}) {
  return (
    <form
      className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave("Borrador");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Moto cotizada">
          <select
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
            onChange={(event) => onChange({ ...draft, modeloId: event.target.value })}
            value={draft.modeloId}
          >
            <option value="">Moto de interés: {file.motoInteres}</option>
            {motorcycles.map((motorcycle) => (
              <option key={motorcycle.slug} value={motorcycle.slug}>
                {motorcycle.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Forma de pago">
          <select
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
            onChange={(event) => onChange({ ...draft, tipoVenta: event.target.value as QuoteDraft["tipoVenta"] })}
            value={draft.tipoVenta}
          >
            {quoteSaleTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Precio referencial">
          <Input min="0" onChange={(event) => onChange({ ...draft, precioReferencial: event.target.value })} step="0.01" type="number" value={draft.precioReferencial} />
        </Field>
        <Field label="Prima">
          <Input min="0" onChange={(event) => onChange({ ...draft, prima: event.target.value })} step="0.01" type="number" value={draft.prima} />
        </Field>
        <Field label="Plazo en meses">
          <Input min="0" onChange={(event) => onChange({ ...draft, plazoMeses: event.target.value })} step="1" type="number" value={draft.plazoMeses} />
        </Field>
        <Field label="Cuota estimada">
          <Input min="0" onChange={(event) => onChange({ ...draft, cuotaEstimada: event.target.value })} step="0.01" type="number" value={draft.cuotaEstimada} />
        </Field>
        <Field label="Moneda">
          <select
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
            onChange={(event) => onChange({ ...draft, moneda: event.target.value as QuoteDraft["moneda"] })}
            value={draft.moneda}
          >
            {quoteCurrencies.map((currency) => <option key={currency}>{currency}</option>)}
          </select>
        </Field>
        <Field label="Fecha de vencimiento">
          <Input onChange={(event) => onChange({ ...draft, fechaVencimiento: event.target.value })} type="date" value={draft.fechaVencimiento} />
        </Field>
      </div>
      <Field label="Observaciones">
        <textarea
          className="min-h-[88px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500"
          maxLength={300}
          onChange={(event) => onChange({ ...draft, observaciones: event.target.value })}
          value={draft.observaciones}
        />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary">
          <FileText className="h-4 w-4" />
          {hasQuote ? "Guardar cambios" : "Guardar borrador"}
        </Button>
        {!hasQuote ? (
          <Button onClick={() => onSave("Emitida")} type="button">
            <Send className="h-4 w-4" />
            Crear y emitir
          </Button>
        ) : null}
        <Button onClick={onCancel} type="button" variant="ghost">Cancelar</Button>
      </div>
    </form>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-900">{value}</div>
    </div>
  );
}

function createDraft(file: CustomerFileRecord, quote?: QuoteRecord | null): QuoteDraft {
  return {
    modeloId: quote?.modeloId ?? "",
    tipoVenta: quote?.tipoVenta ?? "Contado",
    precioReferencial: toInputNumber(quote?.precioReferencial),
    prima: toInputNumber(quote?.prima),
    plazoMeses: toInputNumber(quote?.plazoMeses),
    cuotaEstimada: toInputNumber(quote?.cuotaEstimada),
    moneda: quote?.moneda ?? "USD",
    fechaVencimiento: quote?.fechaVencimiento ?? "",
    observaciones: quote?.observaciones ?? "",
  };
}

function toQuoteInput(draft: QuoteDraft, file: CustomerFileRecord): QuoteInput {
  const selectedModel = motorcycles.find((motorcycle) => motorcycle.slug === draft.modeloId) ?? null;
  return {
    modeloId: selectedModel?.slug ?? null,
    modeloNombre: selectedModel?.name ?? file.motoInteres,
    tipoVenta: draft.tipoVenta,
    precioReferencial: parseOptionalNumber(draft.precioReferencial),
    prima: parseOptionalNumber(draft.prima),
    plazoMeses: parseOptionalNumber(draft.plazoMeses),
    cuotaEstimada: parseOptionalNumber(draft.cuotaEstimada),
    moneda: draft.moneda,
    fechaVencimiento: draft.fechaVencimiento || null,
    observaciones: draft.observaciones,
  };
}

function parseOptionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function toInputNumber(value: number | null | undefined) {
  return value === null || typeof value === "undefined" ? "" : String(value);
}

function quoteTone(quote: QuoteRecord, expired: boolean) {
  if (expired || quote.estado === "Vencida" || quote.estado === "Cancelada") return "gray" as const;
  if (quote.estado === "Aceptada") return "green" as const;
  if (quote.estado === "Emitida") return "yellow" as const;
  return "blue" as const;
}

function formatAmount(value: number | null, currency: QuoteRecord["moneda"]) {
  if (value === null) return "No indicado";
  return new Intl.NumberFormat("es-NI", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "No indicada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
