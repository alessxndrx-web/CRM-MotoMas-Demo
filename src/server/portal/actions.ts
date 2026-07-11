"use server";

import { lookupPublicPortalStatus } from "@/server/portal/queries";
import {
  PUBLIC_LOOKUP_NOT_FOUND,
  type PublicLookupInput,
  type PublicPortalLookupResultDTO,
} from "@/server/portal/shared";

/**
 * Public (unauthenticated) portal lookup action (Patch 3.6A). Thin wrapper over
 * `lookupPublicPortalStatus` so the public tracking form can call it directly
 * once the UI is connected in a later patch. It returns either the public-safe
 * result or a single generic not-found message — never a reason that would
 * reveal whether the code or the verification field was the incorrect part.
 *
 * This action is NOT imported by any portal route yet.
 */

export type PublicPortalLookupActionResult =
  | { ok: true; result: PublicPortalLookupResultDTO }
  | { ok: false; message: string };

export async function lookupPublicPortalStatusAction(
  input: PublicLookupInput,
): Promise<PublicPortalLookupActionResult> {
  const result = await lookupPublicPortalStatus({
    code: input.code ?? null,
    phone: input.phone ?? null,
    identification: input.identification ?? null,
  });
  if (!result) return { ok: false, message: PUBLIC_LOOKUP_NOT_FOUND };
  return { ok: true, result };
}
