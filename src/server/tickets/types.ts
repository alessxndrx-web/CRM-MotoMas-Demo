import type {
  TicketCategory,
  TicketImpact,
  TicketParticipantType,
  TicketPriority,
  TicketScope,
  TicketStatus,
} from "@prisma/client";

export const ticketCategoryValues = [
  "ACCESO_Y_CUENTA",
  "ERROR_DEL_SISTEMA",
  "RENDIMIENTO",
  "DATOS_INCORRECTOS",
  "INVENTARIO",
  "TRASLADOS",
  "RESERVAS",
  "VENTAS",
  "EXPEDIENTES",
  "CREDITOS",
  "LEADS",
  "MARKETING",
  "REPORTES",
  "NOTIFICACIONES",
  "INTEGRACIONES",
  "SOLICITUD_DE_AYUDA",
  "SOLICITUD_DE_MEJORA",
  "SEGURIDAD",
  "OTRO",
] as const satisfies readonly TicketCategory[];

export const ticketImpactValues = [
  "CONSULTA",
  "AFECTA_UNA_TAREA",
  "IMPIDE_TRABAJAR",
  "AFECTA_VARIOS_USUARIOS",
  "SISTEMA_INDISPONIBLE",
  "RIESGO_SEGURIDAD",
] as const satisfies readonly TicketImpact[];

export const ticketPriorityValues = [
  "P1_CRITICA",
  "P2_ALTA",
  "P3_MEDIA",
  "P4_BAJA",
] as const satisfies readonly TicketPriority[];

export const ticketScopeValues = [
  "USER",
  "BRANCH",
  "MODULE",
  "GLOBAL",
] as const satisfies readonly TicketScope[];

export const ticketStatusValues = [
  "NUEVO",
  "RECIBIDO",
  "EN_CLASIFICACION",
  "EN_PROGRESO",
  "PENDIENTE_USUARIO",
  "PENDIENTE_APROBACION",
  "ESCALADO_DESARROLLO",
  "ESCALADO_PROVEEDOR",
  "SOLUCION_PROPUESTA",
  "RESUELTO",
  "CERRADO",
  "REABIERTO",
  "CANCELADO",
] as const satisfies readonly TicketStatus[];

export const operatorTicketModuleValues = [
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
  "SOPORTE",
] as const;

export const ticketPriorityLabels: Readonly<Record<TicketPriority, string>> = {
  P1_CRITICA: "P1 - Critica",
  P2_ALTA: "P2 - Alta",
  P3_MEDIA: "P3 - Media",
  P4_BAJA: "P4 - Baja",
};

export function isTicketCategory(value: string): value is TicketCategory {
  return (ticketCategoryValues as readonly string[]).includes(value);
}

export function isTicketImpact(value: string): value is TicketImpact {
  return (ticketImpactValues as readonly string[]).includes(value);
}

export function isTicketPriority(value: string): value is TicketPriority {
  return (ticketPriorityValues as readonly string[]).includes(value);
}

export function isTicketScope(value: string): value is TicketScope {
  return (ticketScopeValues as readonly string[]).includes(value);
}

export function isTicketStatus(value: string): value is TicketStatus {
  return (ticketStatusValues as readonly string[]).includes(value);
}

export function isOperatorTicketModule(
  value: string,
): value is (typeof operatorTicketModuleValues)[number] {
  return (operatorTicketModuleValues as readonly string[]).includes(value);
}

export type CreateTicketInput = {
  title: string;
  description: string;
  category: TicketCategory;
  subcategory?: string | null;
  impact: TicketImpact;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  sourceRoute?: string | null;
  errorCode?: string | null;
  appVersion?: string | null;
  browser?: string | null;
  operatingSystem?: string | null;
  deviceType?: string | null;
  contextMetadata?: unknown;
};

