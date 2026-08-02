import type { ChartAccount } from "@prisma/client";

import { getPrisma } from "@/server/db/prisma";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { ACCOUNT_NOT_FOUND_ERROR } from "@/server/finance/errors";
import {
  countChildren,
  countJournalLines,
  countUnarchivedChildren,
  createAccount,
  findAccountById,
  listAncestorIds,
  listDescendants,
  setLevel,
  updateAccount,
} from "@/server/finance/chart-of-accounts/repository";
import {
  MAX_CHART_ACCOUNT_LEVEL,
  ROOT_CHART_ACCOUNT_LEVEL,
  defaultNatureForType,
  isAccountNatureValue,
  isAccountTypeValue,
  levelForParent,
  sanitizeChartAccountCode,
  type AccountNatureValue,
  type AccountTypeValue,
} from "@/server/finance/chart-of-accounts/shared";
import { sanitizeFinancialText } from "@/server/finance/text";
import {
  runFinancialTransaction,
  type FinancialResult,
  type FinancialTransactionContext,
} from "@/server/finance/transaction";
import type { FinancialAuditField } from "@/server/financial-audit/shared";

/**
 * Patch FF1.1 — chart-of-accounts foundation service.
 *
 * This is the single place where an account is created, described, moved,
 * deactivated, archived or approved. The Contabilidad actions delegate here
 * instead of writing `chartAccount` themselves, so there is one implementation
 * of the catalogue rules rather than one per caller.
 *
 * Authorization is `authorizeFinancialFoundation`, which resolves to Admin and
 * Contador with a global accounting scope — exactly the roles that
 * `authorizeContabilidad("operate")` already allowed for these actions, so no
 * role gains or loses access. It lives here rather than in Contabilidad because
 * `finance` is the base layer and may never import upwards.
 *
 * Three invariants hold everywhere in this file:
 *
 * 1. **Nothing is ever deleted.** An account is deactivated (stops accepting
 *    movements) or archived (retired permanently). The database enforces the
 *    same rule from below: the tree FK and every movement FK are RESTRICT.
 * 2. **History is never rewritten.** A change that would alter the meaning of
 *    an already-posted movement — the type, the nature, becoming a grouping
 *    header — is refused once journal lines exist.
 * 3. **A template account is a proposal.** It carries `origin = PLANTILLA` and
 *    receives no movement until the company accountant approves it.
 *
 * This service does NOT post, map or price anything. It owns the catalogue.
 */

const CHART_ACCOUNT_ROUTES = [
  "/panel/contabilidad",
  "/panel/contabilidad/catalogo-cuentas",
] as const;

const CHART_ACCOUNT_UNIQUE_MESSAGES = {
  chart_accounts_code_key: "Ya existe una cuenta con ese código.",
} as const;

/** Shared financial wording; declared once in the finance layer (TD-01). */
export const ACCOUNT_NOT_FOUND = ACCOUNT_NOT_FOUND_ERROR;
export const PARENT_NOT_FOUND = "La cuenta padre no existe.";
export const INVALID_CODE = "El código de cuenta no es válido.";
export const INVALID_NAME = "El nombre de la cuenta es obligatorio.";
export const INVALID_TYPE = "El tipo de cuenta no es válido.";
export const INVALID_NATURE = "La naturaleza de la cuenta no es válida.";
export const INVALID_DATES =
  "La fecha de fin de vigencia no puede ser anterior a la de inicio.";
export const ARCHIVED_IMMUTABLE =
  "Una cuenta archivada no puede modificarse. Restáurala primero si fue un error.";
export const MAX_LEVEL_REACHED = `El plan de cuentas admite hasta ${MAX_CHART_ACCOUNT_LEVEL} niveles.`;
export const PARENT_HAS_MOVEMENTS =
  "La cuenta padre ya tiene movimientos registrados y no puede convertirse en cuenta de agrupación.";
export const HAS_MOVEMENTS_STRUCTURAL =
  "La cuenta ya tiene movimientos contabilizados. Cambiar su tipo o naturaleza reescribiría el histórico; crea una cuenta nueva.";
export const POSTING_NEEDS_LEAF =
  "Una cuenta con subcuentas no puede recibir movimientos directos.";

