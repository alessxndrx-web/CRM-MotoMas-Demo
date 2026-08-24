import type { AccountMappingSet } from "@prisma/client";

import { getPrisma } from "@/server/db/prisma";
import {
  countRules,
  createSet,
  deleteRule,
  findActiveRule,
  findLatestVersion,
  findRuleById,
  findSetById,
  findSetWithRules,
  listSets,
  updateSet,
  upsertRule,
  type MappingDb,
  type MappingRuleWithAccounts,
  type MappingSetWithRules,
} from "@/server/finance/account-mapping/repository";
import {
  CORPORATE_MAPPING_BRANCH_KEY,
  accountMappingSetStatusLabels,
  accountingEventComponentLabels,
  accountingEventTypeLabels,
  isAccountingEventComponentValue,
  isAccountingEventTypeValue,
  isComponentAllowedForEvent,
  mappingBranchKey,
  type AccountMappingSetDTO,
  type AccountMappingSetDetailDTO,
  type AccountMappingRuleDTO,
  type AccountMappingValidationDTO,
  type ResolvedAccountMappingDTO,
} from "@/server/finance/account-mapping/shared";
import { validateMappingSet } from "@/server/finance/account-mapping/validation";
import { postingStateSelect } from "@/server/finance/chart-of-accounts/repository";
import { describeChartAccountPostingBlock } from "@/server/finance/chart-of-accounts/shared";
import { UNKNOWN_BRANCH_ERROR } from "@/server/finance/errors";
import {
  authorizeFinancialFoundation,
  resolveBranchCodesByIds,
  resolveFinancialBranchId,
} from "@/server/finance/context";
import {
  runFinancialTransaction,
  type FinancialResult,
  type FinancialTransactionContext,
} from "@/server/finance/transaction";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.0 — account-mapping catalogue service.
 *
 * Writes authorize as Contabilidad writes (Admin/Contador), run inside
 * {@link runFinancialTransaction} and leave an audit event, exactly like every
 * other financial mutation in the project.
 *
 * Lifecycle: a set is drafted (BORRADOR), its rules are edited freely, then it
 * is activated. Activation validates against current state, archives whatever
 * set held the same branch scope and is itself irreversible — an active set is
 * never edited in place, because the rules that produced a historical entry
 * must stay readable. Correcting an active mapping means drafting the next
 * version and activating it.
 *
 * NOTHING here generates a journal entry. {@link resolveAccountMapping} is the
 * read the posting engine (FF1.4) will consume; today it has no caller.
 */

const MAPPING_ROUTES = ["/panel/contabilidad"] as const;

const MAPPING_UNIQUE_MESSAGES = {
  account_mapping_sets_code_version_key:
    "Ya existe un conjunto de mapeo con ese código y versión.",
  account_mapping_sets_active_branch_key_key:
    "Ya hay un conjunto de mapeo activo para esa sucursal.",
  account_mapping_rules_set_id_event_component_key:
    "Ya existe una regla para ese evento y componente.",
} as const;

// TODO(FF1.4): the lifecycle here has no UI and `resolveAccountMapping` has no
// caller. It is NOT dead code — it is the mapping contract the posting engine
// will read, documented in docs/FINANCIAL_FOUNDATION.md §5 and in the event
// specification docs/ACCOUNTING_EVENTS.md. Do not delete it as unused.
export const SET_NOT_FOUND_ERROR = "El conjunto de mapeo no existe.";
export const RULE_NOT_FOUND_ERROR = "La regla de mapeo no existe.";
export const SET_NOT_DRAFT_ERROR =
  "Solo puedes editar un conjunto en borrador. Crea una versión nueva para corregir un mapeo activo.";
export const INVALID_EVENT_ERROR = "El evento contable no es válido.";
export const INVALID_COMPONENT_ERROR = "El componente contable no es válido.";
export const INVALID_CODE_ERROR =
  "El código solo admite letras, números, guion y guion bajo (máximo 40).";
