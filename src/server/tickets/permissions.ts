import type {
  Prisma,
  TicketImpact,
  TicketPriority,
  TicketStatus,
} from "@prisma/client";

import { getTicketScopeForUser } from "@/server/auth/access";
import type { SessionPayload } from "@/server/auth/session";
import { getPrisma } from "@/server/db/prisma";

const personalVisibility = (userId: string): Prisma.SupportTicketWhereInput => ({
  OR: [
    { createdById: userId },
    { participants: { some: { userId } } },
  ],
});

/** Prisma filter that enforces role visibility before any ticket row is read. */
export async function ticketVisibilityWhere(
  session: SessionPayload,
): Promise<Prisma.SupportTicketWhereInput> {
  const scope = getTicketScopeForUser(session);
  if (scope.level === "global") return {};
  if (scope.level === "personal") return personalVisibility(scope.userId);

  const branch = scope.branchCode
    ? await getPrisma().branch.findUnique({
        where: { code: scope.branchCode },
        select: { id: true },
      })
    : null;

  const own = personalVisibility(scope.userId);
  if (!branch) return own;
  return {
    OR: [
      ...(own.OR ?? []),
      {
        branchId: branch.id,
        scope: { in: ["BRANCH", "MODULE", "GLOBAL"] },
        category: { notIn: ["ACCESO_Y_CUENTA", "SEGURIDAD"] },
      },
    ],
  };
}

export const impactToInitialPriority: Readonly<
  Record<TicketImpact, TicketPriority>
> = {
  CONSULTA: "P4_BAJA",
  AFECTA_UNA_TAREA: "P3_MEDIA",
  IMPIDE_TRABAJAR: "P2_ALTA",
  AFECTA_VARIOS_USUARIOS: "P2_ALTA",
  SISTEMA_INDISPONIBLE: "P1_CRITICA",
  RIESGO_SEGURIDAD: "P1_CRITICA",
};

const allowedStatusTransitions: Readonly<
  Record<TicketStatus, readonly TicketStatus[]>
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
  REABIERTO: [
    "EN_CLASIFICACION",
    "EN_PROGRESO",
    "PENDIENTE_USUARIO",
    "CANCELADO",
  ],
  CANCELADO: [],
};

export function canTransitionTicketStatus(
  from: TicketStatus,
  to: TicketStatus,
): boolean {
  return allowedStatusTransitions[from].includes(to);
}

export function isClosedTicket(status: TicketStatus): boolean {
  return status === "CERRADO";
}