// --- Audit ---------------------------------------------------------------

/** Allowlisted snapshot of an account, as the audit writer expects it. */
function accountSnapshot(
  account: ChartAccount,
): Partial<Record<FinancialAuditField, unknown>> {
  return {
    code: account.code,
    type: account.type,
    nature: account.nature,
    level: account.level,
    allowsPosting: account.allowsPosting,
    origin: account.origin,
    templateVersion: account.templateVersion,
    approvedAt: account.approvedAt,
    requiresCostCenter: account.requiresCostCenter,
    allowsBranchDetail: account.allowsBranchDetail,
    effectiveFrom: account.effectiveFrom,
    effectiveTo: account.effectiveTo,
    isActive: account.isActive,
    archivedAt: account.archivedAt,
    description: account.description,
  };
}

type ChartAccountAuditAction =
  | "CHART_ACCOUNT_CREATED"
  | "CHART_ACCOUNT_UPDATED"
  | "CHART_ACCOUNT_STATUS_CHANGED"
  | "CHART_ACCOUNT_ARCHIVED"
  | "CHART_ACCOUNT_RESTORED"
  | "CHART_ACCOUNT_APPROVED";

const auditOperation = {
  CHART_ACCOUNT_CREATED: "CREATE",
  CHART_ACCOUNT_UPDATED: "UPDATE",
  CHART_ACCOUNT_STATUS_CHANGED: "STATUS_CHANGE",
  CHART_ACCOUNT_ARCHIVED: "STATUS_CHANGE",
  CHART_ACCOUNT_RESTORED: "STATUS_CHANGE",
  CHART_ACCOUNT_APPROVED: "STATUS_CHANGE",
} as const satisfies Record<
  ChartAccountAuditAction,
  "CREATE" | "UPDATE" | "STATUS_CHANGE"
>;

async function auditAccount(
  ctx: FinancialTransactionContext,
  action: ChartAccountAuditAction,
  account: ChartAccount,
  before: ChartAccount | null,
  extra: {
    reason?: string | null;
    changedFields?: FinancialAuditField[];
  } = {},
): Promise<void> {
  await ctx.audit({
    // The chart of accounts is accounting master data, so it audits under
    // CONTABILIDAD like every other Admin/Contador write, even though the
    // service itself lives in the finance base layer.
    domain: "CONTABILIDAD",
    action,
    entityType: "CHART_ACCOUNT",
    entityId: account.id,
    entityCode: account.code,
    reason: extra.reason ?? null,
    before: before ? accountSnapshot(before) : null,
    after: accountSnapshot(account),
    metadata: {
      component: action === "CHART_ACCOUNT_UPDATED" ? "HEADER" : "STATUS",
      operation: auditOperation[action],
      ...(extra.changedFields?.length
        ? { changedFields: extra.changedFields }
        : {}),
    },
  });
}

// --- Shared rules --------------------------------------------------------

function parseOptionalDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * A parent stops being a posting account the moment it gains a child: a
 * hierarchical catalogue never posts to a total. The demotion is automatic
 * because the alternative — refusing the child until the operator edits the
 * parent — turns building a tree into a two-step chore for every node. It is
 * refused only when the parent already carries movements, because then the
 * demotion would strand posted history under a header account.
 */
async function demoteParentToHeader(
  ctx: FinancialTransactionContext,
  parent: ChartAccount,
): Promise<void> {
  if (!parent.allowsPosting) return;

  const movements = await countJournalLines(ctx.tx, parent.id);
  ctx.ensure(movements === 0, PARENT_HAS_MOVEMENTS);

  const updated = await updateAccount(ctx.tx, parent.id, {
    allowsPosting: false,
  });
  await auditAccount(ctx, "CHART_ACCOUNT_UPDATED", updated, parent, {
    reason: "La cuenta pasó a ser de agrupación al recibir una subcuenta.",
    changedFields: ["allowsPosting"],
  });
}

// --- Create --------------------------------------------------------------

