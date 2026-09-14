"use server";

import { createPortalToken } from "@/server/auth/session";
import {
  lookupPublicPortalStatus,
  resolveVerifiedCustomerId,
} from "@/server/portal/queries";
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
 * Patch CRM-QA1 añade el testigo del portal. Una consulta correcta ya demostró
 * que quien pregunta es el titular del proceso; el testigo es esa misma prueba,
 * firmada, para que las pantallas de pago y de avisos no tengan que pedir otra
 * vez el teléfono o la cédula en cada petición.
 *
 * **Sólo se emite cuando la consulta resuelve a un cliente real.** Un lead que
 * todavía no es cliente consulta su estado igual, pero no recibe testigo: no
 * tiene cobros que ver.
 */

export type PublicPortalLookupActionResult =
  | {
      ok: true;
      result: PublicPortalLookupResultDTO;
      /** Nulo cuando el proceso aún no tiene cliente asociado. */
      portalToken: string | null;
    }
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

  const verified = await resolveVerifiedCustomerId({
    code: input.code ?? null,
    phone: input.phone ?? null,
    identification: input.identification ?? null,
  });
  const portalToken = verified
    ? await createPortalToken({
        customerId: verified.customerId,
        trackingCode: verified.trackingCode,
      })
    : null;

  return { ok: true, result, portalToken };
}
