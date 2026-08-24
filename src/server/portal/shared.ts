/**
 * Public-safe portal DTOs, input normalization, masking and status mapping
 * (Patch 3.6A). This is the ONLY shape a public (unauthenticated) customer
 * lookup may return. No Prisma import belongs here.
 *
 * A public lookup NEVER exposes: internal cuid ids, user emails, internal notes,
 * audit logs, roles, costs, accounting data, Caja data, inventory costs, raw
 * phone/identification, or any other customer's record. Only the public
 * tracking codes (tracking code, expediente/reservation/sale number), the
 * customer display name, the branch public name, the public advisor display
 * name, a public-safe motorcycle model name and derived public statuses cross
 * the boundary.
 *
 * Nothing here queries or references Caja or Contabilidad.
 */

// --- Generic not-found ----------------------------------------------------

/**
 * Shown for any lookup that does not resolve to a verified record. The message
 * is deliberately identical whether the code, the phone or the identification
 * was wrong, so a public caller cannot enumerate codes or phone numbers.
 */
export const PUBLIC_LOOKUP_NOT_FOUND =
  "No encontramos una solicitud con esos datos. Verifica el código y el teléfono e inténtalo de nuevo.";

// --- Public status kinds --------------------------------------------------

export type PublicStatusKind =
  | "lead"
  | "expediente"
  | "reservation"
  | "credit"
  | "delivery";

// --- Timeline -------------------------------------------------------------

/** Customer-facing progress steps, mirroring the current public tracking UI. */
export const publicTimelineSteps = [
  "Solicitud recibida",
  "En revisión por sucursal",
  "Asesor asignado",
  "Contacto realizado",
  "Interesado",
  "Expediente creado",
  "Reserva",
  "Venta",
  "Entrega",
] as const;

export type PublicTimelineStepStatus = "done" | "current" | "pending";

export type PublicTimelineStepDTO = {
  label: string;
  status: PublicTimelineStepStatus;
};

export function buildPublicTimeline(
  currentIndex: number,
): PublicTimelineStepDTO[] {
  const clamped = Math.max(
    0,
    Math.min(currentIndex, publicTimelineSteps.length - 1),
  );
  return publicTimelineSteps.map((label, index) => ({
    label,
    status:
      index < clamped ? "done" : index === clamped ? "current" : "pending",
  }));
}

// --- DTOs -----------------------------------------------------------------

export type PublicLeadStatusDTO = {
  trackingCode: string;
  status: string;
  nextStep: string;
};

export type PublicExpedienteStatusDTO = {
  /** Public expediente number, safe to show (already printed on documents). */
  expedienteCode: string | null;
  status: string;
  nextStep: string;
};

export type PublicCreditStatusDTO = {
  status: string;
  nextStep: string;
};

export type PublicReservationStatusDTO = {
  status: string;
  nextStep: string;
};

export type PublicDeliveryStatusDTO = {
  status: string;
  nextStep: string;
};

/**
 * The umbrella result the public tracking page shows. Every field is
 * public-safe; masked contact fields let the customer confirm their own record
 * without the portal echoing the raw value back.
 */
export type PublicPortalLookupResultDTO = {
  trackingCode: string | null;
  customerName: string;
  maskedPhone: string | null;
  maskedIdentification: string | null;
  branchName: string;
  advisorName: string | null;
  motorcycleModel: string;
  status: string;
  nextStep: string;
  lastUpdate: string | null;
  timeline: PublicTimelineStepDTO[];
  lead: PublicLeadStatusDTO | null;
  expediente: PublicExpedienteStatusDTO | null;
  reservation: PublicReservationStatusDTO | null;
  credit: PublicCreditStatusDTO | null;
  delivery: PublicDeliveryStatusDTO | null;
};

// --- Input normalization --------------------------------------------------

export type PublicLookupInput = {
  code?: string | null;
  phone?: string | null;
  identification?: string | null;
};

export function normalizeTrackingCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/** Digits only; Nicaraguan numbers are 8 digits, so keep the last 8. */
export function normalizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(-8);
}

export function normalizeIdentification(
  value: string | null | undefined,
): string {
  return (value ?? "").replace(/[^0-9a-z]/gi, "").toUpperCase();
}

/**
 * A verification field is only usable if it carries enough entropy to avoid
 * trivial enumeration alongside the code.
 */
export function hasUsableVerification(input: {
  phone: string;
  identification: string;
}): boolean {
  return input.phone.length >= 7 || input.identification.length >= 6;
}

// --- Masking --------------------------------------------------------------

export function maskPhone(value: string | null | undefined): string | null {
  const digits = normalizePhone(value);
  if (!digits) return null;
  if (digits.length <= 2) return `••${digits}`;
  return `••••${digits.slice(-2)}`;
}

export function maskIdentification(
  value: string | null | undefined,
): string | null {
  const clean = normalizeIdentification(value);
  if (!clean) return null;
  if (clean.length <= 3) return `••${clean.slice(-1)}`;
  return `••••${clean.slice(-3)}`;
}

// --- Status mapping -------------------------------------------------------

type Mapped = { label: string; step: number; nextStep: string };

