import type { SupportScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";

export type SafeTechnicalAuditEventDTO = {
  actionLabel: string;
  targetLabel: string;
  createdAt: string;
};

export type SafeTechnicalAuditCountDTO = {
  label: string;
  count: number;
};

export type SupportDashboardDTO = {
  databaseConfigured: boolean;
  databaseReachable: boolean;
  technicalAuditAvailable: boolean;
  totalTechnicalEvents: number | null;
  eventCounts: SafeTechnicalAuditCountDTO[];
  recentEvents: SafeTechnicalAuditEventDTO[];
};

const actionLabels: Readonly<Record<string, string>> = {
  USER_CREATED: "Creación de usuario",
};

const targetLabels: Readonly<Record<string, string>> = {
  User: "Cuenta interna",
};

function safeActionLabel(value: string): string {
  return actionLabels[value] ?? "Evento técnico";
}

function safeTargetLabel(value: string): string {
  return targetLabels[value] ?? "Recurso interno";
}

function combineSafeCounts(
  rows: { action: string; _count: { _all: number } }[],
): SafeTechnicalAuditCountDTO[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const label = safeActionLabel(row.action);
    totals.set(label, (totals.get(label) ?? 0) + row._count._all);
  }
  return [...totals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

/**
 * Support-only, read-only dashboard query. The explicit Prisma select excludes
 * actor, target IDs and descriptions, and unknown database labels are replaced
 * instead of being rendered verbatim. Connection errors never leave this layer.
 */
export async function getSupportDashboard(
  scope: SupportScope,
  allowTechnicalAudit: boolean,
): Promise<SupportDashboardDTO> {
  const databaseConfigured = isDatabaseConfigured();
  const empty: SupportDashboardDTO = {
    databaseConfigured,
    databaseReachable: false,
    technicalAuditAvailable: false,
    totalTechnicalEvents: null,
    eventCounts: [],
    recentEvents: [],
  };

  if (
    scope.level === "none" ||
    !allowTechnicalAudit ||
    !databaseConfigured
  ) {
    return empty;
  }

  try {
    const prisma = getPrisma();
    const [totalTechnicalEvents, groupedEvents, recentEvents] =
      await Promise.all([
        prisma.userAuditLog.count(),
        prisma.userAuditLog.groupBy({
          by: ["action"],
          _count: { _all: true },
        }),
        prisma.userAuditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            action: true,
            targetType: true,
            createdAt: true,
          },
        }),
      ]);

    return {
      databaseConfigured: true,
      databaseReachable: true,
      technicalAuditAvailable: true,
      totalTechnicalEvents,
      eventCounts: combineSafeCounts(groupedEvents),
      recentEvents: recentEvents.map((event) => ({
        actionLabel: safeActionLabel(event.action),
        targetLabel: safeTargetLabel(event.targetType),
        createdAt: event.createdAt.toISOString(),
      })),
    };
  } catch {
    return empty;
  }
}
