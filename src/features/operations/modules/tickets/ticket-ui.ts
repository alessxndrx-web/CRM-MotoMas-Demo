import type { OperationRole } from "@/features/operations/types";
import type {
  TicketEventDTO,
  TicketSummaryDTO,
} from "@/server/tickets/types";

export type TicketCategoryValue = TicketSummaryDTO["category"];
export type TicketImpactValue = TicketSummaryDTO["impact"];
export type TicketStatusValue = TicketSummaryDTO["status"];
export type TicketBadgeTone =
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "indigo"
  | "orange"
  | "slate";

export const ticketCategoryLabels: Readonly<
  Record<TicketCategoryValue, string>
> = {
  ACCESO_Y_CUENTA: "Acceso y cuenta",
  ERROR_DEL_SISTEMA: "Error del sistema",
  RENDIMIENTO: "Rendimiento",
  DATOS_INCORRECTOS: "Datos incorrectos",
  INVENTARIO: "Inventario",
  TRASLADOS: "Traslados",
  RESERVAS: "Reservas",
  VENTAS: "Ventas",
  EXPEDIENTES: "Expedientes",
  CREDITOS: "Créditos",
  LEADS: "Leads",
  MARKETING: "Marketing",
  REPORTES: "Reportes",
  NOTIFICACIONES: "Notificaciones",
  INTEGRACIONES: "Integraciones",
  SOLICITUD_DE_AYUDA: "Solicitud de ayuda",
  SOLICITUD_DE_MEJORA: "Solicitud de mejora",
  SEGURIDAD: "Seguridad",
  OTRO: "Otro",
};

export const ticketImpactLabels: Readonly<Record<TicketImpactValue, string>> = {
  CONSULTA: "Consulta",
  AFECTA_UNA_TAREA: "Afecta una tarea",
  IMPIDE_TRABAJAR: "Me impide trabajar",
  AFECTA_VARIOS_USUARIOS: "Afecta a varios usuarios",
  SISTEMA_INDISPONIBLE: "Sistema indisponible",
  RIESGO_SEGURIDAD: "Riesgo de seguridad",
};

export const ticketPriorityLabels = {
  P1_CRITICA: "P1 - Crítica",
  P2_ALTA: "P2 - Alta",
  P3_MEDIA: "P3 - Media",
  P4_BAJA: "P4 - Baja",
} as const;

export const ticketScopeLabels = {
  USER: "Usuario",
  BRANCH: "Sucursal",
  MODULE: "Módulo",
  GLOBAL: "Global",
} as const;

export const ticketStatusLabels: Readonly<Record<TicketStatusValue, string>> = {
  NUEVO: "Nuevo",
  RECIBIDO: "Recibido",
  EN_CLASIFICACION: "En clasificación",
  EN_PROGRESO: "En progreso",
  PENDIENTE_USUARIO: "Esperando tu respuesta",
  PENDIENTE_APROBACION: "Pendiente de aprobación",
  ESCALADO_DESARROLLO: "Escalado a desarrollo",
  ESCALADO_PROVEEDOR: "Escalado a proveedor",
  SOLUCION_PROPUESTA: "Solución propuesta",
  RESUELTO: "Resuelto",
  CERRADO: "Cerrado",
  REABIERTO: "Reabierto",
  CANCELADO: "Cancelado",
};

export const ticketStatusTone: Readonly<
  Record<TicketStatusValue, TicketBadgeTone>
> = {
  NUEVO: "blue",
  RECIBIDO: "blue",
  EN_CLASIFICACION: "indigo",
  EN_PROGRESO: "orange",
  PENDIENTE_USUARIO: "yellow",
  PENDIENTE_APROBACION: "yellow",
  ESCALADO_DESARROLLO: "indigo",
  ESCALADO_PROVEEDOR: "indigo",
  SOLUCION_PROPUESTA: "green",
  RESUELTO: "green",
  CERRADO: "slate",
  REABIERTO: "orange",
  CANCELADO: "red",
};

export const ticketImpactTone: Readonly<
  Record<TicketImpactValue, TicketBadgeTone>
> = {
  CONSULTA: "slate",
  AFECTA_UNA_TAREA: "blue",
  IMPIDE_TRABAJAR: "orange",
  AFECTA_VARIOS_USUARIOS: "orange",
  SISTEMA_INDISPONIBLE: "red",
  RIESGO_SEGURIDAD: "red",
};

