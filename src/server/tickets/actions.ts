"use server";

import { Prisma, type TicketStatus } from "@prisma/client";

import {
  canCreateTicket,
  canOperateTickets,
  canWriteInternalNote,
} from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import type { SessionPayload } from "@/server/auth/session";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  generateTicketCodeCandidate,
  TICKET_CODE_ATTEMPTS,
} from "@/server/tickets/code";
import {
  canTransitionTicketStatus,
  impactToInitialPriority,
  isClosedTicket,
  ticketVisibilityWhere,
} from "@/server/tickets/permissions";
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
  type CreateTicketInput,
  type TicketActionResult,
} from "@/server/tickets/types";

const DB_REQUIRED =
  "Esta accion requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para realizar esta accion de ticket.";
const NOT_FOUND = "El ticket no existe o no esta dentro de tu alcance.";
const INVALID = "Revisa los datos del ticket.";
const CLOSED = "El ticket cerrado no se puede modificar; debe reabrirse primero.";
const UNAVAILABLE = "No fue posible completar la accion de ticket.";

function normalizeTicketCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^TKT-\d{4}-\d{5}$/.test(code) ? code : null;
}

function validRequiredText(value: string, maxLength: number): string | null {
  const clean = sanitizeTicketText(value, maxLength);
  return clean ? clean : null;
}

async function resolveSessionBranchId(
  session: SessionPayload,
): Promise<string | null> {
  if (session.branchId === "all" || !session.branchId) return null;
  const branch = await getPrisma().branch.findUnique({
    where: { code: session.branchId },
    select: { id: true },
  });
  return branch?.id ?? null;
}

async function findVisibleTicket(
  session: SessionPayload,
  code: string,
) {
  return getPrisma().supportTicket.findFirst({
    where: { AND: [{ code }, await ticketVisibilityWhere(session)] },
    select: {
      id: true,
      code: true,
      status: true,
      priority: true,
      createdById: true,
      assignedToId: true,
    },
  });
}

