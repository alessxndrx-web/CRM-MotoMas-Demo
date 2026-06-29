"use client";

import {
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  Pencil,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCustomerFileDocumentProgress,
  suggestedCustomerFileDocumentTypes,
  type CustomerFileDocumentRecord,
  type CustomerFileDocumentStatus,
} from "@/data/operations/customer-file-documents";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import {
  addAdditionalCustomerFileDocument,
  getDocumentsByCustomerFileId,
  initializeSuggestedCustomerFileDocuments,
  readCustomerFileDocuments,
  updateCustomerFileDocumentStatus,
} from "@/features/operations/services/customer-file-documents-service";
import type { DemoSession } from "@/features/operations/types";

export function CustomerFileDocumentsPanel({
  file,
  session,
}: {
  file: CustomerFileRecord;
  session: DemoSession;
}) {
  const [documents, setDocuments] = useState<CustomerFileDocumentRecord[]>([]);
  const [editingId, setEditingId] = useState("");
  const [editingStatus, setEditingStatus] = useState<CustomerFileDocumentStatus>("Pendiente");
  const [observations, setObservations] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDocuments(getDocumentsByCustomerFileId(readCustomerFileDocuments(), file.id));
    setEditingId("");
    setMessage("");
  }, [file]);

  const progress = useMemo(
    () => getCustomerFileDocumentProgress(documents),
    [documents],
  );
  const hasAllSuggestedDocuments = suggestedCustomerFileDocumentTypes.every((type) =>
    documents.some((document) => document.tipo === type),
  );
  const canManage =
    session.role === "Gerente"
      ? file.sucursalId === session.branchId
      : session.role === "Vendedor" && file.vendedor === session.userName;

  function syncDocuments(nextDocuments: CustomerFileDocumentRecord[]) {
    setDocuments(getDocumentsByCustomerFileId(nextDocuments, file.id));
  }

  function initializeDocuments() {
    const result = initializeSuggestedCustomerFileDocuments(file, session);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    syncDocuments(result.documents);
    setMessage(
      result.created
        ? "Documentos base inicializados."
        : "Los documentos base ya estan disponibles.",
    );
  }

  function addAdditionalDocument() {
    const result = addAdditionalCustomerFileDocument(file, session);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    syncDocuments(result.documents);
    openEditor(result.document, "Pendiente");
    setMessage("Documento adicional agregado. Puedes registrar una observacion.");
  }

  function updateStatus(document: CustomerFileDocumentRecord, status: CustomerFileDocumentStatus) {
    if (status === "Rechazado") {
      openEditor(document, status);
      return;
    }

    const result = updateCustomerFileDocumentStatus(
      document.id,
      file,
      status,
      document.observaciones ?? "",
      session,
    );
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    syncDocuments(result.documents);
    setMessage(`Documento marcado como ${status.toLowerCase()}.`);
  }

  function openEditor(document: CustomerFileDocumentRecord, status = document.estado) {
    setEditingId(document.id);
    setEditingStatus(status);
    setObservations(document.observaciones ?? "");
    setMessage("");
  }

  function saveObservation(document: CustomerFileDocumentRecord) {
    const result = updateCustomerFileDocumentStatus(
      document.id,
      file,
      editingStatus,
      observations,
      session,
    );
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    syncDocuments(result.documents);
    setEditingId("");
    setMessage(
      editingStatus === "Rechazado"
        ? "Documento marcado como rechazado."
        : "Observacion actualizada.",
    );
  }

  return (
    <section className="mt-6 border-t border-white/10 pt-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <ClipboardCheck className="mt-1 h-5 w-5 text-red-400" />
          <div>
            <h4 className="text-lg font-black text-white">Documentos del expediente</h4>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Checklist documental para organizar el proceso comercial. No incluye archivos adjuntos ni aprobación de crédito.
            </p>
          </div>
        </div>
        <Badge tone={progress.listo ? "green" : "yellow"}>
          {progress.listo ? "Listo documentalmente" : "Validacion documental"}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Revisados" value={`${progress.revisados} de ${progress.baseTotal}`} />
        <Metric label="Pendientes" value={progress.pendientes} />
        <Metric label="Recibidos" value={progress.recibidos} />
        <Metric label="Rechazados" value={progress.rechazados} />
      </div>

      {message ? (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3 text-sm font-semibold text-emerald-100">
          {message}
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {!hasAllSuggestedDocuments ? (
            <Button onClick={initializeDocuments} size="sm" variant="secondary">
              <ClipboardCheck className="h-4 w-4" />
              {documents.length ? "Completar documentos base" : "Inicializar documentos base"}
            </Button>
          ) : null}
          <Button onClick={addAdditionalDocument} size="sm" variant="secondary">
            <FilePlus2 className="h-4 w-4" />
            Agregar documento adicional
          </Button>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {documents.length ? documents.map((document) => (
          <DocumentItem
            canManage={canManage}
            document={document}
            editing={editingId === document.id}
            editingStatus={editingStatus}
            observations={observations}
            key={document.id}
            onCancel={() => setEditingId("")}
            onEdit={() => openEditor(document)}
            onObservationChange={setObservations}
            onSave={() => saveObservation(document)}
            onStatusChange={(status) => updateStatus(document, status)}
            onStatusSelect={setEditingStatus}
          />
        )) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5 text-sm leading-6 text-zinc-500">
            Aún no hay documentos inicializados para este expediente. Usá el checklist base para comenzar la validación documental.
          </div>
        )}
      </div>
    </section>
  );
}