export type CreateChartAccountInput = {
  code: string;
  name: string;
  type: string;
  nature?: string | null;
  parentId?: string | null;
  description?: string | null;
  allowsPosting?: boolean;
  requiresCostCenter?: boolean;
  allowsBranchDetail?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

/**
 * Creates a company account. `origin` is always EMPRESA here: template accounts
 * enter exclusively through the seed, which is what keeps the provenance of the
 * catalogue honest.
 */
export async function createChartAccount(
  input: CreateChartAccountInput,
): Promise<FinancialResult<{ accountId: string; code: string; level: number }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const code = sanitizeChartAccountCode(input.code);
  if (!code) return { ok: false, error: INVALID_CODE };

  const name = sanitizeFinancialText(input.name, 200);
  if (!name) return { ok: false, error: INVALID_NAME };

  if (!isAccountTypeValue(input.type)) {
    return { ok: false, error: INVALID_TYPE };
  }
  const type: AccountTypeValue = input.type;

  let nature: AccountNatureValue = defaultNatureForType(type);
  if (input.nature !== undefined && input.nature !== null) {
    if (!isAccountNatureValue(input.nature)) {
      return { ok: false, error: INVALID_NATURE };
    }
    nature = input.nature;
  }

  const effectiveFrom = parseOptionalDate(input.effectiveFrom);
  const effectiveTo = parseOptionalDate(input.effectiveTo);
  if (effectiveFrom === undefined && input.effectiveFrom) {
    return { ok: false, error: "La fecha de vigencia no es válida." };
  }
  if (effectiveTo === undefined && input.effectiveTo) {
    return { ok: false, error: "La fecha de vigencia no es válida." };
  }
  const from = effectiveFrom ?? new Date();
  if (effectiveTo && effectiveTo.getTime() < from.getTime()) {
    return { ok: false, error: INVALID_DATES };
  }

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: CHART_ACCOUNT_ROUTES,
    uniqueErrorMessages: CHART_ACCOUNT_UNIQUE_MESSAGES,
    errorMessage: "No se pudo registrar la cuenta contable.",
    run: async (ctx) => {
      let level = ROOT_CHART_ACCOUNT_LEVEL;

      if (input.parentId) {
        const parent = await findAccountById(ctx.tx, input.parentId);
        if (!parent) return ctx.fail(PARENT_NOT_FOUND);
        ctx.ensure(
          !parent.archivedAt,
          "La cuenta padre está archivada y no admite subcuentas.",
        );

        level = levelForParent(parent.level);
        ctx.ensure(level <= MAX_CHART_ACCOUNT_LEVEL, MAX_LEVEL_REACHED);

        await demoteParentToHeader(ctx, parent);
      }

      const created = await createAccount(ctx.tx, {
        code,
        name,
        type,
        nature,
        parentId: input.parentId ?? null,
        level,
        description: sanitizeFinancialText(input.description, 500),
        allowsPosting: input.allowsPosting ?? true,
        origin: "EMPRESA",
        requiresCostCenter: input.requiresCostCenter ?? false,
        allowsBranchDetail: input.allowsBranchDetail ?? true,
        effectiveFrom: from,
        effectiveTo: effectiveTo ?? null,
      });

      await auditAccount(ctx, "CHART_ACCOUNT_CREATED", created, null);
      return { accountId: created.id, code: created.code, level: created.level };
    },
  });
}

// --- Update --------------------------------------------------------------

