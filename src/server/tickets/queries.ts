import type { Prisma } from "@prisma/client";

import {
  canViewOwnTickets,
  canWriteInternalNote,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import type { SessionPayload } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import { ticketVisibilityWhere } from "@/server/tickets/permissions";
import {
  sanitizeOptionalTicketText,
  sanitizeTicketMetadata,
  sanitizeTicketText,
} from "@/server/tickets/sanitize";
import {
  ticketPriorityLabels,
  type TicketDetailDTO,
  type TicketSummaryDTO,
} from "@/server/tickets/types";

const LIST_LIMIT = 200;

const summarySelect = {
  code: true,
  title: true,
  category: true,
  impact: true,
  priority: true,
  status: true,
  scope: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { code: true, name: true } },
  assignedTo: { select: { name: true } },
} satisfies Prisma.SupportTicketSelect;

type SummaryRow = Prisma.SupportTicketGetPayload<{
  select: typeof summarySelect;
}>;

function mapSummary(row: SummaryRow, privileged: boolean): TicketSummaryDTO {
  return {
    code: row.code,
    title: sanitizeTicketText(row.title, 160),
    category: row.category,
    impact: row.impact,
    priority: privileged ? row.priority : null,
    priorityLabel: privileged ? ticketPriorityLabels[row.priority] : null,
    status: row.status,
    scope: row.scope,
    branch: row.branch
      ? { code: row.branch.code, name: row.branch.name }
      : null,
    assignedLabel: row.assignedTo
      ? privileged
        ? row.assignedTo.name
        : "Equipo de soporte asignado"
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function ownParticipantWhere(userId: string): Prisma.SupportTicketWhereInput {
  return {
    OR: [
      { createdById: userId },
      { participants: { some: { userId } } },
    ],
  };
}

/** "Mis tickets" is deliberately own/participant-only, even for global roles. */
export async function listMyTickets(): Promise<TicketSummaryDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const session = await requireAuth();
  if (!canViewOwnTickets(session.roleEnum)) return [];

  const rows = await getPrisma().supportTicket.findMany({
    where: ownParticipantWhere(session.uid),
    select: summarySelect,
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
  });
  const privileged = canWriteInternalNote(session.roleEnum);
  return rows.map((row) => mapSummary(row, privileged));
}

/** Manager branch inbox / Admin and Soporte global inbox, always DB-scoped. */
export async function listScopedTickets(): Promise<TicketSummaryDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const session = await requireAuth();
  if (!canViewOwnTickets(session.roleEnum)) return [];

  const rows = await getPrisma().supportTicket.findMany({
    where: await ticketVisibilityWhere(session),
    select: summarySelect,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: LIST_LIMIT,
  });
  const privileged = canWriteInternalNote(session.roleEnum);
  return rows.map((row) => mapSummary(row, privileged));
}

function participantLabel(
  session: SessionPayload,
  privileged: boolean,
  participant: {
    userId: string;
    type: string;
    user: { name: string };
  },
): string {
  if (participant.userId === session.uid) return "Tu";
  if (privileged) return participant.user.name;
  if (participant.type === "CREATOR" || participant.type === "REQUESTER") {
    return "Solicitante";
  }
  if (participant.type === "ASSIGNEE") return "Equipo de soporte";
  return "Participante";
}

/**
 * Safe detail by public ticket code. The visibility predicate is part of the
 * Prisma WHERE clause, and INTERNAL comments are excluded in SQL for every
 * non-Admin/non-Soporte caller rather than filtered only after retrieval.
 */
export async function getTicketDetail(
  code: string,
): Promise<TicketDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const session = await requireAuth();
  if (!canViewOwnTickets(session.roleEnum)) return null;

  const privileged = canWriteInternalNote(session.roleEnum);
  const visibility = await ticketVisibilityWhere(session);
  const ticket = await getPrisma().supportTicket.findFirst({
    where: { AND: [{ code }, visibility] },
    select: {
      ...summarySelect,
      description: true,
      subcategory: true,
      relatedEntityType: true,
      relatedEntityId: true,
      sourceRoute: true,
      errorCode: true,
      appVersion: true,
      browser: true,
      operatingSystem: true,
      deviceType: true,
      resolvedAt: true,
      closedAt: true,
      duplicateOf: { select: { code: true } },
      globalIncident: { select: { code: true } },
      comments: {
        where: privileged ? {} : { visibility: "PUBLIC" },
        select: {
          content: true,
          visibility: true,
          createdAt: true,
          author: { select: { name: true, role: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      participants: {
        select: {
          userId: true,
          type: true,
          createdAt: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      events: {
        where: { action: { not: "ROOT_CAUSE_RECORDED" } },
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

  const summary = mapSummary(ticket, privileged);
  const visibleEvents = privileged
    ? ticket.events
    : ticket.events.filter(
        (event) =>
          event.action !== "INTERNAL_COMMENT_ADDED" &&
          event.action !== "PRIORITY_CHANGED",
      );

  return {
    ...summary,
    description: sanitizeTicketText(ticket.description),
    subcategory: sanitizeOptionalTicketText(ticket.subcategory),
    relatedEntityType: sanitizeOptionalTicketText(ticket.relatedEntityType),
    relatedEntityReference: privileged
      ? sanitizeOptionalTicketText(ticket.relatedEntityId)
      : null,
    sourceRoute: sanitizeOptionalTicketText(ticket.sourceRoute),
    errorCode: sanitizeOptionalTicketText(ticket.errorCode),
    appVersion: sanitizeOptionalTicketText(ticket.appVersion),
    browser: sanitizeOptionalTicketText(ticket.browser),
    operatingSystem: sanitizeOptionalTicketText(ticket.operatingSystem),
    deviceType: sanitizeOptionalTicketText(ticket.deviceType),
    duplicateOfCode: ticket.duplicateOf?.code ?? null,
    globalIncidentCode: ticket.globalIncident?.code ?? null,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    comments: ticket.comments.map((comment) => ({
      content: sanitizeTicketText(comment.content, 4_000),
      visibility: comment.visibility,
      authorLabel: comment.author
        ? privileged
          ? comment.author.name
          : comment.author.role === "ADMIN" ||
              comment.author.role === "SOPORTE_TECNICO"
            ? "Equipo de soporte"
            : "Usuario interno"
        : "Usuario no disponible",
      createdAt: comment.createdAt.toISOString(),
    })),
    participants: ticket.participants.map((participant) => ({
      type: participant.type,
      label: participantLabel(session, privileged, participant),
      createdAt: participant.createdAt.toISOString(),
    })),
    events: visibleEvents.map((event) => ({
      action: event.action,
      actorLabel: privileged
        ? event.actor?.name ?? "Sistema"
        : event.actor
          ? "Usuario interno"
          : "Sistema",
      fromValue:
        !privileged && event.action === "ASSIGNED"
          ? null
          : sanitizeOptionalTicketText(event.fromValue),
      toValue:
        !privileged && event.action === "ASSIGNED"
          ? "Equipo de soporte"
          : sanitizeOptionalTicketText(event.toValue),
      metadata: privileged
        ? sanitizeTicketMetadata(event.metadata) ?? null
        : null,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}
