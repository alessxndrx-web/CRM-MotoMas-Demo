import type { DocumentSequence } from "@prisma/client";

import { getPrisma } from "@/server/db/prisma";
import {
  authorizeFinancialFoundation,
  resolveBranchCodesByIds,
  resolveFinancialBranchId,
} from "@/server/finance/context";
import {
  FinancialRuleError,
  UNKNOWN_BRANCH_ERROR,
} from "@/server/finance/errors";
import {
  consumeNextValue,
  createSequence,
  findSequenceByKey,
  listSequences,
  recordIssuedNumber,
  updateSequence,
  type SequenceDb,
} from "@/server/finance/numbering/repository";
import {
  MAX_SEQUENCE_VALUE,
  defaultSeriesPrefixes,
  financialDocumentSeriesLabels,
  formatDocumentNumber,
  isFinancialDocumentSeriesValue,
  isValidFiscalYear,
  resolveFiscalYear,
  sanitizeSequencePadding,
  sanitizeSequencePrefix,
  sequenceBranchKey,
  type AllocatedDocumentNumber,
  type DocumentSequenceDTO,
  type FinancialDocumentSeriesValue,
} from "@/server/finance/numbering/shared";
import {
  runFinancialTransaction,
  type FinancialResult,
  type FinancialTransactionContext,
} from "@/server/finance/transaction";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.0 — sequential document numbering.
 *
 * Two distinct surfaces:
 *
 * - {@link allocateDocumentNumber} is transaction-scoped and takes no session.
 *   It is called from inside an already-authorized financial action, so the
 *   number it consumes rolls back with the document that failed to be created.
 *   It performs NO authorization — the calling action must have done it.
 * - The configuration functions authorize on their own (Admin/Contador) and
 *   write an audit event, exactly like every other Contabilidad write.
 *
 * Nothing here is wired into the existing Caja/Contabilidad create actions:
 * FF1.0 only builds the service. Existing numbers are never rewritten; a series
 * starts numbering the documents created after it is adopted in a later patch.
 */

const SEQUENCE_ROUTES = ["/panel/contabilidad"] as const;

const SEQUENCE_UNIQUE_MESSAGES = {
  document_sequences_series_branch_key_fiscal_year_key:
    "Ya existe una serie configurada para ese tipo, sucursal y año fiscal.",
} as const;

// TODO(FF1.4): this service still has no caller. It is NOT dead code — it is the
// numbering contract the posting and document actions will consume, documented
// in docs/FINANCIAL_FOUNDATION.md §4. Do not delete it as unused.
export const SERIES_NOT_CONFIGURED_ERROR =
  "No hay una serie de numeración configurada para este documento.";
export const SERIES_INACTIVE_ERROR =
  "La serie de numeración está inactiva y no puede emitir números.";
export const SERIES_EXHAUSTED_ERROR =
  "La serie de numeración alcanzó su valor máximo. Configura una serie nueva.";
export const INVALID_SERIES_ERROR = "La serie de numeración no es válida.";
export const INVALID_FISCAL_YEAR_ERROR = "El año fiscal no es válido.";
export const INVALID_PREFIX_ERROR =
  "El prefijo solo admite letras, números, guion y guion bajo (máximo 20).";
export const INVALID_PADDING_ERROR =
  "El relleno de dígitos debe estar entre 1 y 12.";
/** Re-exported from the shared vocabulary so the wording exists once (TD-01). */
export { UNKNOWN_BRANCH_ERROR };

export type AllocateDocumentNumberInput = {
  series: FinancialDocumentSeriesValue;
  /** Branch owning the counter, or null for a corporate series. */
  branchId: string | null;
  /** Accounting date of the document; decides the fiscal year. */
  date: Date;
  /** Month the fiscal year starts on (1-12). Defaults to January. */
  fiscalYearStartMonth?: number;
};

/**
 * Consumes the next number of a series inside the caller's transaction.
 *
 * Fails closed: an unconfigured or inactive series never falls back to a random
 * number, because a silent fallback would reintroduce exactly the gap-and-
 * duplicate risk this service exists to remove.
 */
