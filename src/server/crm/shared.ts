/**
 * Pure, client-safe CRM types, enum value unions, label maps and normalization
 * helpers. No database import here so client components can reuse the DTO shapes
 * and status catalogs. Enforcement lives in queries.ts / actions.ts.
 *
 * These mirror the Prisma enums added in Patch 3.1A (Customer / Lead /
 * CustomerFile / Activity).
 */

export type LeadStatusValue =
  | "NUEVO_LEAD"
  | "ASIGNADO"
  | "CONTACTADO"
  | "INTERESADO"
  | "EXPEDIENTE"
  | "DESCARTADO";

export const leadStatusValues: LeadStatusValue[] = [
  "NUEVO_LEAD",
  "ASIGNADO",
  "CONTACTADO",
  "INTERESADO",
  "EXPEDIENTE",
  "DESCARTADO",
];

export const leadStatusLabels: Record<LeadStatusValue, string> = {
  NUEVO_LEAD: "Nuevo lead",
  ASIGNADO: "Asignado",
  CONTACTADO: "Contactado",
  INTERESADO: "Interesado",
  EXPEDIENTE: "Expediente",
  DESCARTADO: "Descartado",
};

export function isLeadStatusValue(value: string): value is LeadStatusValue {
  return leadStatusValues.includes(value as LeadStatusValue);
}

export type CustomerFileStatusValue =
  | "ABIERTO"
  | "EN_PROCESO"
  | "COMPLETADO"
  | "CANCELADO";

export const customerFileStatusValues: CustomerFileStatusValue[] = [
  "ABIERTO",
  "EN_PROCESO",
  "COMPLETADO",
  "CANCELADO",
];