/** Re-exported from the shared vocabulary so the wording exists once (TD-01). */
export { UNKNOWN_BRANCH_ERROR };
export const INVALID_DATE_ERROR = "La fecha de vigencia no es válida.";
export const SAME_ACCOUNT_ERROR =
  "La cuenta de debe y la de haber no pueden ser la misma.";

function sanitizeCode(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized.length > 40) return null;
  return /^[A-Z0-9][A-Z0-9_-]*$/.test(normalized) ? normalized : null;
}

function parseEffectiveFrom(value: string | null | undefined): Date | null {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setAuditSnapshot(set: AccountMappingSet) {
  return {
    code: set.code,
    version: set.version,
    status: set.status,
    description: set.description,
    effectiveFrom: set.effectiveFrom,
    activatedAt: set.activatedAt,
    archivedAt: set.archivedAt,
  };
}

async function auditSet(
  ctx: FinancialTransactionContext,
  action:
    | "ACCOUNT_MAPPING_SET_CREATED"
    | "ACCOUNT_MAPPING_SET_UPDATED"
    | "ACCOUNT_MAPPING_SET_STATUS_CHANGED",
  set: AccountMappingSet,
  before: ReturnType<typeof setAuditSnapshot> | null,
  extra: { ruleCount?: number; reason?: string | null } = {},
): Promise<void> {
  await ctx.audit({
    domain: "CONTABILIDAD",
    action,
    entityType: "ACCOUNT_MAPPING_SET",
    entityId: set.id,
    entityCode: `${set.code}-v${set.version}`,
    branchId: set.branchId,
    reason: extra.reason ?? null,
    before,
    after: setAuditSnapshot(set),
    metadata: {
      component: "HEADER",
      operation:
        action === "ACCOUNT_MAPPING_SET_CREATED"
          ? "CREATE"
          : action === "ACCOUNT_MAPPING_SET_STATUS_CHANGED"
            ? "STATUS_CHANGE"
            : "UPDATE",
      ...(extra.ruleCount === undefined ? {} : { lineCount: extra.ruleCount }),
    },
  });
}

// --- Set lifecycle -------------------------------------------------------

export type CreateAccountMappingSetInput = {
  code: string;
  name: string;
  description?: string | null;
  /** Branch code; omit or leave empty for a corporate set. */
  branchCode?: string | null;
  effectiveFrom?: string | null;
};

/**
 * Drafts a new mapping set. Reusing an existing code creates the next version
 * of that mapping rather than colliding with it, so a correction is always a
 * new version and never an edit of history.
 */
export async function createAccountMappingSet(
  input: CreateAccountMappingSetInput,
): Promise<FinancialResult<{ setId: string; version: number }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const code = sanitizeCode(input.code);
  if (!code) return { ok: false, error: INVALID_CODE_ERROR };

  const name = sanitizeFinancialText(input.name, 200);
  if (!name) return { ok: false, error: "El nombre es obligatorio." };

  const effectiveFrom = parseEffectiveFrom(input.effectiveFrom);
  if (!effectiveFrom) return { ok: false, error: INVALID_DATE_ERROR };

  const branch = await resolveFinancialBranchId(input.branchCode);
  if (!branch.ok) return { ok: false, error: UNKNOWN_BRANCH_ERROR };

  const description = input.description
    ? sanitizeFinancialText(input.description, 500)
    : null;

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: MAPPING_ROUTES,
    uniqueErrorMessages: MAPPING_UNIQUE_MESSAGES,
    errorMessage: "No se pudo crear el conjunto de mapeo contable.",
    run: async (ctx) => {
      const version = (await findLatestVersion(ctx.tx, code)) + 1;
      const created = await createSet(ctx.tx, {
        code,
        version,
        name,
        description,
        branchId: branch.branchId,
        branchKey: mappingBranchKey(branch.branchId),
        effectiveFrom,
        createdByUserId: auth.actor.userId,
      });
      await auditSet(ctx, "ACCOUNT_MAPPING_SET_CREATED", created, null, {
        ruleCount: 0,
      });
      return { setId: created.id, version: created.version };
    },
  });
}