export const ticketCategoryOptions = Object.entries(ticketCategoryLabels).map(
  ([value, label]) => ({ value: value as TicketCategoryValue, label }),
);

export const ticketImpactOptions = Object.entries(ticketImpactLabels).map(
  ([value, label]) => ({ value: value as TicketImpactValue, label }),
);

export const ticketStatusOptions = Object.entries(ticketStatusLabels).map(
  ([value, label]) => ({ value: value as TicketStatusValue, label }),
);

export const ticketPriorityOptions = Object.entries(ticketPriorityLabels).map(
  ([value, label]) => ({ value, label }),
);

export const ticketScopeOptions = Object.entries(ticketScopeLabels).map(
  ([value, label]) => ({ value, label }),
);

const operatorTransitions: Readonly<
  Record<TicketStatusValue, readonly TicketStatusValue[]>
> = {
  NUEVO: ["RECIBIDO", "EN_CLASIFICACION", "CANCELADO"],
  RECIBIDO: ["EN_CLASIFICACION", "EN_PROGRESO", "CANCELADO"],
  EN_CLASIFICACION: [
    "EN_PROGRESO",
    "PENDIENTE_USUARIO",
    "PENDIENTE_APROBACION",
    "ESCALADO_DESARROLLO",
    "ESCALADO_PROVEEDOR",
    "SOLUCION_PROPUESTA",
    "CANCELADO",
  ],
  EN_PROGRESO: [
    "PENDIENTE_USUARIO",
    "PENDIENTE_APROBACION",
    "ESCALADO_DESARROLLO",
    "ESCALADO_PROVEEDOR",
    "SOLUCION_PROPUESTA",
    "RESUELTO",
    "CANCELADO",
  ],
  PENDIENTE_USUARIO: ["EN_PROGRESO", "SOLUCION_PROPUESTA", "CANCELADO"],
  PENDIENTE_APROBACION: ["EN_PROGRESO", "SOLUCION_PROPUESTA", "CANCELADO"],
  ESCALADO_DESARROLLO: [
    "EN_PROGRESO",
    "PENDIENTE_USUARIO",
    "SOLUCION_PROPUESTA",
    "RESUELTO",
  ],
  ESCALADO_PROVEEDOR: [
    "EN_PROGRESO",
    "PENDIENTE_USUARIO",
    "SOLUCION_PROPUESTA",
    "RESUELTO",
  ],
  SOLUCION_PROPUESTA: ["EN_PROGRESO", "PENDIENTE_USUARIO", "RESUELTO"],
  RESUELTO: ["CERRADO"],
  CERRADO: [],
  REABIERTO: ["EN_CLASIFICACION", "EN_PROGRESO", "PENDIENTE_USUARIO", "CANCELADO"],
  CANCELADO: [],
};

export function operatorStatusOptions(status: TicketStatusValue) {
  return operatorTransitions[status].map((value) => ({
    value,
    label: ticketStatusLabels[value],
  }));
}

export const ticketModuleLabels = {
  GENERAL: "General / no estoy seguro",
  ACCESO: "Acceso y cuenta",
  CRM: "CRM y clientes",
  LEADS: "Leads",
  EXPEDIENTES: "Expedientes",
  CREDITOS: "Créditos",
  INVENTARIO: "Inventario",
  TRASLADOS: "Traslados",
  RESERVAS: "Reservas",
  VENTAS: "Ventas",
  CAJA: "Caja",
  CONTABILIDAD: "Contabilidad",
  MARKETING: "Marketing",
  REPORTES: "Reportes",
  NOTIFICACIONES: "Notificaciones",
  INTEGRACIONES: "Integraciones",
  SOPORTE: "Soporte técnico",
} as const;

export type TicketModuleValue = keyof typeof ticketModuleLabels;

export const ticketModuleOptions = Object.entries(ticketModuleLabels).map(
  ([value, label]) => ({ value: value as TicketModuleValue, label }),
);