export const customerFileStatusLabels: Record<CustomerFileStatusValue, string> = {
  ABIERTO: "Abierto",
  EN_PROCESO: "En proceso",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

export type ActivityTypeValue =
  | "NOTA"
  | "LLAMADA"
  | "WHATSAPP"
  | "VISITA"
  | "SEGUIMIENTO";

export const activityTypeValues: ActivityTypeValue[] = [
  "NOTA",
  "LLAMADA",
  "WHATSAPP",
  "VISITA",
  "SEGUIMIENTO",
];

export const activityTypeLabels: Record<ActivityTypeValue, string> = {
  NOTA: "Nota",
  LLAMADA: "Llamada",
  WHATSAPP: "WhatsApp",
  VISITA: "Visita",
  SEGUIMIENTO: "Seguimiento",
};

export function isActivityTypeValue(value: string): value is ActivityTypeValue {
  return activityTypeValues.includes(value as ActivityTypeValue);
}

export type ActivityStatusValue = "PENDIENTE" | "COMPLETADA" | "CANCELADA";

export const activityStatusValues: ActivityStatusValue[] = [
  "PENDIENTE",
  "COMPLETADA",
  "CANCELADA",
];

export const activityStatusLabels: Record<ActivityStatusValue, string> = {
  PENDIENTE: "Pendiente",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

export function isActivityStatusValue(
  value: string,
): value is ActivityStatusValue {
  return activityStatusValues.includes(value as ActivityStatusValue);
}

/** Once an activity is completed or cancelled it accepts no further change. */
export const resolvedActivityStatuses: ActivityStatusValue[] = [
  "COMPLETADA",
  "CANCELADA",
];

export type ActivityPriorityValue = "BAJA" | "MEDIA" | "ALTA";

export const activityPriorityValues: ActivityPriorityValue[] = [
  "BAJA",
  "MEDIA",
  "ALTA",
];

export const activityPriorityLabels: Record<ActivityPriorityValue, string> = {
  BAJA: "Baja",
  MEDIA: "Media",
  ALTA: "Alta",
};

export function isActivityPriorityValue(
  value: string,
): value is ActivityPriorityValue {
  return activityPriorityValues.includes(value as ActivityPriorityValue);
}

/**
 * Patch CRM-QA1 — la moto que le interesa al lead, tal y como el catálogo la
 * tiene guardada.
 *
 * **Sólo campos que la base almacena de verdad.** `MotorcycleCatalogModel` no
 * tiene precio ni color, así que aquí no hay precio ni color: inventarlos habría
 * producido una ficha que miente. Lo que sí puede decirse es cuántas unidades de
 * ese modelo quedan disponibles en la sucursal del lead, y eso se cuenta.
 */
export type LeadMotorcycleDTO = {
  catalogModelId: string;
  /** Vacía cuando la marca está pendiente de completar en el catálogo. */
  brand: string;
  /** Patch CRM-INT1 — la etiqueta completa, con versión y año. */
  label: string;
  model: string;
  year: number | null;
  slug: string;
  imageUrl: string | null;
  description: string | null;
  /** Unidades AVAILABLE de este modelo en la sucursal del lead. */
  availableUnitsInBranch: number;
};

export type LeadDTO = {
  id: string;
  trackingCode: string;
  name: string;
  phone: string;
  cedula: string | null;
  email: string | null;
  motorcycleInterest: string | null;
  motorcycleSlug: string | null;
  /**
   * Patch CRM-QA1. Nula cuando el lead no dijo qué moto quiere, o cuando dijo un
   * texto libre que no corresponde a ningún modelo del catálogo — que es el caso
   * de todo lead nacido en el portal público o en el webhook de Meta antes de
   * este parche. La ficha lo pinta con `motorcycleInterest` de reserva.
   */
  motorcycle: LeadMotorcycleDTO | null;
  branchCode: string | null;
  branchName: string;
  originChannel: string | null;
  status: LeadStatusValue;
  statusLabel: string;
  assignedSellerId: string | null;
  assignedSellerName: string | null;
  /**
   * Patch CRM-INT1 — cuándo recibió el lead su primer vendedor y cuándo el
   * actual. **Nulas en los leads asignados antes de que existiera el registro**:
   * la pantalla lo dice («fecha no registrada») en lugar de inventar una.
   */
  firstAssignedAt: string | null;
  assignedAt: string | null;
  /** Patch CRM-INT1 — la campaña a la que se atribuye, si alguna. */
  campaignId: string | null;
  campaignName: string | null;
  createdById: string | null;
  createdByName: string | null;
  customerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Patch CRM-INT1 — una fila del historial de asignaciones de un lead. La
 * primera no tiene vendedor anterior; cada reasignación sí.
 */
export type LeadAssignmentDTO = {
  id: string;
  sellerName: string;
  previousSellerName: string | null;
  assignedByName: string | null;
  branchName: string;
  assignedAt: string;
};

/** Patch CRM-INT1 — una campaña que se le puede atribuir a un lead. */
export type LeadCampaignOption = {
  id: string;
  name: string;
  /** Códigos de sucursal que cubre. Vacío = todas. */
  branchCodes: string[];
};

/**
 * Patch CRM-AUD2 — la situación comercial completa de un cliente.
 *
 * **Es la respuesta a «qué pasa con esta persona».** Antes había que abrirla
 * cruzando seis pantallas, sabiendo de antemano que cada registro existía. Aquí
 * viene todo lo que la base de verdad guarda de ese cliente, y nada más: no hay
 * un solo campo que el esquema no tenga.
 */
export type CustomerDetailDTO = {
  customer: CustomerDTO;
  /** El lead del que salió, si vino de uno. El más reciente. */
  originLead: {
    id: string;
    trackingCode: string;
    statusLabel: string;
    originChannel: string | null;
    motorcycleInterest: string | null;
    createdAt: string;
  } | null;
  leads: Array<{
    id: string;
    trackingCode: string;
    name: string;
    statusLabel: string;
    assignedSellerName: string | null;
    motorcycleInterest: string | null;
    createdAt: string;
  }>;
  activities: ActivityDTO[];
  /** La próxima actividad pendiente con fecha. Lo que toca hacer. */
  nextActivity: { id: string; typeLabel: string; scheduledAt: string } | null;
  /** La última interacción registrada, pendiente o no. */
  lastInteractionAt: string | null;
  expedientes: Array<{
    id: string;
    fileNumber: string;
    statusLabel: string;
    sellerName: string | null;
    motorcycleInterest: string | null;
    creditStatusLabel: string | null;
    creditId: string | null;
    documentsPending: number;
    documentsTotal: number;
  }>;
  reservations: Array<{
    id: string;
    reservationNumber: string;
    statusLabel: string;
    status: string;
    unitName: string;
    chassisNumber: string;
    reservedAt: string;
    /** Cómo está probado el pago: comprobante, pasarela o nada. */
    paymentLabel: string;
  }>;
  paymentRequests: Array<{
    id: string;
    requestNumber: string;
    concept: string;
    amount: string;
    currency: string;
    statusLabel: string;
    createdAt: string;
  }>;
  sales: Array<{
    id: string;
    saleNumber: string;
    statusLabel: string;
    typeLabel: string;
    unitName: string;
    soldAt: string;
  }>;
};

/**
 * Patch CRM-AUD1 — el recorrido comercial del cliente de un lead.
 *
 * **Existe porque la ficha del lead era un callejón sin salida.** Mostraba
 * contacto, moto y seguimientos, y ahí se acababa: para saber si ese mismo
 * cliente ya tenía una reserva, un crédito abierto, un cobro pendiente o una
 * venta cerrada había que salir a buscarlo a mano en cuatro pantallas distintas,
 * sabiendo de antemano que existían.
 *
 * Son sólo punteros —número, estado y a dónde ir—, no copias del registro: la
 * ficha del lead no es el sitio donde se opera una reserva, es el sitio donde se
 * decide qué hacer a continuación.
 */
export type LeadCommercialContextDTO = {
  reservations: Array<{
    id: string;
    reservationNumber: string;
    statusLabel: string;
    unitName: string;
  }>;
  sales: Array<{
    id: string;
    saleNumber: string;
    statusLabel: string;
    unitName: string;
  }>;
  expedientes: Array<{
    id: string;
    fileNumber: string;
    statusLabel: string;
    /** Estado del crédito del expediente, cuando lo tiene. */
    creditStatusLabel: string | null;
  }>;
  paymentRequests: Array<{
    id: string;
    requestNumber: string;
    concept: string;
    amount: string;
    currency: string;
    statusLabel: string;
  }>;
};

export type CustomerDTO = {
  id: string;
  branchCode: string | null;
  branchName: string;
  name: string;
  phone: string;
  cedula: string | null;
  email: string | null;
  /** Patch CRM-QA1 — la cartera: qué vendedor atiende hoy a este cliente. */
  assignedSellerId: string | null;
  assignedSellerName: string | null;
  assignedByName: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFileDTO = {
  id: string;
  fileNumber: string;
  customerId: string;
  customerName: string;
  leadId: string | null;
  branchCode: string | null;
  branchName: string;
  sellerId: string | null;
  sellerName: string | null;
  motorcycleInterest: string | null;
  status: CustomerFileStatusValue;
  statusLabel: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActivityDTO = {
  id: string;
  type: ActivityTypeValue;
  typeLabel: string;
  status: ActivityStatusValue;
  statusLabel: string;
  priority: ActivityPriorityValue;
  priorityLabel: string;
  description: string | null;
  result: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  userName: string | null;
  createdAt: string;
};

export type CustomerFileDetailDTO = CustomerFileDTO & {
  customer: CustomerDTO;
  lead: LeadDTO | null;
  activities: ActivityDTO[];
};

/**
 * An activity as shown in a list that spans several expedientes (Patch 3.3C.1):
 * carries the branch, the responsible user and the related record so the row is
 * readable without a second query. Contains no inventory cost.
 */
export type ActivityListItemDTO = ActivityDTO & {
  branchCode: string | null;
  branchName: string;
  userId: string | null;
  leadId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerFileId: string | null;
  fileNumber: string | null;
};

/** A pending activity whose scheduled date has already passed. */
export function isActivityOverdue(
  activity: Pick<ActivityDTO, "status" | "scheduledAt">,
  now: Date,
): boolean {
  if (activity.status !== "PENDIENTE" || !activity.scheduledAt) return false;
  return new Date(activity.scheduledAt).getTime() < now.getTime();
}

export type ActivitySummaryDTO = {
  pendientes: number;
  vencidas: number;
  /** Pending activities scheduled from now on. */
  proximas: number;
  completadas: number;
};

/**
 * Counters for the activities header. Pure so the server can compute them once
 * with a single `now` — a client-side `Date.now()` would make the "vencidas"
 * count differ between render passes.
 */
export function buildActivitySummary(
  activities: Pick<ActivityDTO, "status" | "scheduledAt">[],
  now: Date,
): ActivitySummaryDTO {
  let pendientes = 0;
  let vencidas = 0;
  let proximas = 0;
  let completadas = 0;

  for (const activity of activities) {
    if (activity.status === "COMPLETADA") completadas += 1;
    if (activity.status !== "PENDIENTE") continue;
    pendientes += 1;
    if (!activity.scheduledAt) continue;
    if (isActivityOverdue(activity, now)) vencidas += 1;
    else proximas += 1;
  }

  return { pendientes, vencidas, proximas, completadas };
}

/**
 * Patch CRM-AUD1 — el techo de filas de una lista del CRM.
 *
 * **Se exporta para que la pantalla pueda decirlo.** Las consultas cortaban en
 * 200 en silencio: una sucursal con más leads que eso mostraba 200 y el usuario
 * creía estar viéndolo todo. Un listado que miente por omisión es peor que uno
 * que avisa, porque nadie busca lo que no sabe que falta.
 */
export const CRM_LIST_LIMIT = 200;

/**
 * Digits-only phone, used for storage.
 *
 * Patch CRM-INT2 — **no es la forma de comparar identidades.** Lo que llega de
 * Meta y de WhatsApp trae el prefijo de país (`50588881234`) y lo que se teclea
 * en el panel no (`88881234`). La columna se deja como está —WhatsApp envía con
 * este valor—; para decidir si dos teléfonos son el mismo se usa
 * {@link phoneMatchKeys}.
 */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Patch CRM-INT2 — el número nacional de 8 dígitos, si lo hay.
 *
 * Nicaragua usa números de 8 dígitos y el prefijo internacional 505. Se acepta
 * el número tal cual (8), con prefijo (11: `505…`) o con salida internacional
 * (13: `00505…`). Cualquier otra longitud no se adivina: se devuelve `null` y
 * el número se compara sólo consigo mismo.
 */
export function nationalPhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 8) return digits;
  if (digits.length === 11 && digits.startsWith("505")) return digits.slice(3);
  if (digits.length === 13 && digits.startsWith("00505")) return digits.slice(5);
  return null;
}

/**
 * Patch CRM-INT2 — las formas guardadas bajo las que puede estar este teléfono.
 * Se usan en un `IN` contra `phoneNormalized`/`phone`, así que un cliente dado
 * de alta por Meta (`505…`) y el mismo cliente tecleado en el panel se
 * reconocen como el mismo teléfono **sin reescribir ninguna fila**.
 */
export function phoneMatchKeys(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  const national = nationalPhone(digits);
  if (!national) return digits ? [digits] : [];
  return [...new Set([national, `505${national}`, digits])];
}

/** Uppercased alphanumeric cedula (accepts formats with or without hyphens). */
export function normalizeCedula(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Patch CRM-INT2 — ¿es una cédula nicaragüense con forma válida?
 *
 * Es **la misma regla que el portal ya exigía** en el formulario público
 * (`001-010101-0000A`, o sus 13 dígitos y letra sin guiones), traída al
 * servidor. No cambia qué cédulas se pueden guardar —el panel sigue aceptando
 * lo que se teclee—: decide qué cédulas **cuentan como prueba de identidad**
 * al buscar un cliente existente. Una cédula mal escrita no identifica a nadie.
 */
export function isValidCedula(normalized: string | null | undefined): boolean {
  return Boolean(normalized && /^\d{13}[A-Z]$/.test(normalized));
}

/** Patch CRM-INT2 — «Juan Pérez» → «J*** P****», para quien no puede ver el cliente. */
export function maskPersonName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => (part ? `${part[0]}${"*".repeat(Math.max(part.length - 1, 2))}` : part))
    .join(" ");
}

/** Patch CRM-INT2 — sólo los 4 últimos dígitos. */
export function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `****${digits.slice(-4)}` : "****";
}

/**
 * Patch CRM-INT2 — un cliente que podría ser la misma persona que se está
 * registrando o convirtiendo.
 *
 * Si quien pregunta **no** puede ver ese cliente, nombre y teléfono llegan
 * enmascarados y no hay id con el que abrirlo: la coincidencia se señala, pero
 * no se convierte en una vía para leer fichas ajenas.
 */
export type IdentityCandidateDTO = {
  /** Sólo presente si quien pregunta puede ver este cliente. */
  customerId: string | null;
  displayName: string;
  displayPhone: string;
  branchName: string;
  assignedSellerName: string | null;
  matchedBy: Array<"CEDULA" | "TELEFONO">;
  accessible: boolean;
};

/**
 * Patch CRM-INT2 — la resolución que falta para seguir. La devuelven el alta de
 * cliente y la conversión de lead cuando la identidad no es inequívoca.
 */
export type IdentityResolutionNeeded = {
  reason: string;
  candidates: IdentityCandidateDTO[];
  /** Quien pregunta puede decidir (vincular o crear nuevo). */
  canResolve: boolean;
  /** Crear un cliente nuevo está permitido (ninguna cédula coincide). */
  canCreateNew: boolean;
};

/** Collapse whitespace and trim a free-text value. */
export function sanitizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Patch CRM-QA1 — el origen que se le pone a un lead registrado a mano.
 *
 * `originChannel` es texto libre en el modelo porque el portal público y Meta
 * escriben ahí lo suyo. Esta lista es la que ofrece el formulario interno, y la
 * acción sólo acepta uno de estos valores: sin la validación, «origen» sería un
 * campo de texto donde cada sucursal escribiría lo que quisiera y el informe de
 * marketing dejaría de poder agrupar.
 *
 * Reproduce `manualLeadOriginChannels` de `src/data/operations/leads.ts`, que es
 * lo que la bandeja local ya ofrecía, más `Registro manual` como valor genérico.
 */
export const manualLeadOrigins = [
  "Registro manual",
  "Sucursal",
  "WhatsApp directo",
  "Referido",
  "Presencial",
] as const;

export type ManualLeadOrigin = (typeof manualLeadOrigins)[number];

export function isManualLeadOrigin(value: string): value is ManualLeadOrigin {
  return (manualLeadOrigins as readonly string[]).includes(value);
}