export async function allocateDocumentNumber(
  db: SequenceDb,
  input: AllocateDocumentNumberInput,
): Promise<AllocatedDocumentNumber> {
  const fiscalYear = resolveFiscalYear(
    input.date,
    input.fiscalYearStartMonth ?? 1,
  );
  if (fiscalYear === null || !isValidFiscalYear(fiscalYear)) {
    throw new FinancialRuleError(INVALID_FISCAL_YEAR_ERROR);
  }

  const sequence = await findSequenceByKey(db, {
    series: input.series,
    branchKey: sequenceBranchKey(input.branchId),
    fiscalYear,
  });
  if (!sequence) throw new FinancialRuleError(SERIES_NOT_CONFIGURED_ERROR);
  if (!sequence.isActive) throw new FinancialRuleError(SERIES_INACTIVE_ERROR);
  if (sequence.nextValue >= MAX_SEQUENCE_VALUE) {
    throw new FinancialRuleError(SERIES_EXHAUSTED_ERROR);
  }

  const consumed = await consumeNextValue(db, sequence.id);
  const number = formatDocumentNumber({
    prefix: consumed.sequence.prefix,
    fiscalYear: consumed.sequence.fiscalYear,
    padding: consumed.sequence.padding,
    value: consumed.value,
  });
  await recordIssuedNumber(db, sequence.id, number, new Date());

  return { number, value: consumed.value, sequenceId: sequence.id };
}

// --- Configuration -------------------------------------------------------

function auditSnapshot(sequence: DocumentSequence) {
  return {
    series: sequence.series,
    fiscalYear: sequence.fiscalYear,
    prefix: sequence.prefix,
    padding: sequence.padding,
    nextValue: sequence.nextValue,
    isActive: sequence.isActive,
    notes: sequence.notes,
  };
}

function auditCode(sequence: DocumentSequence): string {
  return `${sequence.series}-${sequence.fiscalYear}`;
}

async function auditSequence(
  ctx: FinancialTransactionContext,
  action:
    | "DOCUMENT_SEQUENCE_CREATED"
    | "DOCUMENT_SEQUENCE_UPDATED"
    | "DOCUMENT_SEQUENCE_STATUS_CHANGED",
  sequence: DocumentSequence,
  before: ReturnType<typeof auditSnapshot> | null,
): Promise<void> {
  await ctx.audit({
    domain: "CONTABILIDAD",
    action,
    entityType: "DOCUMENT_SEQUENCE",
    entityId: sequence.id,
    entityCode: auditCode(sequence),
    branchId: sequence.branchId,
    before,
    after: auditSnapshot(sequence),
    metadata: {
      component: "HEADER",
      operation:
        action === "DOCUMENT_SEQUENCE_CREATED"
          ? "CREATE"
          : action === "DOCUMENT_SEQUENCE_STATUS_CHANGED"
            ? "STATUS_CHANGE"
            : "UPDATE",
    },
  });
}

export type ConfigureDocumentSequenceInput = {
  series: string;
  /** Branch code; omit or leave empty for a corporate series. */
  branchCode?: string | null;
  fiscalYear: number;
  prefix?: string | null;
  padding?: number | null;
  notes?: string | null;
};

/**
 * Creates a series, or updates the prefix/padding/notes of an existing one.
 *
 * The counter itself (`nextValue`) is never accepted from the caller: rewinding
 * a live counter would reissue numbers that already exist on documents. A
 * different starting point is expressed by configuring a new series.
 */
export async function configureDocumentSequence(
  input: ConfigureDocumentSequenceInput,
): Promise<FinancialResult<{ sequenceId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  if (!isFinancialDocumentSeriesValue(input.series)) {
    return { ok: false, error: INVALID_SERIES_ERROR };
  }
  const series = input.series;

  if (!isValidFiscalYear(input.fiscalYear)) {
    return { ok: false, error: INVALID_FISCAL_YEAR_ERROR };
  }

  const branch = await resolveFinancialBranchId(input.branchCode);
  if (!branch.ok) return { ok: false, error: UNKNOWN_BRANCH_ERROR };

  const prefix =
    input.prefix === undefined || input.prefix === null
      ? defaultSeriesPrefixes[series]
      : sanitizeSequencePrefix(input.prefix);
  if (!prefix) return { ok: false, error: INVALID_PREFIX_ERROR };

  const padding = sanitizeSequencePadding(input.padding);
  if (padding === null) return { ok: false, error: INVALID_PADDING_ERROR };

  const notes = input.notes ? sanitizeFinancialText(input.notes, 500) : null;
  const branchKey = sequenceBranchKey(branch.branchId);

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: SEQUENCE_ROUTES,
    uniqueErrorMessages: SEQUENCE_UNIQUE_MESSAGES,
    errorMessage: "No se pudo configurar la serie de numeración.",
    run: async (ctx) => {
      const existing = await findSequenceByKey(ctx.tx, {
        series,
        branchKey,
        fiscalYear: input.fiscalYear,
      });

      if (!existing) {
        const created = await createSequence(ctx.tx, {
          series,
          branchId: branch.branchId,
          branchKey,
          fiscalYear: input.fiscalYear,
          prefix,
          padding,
          notes,
        });
        await auditSequence(ctx, "DOCUMENT_SEQUENCE_CREATED", created, null);
        return { sequenceId: created.id };
      }

      // Changing the prefix or width of a series that already issued numbers
      // would make two different formats coexist inside one series.
      ctx.ensure(
        existing.nextValue === 1 ||
          (existing.prefix === prefix && existing.padding === padding),
        "La serie ya emitió números: no puedes cambiar su prefijo ni su relleno. Configura una serie nueva.",
      );

      const before = auditSnapshot(existing);
      const updated = await updateSequence(ctx.tx, existing.id, {
        prefix,
        padding,
        notes,
      });
      await auditSequence(ctx, "DOCUMENT_SEQUENCE_UPDATED", updated, before);
      return { sequenceId: updated.id };
    },
  });
}

