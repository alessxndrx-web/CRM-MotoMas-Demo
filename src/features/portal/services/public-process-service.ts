"use client";

import {
  CUSTOMER_FILES_STORAGE_KEY,
  CUSTOMERS_STORAGE_KEY,
  normalizeCustomer,
  normalizeCustomerFile,
  type CustomerFileRecord,
  type CustomerRecord,
} from "@/data/operations/customer-files";
import {
  CREDIT_APPLICATIONS_STORAGE_KEY,
  normalizeCreditApplication,
  type CreditApplicationRecord,
  type CreditApplicationStatus,
} from "@/data/operations/credit-applications";
import {
  CUSTOMER_FILE_DOCUMENTS_STORAGE_KEY,
  normalizeCustomerFileDocument,
  type CustomerFileDocumentRecord,
} from "@/data/operations/customer-file-documents";
import {
  INVENTORY_UNITS_STORAGE_KEY,
  normalizeInventoryUnit,
  type InventoryUnit,
} from "@/data/operations/inventory";
import { type LeadStatus, type PublicLead } from "@/data/operations/leads";
import {
  normalizeReservation,
  RESERVATION_ACTIVE_STATUS,
  RESERVATION_CANCELLED_STATUS,
  RESERVATION_COMPLETED_STATUS,
  RESERVATIONS_STORAGE_KEY,
  type ReservationRecord,
} from "@/data/operations/reservations";
import {
  normalizeSale,
  SALE_DELIVERED_STATUS,
  SALES_STORAGE_KEY,
  type SaleRecord,
} from "@/data/operations/sales";
import { readPublicLeads } from "@/features/portal/services/lead-service";

export type PublicProcessSearch = {
  code?: string | null;
  fileNumber?: string | null;
  phone?: string | null;
  cedula?: string | null;
};

export type PublicProcessSummary = {
  lead: PublicLead | null;
  customer: CustomerRecord | null;
  file: CustomerFileRecord | null;
  reservation: ReservationRecord | null;
  sale: SaleRecord | null;
  unit: InventoryUnit | null;
  credit: CreditApplicationRecord | null;
  documents: CustomerFileDocumentRecord[];
};

export const publicProgressSteps = [
  "Solicitud recibida",
  "En revision por sucursal",
  "Asesor asignado",
  "Contacto realizado",
  "Interesado",
  "Expediente creado",
  "Reserva",
  "Venta",
  "Entrega",
] as const;

const statusLabels: Record<LeadStatus, string> = {
  "Nuevo Lead": "Solicitud recibida",
  Asignado: "Asesor asignado",
  Contactado: "Contacto realizado",
  Interesado: "Interesado",
  Expediente: "Expediente creado",
  Descartado: "Solicitud cerrada",
};

const leadStepIndex: Record<LeadStatus, number> = {
  "Nuevo Lead": 0,
  Asignado: 2,
  Contactado: 3,
  Interesado: 4,
  Expediente: 5,
  Descartado: 0,
};

