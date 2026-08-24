import type { Prisma, UserRole } from "@prisma/client";

import { canOperateTickets } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { roleEnumToSpanish } from "@/server/auth/roles";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  sanitizeOptionalTicketText,
  sanitizeTicketMetadata,
  sanitizeTicketText,
} from "@/server/tickets/sanitize";
import {
  isTicketCategory,
  isTicketImpact,
  isTicketPriority,
  isTicketScope,
  isTicketStatus,
  type OperatorRootCauseDTO,
  type OperatorTicketDetailDTO,
  type OperatorTicketListInput,
  type OperatorTicketListResultDTO,
  type OperatorTicketMetricsDTO,
  type OperatorTicketOptionsDTO,
} from "@/server/tickets/types";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const OPTION_LIMIT = 200;
const CLOSED_STATUSES = ["RESUELTO", "CERRADO", "CANCELADO"] as const;

function roleLabel(role: UserRole | null): string {
  return role ? roleEnumToSpanish[role] : "Rol no disponible";
}

function normalizedCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^TKT-\d{4}-\d{5}$/.test(code) ? code : null;
}

function parseDate(value: string | undefined, endOfDay = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function operatorAuthorized(): Promise<boolean> {
  const session = await requireAuth();
  return canOperateTickets(session.roleEnum);
}

function buildOperatorWhere(
  input: OperatorTicketListInput,
): Prisma.SupportTicketWhereInput {
  const AND: Prisma.SupportTicketWhereInput[] = [];
  const keyword = sanitizeTicketText(input.keyword ?? "", 120);
  if (keyword) {
    AND.push({
      OR: [
        { code: { contains: keyword.toUpperCase(), mode: "insensitive" } },
        { title: { contains: keyword, mode: "insensitive" } },
        { subcategory: { contains: keyword, mode: "insensitive" } },
      ],
    });
  }
  if (input.status && isTicketStatus(input.status)) AND.push({ status: input.status });
  if (input.priority && isTicketPriority(input.priority)) {
    AND.push({ priority: input.priority });
  }
  if (input.impact && isTicketImpact(input.impact)) AND.push({ impact: input.impact });
  if (input.category && isTicketCategory(input.category)) {
    AND.push({ category: input.category });
  }
  if (input.scope && isTicketScope(input.scope)) AND.push({ scope: input.scope });
  if (input.branch) AND.push({ branch: { code: input.branch } });
  if (input.unassignedOnly) {
    AND.push({ assignedToId: null });
  } else if (input.assignedOperator) {
    AND.push({ assignedTo: { email: input.assignedOperator.toLowerCase() } });
  }
  const from = parseDate(input.dateFrom);
  const to = parseDate(input.dateTo, true);
  if (from || to) {
    AND.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  }
  if (input.duplicate === "duplicate") AND.push({ duplicateOfId: { not: null } });
  if (input.duplicate === "primary") AND.push({ duplicateOfId: null });
  if (input.globalRelation === "linked") AND.push({ globalIncidentId: { not: null } });
  if (input.globalRelation === "unlinked") AND.push({ globalIncidentId: null });
  if (input.globalRelation === "global") AND.push({ scope: "GLOBAL" });
  return AND.length > 0 ? { AND } : {};
}

export async function listOperatorTickets(
  input: OperatorTicketListInput,
): Promise<OperatorTicketListResultDTO | null> {
  if (!isDatabaseConfigured() || !(await operatorAuthorized())) return null;
  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_PAGE_SIZE)),
  );
  const where = buildOperatorWhere(input);
  const prisma = getPrisma();
  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        code: true,
        title: true,
        category: true,
        impact: true,
        priority: true,
        status: true,
        scope: true,
        createdByRole: true,
        createdAt: true,
        updatedAt: true,
        branch: { select: { name: true } },
        assignedTo: { select: { name: true } },
        participants: {
          where: { type: "REQUESTER" },
          take: 1,
          select: { user: { select: { role: true } } },
        },
        duplicateOfId: true,
        globalIncidentId: true,
      },
    }),
  ]);

  return {
    tickets: rows.map((row) => ({
      code: row.code,
      title: sanitizeTicketText(row.title, 160),
      category: row.category,
      impact: row.impact,
      priority: row.priority,
      status: row.status,
      scope: row.scope,
      branchLabel: row.branch ? sanitizeTicketText(row.branch.name, 160) : null,
      requesterRoleLabel: roleLabel(
        row.participants[0]?.user.role ?? row.createdByRole,
      ),
      assignedOperatorLabel: row.assignedTo
        ? sanitizeTicketText(row.assignedTo.name, 160)
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      isDuplicate: Boolean(row.duplicateOfId),
      hasGlobalIncident: Boolean(row.globalIncidentId),
      isGlobalIncident: row.scope === "GLOBAL",
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOperatorTicketMetrics(): Promise<OperatorTicketMetricsDTO | null> {
  if (!isDatabaseConfigured() || !(await operatorAuthorized())) return null;
  const prisma = getPrisma();
  const active = { status: { notIn: [...CLOSED_STATUSES] } } satisfies Prisma.SupportTicketWhereInput;
  const [open, unassigned, critical, waitingForUser, inProgress, resolved, reopened, branchIncidents, globalIncidents] =
    await Promise.all([
      prisma.supportTicket.count({ where: active }),
      prisma.supportTicket.count({ where: { ...active, assignedToId: null } }),
      prisma.supportTicket.count({ where: { ...active, priority: "P1_CRITICA" } }),
      prisma.supportTicket.count({ where: { status: "PENDIENTE_USUARIO" } }),
      prisma.supportTicket.count({ where: { status: "EN_PROGRESO" } }),
      prisma.supportTicket.count({ where: { status: "RESUELTO" } }),
      prisma.supportTicket.count({ where: { status: "REABIERTO" } }),
      prisma.supportTicket.count({ where: { scope: "BRANCH" } }),
      prisma.supportTicket.count({ where: { scope: "GLOBAL" } }),
    ]);
  return {
    open,
    unassigned,
    critical,
    waitingForUser,
    inProgress,
    resolved,
    reopened,
    branchIncidents,
    globalIncidents,
  };
}

export async function getOperatorTicketOptions(): Promise<OperatorTicketOptionsDTO | null> {
  if (!isDatabaseConfigured() || !(await operatorAuthorized())) return null;
  const prisma = getPrisma();
  const [branches, operators, requesters, globalIncidents] = await Promise.all([
    prisma.branch.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: OPTION_LIMIT,
      select: { code: true, name: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, role: { in: ["ADMIN", "SOPORTE_TECNICO"] } },
      orderBy: { name: "asc" },
      take: OPTION_LIMIT,
      select: { email: true, name: true, role: true, branch: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: OPTION_LIMIT,
      select: { email: true, name: true, role: true, branch: { select: { name: true } } },
    }),
    prisma.supportTicket.findMany({
      where: { scope: "GLOBAL" },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { code: true, title: true },
    }),
  ]);
  const mapUser = (user: (typeof operators)[number]) => ({
    email: user.email,
    label: sanitizeTicketText(user.name, 160),
    roleLabel: roleLabel(user.role),
    branchLabel: user.branch ? sanitizeTicketText(user.branch.name, 160) : null,
  });
  return {
    branches: branches.map((branch) => ({ code: branch.code, label: branch.name })),
    operators: operators.map(mapUser),
    requesters: requesters.map(mapUser),
    globalIncidents: globalIncidents.map((ticket) => ({
      code: ticket.code,
      title: sanitizeTicketText(ticket.title, 160),
    })),
  };
}

function rootCauseFromEvent(event: {
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  actor: { name: string } | null;
}): OperatorRootCauseDTO | null {
  const safe = sanitizeTicketMetadata(event.metadata);
  if (!safe || Array.isArray(safe) || typeof safe !== "object") return null;
  const record = safe as Record<string, unknown>;
  const summary = sanitizeOptionalTicketText(String(record.summary ?? ""), 2_000);
  if (!summary) return null;
  return {
    summary,
    correctiveAction: sanitizeOptionalTicketText(
      String(record.correctiveAction ?? ""),
      2_000,
    ),
    preventionNotes: sanitizeOptionalTicketText(
      String(record.preventionNotes ?? ""),
      2_000,
    ),
    actorLabel: event.actor
      ? sanitizeTicketText(event.actor.name, 160)
      : "Sistema",
    createdAt: event.createdAt.toISOString(),
  };
}

export async function getOperatorTicketDetail(
  rawCode: string,
): Promise<OperatorTicketDetailDTO | null> {
  if (!isDatabaseConfigured() || !(await operatorAuthorized())) return null;
  const code = normalizedCode(rawCode);
  if (!code) return null;
  const ticket = await getPrisma().supportTicket.findUnique({
    where: { code },
    select: {
      code: true,
      title: true,
      description: true,
      category: true,
      subcategory: true,
      impact: true,
      priority: true,
      status: true,
      scope: true,
      relatedEntityType: true,
      relatedEntityId: true,
      sourceRoute: true,
      errorCode: true,
      appVersion: true,
      browser: true,
      operatingSystem: true,
      deviceType: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
      closedAt: true,
      createdByRole: true,
      createdBy: { select: { name: true, role: true } },
      branch: { select: { code: true, name: true } },
      assignedTo: { select: { name: true } },
      duplicateOf: { select: { code: true } },
      globalIncident: { select: { code: true } },
      linkedTickets: { select: { code: true }, orderBy: { createdAt: "desc" }, take: 100 },
      participants: {
        select: {
          type: true,
          createdAt: true,
          user: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      comments: {
        select: {
          content: true,
          visibility: true,
          createdAt: true,
          author: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      events: {
        select: {
          action: true,
          fromValue: true,
          toValue: true,
          metadata: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) return null;

  const requesterParticipant = ticket.participants.find(
    (participant) => participant.type === "REQUESTER",
  );
  const requester = requesterParticipant?.user ?? ticket.createdBy;
  const rootCauses = ticket.events
    .filter((event) => event.action === "ROOT_CAUSE_RECORDED")
    .map(rootCauseFromEvent)
    .filter((event): event is OperatorRootCauseDTO => Boolean(event));

  return {
    code: ticket.code,
    title: sanitizeTicketText(ticket.title, 160),
    description: sanitizeTicketText(ticket.description),
    category: ticket.category,
    subcategory: sanitizeOptionalTicketText(ticket.subcategory, 120),
    impact: ticket.impact,
    priority: ticket.priority,
    status: ticket.status,
    scope: ticket.scope,
    branch: ticket.branch
      ? { code: ticket.branch.code, label: sanitizeTicketText(ticket.branch.name, 160) }
      : null,
    requesterLabel: requester ? sanitizeTicketText(requester.name, 160) : "Solicitante no disponible",
    requesterRoleLabel: roleLabel(requester?.role ?? ticket.createdByRole),
    assignedOperatorLabel: ticket.assignedTo
      ? sanitizeTicketText(ticket.assignedTo.name, 160)
      : null,
    relatedEntityType: sanitizeOptionalTicketText(ticket.relatedEntityType, 80),
    relatedEntityReference: sanitizeOptionalTicketText(ticket.relatedEntityId, 160),
    sourceRoute: sanitizeOptionalTicketText(ticket.sourceRoute, 300),
    errorCode: sanitizeOptionalTicketText(ticket.errorCode, 160),
    appVersion: sanitizeOptionalTicketText(ticket.appVersion, 80),
    browser: sanitizeOptionalTicketText(ticket.browser, 200),
    operatingSystem: sanitizeOptionalTicketText(ticket.operatingSystem, 120),
    deviceType: sanitizeOptionalTicketText(ticket.deviceType, 80),
    duplicateOfCode: ticket.duplicateOf?.code ?? null,
    globalIncidentCode: ticket.globalIncident?.code ?? null,
    linkedTicketCodes: ticket.linkedTickets.map((entry) => entry.code),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    comments: ticket.comments.map((comment) => ({
      content: sanitizeTicketText(comment.content, 4_000),
      visibility: comment.visibility,
      authorLabel: comment.author
        ? sanitizeTicketText(comment.author.name, 160)
        : "Usuario no disponible",
      createdAt: comment.createdAt.toISOString(),
    })),
    participants: ticket.participants.map((participant) => ({
      type: participant.type,
      label: sanitizeTicketText(participant.user.name, 160),
      createdAt: participant.createdAt.toISOString(),
    })),
    events: ticket.events
      .filter((event) => event.action !== "ROOT_CAUSE_RECORDED")
      .map((event) => ({
        action: event.action,
        actorLabel: event.actor
          ? sanitizeTicketText(event.actor.name, 160)
          : "Sistema",
        fromValue: sanitizeOptionalTicketText(event.fromValue),
        toValue: sanitizeOptionalTicketText(event.toValue),
        metadata: sanitizeTicketMetadata(event.metadata) ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
    rootCauses,
  };
}