export type UpdateChartAccountInput = {
  accountId: string;
  name?: string;
  type?: string;
  nature?: string;
  description?: string | null;
  allowsPosting?: boolean;
  requiresCostCenter?: boolean;
  allowsBranchDetail?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

/**
 * Edits the descriptive and behavioural attributes of an account. The code is
 * deliberately absent: a code identifies the account inside every report,
 * export and printed ledger, so renumbering is a migration of the catalogue,
 * not a field edit.
 */
export async function updateChartAccount(
  input: UpdateChartAccountInput,
): Promise<FinancialResult<{ accountId: string; changed: boolean }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  let name: string | undefined;
  if (input.name !== undefined) {
    const parsed = sanitizeFinancialText(input.name, 200);
    if (!parsed) return { ok: false, error: INVALID_NAME };
    name = parsed;
  }

  if (input.type !== undefined && !isAccountTypeValue(input.type)) {
    return { ok: false, error: INVALID_TYPE };
  }
  if (input.nature !== undefined && !isAccountNatureValue(input.nature)) {
    return { ok: false, error: INVALID_NATURE };
  }
  const type = input.type as AccountTypeValue | undefined;
  const nature = input.nature as AccountNatureValue | undefined;

  const effectiveFrom = parseOptionalDate(input.effectiveFrom);
  const effectiveTo = parseOptionalDate(input.effectiveTo);
  if (
    (effectiveFrom === undefined && input.effectiveFrom) ||
    (effectiveTo === undefined && input.effectiveTo)
  ) {
    return { ok: false, error: "La fecha de vigencia no es válida." };
  }
  if (effectiveFrom === null) {
    return { ok: false, error: "La cuenta necesita una fecha de vigencia." };
  }

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: CHART_ACCOUNT_ROUTES,
    errorMessage: "No se pudo actualizar la cuenta contable.",
    run: async (ctx) => {
      const account = await findAccountById(ctx.tx, input.accountId);
      if (!account) return ctx.fail(ACCOUNT_NOT_FOUND);
      ctx.ensure(!account.archivedAt, ARCHIVED_IMMUTABLE);

      const structural =
        (type !== undefined && type !== account.type) ||
        (nature !== undefined && nature !== account.nature);
      if (structural) {
        const movements = await countJournalLines(ctx.tx, account.id);
        ctx.ensure(movements === 0, HAS_MOVEMENTS_STRUCTURAL);
      }

      if (input.allowsPosting === true && !account.allowsPosting) {
        const children = await countChildren(ctx.tx, account.id);
        ctx.ensure(children === 0, POSTING_NEEDS_LEAF);
      }

      const nextFrom = effectiveFrom ?? account.effectiveFrom;
      const nextTo =
        effectiveTo === undefined ? account.effectiveTo : effectiveTo;
      if (nextTo && nextTo.getTime() < nextFrom.getTime()) {
        return ctx.fail(INVALID_DATES);
      }

      const changedFields: FinancialAuditField[] = [];
      if (name !== undefined && name !== account.name) {
        changedFields.push("displayNameChanged");
      }
      if (type !== undefined && type !== account.type) changedFields.push("type");
      if (nature !== undefined && nature !== account.nature) {
        changedFields.push("nature");
      }
      if (
        input.allowsPosting !== undefined &&
        input.allowsPosting !== account.allowsPosting
      ) {
        changedFields.push("allowsPosting");
      }
      if (
        input.requiresCostCenter !== undefined &&
        input.requiresCostCenter !== account.requiresCostCenter
      ) {
        changedFields.push("requiresCostCenter");
      }
      if (
        input.allowsBranchDetail !== undefined &&
        input.allowsBranchDetail !== account.allowsBranchDetail
      ) {
        changedFields.push("allowsBranchDetail");
      }
      if (nextFrom.getTime() !== account.effectiveFrom.getTime()) {
        changedFields.push("effectiveFrom");
      }
      if ((nextTo?.getTime() ?? null) !== (account.effectiveTo?.getTime() ?? null)) {
        changedFields.push("effectiveTo");
      }

      const description =
        input.description === undefined
          ? undefined
          : sanitizeFinancialText(input.description, 500);
      if (description !== undefined && description !== account.description) {
        changedFields.push("description");
      }

      // Nothing allowlisted changed: writing an "update" event with no delta
      // would only add noise to the audit trail.
      if (!changedFields.length) {
        return { accountId: account.id, changed: false };
      }

      const updated = await updateAccount(ctx.tx, account.id, {
        ...(name === undefined ? {} : { name }),
        ...(type === undefined ? {} : { type }),
        ...(nature === undefined ? {} : { nature }),
        ...(description === undefined ? {} : { description }),
        ...(input.allowsPosting === undefined
          ? {}
          : { allowsPosting: input.allowsPosting }),
        ...(input.requiresCostCenter === undefined
          ? {}
          : { requiresCostCenter: input.requiresCostCenter }),
        ...(input.allowsBranchDetail === undefined
          ? {}
          : { allowsBranchDetail: input.allowsBranchDetail }),
        effectiveFrom: nextFrom,
        effectiveTo: nextTo,
      });

      await auditAccount(ctx, "CHART_ACCOUNT_UPDATED", updated, account, {
        changedFields,
      });
      return { accountId: updated.id, changed: true };
    },
  });
}