const modulesByRole: Readonly<Record<OperationRole, readonly TicketModuleValue[]>> = {
  Administrador: Object.keys(ticketModuleLabels) as TicketModuleValue[],
  Gerente: [
    "GENERAL",
    "ACCESO",
    "CRM",
    "LEADS",
    "EXPEDIENTES",
    "CREDITOS",
    "INVENTARIO",
    "TRASLADOS",
    "RESERVAS",
    "VENTAS",
    "CAJA",
    "CONTABILIDAD",
    "MARKETING",
    "REPORTES",
    "NOTIFICACIONES",
    "INTEGRACIONES",
  ],
  Vendedor: [
    "GENERAL",
    "ACCESO",
    "CRM",
    "LEADS",
    "EXPEDIENTES",
    "CREDITOS",
    "INVENTARIO",
    "TRASLADOS",
    "RESERVAS",
    "VENTAS",
    "NOTIFICACIONES",
    "INTEGRACIONES",
  ],
  Cajero: ["GENERAL", "ACCESO", "CAJA", "NOTIFICACIONES", "INTEGRACIONES"],
  Contador: [
    "GENERAL",
    "ACCESO",
    "CONTABILIDAD",
    "INVENTARIO",
    "CAJA",
    "REPORTES",
    "NOTIFICACIONES",
    "INTEGRACIONES",
  ],
  Marketing: [
    "GENERAL",
    "ACCESO",
    "MARKETING",
    "LEADS",
    "REPORTES",
    "NOTIFICACIONES",
    "INTEGRACIONES",
  ],
  "Soporte Técnico": [
    "GENERAL",
    "ACCESO",
    "SOPORTE",
    "NOTIFICACIONES",
    "INTEGRACIONES",
  ],
};

export function ticketModulesForRole(role: OperationRole) {
  return modulesByRole[role].map((value) => ({
    value,
    label: ticketModuleLabels[value],
  }));
}

export function ticketModuleLabel(value: string | null): string | null {
  if (!value) return null;
  return ticketModuleLabels[value as TicketModuleValue] ?? "Módulo relacionado";
}

export function formatTicketDate(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  }).format(date);
}

export function ticketEventLabel(event: TicketEventDTO): string {
  if (event.action === "CREATED") return "Ticket creado";
  if (event.action === "COMMENT_ADDED") return "Comentario agregado";
  if (event.action === "INTERNAL_COMMENT_ADDED") return "Nota interna agregada";
  if (event.action === "REOPENED") return "Ticket reabierto";
  if (event.action === "CANCELLED") return "Ticket cancelado";
  if (event.action === "ASSIGNED") return "Equipo de soporte asignado";
  if (event.action === "PRIORITY_CHANGED") return "Prioridad técnica actualizada";
  if (event.action === "MARKED_DUPLICATE") return "Ticket relacionado como duplicado";
  if (event.action === "LINKED_GLOBAL_INCIDENT") return "Incidente relacionado";
  if (event.action === "UNLINKED_GLOBAL_INCIDENT") return "Incidente desvinculado";
  if (event.action === "SCOPE_CLASSIFIED") return "Alcance clasificado";
  if (event.action === "CATEGORY_CHANGED") return "Categoría actualizada";
  if (event.action === "SUBCATEGORY_CHANGED") return "Subcategoría actualizada";
  if (event.action === "IMPACT_CHANGED") return "Impacto actualizado";
  if (event.action === "BRANCH_CLASSIFIED") return "Sucursal clasificada";
  if (event.action === "MODULE_CLASSIFIED") return "Módulo clasificado";
  if (event.action === "RELATED_REFERENCE_CHANGED") return "Referencia actualizada";
  if (event.action === "UNASSIGNED") return "Asignación retirada";
  if (event.action === "STATUS_CHANGED") {
    if (event.toValue === "SOLUCION_PROPUESTA") return "Solución propuesta";
    if (event.toValue === "RESUELTO") return "Ticket resuelto";
    if (event.toValue === "CERRADO") return "Ticket cerrado";
    return "Estado actualizado";
  }
  return "Actividad del ticket";
}

export function isTicketOpen(status: TicketStatusValue): boolean {
  return !["RESUELTO", "CERRADO", "CANCELADO"].includes(status);
}

export function canCancelOwnTicket(status: TicketStatusValue): boolean {
  return !["RESUELTO", "CERRADO", "CANCELADO"].includes(status);
}

export function canReopenOwnTicket(status: TicketStatusValue): boolean {
  return status === "RESUELTO" || status === "CERRADO";
}