function DocumentItem({
  canManage,
  document,
  editing,
  editingStatus,
  observations,
  onCancel,
  onEdit,
  onObservationChange,
  onSave,
  onStatusChange,
  onStatusSelect,
}: {
  canManage: boolean;
  document: CustomerFileDocumentRecord;
  editing: boolean;
  editingStatus: CustomerFileDocumentStatus;
  observations: string;
  onCancel: () => void;
  onEdit: () => void;
  onObservationChange: (value: string) => void;
  onSave: () => void;
  onStatusChange: (status: CustomerFileDocumentStatus) => void;
  onStatusSelect: (status: CustomerFileDocumentStatus) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-black text-white">{document.tipo}</div>
            <Badge tone={documentTone(document.estado)}>{document.estado}</Badge>
          </div>
          <div className="mt-2 text-sm text-zinc-500">
            Ultima actualizacion: {formatDate(document.fechaActualizacion)}
          </div>
          {document.observaciones ? (
            <p className="mt-2 text-sm leading-6 text-zinc-300">{document.observaciones}</p>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {document.estado !== "Recibido" ? (
              <IconButton label="Marcar recibido" onClick={() => onStatusChange("Recibido")}>
                <FilePlus2 className="h-4 w-4" />
              </IconButton>
            ) : null}
            {document.estado !== "Revisado" ? (
              <IconButton label="Marcar revisado" onClick={() => onStatusChange("Revisado")}>
                <CheckCircle2 className="h-4 w-4" />
              </IconButton>
            ) : null}
            {document.estado !== "Rechazado" ? (
              <IconButton label="Marcar rechazado" onClick={() => onStatusChange("Rechazado")} variant="danger">
                <XCircle className="h-4 w-4" />
              </IconButton>
            ) : null}
            {document.estado !== "Pendiente" ? (
              <IconButton label="Volver a pendiente" onClick={() => onStatusChange("Pendiente")}>
                <RotateCcw className="h-4 w-4" />
              </IconButton>
            ) : null}
            <IconButton label="Editar observacion" onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </IconButton>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-4">
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Observacion {editingStatus === "Rechazado" ? "requerida" : "opcional"}
            </span>
            <textarea
              className="min-h-[76px] w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 py-3 text-sm text-zinc-100 outline-none focus:border-red-500/70"
              maxLength={300}
              onChange={(event) => onObservationChange(event.target.value)}
              value={observations}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={onSave} size="sm" variant="secondary">Guardar</Button>
            <Button onClick={onCancel} size="sm" variant="ghost">Cancelar</Button>
            <select
              className="h-9 rounded-lg border border-white/10 bg-[#141414] px-3 text-xs font-semibold text-zinc-100"
              onChange={(event) => onStatusSelect(event.target.value as CustomerFileDocumentStatus)}
              value={editingStatus}
            >
              <option>Pendiente</option>
              <option>Recibido</option>
              <option>Revisado</option>
              <option>Rechazado</option>
            </select>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  variant = "secondary",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "secondary" | "danger";
}) {
  return (
    <Button aria-label={label} onClick={onClick} size="icon" title={label} variant={variant}>
      {children}
    </Button>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function documentTone(status: CustomerFileDocumentStatus) {
  if (status === "Revisado") return "green" as const;
  if (status === "Recibido") return "blue" as const;
  if (status === "Rechazado") return "red" as const;
  return "yellow" as const;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
