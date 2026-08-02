import type { PostingEventValue } from "@/server/finance/posting/shared";
import {
  eraseStrategy,
  type PostingStrategy,
  type RegisteredPostingStrategy,
} from "@/server/finance/posting/strategy";

/**
 * Patch FF1.3-A — registration-based strategy registry.
 *
 * This is the file that makes the engine open for extension and closed for
 * modification. There is no `switch (event)` and no `if (eventType)` anywhere in
 * the pipeline: a strategy declares which event it owns and registers itself, so
 * adding an accounting event never edits the dispatcher, the validator, the
 * builder or the writer.
 *
 * Registering the same event twice throws instead of overwriting. A silent
 * overwrite is how two modules end up quietly disagreeing about how a sale is
 * posted, and the winner would depend on module import order.
 */

export type PostingRegistry = {
  register<TPayload>(strategy: PostingStrategy<TPayload>): void;
  /** The strategy for an event, or null when none is registered. */
  find(event: PostingEventValue): RegisteredPostingStrategy | null;
  has(event: PostingEventValue): boolean;
  /** Every registered strategy, for diagnostics and documentation. */
  list(): RegisteredPostingStrategy[];
  /** Test helper: drops every registration. Never called by the engine. */
  clear(): void;
};

export function createPostingRegistry(): PostingRegistry {
  const strategies = new Map<PostingEventValue, RegisteredPostingStrategy>();

  return {
    register(strategy) {
      if (strategies.has(strategy.event)) {
        throw new Error(
          `Ya hay una estrategia de contabilización registrada para ${strategy.event}.`,
        );
      }
      strategies.set(strategy.event, eraseStrategy(strategy));
    },
    find(event) {
      return strategies.get(event) ?? null;
    },
    has(event) {
      return strategies.has(event);
    },
    list() {
      return [...strategies.values()];
    },
    clear() {
      strategies.clear();
    },
  };
}

/**
 * The registry the engine uses by default.
 *
 * **It is empty in FF1.3-A, and that is the deliverable.** No business event can
 * be posted until FF1.3-B registers its first strategy, so shipping this
 * infrastructure cannot change the accounting behaviour of anything that exists
 * today.
 *
 * Module-level state is safe here because a registry holds pure functions, not
 * request data: nothing per-user, per-branch or per-transaction is stored, so
 * there is nothing to leak between requests. The pipeline still accepts an
 * explicit registry, which is what tests use instead of mutating this one.
 */
export const postingRegistry = createPostingRegistry();

/** Convenience wrapper over the default registry. */
export function registerStrategy<TPayload>(
  strategy: PostingStrategy<TPayload>,
): void {
  postingRegistry.register(strategy);
}
