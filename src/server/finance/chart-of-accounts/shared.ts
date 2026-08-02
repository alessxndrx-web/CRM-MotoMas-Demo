import type {
  AccountNature,
  AccountType,
  ChartAccountOrigin,
} from "@prisma/client";

/**
 * Patch FF1.1 — client-safe contracts for the chart-of-accounts foundation.
 *
 * Pure values, types and predicates: no Prisma client, no session, no database
 * access. Everything here is safe to import from a client component, which is
 * why `@/server/contabilidad/shared` re-exports it instead of keeping a second
 * copy of the same labels.
 *
 * This module owns the two rules the rest of the accounting layer asks about:
 * what an account *is* (type, nature, level, provenance) and whether it may
 * receive a movement on a given date. The second one used to be spelled out
 * inline in three different places, each with a slightly different answer.
 */

// --- Type and nature -----------------------------------------------------

export type AccountTypeValue = AccountType;
export type AccountNatureValue = AccountNature;
export type ChartAccountOriginValue = ChartAccountOrigin;

/**
 * Total `Record`s over the Prisma enums: adding a value to the schema fails
 * compilation until it is labelled here, so the runtime lists can never drift
 * from the database.
 */
export const accountTypeLabels: Record<AccountTypeValue, string> = {
  ACTIVO: "Activo",
  PASIVO: "Pasivo",
  PATRIMONIO: "Patrimonio",
  INGRESO: "Ingreso",
  GASTO: "Gasto",
  COSTO: "Costo",
};

export const accountNatureLabels: Record<AccountNatureValue, string> = {
  DEUDORA: "Deudora",
  ACREEDORA: "Acreedora",
};

export const chartAccountOriginLabels: Record<ChartAccountOriginValue, string> =
  {
    PLANTILLA: "Plantilla",
    EMPRESA: "Empresa",
  };

export const accountTypeValues = Object.keys(
  accountTypeLabels,
) as AccountTypeValue[];

export const accountNatureValues = Object.keys(
  accountNatureLabels,
) as AccountNatureValue[];

export const chartAccountOriginValues = Object.keys(
  chartAccountOriginLabels,
) as ChartAccountOriginValue[];

const accountTypeSet = new Set<string>(accountTypeValues);
const accountNatureSet = new Set<string>(accountNatureValues);
const chartAccountOriginSet = new Set<string>(chartAccountOriginValues);

export function isAccountTypeValue(value: string): value is AccountTypeValue {
  return accountTypeSet.has(value);
}

export function isAccountNatureValue(
  value: string,
): value is AccountNatureValue {
  return accountNatureSet.has(value);
}

export function isChartAccountOriginValue(
  value: string,
): value is ChartAccountOriginValue {
  return chartAccountOriginSet.has(value);
}

/**
 * Balance-sheet nature normally implied by the account type. It is a
 * *suggestion*, never an enforcement: contra accounts are legitimate and
 * common (accumulated depreciation is an ACTIVO of ACREEDORA nature, a sales
 * discount is an INGRESO of DEUDORA nature), so the catalogue must be able to
 * store the exception.
 */
export function defaultNatureForType(
  type: AccountTypeValue,
): AccountNatureValue {
  return type === "ACTIVO" || type === "GASTO" || type === "COSTO"
    ? "DEUDORA"
    : "ACREEDORA";
}

/** True when the stored nature departs from the usual one for its type. */
function isContraAccountNature(
  type: AccountTypeValue,
  nature: AccountNatureValue,
): boolean {
  return nature !== defaultNatureForType(type);
}

// --- Hierarchy -----------------------------------------------------------

/**
 * Depth ceiling. Six levels cover the deepest catalogue the template needs
 * (clase → grupo → cuenta → subcuenta → auxiliar → detalle) and keep the
 * re-parent operation bounded: moving a subtree can never walk further than
 * this, so a malformed tree cannot turn into an unbounded recursion.
 */
export const MAX_CHART_ACCOUNT_LEVEL = 6;

export const ROOT_CHART_ACCOUNT_LEVEL = 1;

export function levelForParent(parentLevel: number | null): number {
  return parentLevel === null ? ROOT_CHART_ACCOUNT_LEVEL : parentLevel + 1;
}

const CODE_PATTERN = /^[0-9][0-9.\-]*$/;
const CONTROL_CHARACTERS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");

/**
 * Chart-of-accounts codes: digits, dots and hyphens starting with a digit —
 * the same alphabet the previous `sanitizeAccountCode` accepted, so no code the
 * catalogue could already hold becomes invalid.
 *
 * It validates instead of stripping. A silent strip would turn `1-1` into `11`
 * and file the account under a different, possibly existing, code.
 */
export function sanitizeChartAccountCode(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(CONTROL_CHARACTERS, "").trim();
  if (!clean || clean.length > 30) return null;
  if (!CODE_PATTERN.test(clean)) return null;
  // A code may not end with a separator nor contain an empty segment: `1..2`
  // and `1.2.` are two renderings of a hierarchy that does not exist.
  if (clean.endsWith(".") || clean.endsWith("-")) return null;
  return clean.includes("..") ? null : clean;
}

// --- Posting eligibility -------------------------------------------------

/**
 * The minimal row shape needed to decide whether an account may receive a
 * movement. Deliberately structural: repositories select exactly these columns
 * and every caller — journal lines, posting revalidation, mapping rules —
 * answers the question the same way.
 */
