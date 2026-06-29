"use client";

import {
  CUSTOMER_FILE_DOCUMENTS_STORAGE_KEY,
  getCustomerFileDocumentProgress,
  isCustomerFileDocumentStatus,
  normalizeCustomerFileDocument,
  suggestedCustomerFileDocumentTypes,
  type CustomerFileDocumentRecord,
  type CustomerFileDocumentStatus,
} from "@/data/operations/customer-file-documents";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import { demoInternalUsers } from "@/data/operations/users";
import { completeActivity, createActivity } from "@/features/operations/services/activity-service";
import type { DemoSession } from "@/features/operations/types";

export function readCustomerFileDocuments() {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_FILE_DOCUMENTS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((document) => normalizeCustomerFileDocument(document))
      .filter((document): document is CustomerFileDocumentRecord => Boolean(document))
      .sort((left, right) => right.fechaActualizacion.localeCompare(left.fechaActualizacion));
  } catch {
    return [];
  }
}

export function writeCustomerFileDocuments(documents: CustomerFileDocumentRecord[]) {
  window.localStorage.setItem(CUSTOMER_FILE_DOCUMENTS_STORAGE_KEY, JSON.stringify(documents));
}

export function getDocumentsByCustomerFileId(
  documents: CustomerFileDocumentRecord[],
  expedienteId: string,
) {
  return documents.filter((document) => document.expedienteId === expedienteId);
}

export function initializeSuggestedCustomerFileDocuments(
  file: CustomerFileRecord,
  session: DemoSession,
) {
  if (!canManageDocuments(file, session)) {
    return documentError("Tu rol no puede inicializar documentos para este expediente.");
  }

  const documents = readCustomerFileDocuments();
  const fileDocuments = getDocumentsByCustomerFileId(documents, file.id);
  const existingTypes = new Set(fileDocuments.map((document) => document.tipo));
  const now = new Date().toISOString();
  const missingDocuments = suggestedCustomerFileDocumentTypes
    .filter((type) => !existingTypes.has(type))
    .map((tipo) => createDocument(file, tipo, session, now));
  const nextDocuments = [...missingDocuments, ...documents];

  if (missingDocuments.length) writeCustomerFileDocuments(nextDocuments);
  return { ok: true as const, documents: nextDocuments, created: missingDocuments.length };
}

export function addAdditionalCustomerFileDocument(
  file: CustomerFileRecord,
  session: DemoSession,
) {
  if (!canManageDocuments(file, session)) {
    return documentError("Tu rol no puede agregar documentos a este expediente.");
  }

  const documents = readCustomerFileDocuments();
  const now = new Date().toISOString();
  const document = createDocument(file, "Documento adicional", session, now);
  const nextDocuments = [document, ...documents];

  writeCustomerFileDocuments(nextDocuments);
  return { ok: true as const, document, documents: nextDocuments };
}

export function updateCustomerFileDocumentStatus(
  documentId: string,
  file: CustomerFileRecord,
  status: CustomerFileDocumentStatus,
  observaciones: string,
  session: DemoSession,
) {
  if (!isCustomerFileDocumentStatus(status)) {
    return documentError("Selecciona un estado documental valido.");
  }

  const documents = readCustomerFileDocuments();
  const document = documents.find((item) => item.id === documentId);
  const notes = normalizeText(observaciones);
  if (!document || document.expedienteId !== file.id) {
    return documentError("Documento no encontrado para este expediente.");
  }
  if (!canManageDocuments(file, session)) {
    return documentError("Tu rol no puede actualizar documentos de este expediente.");
  }
  if (notes.length > 300) {
    return documentError("Las observaciones permiten hasta 300 caracteres.");
  }
  if (status === "Rechazado" && !notes) {
    return documentError("Agrega una observacion para rechazar el documento.");
  }

  const changedStatus = document.estado !== status;
  const nextDocument: CustomerFileDocumentRecord = {
    ...document,
    estado: status,
    observaciones: notes || null,
    fechaActualizacion: new Date().toISOString(),
  };
  const nextDocuments = documents.map((item) =>
    item.id === documentId ? nextDocument : item,
  );

  writeCustomerFileDocuments(nextDocuments);
  if (changedStatus && (status === "Recibido" || status === "Revisado" || status === "Rechazado")) {
    registerDocumentActivity(nextDocument, session);
  }

  return { ok: true as const, document: nextDocument, documents: nextDocuments };
}

export function updateCustomerFileDocumentObservation(
  documentId: string,
  file: CustomerFileRecord,
  observaciones: string,
  session: DemoSession,
) {
  const document = readCustomerFileDocuments().find((item) => item.id === documentId);
  if (!document || document.expedienteId !== file.id) {
    return documentError("Documento no encontrado para este expediente.");
  }

  return updateCustomerFileDocumentStatus(
    documentId,
    file,
    document.estado,
    observaciones,
    session,
  );
}

export function getScopedDocumentProgress(
  files: CustomerFileRecord[],
  documents: CustomerFileDocumentRecord[],
) {
  const fileIds = new Set(files.map((file) => file.id));
  const scopedDocuments = documents.filter((document) => fileIds.has(document.expedienteId));
  const summaries = files.map((file) =>
    getCustomerFileDocumentProgress(
      scopedDocuments.filter((document) => document.expedienteId === file.id),
    ),
  );

  return {
    documents: scopedDocuments,
    filesWithPendingDocuments: summaries.filter((summary) => !summary.listo).length,
    readyFiles: summaries.filter((summary) => summary.listo).length,
  };
}

function createDocument(
  file: CustomerFileRecord,
  tipo: CustomerFileDocumentRecord["tipo"],
  session: DemoSession,
  now: string,
): CustomerFileDocumentRecord {
  const responsibleSeller = demoInternalUsers.find(
    (user) => user.role === "Vendedor" && user.userName === file.vendedor,
  );

  return {
    id: createId("DOC"),
    expedienteId: file.id,
    customerId: file.clienteId,
    leadId: file.leadId,
    tipo,
    estado: "Pendiente",
    observaciones: null,
    fechaRegistro: now,
    fechaActualizacion: now,
    registradoPor: session.userName,
    vendedorId: responsibleSeller?.userId ?? session.userId,
    vendedorNombre: responsibleSeller?.userName ?? session.userName,
    sucursalId: file.sucursalId,
    sucursalNombre: file.sucursalNombre,
  };
}

function canManageDocuments(file: CustomerFileRecord, session: DemoSession) {
  if (session.role === "Administrador") return false;
  if (session.role === "Gerente") return file.sucursalId === session.branchId;
  return file.vendedor === session.userName;
}

function registerDocumentActivity(document: CustomerFileDocumentRecord, session: DemoSession) {
  const label = document.estado.toLowerCase();
  const created = createActivity(
    {
      tipo: "Nota",
      prioridad: document.estado === "Rechazado" ? "Alta" : "Media",
      titulo: `Documento ${label}`,
      descripcion: `${document.tipo} marcado como ${label}.`,
      fechaProgramada: null,
      leadId: document.leadId,
      customerId: document.customerId,
      expedienteId: document.expedienteId,
      sucursalId: document.sucursalId,
      sucursalNombre: document.sucursalNombre,
    },
    session,
  );

  if (created.ok) completeActivity(created.activity.id, "", session);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function documentError(message: string) {
  return { ok: false as const, message };
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}