export type UpdateAccountMappingSetInput = {
  setId: string;
  name?: string;
  description?: string | null;
  effectiveFrom?: string | null;
};

/** Edits the descriptive header of a draft. An active set is never edited. */
export async function updateAccountMappingSet(
  input: UpdateAccountMappingSetInput,
): Promise<FinancialResult<{ setId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  let name: string | undefined;
  if (input.name !== undefined) {
    const parsed = sanitizeFinancialText(input.name, 200);
    if (!parsed) return { ok: false, error: "El nombre es obligatorio." };
    name = parsed;
  }

  let effectiveFrom: Date | undefined;
  if (input.effectiveFrom !== undefined) {
    const parsed = parseEffectiveFrom(input.effectiveFrom);
    if (!parsed) return { ok: false, error: INVALID_DATE_ERROR };
    effectiveFrom = parsed;
  }

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: MAPPING_ROUTES,
    uniqueErrorMessages: MAPPING_UNIQUE_MESSAGES,
    errorMessage: "No se pudo actualizar el conjunto de mapeo contable.",
    run: async (ctx) => {
      const existing = await findSetById(ctx.tx, input.setId);
      if (!existing) return ctx.fail(SET_NOT_FOUND_ERROR);
      ctx.ensure(existing.status === "BORRADOR", SET_NOT_DRAFT_ERROR);

      const before = setAuditSnapshot(existing);
      const updated = await updateSet(ctx.tx, existing.id, {
        ...(name === undefined ? {} : { name }),
        ...(input.description === undefined
          ? {}
          : {
              description: input.description
                ? sanitizeFinancialText(input.description, 500)
                : null,
            }),
        ...(effectiveFrom === undefined ? {} : { effectiveFrom }),
      });
      await auditSet(ctx, "ACCOUNT_MAPPING_SET_UPDATED", updated, before);
      return { setId: updated.id };
    },
  });
}

/**
 * Activates a validated draft and archives the set that currently holds the
 * same branch scope, inside one transaction. `activeBranchKey` is unique, so
 * the database itself guarantees a single active set per scope even if two
 * activations race — the loser fails instead of producing an ambiguous mapping.
 */
export async function activateAccountMappingSet(input: {
  setId: string;
  reason?: string | null;
}): Promise<FinancialResult<{ setId: string; archivedSetId: string | null }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = input.reason ? sanitizeFinancialText(input.reason, 500) : null;

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: MAPPING_ROUTES,
    uniqueErrorMessages: MAPPING_UNIQUE_MESSAGES,
    errorMessage: "No se pudo activar el conjunto de mapeo contable.",
    run: async (ctx) => {
      const existing = await findSetById(ctx.tx, input.setId);
      if (!existing) return ctx.fail(SET_NOT_FOUND_ERROR);
      ctx.ensure(
        existing.status === "BORRADOR",
        existing.status === "ACTIVO"
          ? "El conjunto ya está activo."
          : "Un conjunto archivado no puede reactivarse. Crea una versión nueva.",
      );

      // Re-validated here, against current state: a set validated while
      // drafting may hold an account that was deactivated afterwards.
      const validation = await validateMappingSet(ctx.tx, existing.id);
      if (!validation.valid) {
        return ctx.fail(
          `El conjunto no es válido: ${validation.issues[0]?.message ?? ""}`.trim(),
        );
      }

      const current = await ctx.tx.accountMappingSet.findUnique({
        where: { activeBranchKey: existing.branchKey },
      });

      let archivedSetId: string | null = null;
      if (current) {
        const previousSnapshot = setAuditSnapshot(current);
        const archived = await updateSet(ctx.tx, current.id, {
          status: "ARCHIVADO",
          activeBranchKey: null,
          archivedAt: new Date(),
          archivedBy: { connect: { id: auth.actor.userId } },
        });
        archivedSetId = archived.id;
        await auditSet(
          ctx,
          "ACCOUNT_MAPPING_SET_STATUS_CHANGED",
          archived,
          previousSnapshot,
          { reason: `Reemplazado por ${existing.code}-v${existing.version}.` },
        );
      }

      const before = setAuditSnapshot(existing);
      const activated = await updateSet(ctx.tx, existing.id, {
        status: "ACTIVO",
        activeBranchKey: existing.branchKey,
        activatedAt: new Date(),
        activatedBy: { connect: { id: auth.actor.userId } },
      });
      await auditSet(
        ctx,
        "ACCOUNT_MAPPING_SET_STATUS_CHANGED",
        activated,
        before,
        { ruleCount: validation.ruleCount, reason },
      );

      return { setId: activated.id, archivedSetId };
    },
  });
}