// --- Move ----------------------------------------------------------------

/**
 * Re-parents an account and re-levels its whole subtree in the same
 * transaction. Separate from {@link updateChartAccount} because it is the only
 * operation that can corrupt the tree: it must reject cycles, respect the depth
 * ceiling for the *deepest descendant* (not just the moved node) and keep every
 * stored level consistent with the new position.
 */
export async function moveChartAccount(input: {
  accountId: string;
  parentId: string | null;
}): Promise<FinancialResult<{ accountId: string; level: number }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  if (input.parentId && input.parentId === input.accountId) {
    return { ok: false, error: "Una cuenta no puede ser su propia cuenta padre." };
  }

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: CHART_ACCOUNT_ROUTES,
    errorMessage: "No se pudo mover la cuenta contable.",
    run: async (ctx) => {
      const account = await findAccountById(ctx.tx, input.accountId);
      if (!account) return ctx.fail(ACCOUNT_NOT_FOUND);
      ctx.ensure(!account.archivedAt, ARCHIVED_IMMUTABLE);

      const descendants = await listDescendants(
        ctx.tx,
        account.id,
        MAX_CHART_ACCOUNT_LEVEL,
      );
      const subtreeDepth = descendants.reduce(
        (deepest, node) => Math.max(deepest, node.relativeDepth),
        0,
      );

      let nextLevel = ROOT_CHART_ACCOUNT_LEVEL;
      if (input.parentId) {
        const parent = await findAccountById(ctx.tx, input.parentId);
        if (!parent) return ctx.fail(PARENT_NOT_FOUND);
        ctx.ensure(
          !parent.archivedAt,
          "La cuenta padre está archivada y no admite subcuentas.",
        );

        // A cycle would detach the whole subtree from the catalogue and make
        // every later tree read non-terminating.
        const ancestors = await listAncestorIds(
          ctx.tx,
          parent.id,
          MAX_CHART_ACCOUNT_LEVEL,
        );
        ctx.ensure(
          parent.id !== account.id && !ancestors.includes(account.id),
          "No puedes mover una cuenta dentro de una de sus propias subcuentas.",
        );

        nextLevel = levelForParent(parent.level);
        ctx.ensure(
          nextLevel + subtreeDepth <= MAX_CHART_ACCOUNT_LEVEL,
          MAX_LEVEL_REACHED,
        );

        await demoteParentToHeader(ctx, parent);
      }

      if (
        account.parentId === (input.parentId ?? null) &&
        account.level === nextLevel
      ) {
        return { accountId: account.id, level: account.level };
      }

      const updated = await updateAccount(ctx.tx, account.id, {
        parentId: input.parentId ?? null,
        level: nextLevel,
      });

      // Re-level the subtree by depth band: one statement per level instead of
      // one per account.
      const byDepth = new Map<number, string[]>();
      for (const node of descendants) {
        const bucket = byDepth.get(node.relativeDepth) ?? [];
        bucket.push(node.id);
        byDepth.set(node.relativeDepth, bucket);
      }
      for (const [relativeDepth, ids] of byDepth) {
        await setLevel(ctx.tx, ids, nextLevel + relativeDepth);
      }

      await auditAccount(ctx, "CHART_ACCOUNT_UPDATED", updated, account, {
        changedFields: ["parentCode", "level"],
        reason:
          input.parentId === null
            ? "La cuenta pasó al primer nivel del catálogo."
            : null,
      });
      return { accountId: updated.id, level: updated.level };
    },
  });
}

// --- Lifecycle -----------------------------------------------------------

/**
 * Activates or deactivates an account. Deactivation is the reversible way to
 * stop new movements while keeping the account readable in historical reports;
 * it never touches posted lines.
 */
