"use client";

import {
  CREDIT_APPLICATIONS_STORAGE_KEY,
  isCreditApplicationStatus,
  isCreditCurrency,
  isCreditFinancingType,
  normalizeCreditApplication,
  type CreditApplicationRecord,
  type CreditApplicationStatus,
  type CreditCurrency,
  type CreditFinancingType,
} from "@/data/operations/credit-applications";
import type { CustomerFileRecord } from "@/data/operations/customer-files";
import { demoInternalUsers } from "@/data/operations/users";
import { createActivity, completeActivity } from "@/features/operations/services/activity-service";
import { readCustomerFileDocuments } from "@/features/operations/services/customer-file-documents-service";
import { readQuotes } from "@/features/operations/services/quote-service";
import type { DemoSession } from "@/features/operations/types";

export type CreditApplicationInput = {
  financiera: string;
  tipoFinanciamiento: CreditFinancingType;
  estado: CreditApplicationStatus;
  montoSolicitado: number | null;
  prima: number | null;
  plazoMeses: number | null;
  cuotaEstimada: number | null;
  moneda: CreditCurrency;
  documentosPendientes: string;
  observaciones: string;
};

export function readCreditApplications() {
  try {
    const raw = window.localStorage.getItem(CREDIT_APPLICATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((credit) => normalizeCreditApplication(credit))
      .filter((credit): credit is CreditApplicationRecord => Boolean(credit))
      .sort((left, right) => right.fechaActualizacion.localeCompare(left.fechaActualizacion));
  } catch {
    return [];
  }
}

export function writeCreditApplications(credits: CreditApplicationRecord[]) {
  window.localStorage.setItem(CREDIT_APPLICATIONS_STORAGE_KEY, JSON.stringify(credits));
}

export function getCreditApplicationByCustomerFileId(
  credits: CreditApplicationRecord[],
  expedienteId: string,
) {
  return credits.find((credit) => credit.expedienteId === expedienteId) ?? null;
}

export function createCreditApplication(
  file: CustomerFileRecord,
  input: CreditApplicationInput,
  session: DemoSession,
) {
  if (!canManageCredit(file, session)) {
    return creditError("Tu rol no puede crear seguimiento de credito para este expediente.");
  }
  const validated = validateInput(input);
  if (!validated.ok) return validated;

  const credits = readCreditApplications();
  const existing = getCreditApplicationByCustomerFileId(credits, file.id);
  if (existing) {
    return creditError("Este expediente ya tiene un seguimiento de credito. Editalo para continuar.");
  }

  const now = new Date().toISOString();
  const responsibleSeller = demoInternalUsers.find(
    (user) => user.role === "Vendedor" && user.userName === file.vendedor,
  );
  const credit: CreditApplicationRecord = {
    id: createId("CRED"),
    expedienteId: file.id,
    customerId: file.clienteId,
    leadId: file.leadId,
    proformaId: readQuotes().find((quote) => quote.expedienteId === file.id)?.id ?? null,
    sucursalId: file.sucursalId,
    sucursalNombre: file.sucursalNombre,
    vendedorId: responsibleSeller?.userId ?? session.userId,
    vendedorNombre: responsibleSeller?.userName ?? file.vendedor,
    ...validated.input,
    fechaSolicitud: validated.input.estado === "No iniciado" ? null : now,
    fechaResolucion: isTerminalStatus(validated.input.estado) ? now : null,
    fechaCreacion: now,
    fechaActualizacion: now,
  };
  const nextCredits = [credit, ...credits];
  writeCreditApplications(nextCredits);
  registerCreditActivity(credit, "creado", session);

  return { ok: true as const, credit, credits: nextCredits };
}

export function updateCreditApplication(
  creditId: string,
  file: CustomerFileRecord,
  input: CreditApplicationInput,
  session: DemoSession,
) {
  const credits = readCreditApplications();
  const current = credits.find((credit) => credit.id === creditId);
  if (!current || current.expedienteId !== file.id) {
    return creditError("Seguimiento de credito no encontrado para este expediente.");
  }
  if (!canManageCredit(file, session)) {
    return creditError("Tu rol no puede actualizar este seguimiento de credito.");
  }
  const validated = validateInput(input);
  if (!validated.ok) return validated;

  const now = new Date().toISOString();
  const changedStatus = current.estado !== validated.input.estado;
  const nextCredit: CreditApplicationRecord = {
    ...current,
    ...validated.input,
    fechaSolicitud:
      current.fechaSolicitud ?? (validated.input.estado === "No iniciado" ? null : now),
    fechaResolucion: isTerminalStatus(validated.input.estado)
      ? current.fechaResolucion ?? now
      : null,
    fechaActualizacion: now,
  };
  const nextCredits = credits.map((credit) => credit.id === creditId ? nextCredit : credit);
  writeCreditApplications(nextCredits);
  if (changedStatus) registerCreditActivity(nextCredit, `actualizado a ${nextCredit.estado.toLowerCase()}`, session);

  return { ok: true as const, credit: nextCredit, credits: nextCredits };
}

export function getCreditDocumentWarning(expedienteId: string) {
  const documents = readCustomerFileDocuments().filter((document) => document.expedienteId === expedienteId);
  return documents.some(
    (document) => document.estado === "Pendiente" || document.estado === "Rechazado",
  );
}

function validateInput(input: CreditApplicationInput) {
  const financiera = normalizeText(input.financiera);
  const documentosPendientes = normalizeText(input.documentosPendientes);
  const observaciones = normalizeText(input.observaciones);
  if (!isCreditFinancingType(input.tipoFinanciamiento) || !isCreditApplicationStatus(input.estado) || !isCreditCurrency(input.moneda)) {
    return creditError("Selecciona tipo de financiamiento, estado y moneda validos.");
  }
  if (financiera.length > 120) return creditError("La financiera permite hasta 120 caracteres.");
  if (documentosPendientes.length > 300) return creditError("Los documentos pendientes permiten hasta 300 caracteres.");
  if (observaciones.length > 500) return creditError("Las observaciones permiten hasta 500 caracteres.");
  if (!areAmountsValid([input.montoSolicitado, input.prima, input.cuotaEstimada])) {
    return creditError("Los montos deben ser numeros positivos o cero.");
  }
  if (input.plazoMeses !== null && (!Number.isInteger(input.plazoMeses) || input.plazoMeses <= 0)) {
    return creditError("El plazo debe ser un numero entero mayor que cero.");
  }

  return {
    ok: true as const,
    input: {
      ...input,
      financiera: financiera || null,
      documentosPendientes: documentosPendientes || null,
      observaciones: observaciones || null,
    },
  };
}

function canManageCredit(file: CustomerFileRecord, session: DemoSession) {
  if (session.role === "Administrador") return false;
  if (session.role === "Gerente") return file.sucursalId === session.branchId;
  return file.vendedor === session.userName;
}

function registerCreditActivity(
  credit: CreditApplicationRecord,
  action: string,
  session: DemoSession,
) {
  const created = createActivity(
    {
      tipo: "Seguimiento",
      prioridad: credit.estado === "Rechazado" || credit.estado === "Documentacion pendiente" ? "Alta" : "Media",
      titulo: `Credito ${action}`,
      descripcion: `Seguimiento manual de credito: ${credit.estado}.`,
      fechaProgramada: null,
      leadId: credit.leadId,
      customerId: credit.customerId,
      expedienteId: credit.expedienteId,
      sucursalId: credit.sucursalId,
      sucursalNombre: credit.sucursalNombre,
    },
    session,
  );
  if (created.ok) completeActivity(created.activity.id, "Seguimiento de credito actualizado.", session);
}

function isTerminalStatus(status: CreditApplicationStatus) {
  return status === "Aprobado" || status === "Rechazado" || status === "Cancelado";
}

function areAmountsValid(values: Array<number | null>) {
  return values.every((value) => value === null || (Number.isFinite(value) && value >= 0));
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function creditError(message: string) {
  return { ok: false as const, message };
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}