export function mapLeadStatusToPublicStatus(status: string): Mapped {
  switch (status) {
    case "NUEVO_LEAD":
      return {
        label: "Solicitud recibida",
        step: 0,
        nextStep:
          "La sucursal seleccionada revisará tu solicitud y preparará el seguimiento.",
      };
    case "ASIGNADO":
      return {
        label: "Asesor asignado",
        step: 2,
        nextStep: "Tu asesor se pondrá en contacto contigo por teléfono.",
      };
    case "CONTACTADO":
      return {
        label: "Contacto realizado",
        step: 3,
        nextStep:
          "Continúa la conversación con tu asesor para definir los siguientes pasos.",
      };
    case "INTERESADO":
      return {
        label: "Interesado",
        step: 4,
        nextStep:
          "La sucursal dará seguimiento a tu interés en la motocicleta seleccionada.",
      };
    case "EXPEDIENTE":
      return {
        label: "Expediente creado",
        step: 5,
        nextStep: "Tu expediente está activo. La sucursal continuará el seguimiento.",
      };
    case "DESCARTADO":
      return {
        label: "Solicitud cerrada",
        step: 0,
        nextStep:
          "La solicitud fue cerrada. Puedes enviar una nueva solicitud si deseas continuar.",
      };
    default:
      return {
        label: "Seguimiento activo",
        step: 0,
        nextStep: "La sucursal continuará el seguimiento de tu proceso.",
      };
  }
}

export function mapExpedienteStatusToPublicStatus(status: string): Mapped {
  switch (status) {
    case "COMPLETADO":
      return {
        label: "Expediente completado",
        step: 5,
        nextStep: "Tu expediente fue completado. Consulta el avance de tu reserva o entrega.",
      };
    case "CANCELADO":
      return {
        label: "Expediente cerrado",
        step: 0,
        nextStep: "El expediente fue cerrado. Coordina con la sucursal si deseas continuar.",
      };
    case "EN_PROCESO":
    case "ABIERTO":
    default:
      return {
        label: "Expediente en proceso",
        step: 5,
        nextStep: "Tu expediente está activo. La sucursal continuará el seguimiento comercial.",
      };
  }
}

export function mapReservationStatusToPublicStatus(status: string): Mapped {
  switch (status) {
    case "COMPLETADA":
      return {
        label: "Reserva completada",
        step: 6,
        nextStep: "La reserva fue completada. Consulta el avance de entrega para el siguiente paso.",
      };
    case "CANCELADA":
      return {
        label: "Reserva cancelada",
        step: 5,
        nextStep: "La reserva fue cancelada. Puedes coordinar con la sucursal si deseas continuar.",
      };
    case "ACTIVA":
    default:
      return {
        label: "Reserva activa",
        step: 6,
        nextStep: "Tu reserva está activa. La sucursal continuará el seguimiento de tu proceso.",
      };
  }
}

export function mapCreditStatusToPublicStatus(status: string): Mapped {
  switch (status) {
    case "EN_REVISION":
      return { label: "Seguimiento de crédito en revisión", step: 5, nextStep: "La sucursal continuará el seguimiento y te informará el próximo paso." };
    case "DOCUMENTACION_PENDIENTE":
      return { label: "Documentación pendiente", step: 5, nextStep: "Comunícate con tu asesor para completar la documentación pendiente." };
    case "PREAPROBADO":
      return { label: "Seguimiento de crédito preaprobado", step: 5, nextStep: "Comunícate con tu asesor para conocer el siguiente paso de tu proceso." };
    case "APROBADO":
      return { label: "Seguimiento de crédito aprobado", step: 5, nextStep: "Comunícate con tu asesor para conocer el siguiente paso de tu proceso." };
    case "RECHAZADO":
      return { label: "Seguimiento de crédito rechazado", step: 5, nextStep: "Tu asesor puede orientarte sobre las opciones disponibles para continuar." };
    case "CANCELADO":
      return { label: "Seguimiento de crédito cancelado", step: 5, nextStep: "Comunícate con tu asesor si deseas continuar." };
    case "PENDIENTE":
    default:
      return { label: "Seguimiento de crédito pendiente", step: 5, nextStep: "Cuando la sucursal inicie tu seguimiento de crédito, podrás consultar el avance aquí." };
  }
}

/** Delivery is derived from the sale status; there is no separate entity. */
export function mapDeliveryStatusToPublicStatus(
  saleStatus: string | null,
): Mapped {
  if (saleStatus === "ENTREGADA") {
    return {
      label: "Motocicleta entregada",
      step: 8,
      nextStep: "La motocicleta fue entregada. Conserva tu documentación para cualquier seguimiento posterior.",
    };
  }
  if (saleStatus === "COMPLETADA") {
    return {
      label: "Proceso de entrega en preparación",
      step: 7,
      nextStep: "Tu proceso de entrega está en preparación. La sucursal dará seguimiento a los pasos finales.",
    };
  }
  return {
    label: "Entrega aún no programada",
    step: 6,
    nextStep: "Cuando tu compra avance, verás aquí el estado de la entrega.",
  };
}
