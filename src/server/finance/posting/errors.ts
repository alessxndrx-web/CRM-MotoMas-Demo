import { FinancialRuleError } from "@/server/finance/errors";

/**
 * Patch FF1.3-A — posting error hierarchy.
 *
 * Every error here extends `FinancialRuleError`, which is not decoration: only
 * a thrown error rolls a Prisma interactive transaction back, and
 * `runFinancialTransaction` already translates that class into the business
 * message the caller receives. Inheriting means the engine needs no error
 * handling of its own and cannot accidentally commit a partial posting.
 *
 * `code` exists so a future caller can branch on the cause — retry a mapping
 * gap, surface a period lock differently — without matching on message text.
 */

export type PostingErrorCode =
  | "STRATEGY_NOT_FOUND"
  | "INVALID_PAYLOAD"
  | "INVALID_REQUEST"
  | "MAPPING_MISSING"
  | "ACCOUNT_NOT_POSTABLE"
  | "UNBALANCED"
  | "PERIOD_CLOSED"
  | "DUPLICATE_POSTING";

export class PostingError extends FinancialRuleError {
  readonly code: PostingErrorCode;

  constructor(code: PostingErrorCode, message: string) {
    super(message);
    this.name = "PostingError";
    this.code = code;
  }
}

export function isPostingError(error: unknown): error is PostingError {
  return error instanceof PostingError;
}

/** No strategy is registered for the event. The engine never guesses. */
export class PostingStrategyNotFoundError extends PostingError {
  constructor(event: string) {
    super(
      "STRATEGY_NOT_FOUND",
      `No hay una estrategia de contabilización registrada para el evento ${event}.`,
    );
    this.name = "PostingStrategyNotFoundError";
  }
}

/** The strategy rejected the payload it was given. */
export class PostingPayloadError extends PostingError {
  constructor(message = "Los datos del evento contable no son válidos.") {
    super("INVALID_PAYLOAD", message);
    this.name = "PostingPayloadError";
  }
}

/** The request itself is malformed, before any strategy is consulted. */
export class PostingRequestError extends PostingError {
  constructor(message: string) {
    super("INVALID_REQUEST", message);
    this.name = "PostingRequestError";
  }
}

/**
 * No active mapping covers an event component. This must stop the posting: an
 * event without a mapping has no accounts, and inventing one is the single
 * worst thing an accounting engine can do.
 */
export class PostingMappingError extends PostingError {
  constructor(event: string, component: string) {
    super(
      "MAPPING_MISSING",
      `No hay un mapeo contable activo para ${event} · ${component}. Configúralo antes de contabilizar.`,
    );
    this.name = "PostingMappingError";
  }
}

/** A mapped account may not receive movements on the accounting date. */
export class PostingAccountError extends PostingError {
  constructor(message: string) {
    super("ACCOUNT_NOT_POSTABLE", message);
    this.name = "PostingAccountError";
  }
}

export class PostingUnbalancedError extends PostingError {
  constructor(debitTotal: number, creditTotal: number) {
    super(
      "UNBALANCED",
      `El asiento generado no cuadra: debe ${debitTotal.toFixed(2)} contra haber ${creditTotal.toFixed(2)}.`,
    );
    this.name = "PostingUnbalancedError";
  }
}

export class PostingPeriodClosedError extends PostingError {
  constructor(message: string) {
    super("PERIOD_CLOSED", message);
    this.name = "PostingPeriodClosedError";
  }
}

/**
 * The event was already posted. Thrown only when the caller asked for a strict
 * posting; the default pipeline returns the existing result instead, because a
 * retry after a timeout must converge rather than fail.
 */
export class PostingDuplicateError extends PostingError {
  constructor(idempotencyKey: string) {
    super(
      "DUPLICATE_POSTING",
      `El evento ${idempotencyKey} ya fue contabilizado.`,
    );
    this.name = "PostingDuplicateError";
  }
}
