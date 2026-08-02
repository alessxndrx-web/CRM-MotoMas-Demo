import {
  PostingPayloadError,
  PostingStrategyNotFoundError,
} from "@/server/finance/posting/errors";
import {
  postingRegistry,
  type PostingRegistry,
} from "@/server/finance/posting/registry";
import type {
  PostingPlan,
  PostingRequest,
} from "@/server/finance/posting/shared";

/**
 * Patch FF1.3-A — posting dispatcher.
 *
 * Turns a business event into an accounting plan by delegating to the strategy
 * that owns it. It contains no knowledge of any event: it looks one up, asks it
 * to narrow its own payload, and asks it to declare its components.
 *
 * No database access, no transaction, no side effect. Dispatching is a pure
 * function of the request and the registry, which is what allows the whole
 * accounting shape of an event to be tested without a database.
 */

export function dispatchPosting(
  request: PostingRequest,
  registry: PostingRegistry = postingRegistry,
): PostingPlan {
  const strategy = registry.find(request.event);
  if (!strategy) throw new PostingStrategyNotFoundError(request.event);

  const payload = strategy.parse(request.payload);
  if (payload === null || payload === undefined) {
    throw new PostingPayloadError(
      `Los datos del evento ${request.event} no son válidos para contabilizar.`,
    );
  }

  const components = strategy.plan(payload, {
    event: request.event,
    source: request.source,
    branchId: request.branchId,
    accountingDate: request.accountingDate,
    currency: request.currency ?? null,
  });

  return { event: request.event, components };
}

/** What the engine can post today. Empty until FF1.3-B registers strategies. */
export function listPostableEvents(
  registry: PostingRegistry = postingRegistry,
): Array<{ event: string; description: string }> {
  return registry
    .list()
    .map((strategy) => ({
      event: strategy.event,
      description: strategy.description,
    }));
}
