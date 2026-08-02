import { resolveAccountMapping } from "@/server/finance/account-mapping/service";
import type { MappingDb } from "@/server/finance/account-mapping/repository";
import { PostingMappingError } from "@/server/finance/posting/errors";
import type {
  PostingComponentValue,
  PostingEventValue,
} from "@/server/finance/posting/shared";

/**
 * Patch FF1.3-A — the contract the posting engine consumes from the account
 * mapping module.
 *
 * **The account-mapping module was not modified.** This file only declares the
 * port the engine depends on and provides the adapter that satisfies it with
 * FF1.0's `resolveAccountMapping`. The engine therefore depends on an interface
 * it owns, not on the mapping service's shape, which is what will let FF1.3-B
 * test the pipeline with a stub resolver and no database.
 *
 * The resolution rule itself is FF1.0's and is unchanged: the branch mapping
 * wins over the corporate one, only ACTIVO sets already in force resolve, and a
 * missing mapping returns null.
 */

/** What the engine needs to know about a resolved component. */
export type ResolvedPostingAccounts = {
  debitAccountId: string;
  debitAccountCode: string;
  creditAccountId: string;
  creditAccountCode: string;
  setCode: string;
  setVersion: number;
};

export type AccountMappingResolverPort = (input: {
  event: PostingEventValue;
  component: PostingComponentValue;
  branchId: string | null;
  at: Date;
}) => Promise<ResolvedPostingAccounts | null>;

/** Adapter over FF1.0. The only place the engine touches the mapping module. */
export function createAccountMappingResolver(
  db: MappingDb,
): AccountMappingResolverPort {
  return async (input) => {
    const resolved = await resolveAccountMapping(db, {
      branchId: input.branchId,
      event: input.event,
      component: input.component,
      at: input.at,
    });
    if (!resolved) return null;
    return {
      debitAccountId: resolved.debitAccountId,
      debitAccountCode: resolved.debitAccountCode,
      creditAccountId: resolved.creditAccountId,
      creditAccountCode: resolved.creditAccountCode,
      setCode: resolved.setCode,
      setVersion: resolved.setVersion,
    };
  };
}

/**
 * Resolves every component of a plan, failing closed on the first gap.
 *
 * An unmapped component stops the whole posting instead of producing a partial
 * entry. A half-posted event is worse than an unposted one: the ledger would
 * balance and still be wrong.
 */
export async function resolvePostingAccounts(
  resolver: AccountMappingResolverPort,
  input: {
    event: PostingEventValue;
    components: readonly PostingComponentValue[];
    branchId: string | null;
    at: Date;
  },
): Promise<Map<PostingComponentValue, ResolvedPostingAccounts>> {
  const resolved = new Map<PostingComponentValue, ResolvedPostingAccounts>();

  for (const component of input.components) {
    if (resolved.has(component)) continue;
    const mapping = await resolver({
      event: input.event,
      component,
      branchId: input.branchId,
      at: input.at,
    });
    if (!mapping) throw new PostingMappingError(input.event, component);
    resolved.set(component, mapping);
  }

  return resolved;
}
