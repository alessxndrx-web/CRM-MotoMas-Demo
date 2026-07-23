"use server";

import { Prisma, type TicketPriority } from "@prisma/client";

import { canOperateTickets } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  generateTicketCodeCandidate,
  TICKET_CODE_ATTEMPTS,
} from "@/server/tickets/code";
import { impactToInitialPriority, isClosedTicket } from "@/server/tickets/permissions";
import {
  sanitizeOptionalTicketText,
  sanitizeTicketMetadata,
  sanitizeTicketText,
} from "@/server/tickets/sanitize";
import {
  isTicketCategory,
  isTicketImpact,
  isOperatorTicketModule,
  isTicketPriority,
  isTicketScope,
  type CreateOperatorTicketInput,
  type RecordRootCauseInput,
  type TicketActionResult,
  type UpdateTicketClassificationInput,
} from "@/server/tickets/types";

const DB_REQUIRED = "Esta accion requiere una base de datos configurada.";
const NO_PERMISSION = "No tienes permiso para operar tickets.";
const INVALID = "Revisa la clasificacion del ticket.";
const NOT_FOUND = "El ticket o la referencia autorizada no existe.";
const CLOSED = "El ticket cerrado debe reabrirse antes de modificarse.";
const UNAVAILABLE = "No fue posible completar la operacion de ticket.";

function normalizeCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^TKT-\d{4}-\d{5}$/.test(code) ? code : null;
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : null;
}

function requiredText(value: string, maxLength: number): string | null {
  const clean = sanitizeTicketText(value, maxLength);
  return clean || null;
}

async function operatorSession() {
  const session = await requireAuth();
  return canOperateTickets(session.roleEnum) ? session : null;
}

async function resolveActiveBranch(code: string | null | undefined) {
  if (!code) return null;
  return getPrisma().branch.findFirst({
    where: { code, isActive: true },
    select: { id: true, code: true },
  });
}