export type ChartAccountPostingState = {
  code: string;
  isActive: boolean;
  allowsPosting: boolean;
  archivedAt: Date | null;
  origin: ChartAccountOriginValue;
  approvedAt: Date | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

const ACCOUNT_ARCHIVED_ERROR_SUFFIX =
  "está archivada y no admite movimientos.";

/**
 * Why this account cannot receive a movement on `at`, or `null` when it can.
 *
 * Order matters: the first reason returned is the one shown to the operator, so
 * the most structural cause comes first. A template account that the company
 * accountant has not approved is refused on purpose — a seeded catalogue is a
 * proposal, and posting to it would silently adopt it.
 */
export function describeChartAccountPostingBlock(
  account: ChartAccountPostingState,
  at: Date = new Date(),
): string | null {
  if (account.archivedAt) {
    return `La cuenta ${account.code} ${ACCOUNT_ARCHIVED_ERROR_SUFFIX}`;
  }
  if (!account.allowsPosting) {
    return `La cuenta ${account.code} es una cuenta de agrupación y no admite movimientos directos.`;
  }
  if (!account.isActive) {
    return `La cuenta ${account.code} está inactiva y no admite nuevos movimientos.`;
  }
  if (account.origin === "PLANTILLA" && !account.approvedAt) {
    return `La cuenta ${account.code} pertenece a la plantilla y aún no fue aprobada por la contabilidad de la empresa.`;
  }
  if (!isWithinEffectiveWindow(account, at)) {
    return `La cuenta ${account.code} no está vigente en la fecha del movimiento.`;
  }
  return null;
}

/**
 * Effective window check. Dates are compared as instants; an unparseable date
 * fails closed (outside the window) rather than silently passing, mirroring the
 * period-lock guard of Patch 4.0S-C1.
 */
function isWithinEffectiveWindow(
  account: Pick<ChartAccountPostingState, "effectiveFrom" | "effectiveTo">,
  at: Date,
): boolean {
  if (Number.isNaN(at.getTime())) return false;
  if (at.getTime() < account.effectiveFrom.getTime()) return false;
  if (account.effectiveTo && at.getTime() > account.effectiveTo.getTime()) {
    return false;
  }
  return true;
}

// --- DTO -----------------------------------------------------------------

/**
 * Catalogue row as the panels read it. `pendingApproval` and `postable` are
 * derived server-side so no client re-implements the eligibility rule — a
 * client-side copy is exactly how the three divergent answers appeared.
 */
export type ChartAccountDTO = {
  id: string;
  code: string;
  name: string;
  type: AccountTypeValue;
  typeLabel: string;
  nature: AccountNatureValue;
  natureLabel: string;
  isContraNature: boolean;
  parentId: string | null;
  parentCode: string | null;
  level: number;
  childCount: number;
  description: string | null;
  allowsPosting: boolean;
  origin: ChartAccountOriginValue;
  originLabel: string;
  isTemplate: boolean;
  templateVersion: string | null;
  approvedAt: string | null;
  pendingApproval: boolean;
  requiresCostCenter: boolean;
  allowsBranchDetail: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  archivedAt: string | null;
  isArchived: boolean;
  /** Whether the account may receive a movement right now. */
  postable: boolean;
  /** Reason it cannot, or null. */
  postingBlockReason: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Row shape the mapper consumes; matches the repository selections. */
export type ChartAccountRowForDTO = ChartAccountPostingState & {
  id: string;
  name: string;
  type: AccountTypeValue;
  nature: AccountNatureValue;
  parentId: string | null;
  level: number;
  description: string | null;
  templateVersion: string | null;
  requiresCostCenter: boolean;
  allowsBranchDetail: boolean;
  createdAt: Date;
  updatedAt: Date;
  parent?: { code: string } | null;
  _count?: { children: number };
};

export function toChartAccountDTO(
  row: ChartAccountRowForDTO,
  at: Date = new Date(),
): ChartAccountDTO {
  const blockReason = describeChartAccountPostingBlock(row, at);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    typeLabel: accountTypeLabels[row.type] ?? row.type,
    nature: row.nature,
    natureLabel: accountNatureLabels[row.nature] ?? row.nature,
    isContraNature: isContraAccountNature(row.type, row.nature),
    parentId: row.parentId,
    parentCode: row.parent?.code ?? null,
    level: row.level,
    childCount: row._count?.children ?? 0,
    description: row.description,
    allowsPosting: row.allowsPosting,
    origin: row.origin,
    originLabel: chartAccountOriginLabels[row.origin] ?? row.origin,
    isTemplate: row.origin === "PLANTILLA",
    templateVersion: row.templateVersion,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    pendingApproval: row.origin === "PLANTILLA" && !row.approvedAt,
    requiresCostCenter: row.requiresCostCenter,
    allowsBranchDetail: row.allowsBranchDetail,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    isActive: row.isActive,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    isArchived: Boolean(row.archivedAt),
    postable: blockReason === null,
    postingBlockReason: blockReason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Filters shared by the catalogue reads. */
export type ChartAccountFilters = {
  type?: AccountTypeValue;
  nature?: AccountNatureValue;
  origin?: ChartAccountOriginValue;
  isActive?: boolean;
  allowsPosting?: boolean;
  pendingApproval?: boolean;
  /** Archived accounts are excluded unless this is true. */
  includeArchived?: boolean;
  /** Case-insensitive match against code or name. */
  search?: string;
};