export function findPublicProcess(
  search: PublicProcessSearch,
): PublicProcessSummary | null {
  const code = normalizeText(search.code);
  const fileNumber = normalizeText(search.fileNumber);
  const phone = normalizePhone(search.phone ?? "");
  const cedula = normalizeCedula(search.cedula);

  if (!code && !fileNumber && !phone && !cedula) return null;

  const leads = readPublicLeads();
  const customers = readCustomers();
  const files = readCustomerFiles();
  const reservations = readReservations();
  const sales = readSales();
  const units = readInventoryUnits();
  const credits = readCreditApplications();
  const documents = readCustomerFileDocuments();

  const leadByCode = code
    ? leads.find((lead) => normalizeText(lead.id) === code)
    : null;
  const fileByNumber = fileNumber
    ? files.find((file) => normalizeText(file.numeroExpediente) === fileNumber)
    : null;
  const leadByFileNumber =
    fileNumber && !fileByNumber
      ? leads.find(
          (lead) => normalizeText(lead.numeroExpediente) === fileNumber,
        )
      : null;
  const leadByPhone = phone
    ? leads.find((lead) => normalizePhone(lead.telefono) === phone)
    : null;
  const leadByCedula = cedula
    ? leads.find((lead) => normalizeCedula(lead.cedula) === cedula)
    : null;
  const customerByPhone = phone
    ? customers.find((customer) => normalizePhone(customer.telefono) === phone)
    : null;
  const customerByCedula = cedula
    ? customers.find((customer) => normalizeCedula(customer.cedula) === cedula)
    : null;

  const lead =
    leadByCode ??
    leadByFileNumber ??
    (fileByNumber
      ? leads.find((item) => item.id === fileByNumber.leadId) ?? null
      : null) ??
    leadByPhone ??
    leadByCedula ??
    (customerByPhone
      ? leads.find((item) => item.id === customerByPhone.origenLeadId) ?? null
      : null) ??
    (customerByCedula
      ? leads.find((item) => item.id === customerByCedula.origenLeadId) ?? null
      : null);

  const customer =
    (lead?.clienteId
      ? customers.find((item) => item.id === lead.clienteId) ?? null
      : null) ??
    (fileByNumber
      ? customers.find((item) => item.id === fileByNumber.clienteId) ?? null
      : null) ??
    customerByPhone ??
    customerByCedula ??
    null;

  const file =
    fileByNumber ??
    (lead?.expedienteId
      ? files.find((item) => item.id === lead.expedienteId) ?? null
      : null) ??
    (customer
      ? latestByDate(
          files.filter((item) => item.clienteId === customer.id),
          (item) => item.fechaCreacion,
        )
      : null) ??
    null;

  const reservationCandidates = reservations.filter((reservation) => {
    return (
      (file ? reservation.expedienteId === file.id : false) ||
      (customer ? reservation.clienteId === customer.id : false)
    );
  });
  const reservation =
    reservationCandidates.find(
      (item) => item.estado === RESERVATION_ACTIVE_STATUS,
    ) ??
    latestByDate(reservationCandidates, (item) => item.fechaReserva) ??
    null;

  const saleCandidates = sales.filter((sale) => {
    return (
      (reservation ? sale.reservaId === reservation.id : false) ||
      (file ? sale.expedienteId === file.id : false) ||
      (customer ? sale.clienteId === customer.id : false)
    );
  });
  const sale =
    latestByDate(saleCandidates, (item) => item.fechaVenta) ?? null;

  const unitId = sale?.unidadId ?? reservation?.unidadId ?? null;
  const unit = unitId ? units.find((item) => item.id === unitId) ?? null : null;
  const credit = file
    ? credits.find((item) => item.expedienteId === file.id) ?? null
    : null;
  const fileDocuments = file
    ? documents.filter((item) => item.expedienteId === file.id)
    : [];

  if (!lead && !customer && !file && !reservation && !sale) return null;

  return {
    lead,
    customer,
    file,
    reservation,
    sale,
    unit,
    credit,
    documents: fileDocuments,
  };
}

export function getPublicCreditStatus(process: PublicProcessSummary | null) {
  const status = process?.credit?.estado;
  if (!status) return "Seguimiento de crédito pendiente";

  const labels: Record<CreditApplicationStatus, string> = {
    "No iniciado": "Seguimiento de crédito pendiente",
    "En revision": "Tu seguimiento de crédito está en revisión.",
    "Documentacion pendiente": "Hay documentación pendiente por completar.",
    Preaprobado: "Tu seguimiento de crédito fue preaprobado por la sucursal.",
    Aprobado: "Tu seguimiento de crédito fue aprobado manualmente por la sucursal.",
    Rechazado: "Tu seguimiento de crédito fue rechazado. Comunicate con tu asesor para conocer el siguiente paso.",
    Cancelado: "El seguimiento de crédito fue cancelado. Comunicate con tu asesor si deseas continuar.",
  };

  return labels[status];
}