async function createTicketRecord(
  session: SessionPayload,
  branchId: string | null,
  data: {
    title: string;
    description: string;
    category: CreateTicketInput["category"];
    subcategory: string | null;
    impact: CreateTicketInput["impact"];
    scope: NonNullable<CreateTicketInput["scope"]>;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    sourceRoute: string | null;
    errorCode: string | null;
    appVersion: string | null;
    browser: string | null;
    operatingSystem: string | null;
    deviceType: string | null;
    metadata: Prisma.InputJsonValue | undefined;
  },
): Promise<string> {
  const prisma = getPrisma();
  for (let attempt = 0; attempt < TICKET_CODE_ATTEMPTS; attempt += 1) {
    const code = generateTicketCodeCandidate();
    try {
      const ticket = await prisma.$transaction(async (tx) =>
        tx.supportTicket.create({
          data: {
            code,
            title: data.title,
            description: data.description,
            category: data.category,
            subcategory: data.subcategory,
            impact: data.impact,
            priority: impactToInitialPriority[data.impact],
            status: "NUEVO",
            scope: data.scope,
            createdById: session.uid,
            createdByRole: session.roleEnum,
            branchId,
            relatedEntityType: data.relatedEntityType,
            relatedEntityId: data.relatedEntityId,
            sourceRoute: data.sourceRoute,
            errorCode: data.errorCode,
            appVersion: data.appVersion,
            browser: data.browser,
            operatingSystem: data.operatingSystem,
            deviceType: data.deviceType,
            participants: {
              create: {
                userId: session.uid,
                type: "CREATOR",
                addedById: session.uid,
              },
            },
            events: {
              create: {
                actorId: session.uid,
                action: "CREATED",
                toValue: "NUEVO",
                metadata: data.metadata,
              },
            },
          },
          select: { code: true },
        }),
      );
      return ticket.code;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("TICKET_CODE_COLLISION");
}

export async function createTicketAction(
  input: CreateTicketInput,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canCreateTicket(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  if (!isTicketCategory(input.category) || !isTicketImpact(input.impact)) {
    return { ok: false, error: INVALID };
  }
  const scope = input.scope ?? "USER";
  if (!isTicketScope(scope)) return { ok: false, error: INVALID };
  const title = validRequiredText(input.title, 160);
  const description = validRequiredText(input.description, 8_000);
  if (!title || !description) return { ok: false, error: INVALID };

  try {
    const branchId = await resolveSessionBranchId(session);
    const code = await createTicketRecord(session, branchId, {
      title,
      description,
      category: input.category,
      subcategory: sanitizeOptionalTicketText(input.subcategory, 120),
      impact: input.impact,
      scope,
      relatedEntityType: sanitizeOptionalTicketText(input.relatedEntityType, 80),
      relatedEntityId: sanitizeOptionalTicketText(input.relatedEntityId, 160),
      sourceRoute: sanitizeOptionalTicketText(input.sourceRoute, 300),
      errorCode: sanitizeOptionalTicketText(input.errorCode, 160),
      appVersion: sanitizeOptionalTicketText(input.appVersion, 80),
      browser: sanitizeOptionalTicketText(input.browser, 200),
      operatingSystem: sanitizeOptionalTicketText(input.operatingSystem, 120),
      deviceType: sanitizeOptionalTicketText(input.deviceType, 80),
      metadata: sanitizeTicketMetadata(input.contextMetadata),
    });
    return { ok: true, code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

async function addComment(
  session: SessionPayload,
  ticket: { id: string; code: string; status: TicketStatus },
  content: string,
  visibility: "PUBLIC" | "INTERNAL",
): Promise<TicketActionResult> {
  if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      const writable = await tx.supportTicket.updateMany({
        where: { id: ticket.id, status: { not: "CERRADO" } },
        data: { updatedAt: new Date() },
      });
      if (writable.count !== 1) throw new Error("TICKET_CLOSED");
      await tx.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: session.uid,
          content,
          visibility,
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action:
            visibility === "INTERNAL"
              ? "INTERNAL_COMMENT_ADDED"
              : "COMMENT_ADDED",
        },
      });
    });
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function addPublicCommentAction(
  ticketCode: string,
  content: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  const code = normalizeTicketCode(ticketCode);
  const clean = validRequiredText(content, 4_000);
  if (!code || !clean) return { ok: false, error: INVALID };

  try {
    const ticket = await findVisibleTicket(session, code);
    if (!ticket) return { ok: false, error: NOT_FOUND };
    return addComment(session, ticket, clean, "PUBLIC");
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function addInternalCommentAction(
  ticketCode: string,
  content: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canWriteInternalNote(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  const code = normalizeTicketCode(ticketCode);
  const clean = validRequiredText(content, 4_000);
  if (!code || !clean) return { ok: false, error: INVALID };

  try {
    const ticket = await getPrisma().supportTicket.findUnique({
      where: { code },
      select: { id: true, code: true, status: true },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    return addComment(session, ticket, clean, "INTERNAL");
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function updateTicketStatusAction(
  ticketCode: string,
  nextStatus: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  const code = normalizeTicketCode(ticketCode);
  if (!code || !isTicketStatus(nextStatus)) {
    return { ok: false, error: INVALID };
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findUnique({
      where: { code },
      select: { id: true, code: true, status: true, resolvedAt: true },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    if (!canTransitionTicketStatus(ticket.status, nextStatus)) {
      return { ok: false, error: "La transicion de estado no esta permitida." };
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const changed = await tx.supportTicket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: {
          status: nextStatus,
          resolvedAt:
            nextStatus === "RESUELTO"
              ? now
              : nextStatus === "CERRADO"
                ? ticket.resolvedAt ?? now
                : undefined,
          closedAt: nextStatus === "CERRADO" ? now : undefined,
        },
      });
      if (changed.count !== 1) throw new Error("TICKET_CHANGED");
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "STATUS_CHANGED",
          fromValue: ticket.status,
          toValue: nextStatus,
        },
      });
    });
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function assignTicketAction(
  ticketCode: string,
  assigneeEmail: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  const code = normalizeTicketCode(ticketCode);
  const email = assigneeEmail.trim().toLowerCase();
  if (!code || !/^\S+@\S+\.\S+$/.test(email)) {
    return { ok: false, error: INVALID };
  }

  try {
    const prisma = getPrisma();
    const [ticket, assignee] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { code },
        select: {
          id: true,
          code: true,
          status: true,
          assignedToId: true,
          assignedTo: { select: { name: true } },
        },
      }),
      prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, role: true, isActive: true },
      }),
    ]);
    if (!ticket) return { ok: false, error: NOT_FOUND };
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    if (!assignee || !assignee.isActive || !canOperateTickets(assignee.role)) {
      return { ok: false, error: "El usuario asignado no es un operador valido." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { assignedToId: assignee.id },
      });
      await tx.ticketParticipant.deleteMany({
        where: { ticketId: ticket.id, type: "ASSIGNEE" },
      });
      await tx.ticketParticipant.create({
        data: {
          ticketId: ticket.id,
          userId: assignee.id,
          type: "ASSIGNEE",
          addedById: session.uid,
        },
      });
      await tx.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "ASSIGNED",
          fromValue: ticket.assignedTo?.name ?? null,
          toValue: sanitizeTicketText(assignee.name, 160),
        },
      });
    });
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function updateTicketPriorityAction(
  ticketCode: string,
  nextPriority: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  const code = normalizeTicketCode(ticketCode);
  if (!code || !isTicketPriority(nextPriority)) {
    return { ok: false, error: INVALID };
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findUnique({
      where: { code },
      select: { id: true, code: true, status: true, priority: true },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    if (ticket.priority === nextPriority) return { ok: true, code: ticket.code };

    await prisma.$transaction([
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { priority: nextPriority },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "PRIORITY_CHANGED",
          fromValue: ticket.priority,
          toValue: nextPriority,
        },
      }),
    ]);
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function markDuplicateAction(
  ticketCode: string,
  duplicateOfCode: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  const code = normalizeTicketCode(ticketCode);
  const targetCode = normalizeTicketCode(duplicateOfCode);
  if (!code || !targetCode || code === targetCode) {
    return { ok: false, error: INVALID };
  }

  try {
    const prisma = getPrisma();
    const [ticket, original] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { code },
        select: { id: true, code: true, status: true },
      }),
      prisma.supportTicket.findUnique({
        where: { code: targetCode },
        select: { id: true, code: true },
      }),
    ]);
    if (!ticket || !original) return { ok: false, error: NOT_FOUND };
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    await prisma.$transaction([
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { duplicateOfId: original.id },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "MARKED_DUPLICATE",
          toValue: original.code,
        },
      }),
    ]);
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function linkGlobalIncidentAction(
  ticketCode: string,
  globalIncidentCode: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  if (!canOperateTickets(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }
  const code = normalizeTicketCode(ticketCode);
  const targetCode = normalizeTicketCode(globalIncidentCode);
  if (!code || !targetCode || code === targetCode) {
    return { ok: false, error: INVALID };
  }

  try {
    const prisma = getPrisma();
    const [ticket, incident] = await Promise.all([
      prisma.supportTicket.findUnique({
        where: { code },
        select: { id: true, code: true, status: true },
      }),
      prisma.supportTicket.findUnique({
        where: { code: targetCode },
        select: { id: true, code: true, scope: true },
      }),
    ]);
    if (!ticket || !incident || incident.scope !== "GLOBAL") {
      return { ok: false, error: NOT_FOUND };
    }
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    await prisma.$transaction([
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { globalIncidentId: incident.id },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "LINKED_GLOBAL_INCIDENT",
          toValue: incident.code,
        },
      }),
    ]);
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function reopenTicketAction(
  ticketCode: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  const code = normalizeTicketCode(ticketCode);
  if (!code) return { ok: false, error: INVALID };

  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findUnique({
      where: { code },
      select: { id: true, code: true, status: true, createdById: true },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    const operator = canOperateTickets(session.roleEnum);
    const creator = ticket.createdById === session.uid;
    const creatorAllowed =
      creator && (ticket.status === "RESUELTO" || ticket.status === "CERRADO");
    const operatorAllowed =
      operator &&
      (ticket.status === "RESUELTO" ||
        ticket.status === "CERRADO" ||
        ticket.status === "CANCELADO");
    if (!creatorAllowed && !operatorAllowed) {
      return { ok: false, error: NO_PERMISSION };
    }

    await prisma.$transaction([
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "REABIERTO", resolvedAt: null, closedAt: null },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "REOPENED",
          fromValue: ticket.status,
          toValue: "REABIERTO",
          metadata: sanitizeTicketMetadata({ requestedByCreator: creator }),
        },
      }),
    ]);
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function cancelOwnTicketAction(
  ticketCode: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await requireAuth();
  const code = normalizeTicketCode(ticketCode);
  if (!code) return { ok: false, error: INVALID };

  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findFirst({
      where: { code, createdById: session.uid },
      select: { id: true, code: true, status: true },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    if (
      ticket.status === "RESUELTO" ||
      ticket.status === "CERRADO" ||
      ticket.status === "CANCELADO"
    ) {
      return { ok: false, error: "El ticket ya no se puede cancelar." };
    }

    await prisma.$transaction([
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "CANCELADO" },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "CANCELLED",
          fromValue: ticket.status,
          toValue: "CANCELADO",
        },
      }),
    ]);
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}