/** Archives an active set, leaving its branch scope without a mapping. */
export async function archiveAccountMappingSet(input: {
  setId: string;
  reason: string;
}): Promise<FinancialResult<{ setId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  const reason = sanitizeFinancialText(input.reason, 500);
  if (!reason) {
    return { ok: false, error: "Indica el motivo del archivado." };
  }

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: MAPPING_ROUTES,
    errorMessage: "No se pudo archivar el conjunto de mapeo contable.",
    run: async (ctx) => {
      const existing = await findSetById(ctx.tx, input.setId);
      if (!existing) return ctx.fail(SET_NOT_FOUND_ERROR);
      ctx.ensure(
        existing.status !== "ARCHIVADO",
        "El conjunto ya está archivado.",
      );

      const before = setAuditSnapshot(existing);
      const archived = await updateSet(ctx.tx, existing.id, {
        status: "ARCHIVADO",
        activeBranchKey: null,
        archivedAt: new Date(),
        archivedBy: { connect: { id: auth.actor.userId } },
      });
      await auditSet(
        ctx,
        "ACCOUNT_MAPPING_SET_STATUS_CHANGED",
        archived,
        before,
        { reason },
      );
      return { setId: archived.id };
    },
  });
}

// --- Rules ---------------------------------------------------------------

export type UpsertAccountMappingRuleInput = {
  setId: string;
  event: string;
  component: string;
  debitAccountId: string;
  creditAccountId: string;
  description?: string | null;
};

/**
 * Creates or replaces the rule of one event/component pair inside a draft.
 * Both accounts are required, must exist, must be active and must differ, so a
 * stored rule can only describe a balanced debit/credit pair.
 */