export type TicketActionResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export type TicketSummaryDTO = {
  code: string;
  title: string;
  category: TicketCategory;
  impact: TicketImpact;
  priority: TicketPriority | null;
  priorityLabel: string | null;
  status: TicketStatus;
  scope: TicketScope;
  branch: { code: string; name: string } | null;
  assignedLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketCommentDTO = {
  content: string;
  visibility: "PUBLIC" | "INTERNAL";
  authorLabel: string;
  createdAt: string;
};

export type TicketParticipantDTO = {
  type: TicketParticipantType;
  label: string;
  createdAt: string;
};

export type TicketEventDTO = {
  action: string;
  actorLabel: string;
  fromValue: string | null;
  toValue: string | null;
  metadata: unknown;
  createdAt: string;
};

export type TicketDetailDTO = TicketSummaryDTO & {
  description: string;
  subcategory: string | null;
  relatedEntityType: string | null;
  relatedEntityReference: string | null;
  sourceRoute: string | null;
  errorCode: string | null;
  appVersion: string | null;
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string | null;
  duplicateOfCode: string | null;
  globalIncidentCode: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  comments: TicketCommentDTO[];
  participants: TicketParticipantDTO[];
  events: TicketEventDTO[];
};

export type OperatorTicketListInput = {
  keyword?: string;
  status?: string;
  priority?: string;
  impact?: string;
  category?: string;
  scope?: string;
  branch?: string;
  assignedOperator?: string;
  unassignedOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
  duplicate?: "all" | "duplicate" | "primary";
  globalRelation?: "all" | "linked" | "unlinked" | "global";
  page?: number;
  pageSize?: number;
};

export type OperatorTicketSummaryDTO = {
  code: string;
  title: string;
  category: TicketCategory;
  impact: TicketImpact;
  priority: TicketPriority;
  status: TicketStatus;
  scope: TicketScope;
  branchLabel: string | null;
  requesterRoleLabel: string;
  assignedOperatorLabel: string | null;
  createdAt: string;
  updatedAt: string;
  isDuplicate: boolean;
  hasGlobalIncident: boolean;
  isGlobalIncident: boolean;
};

export type OperatorTicketMetricsDTO = {
  open: number;
  unassigned: number;
  critical: number;
  waitingForUser: number;
  inProgress: number;
  resolved: number;
  reopened: number;
  branchIncidents: number;
  globalIncidents: number;
};

export type OperatorTicketListResultDTO = {
  tickets: OperatorTicketSummaryDTO[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export type OperatorBranchOptionDTO = {
  code: string;
  label: string;
};

export type OperatorUserOptionDTO = {
  email: string;
  label: string;
  roleLabel: string;
  branchLabel: string | null;
};

export type OperatorTicketOptionsDTO = {
  branches: OperatorBranchOptionDTO[];
  operators: OperatorUserOptionDTO[];
  requesters: OperatorUserOptionDTO[];
  globalIncidents: { code: string; title: string }[];
};

export type OperatorRootCauseDTO = {
  summary: string;
  correctiveAction: string | null;
  preventionNotes: string | null;
  actorLabel: string;
  createdAt: string;
};

export type OperatorTicketDetailDTO = {
  code: string;
  title: string;
  description: string;
  category: TicketCategory;
  subcategory: string | null;
  impact: TicketImpact;
  priority: TicketPriority;
  status: TicketStatus;
  scope: TicketScope;
  branch: { code: string; label: string } | null;
  requesterLabel: string;
  requesterRoleLabel: string;
  assignedOperatorLabel: string | null;
  relatedEntityType: string | null;
  relatedEntityReference: string | null;
  sourceRoute: string | null;
  errorCode: string | null;
  appVersion: string | null;
  browser: string | null;
  operatingSystem: string | null;
  deviceType: string | null;
  duplicateOfCode: string | null;
  globalIncidentCode: string | null;
  linkedTicketCodes: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  comments: TicketCommentDTO[];
  participants: TicketParticipantDTO[];
  events: TicketEventDTO[];
  rootCauses: OperatorRootCauseDTO[];
};

export type CreateOperatorTicketInput = {
  title: string;
  description: string;
  category: TicketCategory;
  subcategory?: string | null;
  impact: TicketImpact;
  priority?: TicketPriority | null;
  scope: TicketScope;
  branchCode?: string | null;
  requesterEmail?: string | null;
  relatedEntityType?: string | null;
  relatedEntityReference?: string | null;
  sourceRoute?: string | null;
  errorCode?: string | null;
  contextMetadata?: unknown;
};

export type UpdateTicketClassificationInput = {
  code: string;
  category: TicketCategory;
  subcategory?: string | null;
  impact: TicketImpact;
  scope: TicketScope;
  branchCode?: string | null;
  relatedEntityType?: string | null;
  relatedEntityReference?: string | null;
};

export type RecordRootCauseInput = {
  code: string;
  summary: string;
  correctiveAction?: string | null;
  preventionNotes?: string | null;
};