export function getPublicCreditNextStep(process: PublicProcessSummary | null) {
  const credit = process?.credit;
  if (!credit) return "Cuando la sucursal inicie tu seguimiento de crédito, podrás consultar el avance desde esta pantalla.";
  if (credit.estado === "Documentacion pendiente" || hasPendingDocuments(process)) {
    return "Comunicate con tu asesor para completar la documentación pendiente.";
  }
  if (credit.estado === "Aprobado" || credit.estado === "Preaprobado") {
    return "Comunicate con tu asesor para conocer el siguiente paso de tu proceso.";
  }
  if (credit.estado === "Rechazado" || credit.estado === "Cancelado") {
    return "Tu asesor puede orientarte sobre las opciones disponibles para continuar.";
  }
  return "La sucursal continuará el seguimiento y te informará el próximo paso.";
}

export function hasPendingDocuments(process: PublicProcessSummary | null) {
  return Boolean(
    process?.documents.some(
      (document) => document.estado === "Pendiente" || document.estado === "Rechazado",
    ),
  );
}

export function getPublicPersonName(process: PublicProcessSummary) {
  return (
    process.customer?.nombre ??
    process.lead?.nombre ??
    process.reservation?.clienteNombre ??
    process.sale?.clienteNombre ??
    "Cliente"
  );
}

export function getPublicPhone(process: PublicProcessSummary) {
  return process.customer?.telefono ?? process.lead?.telefono ?? null;
}

export function getPublicMotorcycle(process: PublicProcessSummary) {
  return (
    process.sale?.modelo ??
    process.reservation?.modelo ??
    process.file?.motoInteres ??
    process.lead?.motoInteres ??
    "Informacion pendiente de completar"
  );
}

export function getPublicBranch(process: PublicProcessSummary) {
  return (
    process.sale?.sucursalNombre ??
    process.reservation?.sucursalNombre ??
    process.file?.sucursalNombre ??
    process.lead?.sucursalNombre ??
    process.customer?.sucursalOrigenNombre ??
    "Informacion pendiente de completar"
  );
}

export function getPublicAdvisor(process: PublicProcessSummary) {
  return (
    process.file?.vendedor ??
    process.sale?.vendedorNombre ??
    process.reservation?.vendedorNombre ??
    process.lead?.vendedorAsignado ??
    null
  );
}

export function getPublicStatus(process: PublicProcessSummary) {
  if (process.sale?.estado === SALE_DELIVERED_STATUS) {
    return "Motocicleta entregada";
  }
  if (normalizeUnitStatus(process.unit?.estado) === "Entregada") return "Entregada";
  if (process.sale) return "Venta completada";
  if (process.reservation?.estado === RESERVATION_COMPLETED_STATUS) {
    return "Reserva completada";
  }
  if (process.reservation?.estado === RESERVATION_ACTIVE_STATUS) {
    return "Reserva activa";
  }
  if (process.reservation?.estado === RESERVATION_CANCELLED_STATUS) {
    return "Reserva cancelada";
  }
  if (process.file) return "Expediente creado";
  if (process.lead) return statusLabels[process.lead.estado];

  return "Seguimiento activo";
}

export function getProgressIndex(process: PublicProcessSummary) {
  if (normalizeUnitStatus(process.unit?.estado) === "Entregada") return 8;
  if (process.sale) return 7;
  if (process.reservation) return 6;
  if (process.file) return 5;
  if (process.lead) return leadStepIndex[process.lead.estado];

  return 0;
}