export async function upsertAccountMappingRule(
  input: UpsertAccountMappingRuleInput,
): Promise<FinancialResult<{ ruleId: string; created: boolean }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isAccountingEventTypeValue(input.event)) {
    return { ok: false, error: INVALID_EVENT_ERROR };
  }
  if (!isAccountingEventComponentValue(input.component)) {
    return { ok: false, error: INVALID_COMPONENT_ERROR };
  }
  const { event, component } = input;

  if (!isComponentAllowedForEvent(event, component)) {
    return {
      ok: false,
      error: `El componente ${accountingEventComponentLabels[component]} no corresponde al evento ${accountingEventTypeLabels[event]}.`,
    };
  }
  if (input.debitAccountId === input.creditAccountId) {
    return { ok: false, error: SAME_ACCOUNT_ERROR };
  }

  const description = input.description
    ? sanitizeFinancialText(input.description, 300)
    : null;

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: MAPPING_ROUTES,
    uniqueErrorMessages: MAPPING_UNIQUE_MESSAGES,
    errorMessage: "No se pudo guardar la regla de mapeo contable.",
    run: async (ctx) => {
      const set = await findSetById(ctx.tx, input.setId);
      if (!set) return ctx.fail(SET_NOT_FOUND_ERROR);
      ctx.ensure(set.status === "BORRADOR", SET_NOT_DRAFT_ERROR);

      // Account state comes from the database inside this transaction, never
      // from the client. FF1.1: the check is the full posting rule, so a
      // grouping header, an archived account or an unapproved template account
      // cannot be mapped either.
      const accounts = await ctx.tx.chartAccount.findMany({
        where: { id: { in: [input.debitAccountId, input.creditAccountId] } },
        select: { id: true, ...postingStateSelect },
      });
      const debit = accounts.find(
        (account) => account.id === input.debitAccountId,
      );
      const credit = accounts.find(
        (account) => account.id === input.creditAccountId,
      );
      if (!debit) return ctx.fail("La cuenta de debe no existe.");
      if (!credit) return ctx.fail("La cuenta de haber no existe.");

      const debitBlock = describeChartAccountPostingBlock(debit);
      if (debitBlock) return ctx.fail(debitBlock);
      const creditBlock = describeChartAccountPostingBlock(credit);
      if (creditBlock) return ctx.fail(creditBlock);

      const result = await upsertRule(ctx.tx, {
        setId: set.id,
        event,
        component,
        debitAccountId: input.debitAccountId,
        creditAccountId: input.creditAccountId,
        description,
      });

      await ctx.audit({
        domain: "CONTABILIDAD",
        action: result.created
          ? "ACCOUNT_MAPPING_RULE_CREATED"
          : "ACCOUNT_MAPPING_RULE_UPDATED",
        entityType: "ACCOUNT_MAPPING_RULE",
        entityId: result.rule.id,
        entityCode: `${set.code}-v${set.version}·${event}·${component}`,
        branchId: set.branchId,
        after: {
          event,
          component,
          debitAccountCode: debit.code,
          creditAccountCode: credit.code,
          description,
        },
        metadata: {
          component: "LINE",
          operation: result.created ? "CREATE" : "UPDATE",
        },
      });

      return { ruleId: result.rule.id, created: result.created };
    },
  });
}

/** Removes a rule from a draft. Rules of active/archived sets are immutable. */
export async function removeAccountMappingRule(input: {
  ruleId: string;
}): Promise<FinancialResult<{ ruleId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: MAPPING_ROUTES,
    errorMessage: "No se pudo retirar la regla de mapeo contable.",
    run: async (ctx) => {
      const rule = await findRuleById(ctx.tx, input.ruleId);
      if (!rule) return ctx.fail(RULE_NOT_FOUND_ERROR);

      const set = await findSetById(ctx.tx, rule.setId);
      if (!set) return ctx.fail(SET_NOT_FOUND_ERROR);
      ctx.ensure(set.status === "BORRADOR", SET_NOT_DRAFT_ERROR);

      await deleteRule(ctx.tx, rule.id);
      await ctx.audit({
        domain: "CONTABILIDAD",
        action: "ACCOUNT_MAPPING_RULE_REMOVED",
        entityType: "ACCOUNT_MAPPING_RULE",
        entityId: rule.id,
        entityCode: `${set.code}-v${set.version}·${rule.event}·${rule.component}`,
        branchId: set.branchId,
        before: { event: rule.event, component: rule.component },
        metadata: { component: "LINE", operation: "REMOVE" },
      });
      return { ruleId: rule.id };
    },
  });
}

// --- Reads ---------------------------------------------------------------

function ruleToDTO(rule: MappingRuleWithAccounts): AccountMappingRuleDTO {
  return {
    id: rule.id,
    event: rule.event,
    eventLabel: accountingEventTypeLabels[rule.event],
    component: rule.component,
    componentLabel: accountingEventComponentLabels[rule.component],
    debitAccountCode: rule.debitAccount.code,
    debitAccountName: rule.debitAccount.name,
    debitAccountIsActive: rule.debitAccount.isActive,
    creditAccountCode: rule.creditAccount.code,
    creditAccountName: rule.creditAccount.name,
    creditAccountIsActive: rule.creditAccount.isActive,
    description: rule.description,
  };
}