export type SetDocumentSequenceActiveInput = {
  sequenceId: string;
  isActive: boolean;
};

/** Enables or disables a series without ever touching its counter. */
export async function setDocumentSequenceActive(
  input: SetDocumentSequenceActiveInput,
): Promise<FinancialResult<{ sequenceId: string }>> {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return { ok: false, error: auth.error };

  return runFinancialTransaction({
    actor: auth.actor,
    revalidate: SEQUENCE_ROUTES,
    errorMessage: "No se pudo actualizar el estado de la serie.",
    run: async (ctx) => {
      const existing = await ctx.tx.documentSequence.findUnique({
        where: { id: input.sequenceId },
      });
      if (!existing) return ctx.fail("La serie de numeración no existe.");
      ctx.ensure(
        existing.isActive !== input.isActive,
        input.isActive
          ? "La serie ya está activa."
          : "La serie ya está inactiva.",
      );

      const before = auditSnapshot(existing);
      const updated = await updateSequence(ctx.tx, existing.id, {
        isActive: input.isActive,
      });
      await auditSequence(
        ctx,
        "DOCUMENT_SEQUENCE_STATUS_CHANGED",
        updated,
        before,
      );
      return { sequenceId: updated.id };
    },
  });
}

function toDTO(
  sequence: DocumentSequence,
  branchCodes: Map<string, string>,
): DocumentSequenceDTO {
  return {
    id: sequence.id,
    series: sequence.series,
    seriesLabel: financialDocumentSeriesLabels[sequence.series],
    branchCode: sequence.branchId
      ? (branchCodes.get(sequence.branchId) ?? null)
      : null,
    fiscalYear: sequence.fiscalYear,
    prefix: sequence.prefix,
    padding: sequence.padding,
    nextValue: sequence.nextValue,
    lastNumber: sequence.lastNumber,
    lastIssuedAt: sequence.lastIssuedAt?.toISOString() ?? null,
    isActive: sequence.isActive,
    notes: sequence.notes,
    preview: formatDocumentNumber({
      prefix: sequence.prefix,
      fiscalYear: sequence.fiscalYear,
      padding: sequence.padding,
      value: sequence.nextValue,
    }),
  };
}

export type ListDocumentSequencesInput = {
  series?: string;
  fiscalYear?: number;
};

/** Authorized read. Only a global accounting scope reaches this listing. */
export async function listDocumentSequences(
  input: ListDocumentSequencesInput = {},
): Promise<FinancialResult<DocumentSequenceDTO[]>> {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return { ok: false, error: auth.error };

  const series =
    input.series && isFinancialDocumentSeriesValue(input.series)
      ? input.series
      : undefined;
  if (input.series && !series) {
    return { ok: false, error: INVALID_SERIES_ERROR };
  }
  if (input.fiscalYear !== undefined && !isValidFiscalYear(input.fiscalYear)) {
    return { ok: false, error: INVALID_FISCAL_YEAR_ERROR };
  }

  const rows = await listSequences(getPrisma(), {
    ...(series ? { series } : {}),
    ...(input.fiscalYear ? { fiscalYear: input.fiscalYear } : {}),
  });
  const branchCodes = await resolveBranchCodesByIds(
    rows
      .map((row) => row.branchId)
      .filter((id): id is string => typeof id === "string"),
  );

  return { ok: true, data: rows.map((row) => toDTO(row, branchCodes)) };
}
