import type {
  PostingComponentAmount,
  PostingEventValue,
  PostingRequest,
} from "@/server/finance/posting/shared";

/**
 * Patch FF1.3-A — the extension point of the engine.
 *
 * A strategy owns exactly one accounting event and answers one question: given
 * this event's data, which monetary components does it move and for how much?
 *
 * What a strategy must NOT do, by design and not by convention:
 *
 * - It never touches the database. `plan` is synchronous and pure, so an event's
 *   accounting shape can be reasoned about — and tested — without a transaction.
 * - It never chooses an account. Accounts come from the mapping, so accounting
 *   policy stays in the catalogue the accountant controls rather than compiled
 *   into code.
 * - It never decides debit or credit. The mapping already carries both sides,
 *   which is what makes every entry the engine builds balanced by construction.
 *
 * Adding an event therefore means adding a file and registering it. The
 * dispatcher, the validator, the builder and the writer are never modified —
 * that is the whole point of the registry.
 */
export interface PostingStrategy<TPayload = unknown> {
  /** The single event this strategy owns. */
  readonly event: PostingEventValue;

  /** Human description, surfaced when listing what the engine can post. */
  readonly description: string;

  /**
   * Narrows the opaque payload of the request. Returning `null` rejects the
   * event with an invalid-payload error.
   *
   * This is the only place a payload is trusted, and it is the strategy's own
   * boundary: the framework never casts.
   */
  parse(payload: unknown): TPayload | null;

  /**
   * Declares the monetary components of the event.
   *
   * Pure and synchronous. An empty result means "nothing to post" and is
   * rejected upstream: an event that moves no money should not have reached the
   * engine at all.
   */
  plan(payload: TPayload, request: PostingPlanInput): PostingComponentAmount[];
}

/** The request data a strategy may read while planning. Never the payload. */
export type PostingPlanInput = Pick<
  PostingRequest,
  "event" | "source" | "branchId" | "accountingDate" | "currency"
>;

/**
 * Type-erased view the registry stores. `parse` returning `unknown` and `plan`
 * accepting `unknown` keeps the registry free of `any` while each strategy stays
 * strongly typed on its own payload.
 */
export type RegisteredPostingStrategy = {
  readonly event: PostingEventValue;
  readonly description: string;
  parse(payload: unknown): unknown | null;
  plan(payload: unknown, request: PostingPlanInput): PostingComponentAmount[];
};

/**
 * Erases the payload type of a strategy so it can be stored in the registry.
 * The cast lives here, once, instead of at every registration site.
 */
export function eraseStrategy<TPayload>(
  strategy: PostingStrategy<TPayload>,
): RegisteredPostingStrategy {
  return {
    event: strategy.event,
    description: strategy.description,
    parse: (payload) => strategy.parse(payload),
    plan: (payload, request) =>
      strategy.plan(payload as TPayload, request),
  };
}
