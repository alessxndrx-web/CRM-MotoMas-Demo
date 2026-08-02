import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  DATABASE_REQUIRED_ERROR,
  FinancialRuleError,
  describeFinancialError,
  type UniqueConstraintMessages,
} from "@/server/finance/errors";
import { recordFinancialAuditEvent } from "@/server/financial-audit/record";
import type { RecordFinancialAuditEventInput } from "@/server/financial-audit/record";
import type { FinancialAuditActor } from "@/server/financial-audit/shared";

/**
 * Patch FF1.0 — one place for the transactional plumbing every financial write
 * repeats today: database availability, `$transaction`, atomic audit writing,
 * error translation and cache revalidation after commit.
 *
 * It codifies the invariants the Caja/Contabilidad actions already follow by
 * hand, so a future module cannot accidentally skip one:
 *
 * 1. No financial write runs without a configured database.
 * 2. The audit event is written with the same transaction client as the
 *    mutation, so history and change commit or roll back together.
 * 3. A rejected business rule aborts the transaction — it never returns a
 *    failure while leaving partial writes committed.
 * 4. `revalidatePath` runs only after the transaction commits, never inside it.
 * 5. Errors reaching the caller are business messages, never driver text.
 *
 * This helper does NOT authorize. Authorization stays where it is today: each
 * module's `authorizeCaja` / `authorizeContabilidad` resolves the actor and
 * scope from the session before calling in. Passing an actor here is not a
 * permission check and must never be treated as one.
 *
 * Existing actions keep working untouched; adoption is incremental.
 */

export type FinancialTransactionActor = FinancialAuditActor;

/** Audit event minus the actor, which the helper supplies from the caller. */
export type FinancialAuditIntent = Omit<
  RecordFinancialAuditEventInput,
  "actor"
>;

export type FinancialTransactionContext = {
  /** Transaction client. Every read and write of the operation must use it. */
  readonly tx: Prisma.TransactionClient;
  readonly actor: FinancialTransactionActor;
  /**
   * Appends an audit event inside the current transaction. A no-op update
   * (nothing allowlisted changed) is suppressed by the audit writer itself.
   */
  audit(intent: FinancialAuditIntent): Promise<void>;
  /** Rejects the operation and rolls the transaction back. */
  fail(message: string): never;
  /** `fail` guarded by a condition, for linear rule checks. */
  ensure(condition: boolean, message: string): void;
};

export type FinancialResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type FinancialTransactionOptions<T> = {
  actor: FinancialTransactionActor;
  /** Routes revalidated after a successful commit. */
  revalidate?: readonly string[];
  /** Message used when the failure cannot be classified. */
  errorMessage?: string;
  /** Constraint name → business message for unique violations. */
  uniqueErrorMessages?: UniqueConstraintMessages;
  /** Interactive transaction timeout; defaults to the Prisma default (5s). */
  timeoutMs?: number;
  /** Maximum wait for a connection from the pool. */
  maxWaitMs?: number;
  run: (ctx: FinancialTransactionContext) => Promise<T>;
};

function buildContext(
  tx: Prisma.TransactionClient,
  actor: FinancialTransactionActor,
): FinancialTransactionContext {
  const fail = (message: string): never => {
    throw new FinancialRuleError(message);
  };

  return {
    tx,
    actor,
    audit: async (intent) => {
      await recordFinancialAuditEvent(tx, { ...intent, actor });
    },
    fail,
    ensure: (condition, message) => {
      if (!condition) fail(message);
    },
  };
}

/**
 * Runs `run` inside a single financial transaction and returns a business
 * result. `run` may call `ctx.fail` / `ctx.ensure` to reject a rule; anything it
 * returns becomes `data` once the transaction commits.
 */
export async function runFinancialTransaction<T>(
  options: FinancialTransactionOptions<T>,
): Promise<FinancialResult<T>> {
  if (!isDatabaseConfigured()) {
    return { ok: false, error: DATABASE_REQUIRED_ERROR };
  }

  try {
    const data = await getPrisma().$transaction(
      (tx) => options.run(buildContext(tx, options.actor)),
      {
        ...(options.timeoutMs === undefined
          ? {}
          : { timeout: options.timeoutMs }),
        ...(options.maxWaitMs === undefined
          ? {}
          : { maxWait: options.maxWaitMs }),
      },
    );

    // Only after the commit: a revalidation inside the transaction would
    // publish a view of data that could still roll back.
    for (const route of options.revalidate ?? []) revalidatePath(route);

    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: describeFinancialError(
        error,
        options.errorMessage,
        options.uniqueErrorMessages,
      ),
    };
  }
}