export async function createOperatorTicketAction(
  input: CreateOperatorTicketInput,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await operatorSession();
  if (!session) return { ok: false, error: NO_PERMISSION };
  if (
    !isTicketCategory(String(input.category)) ||
    !isTicketImpact(String(input.impact)) ||
    !isTicketScope(String(input.scope)) ||
    (input.priority && !isTicketPriority(String(input.priority)))
  ) {
    return { ok: false, error: INVALID };
  }

  const title = requiredText(input.title, 160);
  const description = requiredText(input.description, 8_000);
  const moduleKey = sanitizeOptionalTicketText(input.relatedEntityType, 80);
  const relatedReference = sanitizeOptionalTicketText(
    input.relatedEntityReference,
    160,
  );
  if (
    !title ||
    !description ||
    (input.scope === "MODULE" &&
      (!moduleKey || !isOperatorTicketModule(moduleKey)))
  ) {
    return { ok: false, error: INVALID };
  }

  try {
    const prisma = getPrisma();
    const requesterEmail = normalizeEmail(input.requesterEmail);
    const requester =
      input.scope === "USER" && requesterEmail
        ? await prisma.user.findUnique({
            where: { email: requesterEmail },
            select: { id: true, role: true, branchId: true, isActive: true },
          })
        : null;
    if (input.scope === "USER" && (!requester || !requester.isActive)) {
      return { ok: false, error: "Selecciona un solicitante interno activo." };
    }

    const branch =
      input.scope === "BRANCH" ||
      (input.scope === "MODULE" && Boolean(input.branchCode))
        ? await resolveActiveBranch(input.branchCode)
        : null;
    if (input.scope === "BRANCH" && !branch) {
      return { ok: false, error: "Selecciona una sucursal valida." };
    }
    if (input.scope === "MODULE" && input.branchCode && !branch) {
      return { ok: false, error: "La sucursal indicada no es valida." };
    }

    const branchId =
      input.scope === "GLOBAL"
        ? null
        : input.scope === "USER"
          ? requester?.branchId ?? null
          : branch?.id ?? null;
    const priority: TicketPriority = input.priority ?? impactToInitialPriority[input.impact];
    const participants = [
      { userId: session.uid, type: "CREATOR" as const, addedById: session.uid },
      ...(requester && requester.id !== session.uid
        ? [{ userId: requester.id, type: "REQUESTER" as const, addedById: session.uid }]
        : []),
    ];
    const scopeMetadata = sanitizeTicketMetadata({
      branchCode: branch?.code ?? null,
      module: moduleKey,
      requesterRole: requester?.role ?? null,
    });

    for (let attempt = 0; attempt < TICKET_CODE_ATTEMPTS; attempt += 1) {
      const code = generateTicketCodeCandidate();
      try {
        const ticket = await prisma.supportTicket.create({
          data: {
            code,
            title,
            description,
            category: input.category,
            subcategory: sanitizeOptionalTicketText(input.subcategory, 120),
            impact: input.impact,
            priority,
            status: "NUEVO",
            scope: input.scope,
            createdById: session.uid,
            createdByRole: session.roleEnum,
            branchId,
            relatedEntityType: moduleKey,
            relatedEntityId: relatedReference,
            sourceRoute: sanitizeOptionalTicketText(input.sourceRoute, 300),
            errorCode: sanitizeOptionalTicketText(input.errorCode, 160),
            participants: { create: participants },
            events: {
              create: [
                {
                  actorId: session.uid,
                  action: "CREATED",
                  toValue: "NUEVO",
                  metadata: sanitizeTicketMetadata(input.contextMetadata),
                },
                {
                  actorId: session.uid,
                  action: "SCOPE_CLASSIFIED",
                  toValue: input.scope,
                  metadata: scopeMetadata,
                },
              ],
            },
          },
          select: { code: true },
        });
        return { ok: true, code: ticket.code };
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
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

type ClassificationEvent = {
  action: string;
  fromValue: string | null;
  toValue: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function updateTicketClassificationAction(
  input: UpdateTicketClassificationInput,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await operatorSession();
  if (!session) return { ok: false, error: NO_PERMISSION };
  const code = normalizeCode(input.code);
  if (
    !code ||
    !isTicketCategory(String(input.category)) ||
    !isTicketImpact(String(input.impact)) ||
    !isTicketScope(String(input.scope))
  ) {
    return { ok: false, error: INVALID };
  }

  const subcategory = sanitizeOptionalTicketText(input.subcategory, 120);
  const moduleKey = sanitizeOptionalTicketText(input.relatedEntityType, 80);
  const relatedReference = sanitizeOptionalTicketText(
    input.relatedEntityReference,
    160,
  );
  if (
    input.scope === "MODULE" &&
    (!moduleKey || !isOperatorTicketModule(moduleKey))
  ) {
    return { ok: false, error: INVALID };
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        status: true,
        category: true,
        subcategory: true,
        impact: true,
        scope: true,
        branchId: true,
        branch: { select: { code: true } },
        relatedEntityType: true,
        relatedEntityId: true,
        createdBy: { select: { branchId: true, branch: { select: { code: true } } } },
        participants: {
          where: { type: "REQUESTER" },
          take: 1,
          select: {
            user: {
              select: { branchId: true, branch: { select: { code: true } } },
            },
          },
        },
        _count: { select: { linkedTickets: true } },
      },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    if (
      ticket.scope === "GLOBAL" &&
      input.scope !== "GLOBAL" &&
      ticket._count.linkedTickets > 0
    ) {
      return {
        ok: false,
        error: "Desvincula los tickets del incidente global antes de reducir su alcance.",
      };
    }

    const requestedBranch =
      input.scope === "BRANCH" ||
      (input.scope === "MODULE" && Boolean(input.branchCode))
        ? await resolveActiveBranch(input.branchCode)
        : null;
    if (input.scope === "BRANCH" && !requestedBranch) {
      return { ok: false, error: "Selecciona una sucursal valida." };
    }
    if (input.scope === "MODULE" && input.branchCode && !requestedBranch) {
      return { ok: false, error: "La sucursal indicada no es valida." };
    }
    const requesterBranchId =
      ticket.participants[0]?.user.branchId ?? ticket.createdBy?.branchId ?? null;
    const requesterBranchCode =
      ticket.participants[0]?.user.branch?.code ??
      ticket.createdBy?.branch?.code ??
      null;
    const branchId =
      input.scope === "GLOBAL"
        ? null
        : input.scope === "USER"
          ? requesterBranchId
          : requestedBranch?.id ?? null;
    const branchCode =
      input.scope === "USER"
        ? requesterBranchCode
        : requestedBranch?.code ?? null;

    const events: ClassificationEvent[] = [];
    const add = (
      changed: boolean,
      action: string,
      fromValue: string | null,
      toValue: string | null,
      metadata?: Prisma.InputJsonValue,
    ) => {
      if (changed) events.push({ action, fromValue, toValue, metadata });
    };
    add(ticket.category !== input.category, "CATEGORY_CHANGED", ticket.category, input.category);
    add(ticket.subcategory !== subcategory, "SUBCATEGORY_CHANGED", ticket.subcategory, subcategory);
    add(ticket.impact !== input.impact, "IMPACT_CHANGED", ticket.impact, input.impact);
    add(
      ticket.scope !== input.scope,
      "SCOPE_CLASSIFIED",
      ticket.scope,
      input.scope,
      sanitizeTicketMetadata({ branchCode, module: moduleKey }),
    );
    add(
      ticket.branchId !== branchId,
      "BRANCH_CLASSIFIED",
      ticket.branch?.code ?? null,
      branchCode,
    );
    add(
      ticket.relatedEntityType !== moduleKey,
      "MODULE_CLASSIFIED",
      ticket.relatedEntityType,
      moduleKey,
    );
    add(
      ticket.relatedEntityId !== relatedReference,
      "RELATED_REFERENCE_CHANGED",
      ticket.relatedEntityId,
      relatedReference,
    );
    if (events.length === 0) return { ok: true, code: ticket.code };

    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          category: input.category,
          subcategory,
          impact: input.impact,
          scope: input.scope,
          branchId,
          relatedEntityType: moduleKey,
          relatedEntityId: relatedReference,
        },
      });
      for (const event of events) {
        await tx.ticketEvent.create({
          data: {
            ticketId: ticket.id,
            actorId: session.uid,
            action: event.action,
            fromValue: event.fromValue,
            toValue: event.toValue,
            metadata: event.metadata,
          },
        });
      }
    });
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function recordRootCauseAction(
  input: RecordRootCauseInput,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await operatorSession();
  if (!session) return { ok: false, error: NO_PERMISSION };
  const code = normalizeCode(input.code);
  const summary = requiredText(input.summary, 2_000);
  if (!code || !summary) return { ok: false, error: INVALID };

  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findUnique({
      where: { code },
      select: { id: true, code: true, status: true },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    await prisma.ticketEvent.create({
      data: {
        ticketId: ticket.id,
        actorId: session.uid,
        action: "ROOT_CAUSE_RECORDED",
        metadata: sanitizeTicketMetadata({
          summary,
          correctiveAction: sanitizeOptionalTicketText(input.correctiveAction, 2_000),
          preventionNotes: sanitizeOptionalTicketText(input.preventionNotes, 2_000),
        }),
      },
    });
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}

export async function unlinkGlobalIncidentAction(
  rawCode: string,
): Promise<TicketActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };
  const session = await operatorSession();
  if (!session) return { ok: false, error: NO_PERMISSION };
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: INVALID };
  try {
    const prisma = getPrisma();
    const ticket = await prisma.supportTicket.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        status: true,
        globalIncident: { select: { code: true } },
      },
    });
    if (!ticket) return { ok: false, error: NOT_FOUND };
    if (isClosedTicket(ticket.status)) return { ok: false, error: CLOSED };
    if (!ticket.globalIncident) return { ok: true, code: ticket.code };
    await prisma.$transaction([
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { globalIncidentId: null },
      }),
      prisma.ticketEvent.create({
        data: {
          ticketId: ticket.id,
          actorId: session.uid,
          action: "UNLINKED_GLOBAL_INCIDENT",
          fromValue: ticket.globalIncident.code,
        },
      }),
    ]);
    return { ok: true, code: ticket.code };
  } catch {
    return { ok: false, error: UNAVAILABLE };
  }
}