export function getNextStep(process: PublicProcessSummary) {
  const unitStatus = normalizeUnitStatus(process.unit?.estado);

  if (unitStatus === "Entregada") {
    return "La motocicleta fue entregada. Conserva tu documentacion para cualquier seguimiento posterior.";
  }

  if (process.sale) {
    return "Tu proceso de entrega esta en preparacion. La sucursal dara seguimiento a los pasos finales.";
  }

  if (process.reservation?.estado === RESERVATION_ACTIVE_STATUS) {
    return "Tu reserva esta activa. La sucursal continuara el seguimiento de tu proceso comercial.";
  }

  if (process.reservation?.estado === RESERVATION_COMPLETED_STATUS) {
    return "La reserva fue completada. Consulta el avance de entrega para conocer el siguiente paso.";
  }

  if (process.reservation?.estado === RESERVATION_CANCELLED_STATUS) {
    return "La reserva fue cancelada. Puedes coordinar con la sucursal si deseas continuar.";
  }

  if (process.file) {
    return "Tu expediente esta activo. La sucursal continuara el seguimiento comercial.";
  }

  if (process.lead?.estado === "Descartado") {
    return "La solicitud fue cerrada. Puedes enviar una nueva solicitud si deseas continuar.";
  }

  if (process.lead?.estado === "Asignado") {
    return "Tu asesor se pondra en contacto contigo por telefono.";
  }

  if (process.lead?.estado === "Contactado") {
    return "Continua la conversacion con tu asesor para definir los siguientes pasos.";
  }

  if (process.lead?.estado === "Interesado") {
    return "La sucursal dara seguimiento a tu interes en la motocicleta seleccionada.";
  }

  return "La sucursal seleccionada revisara tu solicitud y preparara el seguimiento.";
}

export function getReservationPublicStatus(
  process: PublicProcessSummary | null,
) {
  if (!process?.reservation) return "Sin reserva activa";
  if (process.reservation.estado === RESERVATION_ACTIVE_STATUS) {
    return "Reserva activa";
  }
  if (process.reservation.estado === RESERVATION_COMPLETED_STATUS) {
    return "Reserva completada";
  }
  if (process.reservation.estado === RESERVATION_CANCELLED_STATUS) {
    return "Reserva cancelada";
  }

  return "Sin reserva activa";
}

export function getDeliveryPublicStatus(process: PublicProcessSummary | null) {
  const unitStatus = normalizeUnitStatus(process?.unit?.estado);

  if (process?.sale?.estado === SALE_DELIVERED_STATUS) {
    return "Motocicleta entregada";
  }
  if (unitStatus === "Entregada") return "Entregada";
  if (process?.sale || unitStatus === "Vendida") {
    return "Proceso de entrega en preparacion";
  }

  return "Entrega aun no programada";
}

export function normalizeUnitStatus(status?: string | null) {
  if (!status) return null;
  if (
    status === "En tr\u00c3\u00a1nsito" ||
    status === "En tr\u00e1nsito"
  ) {
    return "En transito";
  }

  return status;
}

export function formatPublicDate(value?: string | null) {
  if (!value) return "Informacion pendiente de completar";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function maskVin(vin?: string | null) {
  if (!vin) return "Informacion pendiente de completar";
  if (vin.length <= 6) return vin;

  return `${vin.slice(0, 4)}...${vin.slice(-4)}`;
}

function readCustomers() {
  return readList(CUSTOMERS_STORAGE_KEY, normalizeCustomer);
}

function readCustomerFiles() {
  return readList(CUSTOMER_FILES_STORAGE_KEY, normalizeCustomerFile);
}

function readReservations() {
  return readList(RESERVATIONS_STORAGE_KEY, normalizeReservation);
}

function readSales() {
  return readList(SALES_STORAGE_KEY, normalizeSale);
}

function readInventoryUnits() {
  return readList(INVENTORY_UNITS_STORAGE_KEY, normalizeInventoryUnit);
}

function readCreditApplications() {
  return readList(CREDIT_APPLICATIONS_STORAGE_KEY, normalizeCreditApplication);
}

function readCustomerFileDocuments() {
  return readList(CUSTOMER_FILE_DOCUMENTS_STORAGE_KEY, normalizeCustomerFileDocument);
}

function readList<T>(
  key: string,
  normalize: (value: unknown) => T | null,
) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalize(item))
      .filter((item): item is T => Boolean(item));
  } catch {
    return [];
  }
}

function latestByDate<T>(items: T[], getDate: (item: T) => string) {
  return [...items].sort(
    (left, right) =>
      new Date(getDate(right)).getTime() - new Date(getDate(left)).getTime(),
  )[0] ?? null;
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeCedula(value?: string | null) {
  return value?.replace(/[^0-9a-z]/gi, "").toUpperCase() ?? "";
}
