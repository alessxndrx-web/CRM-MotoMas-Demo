"use client";

import { AlertTriangle, CheckCircle2, CreditCard, Pencil, Save, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  creditApplicationStatuses,
  creditCurrencies,
  creditFinancingTypes,
  type CreditApplicationRecord,
} from "@/data/operations/credit-applications";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import {
  createCreditApplication,
  getCreditApplicationByCustomerFileId,
  getCreditDocumentWarning,
  readCreditApplications,
  type CreditApplicationInput,
  updateCreditApplication,
} from "@/features/operations/services/credit-application-service";
import type { DemoSession } from "@/features/operations/types";

type CreditDraft = {
  financiera: string;
  tipoFinanciamiento: CreditApplicationInput["tipoFinanciamiento"];
  estado: CreditApplicationInput["estado"];
  montoSolicitado: string;
  prima: string;
  plazoMeses: string;
  cuotaEstimada: string;
  moneda: CreditApplicationInput["moneda"];
  documentosPendientes: string;
  observaciones: string;
};

export function CustomerFileCreditPanel({
  file,
  session,
}: {
  file: CustomerFileRecord;
  session: DemoSession;
}) {
  const [credit, setCredit] = useState<CreditApplicationRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CreditDraft>(() => createDraft(null));
  const [message, setMessage] = useState("");
  const [hasDocumentWarning, setHasDocumentWarning] = useState(false);

  useEffect(() => {
    const nextCredit = getCreditApplicationByCustomerFileId(readCreditApplications(), file.id);
    setCredit(nextCredit);
    setDraft(createDraft(nextCredit));
    setEditing(false);
    setMessage("");
    setHasDocumentWarning(getCreditDocumentWarning(file.id));
  }, [file.id]);

  const canEdit =
    session.role === "Vendedor"
      ? file.vendedor === session.userName
      : session.role === "Gerente" && file.sucursalId === session.branchId;

  function save() {
    const input = toCreditInput(draft);
    const result = credit
      ? updateCreditApplication(credit.id, file, input, session)
      : createCreditApplication(file, input, session);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setCredit(result.credit);
    setDraft(createDraft(result.credit));
    setEditing(false);
    setMessage(credit ? "Seguimiento de crédito actualizado." : "Seguimiento de crédito creado.");
  }

  function changeStatus(estado: CreditApplicationInput["estado"]) {
    if (!credit) return;
    const result = updateCreditApplication(
      credit.id,
      file,
      toCreditInput({ ...draft, estado }),
      session,
    );
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setCredit(result.credit);
    setDraft(createDraft(result.credit));
    setMessage(`Estado actualizado a ${estado}.`);
  }

  return (
    <section className="mt-6 border-t border-slate-200 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-red-600" />
            <h4 className="text-lg font-black text-slate-900">Seguimiento de crédito</h4>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Registro manual por expediente. No reserva unidades ni aprueba una venta.
          </p>
        </div>
        {credit ? <Badge tone={creditTone(credit.estado)}>{credit.estado}</Badge> : null}
      </div>

      {hasDocumentWarning ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-400/10 p-4 text-sm leading-6 text-amber-700">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Este expediente tiene documentos pendientes o rechazados.</p>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-slate-600">{message}</p> : null}

      {!credit && !editing ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5">
          <p className="text-sm leading-6 text-slate-500">Aún no hay seguimiento de crédito para este expediente. Crealo cuando inicie la gestión con la financiera.</p>
          {canEdit ? (
            <Button className="mt-4" onClick={() => setEditing(true)} size="sm">
              <CreditCard className="h-4 w-4" />
              Crear seguimiento de crédito
            </Button>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <CreditForm
          draft={draft}
          hasCredit={Boolean(credit)}
          onCancel={() => {
            setEditing(false);
            setDraft(createDraft(credit));
          }}
          onChange={setDraft}
          onSave={save}
        />
      ) : null}

      {credit && !editing ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Financiera" value={credit.financiera ?? "No indicada"} />
            <Detail label="Tipo" value={credit.tipoFinanciamiento} />
            <Detail label="Monto solicitado" value={formatAmount(credit.montoSolicitado, credit.moneda)} />
            <Detail label="Prima" value={formatAmount(credit.prima, credit.moneda)} />
            <Detail label="Plazo" value={credit.plazoMeses === null ? "No indicado" : `${credit.plazoMeses} meses`} />
            <Detail label="Cuota estimada" value={formatAmount(credit.cuotaEstimada, credit.moneda)} />
            <Detail label="Fecha de solicitud" value={formatDate(credit.fechaSolicitud)} />
            <Detail label="Fecha de resolucion" value={formatDate(credit.fechaResolucion)} />
          </div>
          <DetailBlock label="Documentos pendientes" value={credit.documentosPendientes ?? "Sin documentos pendientes registrados."} />
          <DetailBlock label="Observaciones" value={credit.observaciones ?? "Sin observaciones registradas."} />

          {canEdit ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={() => setEditing(true)} size="sm" variant="secondary">
                <Pencil className="h-4 w-4" />
                Editar seguimiento
              </Button>
              {credit.estado !== "En revision" ? (
                <Button onClick={() => changeStatus("En revision")} size="sm" variant="secondary">En revision</Button>
              ) : null}
              {credit.estado !== "Documentacion pendiente" ? (
                <Button onClick={() => changeStatus("Documentacion pendiente")} size="sm" variant="secondary">Documentación pendiente</Button>
              ) : null}
              {credit.estado !== "Preaprobado" ? (
                <Button onClick={() => changeStatus("Preaprobado")} size="sm" variant="secondary">Preaprobado</Button>
              ) : null}
              {credit.estado !== "Aprobado" ? (
                <Button onClick={() => changeStatus("Aprobado")} size="sm" variant="success">
                  <CheckCircle2 className="h-4 w-4" />
                  Marcar aprobado
                </Button>
              ) : null}
              {credit.estado !== "Rechazado" ? (
                <Button onClick={() => changeStatus("Rechazado")} size="sm" variant="danger">
                  <XCircle className="h-4 w-4" />
                  Marcar rechazado
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CreditForm({
  draft,
  hasCredit,
  onCancel,
  onChange,
  onSave,
}: {
  draft: CreditDraft;
  hasCredit: boolean;
  onCancel: () => void;
  onChange: (draft: CreditDraft) => void;
  onSave: () => void;
}) {
  return (
    <form className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Financiera">
          <Input maxLength={120} onChange={(event) => onChange({ ...draft, financiera: event.target.value })} value={draft.financiera} />
        </Field>
        <Field label="Tipo de financiamiento">
          <Select onChange={(event) => onChange({ ...draft, tipoFinanciamiento: event.target.value as CreditDraft["tipoFinanciamiento"] })} value={draft.tipoFinanciamiento}>
            {creditFinancingTypes.map((type) => <option key={type}>{type}</option>)}
          </Select>
        </Field>
        <Field label="Estado">
          <Select onChange={(event) => onChange({ ...draft, estado: event.target.value as CreditDraft["estado"] })} value={draft.estado}>
            {creditApplicationStatuses.map((status) => <option key={status}>{status}</option>)}
          </Select>
        </Field>
        <Field label="Moneda">
          <Select onChange={(event) => onChange({ ...draft, moneda: event.target.value as CreditDraft["moneda"] })} value={draft.moneda}>
            {creditCurrencies.map((currency) => <option key={currency}>{currency}</option>)}
          </Select>
        </Field>
        <Field label="Monto solicitado"><Input min="0" onChange={(event) => onChange({ ...draft, montoSolicitado: event.target.value })} step="0.01" type="number" value={draft.montoSolicitado} /></Field>
        <Field label="Prima"><Input min="0" onChange={(event) => onChange({ ...draft, prima: event.target.value })} step="0.01" type="number" value={draft.prima} /></Field>
        <Field label="Plazo en meses"><Input min="1" onChange={(event) => onChange({ ...draft, plazoMeses: event.target.value })} step="1" type="number" value={draft.plazoMeses} /></Field>
        <Field label="Cuota estimada"><Input min="0" onChange={(event) => onChange({ ...draft, cuotaEstimada: event.target.value })} step="0.01" type="number" value={draft.cuotaEstimada} /></Field>
      </div>
      <Field label="Documentos pendientes">
        <textarea className="min-h-[76px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500" maxLength={300} onChange={(event) => onChange({ ...draft, documentosPendientes: event.target.value })} value={draft.documentosPendientes} />
      </Field>
      <Field label="Observaciones">
        <textarea className="min-h-[88px] w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500" maxLength={500} onChange={(event) => onChange({ ...draft, observaciones: event.target.value })} value={draft.observaciones} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="secondary"><Save className="h-4 w-4" />{hasCredit ? "Guardar cambios" : "Crear seguimiento"}</Button>
        <Button onClick={onCancel} type="button" variant="ghost">Cancelar</Button>
      </div>
    </form>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>{children}</label>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500" {...props}>{children}</select>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-sm font-black text-slate-900">{value}</div></div>;
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return <div className="mt-4"><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</div><p className="mt-2 text-sm leading-6 text-slate-600">{value}</p></div>;
}

function createDraft(credit: CreditApplicationRecord | null): CreditDraft {
  return {
    financiera: credit?.financiera ?? "",
    tipoFinanciamiento: credit?.tipoFinanciamiento ?? "Financiera externa",
    estado: credit?.estado ?? "No iniciado",
    montoSolicitado: toInputNumber(credit?.montoSolicitado),
    prima: toInputNumber(credit?.prima),
    plazoMeses: toInputNumber(credit?.plazoMeses),
    cuotaEstimada: toInputNumber(credit?.cuotaEstimada),
    moneda: credit?.moneda ?? "USD",
    documentosPendientes: credit?.documentosPendientes ?? "",
    observaciones: credit?.observaciones ?? "",
  };
}

function toCreditInput(draft: CreditDraft): CreditApplicationInput {
  return {
    financiera: draft.financiera,
    tipoFinanciamiento: draft.tipoFinanciamiento,
    estado: draft.estado,
    montoSolicitado: parseOptionalNumber(draft.montoSolicitado),
    prima: parseOptionalNumber(draft.prima),
    plazoMeses: parseOptionalNumber(draft.plazoMeses),
    cuotaEstimada: parseOptionalNumber(draft.cuotaEstimada),
    moneda: draft.moneda,
    documentosPendientes: draft.documentosPendientes,
    observaciones: draft.observaciones,
  };
}

function parseOptionalNumber(value: string) { return value.trim() ? Number(value) : null; }
function toInputNumber(value: number | null | undefined) { return value === null || typeof value === "undefined" ? "" : String(value); }
function formatAmount(value: number | null, currency: CreditApplicationRecord["moneda"]) { return value === null ? "No indicado" : new Intl.NumberFormat("es-NI", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
function formatDate(value: string | null) { if (!value) return "No indicada"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function creditTone(status: CreditApplicationRecord["estado"]) { if (status === "Aprobado") return "green" as const; if (status === "Rechazado" || status === "Cancelado") return "gray" as const; if (status === "Documentacion pendiente") return "yellow" as const; return "blue" as const; }
