"use client";

import { Link2, UserPlus, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { IdentityResolutionNeeded } from "@/server/crm/shared";

/**
 * Patch CRM-INT2 — cuando no está claro quién es.
 *
 * Lo enseñan el alta de cliente y la conversión de lead cuando el servidor
 * encuentra clientes que **podrían** ser la misma persona sin poder asegurarlo
 * (sólo coincide el teléfono, o hay varias candidatas). La decisión es de una
 * persona y queda registrada:
 *
 * - «Vincular» sólo aparece en las candidatas que quien mira puede ver.
 * - «Es otra persona» sólo aparece si ninguna comparte la cédula y quien mira
 *   puede decidir. Si no puede, se le dice quién sí.
 *
 * Las candidatas fuera de su alcance llegan enmascaradas del servidor: la
 * coincidencia se señala sin convertirse en una forma de leer fichas ajenas.
 */
export function IdentityResolutionPanel({
  linkLabel = "Vincular con este cliente",
  onCreateNew,
  onLink,
  pending,
  resolution,
}: {
  linkLabel?: string;
  onCreateNew?: () => void;
  onLink?: (customerId: string) => void;
  pending: boolean;
  resolution: IdentityResolutionNeeded;
}) {
  return (
    <div
      aria-live="polite"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <p className="flex items-center gap-2 font-semibold">
        <Users aria-hidden className="h-4 w-4" />
        Posible cliente existente
      </p>
      <p className="mt-1">{resolution.reason}</p>
      <ul className="mt-3 space-y-2">
        {resolution.candidates.map((candidate, index) => (
          <li
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
            key={candidate.customerId ?? `oculto-${index}`}
          >
            <span className="min-w-0 text-slate-700">
              <span className="block font-semibold text-slate-900">{candidate.displayName}</span>
              <span className="block text-xs text-slate-500">
                {candidate.displayPhone} · {candidate.branchName}
                {candidate.assignedSellerName ? ` · atiende ${candidate.assignedSellerName}` : ""}
              </span>
              <span className="mt-1 flex flex-wrap gap-1">
                {candidate.matchedBy.map((kind) => (
                  <Badge key={kind} tone={kind === "CEDULA" ? "green" : "orange"}>
                    {kind === "CEDULA" ? "Misma cédula" : "Mismo teléfono"}
                  </Badge>
                ))}
                {candidate.accessible ? null : <Badge tone="slate">Fuera de tu alcance</Badge>}
              </span>
            </span>
            {onLink && candidate.customerId ? (
              <Button
                disabled={pending}
                onClick={() => onLink(candidate.customerId as string)}
                size="sm"
                variant="secondary"
              >
                <Link2 aria-hidden className="h-4 w-4" />
                {linkLabel}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {onCreateNew && resolution.canResolve && resolution.canCreateNew ? (
        <div className="mt-3">
          <Button disabled={pending} onClick={onCreateNew} size="sm" variant="secondary">
            <UserPlus aria-hidden className="h-4 w-4" />
            Es otra persona: registrar cliente nuevo
          </Button>
        </div>
      ) : null}
      {!resolution.canResolve ? (
        <p className="mt-3 text-xs">
          No puedes decidirlo tú: pide a tu líder de ventas o gerente que abra este
          registro y resuelva la coincidencia.
        </p>
      ) : !resolution.canCreateNew ? (
        <p className="mt-3 text-xs">
          Una cédula coincide: no se crea otro cliente. Si no está en tu alcance,
          el gerente o el administrador puede vincularlo o cambiarlo de sucursal.
        </p>
      ) : null}
    </div>
  );
}