function setToDTO(
  set: AccountMappingSet,
  ruleCount: number,
  branchCodes: Map<string, string>,
): AccountMappingSetDTO {
  return {
    id: set.id,
    code: set.code,
    version: set.version,
    name: set.name,
    description: set.description,
    status: set.status,
    statusLabel: accountMappingSetStatusLabels[set.status],
    branchCode: set.branchId ? (branchCodes.get(set.branchId) ?? null) : null,
    effectiveFrom: set.effectiveFrom.toISOString(),
    activatedAt: set.activatedAt?.toISOString() ?? null,
    archivedAt: set.archivedAt?.toISOString() ?? null,
    ruleCount,
  };
}

export async function listAccountMappingSets(): Promise<
  FinancialResult<AccountMappingSetDTO[]>
> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const rows = await listSets(getPrisma());
  const branchCodes = await resolveBranchCodesByIds(
    rows
      .map((row) => row.branchId)
      .filter((id): id is string => typeof id === "string"),
  );
  return {
    ok: true,
    data: rows.map((row) => setToDTO(row, row._count.rules, branchCodes)),
  };
}

export async function getAccountMappingSetDetail(
  setId: string,
): Promise<FinancialResult<AccountMappingSetDetailDTO>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const set: MappingSetWithRules | null = await findSetWithRules(
    getPrisma(),
    setId,
  );
  if (!set) return { ok: false, error: SET_NOT_FOUND_ERROR };

  const branchCodes = await resolveBranchCodesByIds(
    set.branchId ? [set.branchId] : [],
  );
  return {
    ok: true,
    data: {
      ...setToDTO(set, set.rules.length, branchCodes),
      rules: set.rules.map(ruleToDTO),
    },
  };
}

export async function getAccountMappingValidation(
  setId: string,
): Promise<FinancialResult<AccountMappingValidationDTO>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const prisma = getPrisma();
  const set = await findSetById(prisma, setId);
  if (!set) return { ok: false, error: SET_NOT_FOUND_ERROR };

  return { ok: true, data: await validateMappingSet(prisma, setId) };
}

/** Rule count of a set, used by callers that only need the size. */
export async function countAccountMappingRules(
  setId: string,
): Promise<FinancialResult<number>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };
  return { ok: true, data: await countRules(getPrisma(), setId) };
}

/**
 * Resolution the posting engine (FF1.4) will consume: the active rule for an
 * event/component in a branch, preferring the branch mapping over the corporate
 * one. Transaction-scoped and unauthenticated by design — the calling action
 * has already authorized, and posting must read the mapping through its own
 * transaction. It returns null instead of guessing: an event with no mapping
 * must stop the posting, never invent an account.
 */
export async function resolveAccountMapping(
  db: MappingDb,
  input: {
    branchId: string | null;
    event: string;
    component: string;
    at?: Date;
  },
): Promise<ResolvedAccountMappingDTO | null> {
  if (!isAccountingEventTypeValue(input.event)) return null;
  if (!isAccountingEventComponentValue(input.component)) return null;

  const rule = await findActiveRule(db, {
    branchKey: mappingBranchKey(input.branchId),
    corporateKey: CORPORATE_MAPPING_BRANCH_KEY,
    event: input.event,
    component: input.component,
    at: input.at ?? new Date(),
  });
  if (!rule) return null;

  return {
    setId: rule.set.id,
    setCode: rule.set.code,
    setVersion: rule.set.version,
    event: rule.event,
    component: rule.component,
    debitAccountId: rule.debitAccountId,
    debitAccountCode: rule.debitAccount.code,
    creditAccountId: rule.creditAccountId,
    creditAccountCode: rule.creditAccount.code,
  };
}