export async function setChartAccountActive(input: {
  accountId: string;
  isActive: boolean;
  reason?: string | null;
}): Promise<FinancialResult<{ accountId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = sanitizeFinancialText(input.reason, 500);

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: CHART_ACCOUNT_ROUTES,
    errorMessage: "No se pudo actualizar el estado de la cuenta contable.",
    run: async (ctx) => {
      const account = await findAccountById(ctx.tx, input.accountId);
      if (!account) return ctx.fail(ACCOUNT_NOT_FOUND);
      ctx.ensure(!account.archivedAt, ARCHIVED_IMMUTABLE);
      ctx.ensure(
        account.isActive !== input.isActive,
        input.isActive
          ? "La cuenta ya está activa."
          : "La cuenta ya está inactiva.",
      );

      if (input.isActive && account.parentId) {
        // Reactivating under a retired parent would produce a branch of the
        // tree that is reachable but whose header is gone.
        const parent = await findAccountById(ctx.tx, account.parentId);
        ctx.ensure(
          Boolean(parent && parent.isActive && !parent.archivedAt),
          "Reactiva primero la cuenta padre.",
        );
      }

      const updated = await updateAccount(ctx.tx, account.id, {
        isActive: input.isActive,
      });
      await auditAccount(
        ctx,
        "CHART_ACCOUNT_STATUS_CHANGED",
        updated,
        account,
        { reason, changedFields: ["isActive"] },
      );
      return { accountId: updated.id };
    },
  });
}

/**
 * Retires an account permanently. Archiving is the strongest state the
 * catalogue has and the deliberate replacement for deletion: the row, its code
 * and its movements stay readable forever.
 */
export async function archiveChartAccount(input: {
  accountId: string;
  reason: string;
}): Promise<FinancialResult<{ accountId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = sanitizeFinancialText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo del archivado." };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: CHART_ACCOUNT_ROUTES,
    errorMessage: "No se pudo archivar la cuenta contable.",
    run: async (ctx) => {
      const account = await findAccountById(ctx.tx, input.accountId);
      if (!account) return ctx.fail(ACCOUNT_NOT_FOUND);
      ctx.ensure(!account.archivedAt, "La cuenta ya está archivada.");

      const liveChildren = await countUnarchivedChildren(ctx.tx, account.id);
      ctx.ensure(
        liveChildren === 0,
        "Archiva primero las subcuentas de esta cuenta.",
      );

      const updated = await updateAccount(ctx.tx, account.id, {
        archivedAt: new Date(),
        archivedByUserId: auth.actor.userId,
        // Archived implies inactive, so every existing guard that already
        // checks `isActive` keeps rejecting the account without being touched.
        isActive: false,
      });
      await auditAccount(ctx, "CHART_ACCOUNT_ARCHIVED", updated, account, {
        reason,
        changedFields: ["archivedAt", "isActive"],
      });
      return { accountId: updated.id };
    },
  });
}

/**
 * Undoes an archival. The account comes back **inactive**: restoring corrects
 * the archive, it does not re-open the account for movements, which stays an
 * explicit second decision.
 */
export async function restoreChartAccount(input: {
  accountId: string;
  reason: string;
}): Promise<FinancialResult<{ accountId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = sanitizeFinancialText(input.reason, 500);
  if (!reason) return { ok: false, error: "Indica el motivo de la restauración." };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: CHART_ACCOUNT_ROUTES,
    errorMessage: "No se pudo restaurar la cuenta contable.",
    run: async (ctx) => {
      const account = await findAccountById(ctx.tx, input.accountId);
      if (!account) return ctx.fail(ACCOUNT_NOT_FOUND);
      ctx.ensure(Boolean(account.archivedAt), "La cuenta no está archivada.");

      if (account.parentId) {
        const parent = await findAccountById(ctx.tx, account.parentId);
        ctx.ensure(
          Boolean(parent && !parent.archivedAt),
          "Restaura primero la cuenta padre.",
        );
      }

      const updated = await updateAccount(ctx.tx, account.id, {
        archivedAt: null,
        archivedByUserId: null,
        isActive: false,
      });
      await auditAccount(ctx, "CHART_ACCOUNT_RESTORED", updated, account, {
        reason,
        changedFields: ["archivedAt"],
      });
      return { accountId: updated.id };
    },
  });
}

// --- Template approval ---------------------------------------------------

