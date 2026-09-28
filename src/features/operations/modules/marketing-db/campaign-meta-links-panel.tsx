"use client";

import { useRouter } from "next/navigation";
import { Link2, Unlink } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  linkMetaCampaignAction,
  unlinkMetaCampaignAction,
} from "@/server/marketing/actions";
import type { CampaignMetaAttributionDTO } from "@/server/marketing/shared";

/**
 * Patch CRM-INT3 — qué campañas de Meta Ads cuentan para esta campaña.
 *
 * El vínculo lo decide una persona: nada en el `campaign_id` de Meta dice a qué
 * campaña de MotoMas pertenece. Al vincular se atribuyen también los leads que
 * ya habían entrado; al desvincular se deshace sólo lo que el vínculo atribuyó.
 *
 * Las cifras de cada fila explican la conciliación: por qué un lead de esa
 * campaña de Meta puede no contar aquí (otra campaña, fuera de cobertura o de
 * fechas, o esperando sucursal en el andén).
 */
export function CampaignMetaLinksPanel({
  attribution,
  campaignId,
  canEdit,
}: {
  attribution: CampaignMetaAttributionDTO;
  campaignId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [metaCampaignId, setMetaCampaignId] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function link(id: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await linkMetaCampaignAction({ campaignId, metaCampaignId: id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(
        `Campaña de Meta vinculada: ${result.attributed} lead(s) atribuidos` +
          (result.outOfScope
            ? `, ${result.outOfScope} fuera de la cobertura o de las fechas de esta campaña.`
            : "."),
      );
      setMetaCampaignId("");
      router.refresh();
    });
  }

  function unlink(id: string) {
    setError("");
    setMessage("");
    startTransition(async () => {
      const result = await unlinkMetaCampaignAction({ campaignId, metaCampaignId: id });
      setConfirming(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage(`Campaña de Meta desvinculada: ${result.detached} lead(s) quedaron sin campaña.`);
      router.refresh();
    });
  }

  return (
    <Card className="p-6">
      <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
        <Link2 aria-hidden className="h-5 w-5 text-slate-400" />
        Meta Lead Ads
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Los leads que llegan por un anuncio de estas campañas de Meta cuentan para ésta si cubre su
        sucursal y estaba vigente cuando se llenó el formulario.
      </p>

      {error ? (
        <div className="mt-3">
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}
      {message ? (
        <div className="mt-3">
          <Notice tone="success">{message}</Notice>
        </div>
      ) : null}

      {attribution.links.length ? (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <THead>
              <tr>
                <TH>Campaña de Meta</TH>
                <TH align="right">Leads</TH>
                <TH align="right">Aquí</TH>
                <TH align="right">En otra campaña</TH>
                <TH align="right">Sin campaña</TH>
                <TH align="right">En el andén</TH>
                {canEdit ? (
                  <TH align="right">
                    <span className="sr-only">Acción</span>
                  </TH>
                ) : null}
              </tr>
            </THead>
            <TBody>
              {attribution.links.map((link) => (
                <TR key={link.metaCampaignId}>
                  <TD>
                    <span className="font-medium text-slate-900">{link.label ?? "Sin nombre"}</span>
                    <span className="block font-mono text-xs text-slate-500">{link.metaCampaignId}</span>
                    <span className="block text-xs text-slate-400">
                      Vinculada por {link.createdByName ?? "—"} ·{" "}
                      {new Date(link.createdAt).toLocaleDateString("es-NI")}
                    </span>
                  </TD>
                  <TD numeric>{link.leadsTotal}</TD>
                  <TD numeric>{link.attributedHere}</TD>
                  <TD numeric>{link.attributedElsewhere}</TD>
                  <TD numeric>{link.unattributed}</TD>
                  <TD numeric>{link.pendingInStaging}</TD>
                  {canEdit ? (
                    <TD align="right">
                      {confirming === link.metaCampaignId ? (
                        <span className="flex justify-end gap-2">
                          <Button
                            disabled={pending}
                            onClick={() => unlink(link.metaCampaignId)}
                            size="sm"
                            variant="danger"
                          >
                            Confirmar
                          </Button>
                          <Button onClick={() => setConfirming(null)} size="sm" variant="ghost">
                            Cancelar
                          </Button>
                        </span>
                      ) : (
                        <Button
                          disabled={pending}
                          onClick={() => setConfirming(link.metaCampaignId)}
                          size="sm"
                          variant="secondary"
                        >
                          <Unlink aria-hidden className="h-4 w-4" />
                          Desvincular
                        </Button>
                      )}
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
          {confirming ? (
            <p className="mt-2 text-xs text-slate-500">
              Desvincular quita esta campaña sólo a los leads que el vínculo atribuyó; los corregidos a
              mano la conservan.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Ninguna campaña de Meta vinculada.</p>
      )}

      {canEdit ? (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Vincular una campaña de Meta</p>
          {attribution.candidates.length ? (
            <ul className="mt-2 space-y-2">
              {attribution.candidates.slice(0, 8).map((candidate) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  key={candidate.metaCampaignId}
                >
                  <span>
                    <span className="font-medium text-slate-900">{candidate.name ?? "Sin nombre"}</span>{" "}
                    <span className="font-mono text-xs text-slate-500">{candidate.metaCampaignId}</span>
                    <span className="block text-xs text-slate-500">
                      {candidate.leads} lead(s) sin vincular
                      {candidate.pendingInStaging ? ` · ${candidate.pendingInStaging} en el andén` : ""}
                    </span>
                  </span>
                  <Button
                    disabled={pending}
                    onClick={() => link(candidate.metaCampaignId)}
                    size="sm"
                    variant="secondary"
                  >
                    Vincular a esta campaña
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Todavía no han entrado leads de campañas de Meta sin vincular.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Field
              hint="Administrador de anuncios → columna «Identificador de la campaña»."
              label="Identificador de la campaña de Meta"
            >
              <Input
                inputMode="numeric"
                onChange={(event) => setMetaCampaignId(event.target.value)}
                placeholder="120210000000000000"
                value={metaCampaignId}
              />
            </Field>
            <Button
              disabled={pending || !metaCampaignId.trim()}
              onClick={() => link(metaCampaignId.trim())}
            >
              Vincular
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
