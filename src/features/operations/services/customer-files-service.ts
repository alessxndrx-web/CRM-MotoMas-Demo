"use client";

import {
  CUSTOMER_FILE_CREATED_STATUS,
  CUSTOMER_FILES_STORAGE_KEY,
  CUSTOMERS_STORAGE_KEY,
  normalizeCustomer,
  normalizeCustomerFile,
  type CustomerFileRecord,
  type CustomerInteraction,
  type CustomerRecord,
} from "@/data/operations/customer-files";
import type { PublicLead } from "@/data/operations/leads";
import type { DemoSession } from "@/features/operations/types";

export function readCustomers() {
  try {
    const raw = window.localStorage.getItem(CUSTOMERS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((customer) => normalizeCustomer(customer))
      .filter((customer): customer is CustomerRecord => Boolean(customer));
  } catch {
    return [];
  }
}

export function writeCustomers(customers: CustomerRecord[]) {
  window.localStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(customers));
}

export function readCustomerFiles() {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_FILES_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((file) => normalizeCustomerFile(file))
      .filter((file): file is CustomerFileRecord => Boolean(file));
  } catch {
    return [];
  }
}

export function writeCustomerFiles(files: CustomerFileRecord[]) {
  window.localStorage.setItem(CUSTOMER_FILES_STORAGE_KEY, JSON.stringify(files));
}

export function createCustomerFileFromLead({
  lead,
  observaciones,
  session,
}: {
  lead: PublicLead;
  observaciones: string;
  session: DemoSession & { role: "Vendedor" };
}) {
  const now = new Date().toISOString();
  const customers = readCustomers();
  const files = readCustomerFiles();
  const existingFile = files.find((file) => file.leadId === lead.id);

  if (existingFile) {
    const existingCustomer = customers.find(
      (customer) => customer.id === existingFile.clienteId,
    );

    if (existingCustomer) {
      return {
        ok: true as const,
        created: false,
        customer: existingCustomer,
        file: existingFile,
        customers,
        files,
      };
    }

    return {
      ok: false as const,
      message: "El lead ya tiene un expediente sin cliente asociado.",
    };
  }

  const leadPhone = normalizePhone(lead.telefono);
  const leadCedula = normalizeCedula(lead.cedula);
  const existingCustomer = customers.find(
    (customer) =>
      (leadPhone && normalizePhone(customer.telefono) === leadPhone) ||
      (leadCedula && normalizeCedula(customer.cedula) === leadCedula),
  );

  const file: CustomerFileRecord = {
    id: generateCustomerFileId(),
    numeroExpediente: generateCustomerFileNumber(),
    clienteId: existingCustomer?.id ?? generateCustomerId(),
    leadId: lead.id,
    motoInteres: lead.motoInteres,
    sucursalId: lead.sucursalDeseada,
    sucursalNombre: lead.sucursalNombre,
    vendedor: session.userName,
    estado: CUSTOMER_FILE_CREATED_STATUS,
    fechaCreacion: now,
    observaciones: observaciones.trim() || null,
  };

  const interaction: CustomerInteraction = {
    id: generateInteractionId(),
    fecha: now,
    tipo: "Expediente creado",
    descripcion: `Expediente ${file.numeroExpediente} creado desde lead ${lead.id}.`,
    leadId: lead.id,
    expedienteId: file.id,
    sucursalId: lead.sucursalDeseada,
    sucursalNombre: lead.sucursalNombre,
    vendedor: session.userName,
  };

  const customer: CustomerRecord = existingCustomer
    ? {
        ...existingCustomer,
        nombre: existingCustomer.nombre || lead.nombre,
        cedula: existingCustomer.cedula ?? lead.cedula ?? null,
        correo: existingCustomer.correo ?? lead.correo,
        historialInteracciones: [
          interaction,
          ...existingCustomer.historialInteracciones,
        ],
        fechaActualizacion: now,
      }
    : {
        id: file.clienteId,
        nombre: lead.nombre,
        telefono: lead.telefono,
        cedula: lead.cedula ?? null,
        correo: lead.correo,
        sucursalOrigenId: lead.sucursalDeseada,
        sucursalOrigenNombre: lead.sucursalNombre,
        origenLeadId: lead.id,
        historialInteracciones: [interaction],
        fechaCreacion: now,
        fechaActualizacion: now,
      };

  const nextCustomers = existingCustomer
    ? customers.map((current) =>
        current.id === existingCustomer.id ? customer : current,
      )
    : [customer, ...customers];
  const nextFiles = [file, ...files];

  writeCustomers(nextCustomers);
  writeCustomerFiles(nextFiles);

  return {
    ok: true as const,
    created: true,
    customer,
    file,
    customers: nextCustomers,
    files: nextFiles,
  };
}

export function findCustomerById(customers: CustomerRecord[], customerId: string) {
  return customers.find((customer) => customer.id === customerId) ?? null;
}

export function getCustomerFilesByCustomerId(
  files: CustomerFileRecord[],
  customerId: string,
) {
  return files.filter((file) => file.clienteId === customerId);
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCedula(value?: string | null) {
  return value?.replace(/[^0-9a-z]/gi, "").toUpperCase() ?? "";
}

function generateCustomerId() {
  return `CUS-${randomSuffix()}`;
}

function generateCustomerFileId() {
  return `FILE-${randomSuffix()}`;
}

function generateInteractionId() {
  return `INT-${randomSuffix()}`;
}

function generateCustomerFileNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `EXP-${date}-${randomSuffix().slice(0, 6)}`;
}

function randomSuffix() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8).toUpperCase();
  }

  return Math.random().toString(36).slice(2, 10).toUpperCase();
}