const MAX_APPROVAL_BATCH = 500;

/**
 * Records the company accountant adopting template accounts. Until this runs,
 * a `PLANTILLA` account is a suggestion: it is visible, it can be renamed or
 * deactivated, and it receives no movement.
 *
 * Approval is per account and reversible only by deactivating or archiving —
 * it is not a status toggle, because "this account belongs to our catalogue"
 * is a statement about the past that later reports depend on.
 */
export async function approveTemplateChartAccounts(input: {
  accountIds: readonly string[];
  reason?: string | null;
}): Promise<
  FinancialResult<{ approved: number; skipped: number; notFound: number }>
> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const ids = [...new Set(input.accountIds.filter(Boolean))];
  if (!ids.length) return { ok: false, error: "Selecciona al menos una cuenta." };
  if (ids.length > MAX_APPROVAL_BATCH) {
    return {
      ok: false,
      error: `Aprueba como máximo ${MAX_APPROVAL_BATCH} cuentas por operación.`,
    };
  }

  const reason = sanitizeFinancialText(input.reason, 500);

  return runFinancialTransaction({
    actor: auth.actor,
    // A large batch writes one audit event per account, so the default 5s
    // interactive-transaction budget is raised deliberately rather than
    // splitting the approval into several transactions that could half-apply.
    timeoutMs: 30_000,
    revalidate: CHART_ACCOUNT_ROUTES,
    errorMessage: "No se pudieron aprobar las cuentas de la plantilla.",
    run: async (ctx) => {
      let approved = 0;
      let skipped = 0;
      let notFound = 0;

      for (const accountId of ids) {
        const account = await findAccountById(ctx.tx, accountId);
        if (!account) {
          notFound += 1;
          continue;
        }
        // Already-approved, company-owned or archived accounts are counted, not
        // rejected: a bulk approval must be re-runnable without failing on the
        // rows a previous run already handled.
        if (
          account.origin !== "PLANTILLA" ||
          account.approvedAt ||
          account.archivedAt
        ) {
          skipped += 1;
          continue;
        }

        const updated = await updateAccount(ctx.tx, account.id, {
          approvedAt: new Date(),
          approvedByUserId: auth.actor.userId,
        });
        await auditAccount(ctx, "CHART_ACCOUNT_APPROVED", updated, account, {
          reason,
          changedFields: ["approvedAt"],
        });
        approved += 1;
      }

      return { approved, skipped, notFound };
    },
  });
}

// --- Reads ---------------------------------------------------------------

export type ChartAccountCatalogSummary = {
  total: number;
  active: number;
  postable: number;
  template: number;
  pendingApproval: number;
  archived: number;
};

/**
 * Patch TD-01 removed `listChartAccountCatalog` and `getChartAccountDetail`
 * from this service. Both were written in FF1.1-A, never acquired a caller, and
 * duplicated `listChartAccounts` / `getChartAccountDetail` of
 * `@/server/contabilidad/queries`, which the catalogue route actually uses and
 * which additionally applies the reader's `ContabilidadScope`. Two read paths
 * with different authorization for the same rows is the kind of divergence this
 * cleanup exists to remove; the scoped one stays.
 */

/** Counts used by the catalogue header. Cheap aggregate queries, no rows. */
export async function getChartAccountCatalogSummary(): Promise<
  FinancialResult<ChartAccountCatalogSummary>
> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getPrisma();
  const now = new Date();
  const [total, active, postable, template, pendingApproval, archived] =
    await Promise.all([
      db.chartAccount.count(),
      db.chartAccount.count({ where: { isActive: true, archivedAt: null } }),
      db.chartAccount.count({
        where: {
          isActive: true,
          archivedAt: null,
          allowsPosting: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          NOT: { origin: "PLANTILLA", approvedAt: null },
        },
      }),
      db.chartAccount.count({ where: { origin: "PLANTILLA" } }),
      db.chartAccount.count({
        where: { origin: "PLANTILLA", approvedAt: null, archivedAt: null },
      }),
      db.chartAccount.count({ where: { archivedAt: { not: null } } }),
    ]);

  return {
    ok: true,
    data: { total, active, postable, template, pendingApproval, archived },
  };
}
