"use client";

import { Megaphone, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  connectMetaAdAccount,
  disconnectMetaAdAccount,
  resyncMetaAdAccountMetadata,
  updateMetaAdAccount,
} from "@/server/meta-ads/actions";
import {
  isValidAdAccountId,
  type MetaAdAccountDTO,
} from "@/server/meta-ads/shared";

/**
 * Cuentas publicitarias de Meta conectadas. Es una sección más del panel de
 * integraciones de Marketing, junto a los mapeos de página → sucursal; no una
 * pantalla nueva.
 *
 * **Sólo lectura y conexión.** Desde aquí no se crea ninguna campaña, no se
 * pausa ninguna, no se cambia ningún presupuesto y no se gasta dinero. Conectar
 * es anotar el identificador después de comprobar que el token puede leer la
 * cuenta.
 *
 * Empieza vacío y eso es lo normal hasta que alguien pegue los `act_` reales.
 */

export type MetaAdAccountsSectionProps = {
  accounts: MetaAdAccountDTO[];
  canManage: boolean;
};

export function MetaAdAccountsSection({
  accounts,
  canManage,
}: MetaAdAccountsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [adAccountId, setAdAccountId] = useState("");
  const [label, setLabel] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  // Misma regla que el servidor, para no gastar un viaje en un valor que ya se
  // ve mal escrito. La barrera sigue estando en la acción.
  const idLooksValid = isValidAdAccountId(adAccountId);

  function report(text: string, failed: boolean) {
    setMessage(text);
    setIsError(failed);
  }

  function resetForm() {
    setShowForm(false);
    setAdAccountId("");
    setLabel("");
  }

  function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !idLooksValid) return;
    report("", false);
    startTransition(async () => {
      const result = await connectMetaAdAccount(adAccountId, label || null);
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      resetForm();
      report("Cuenta publicitaria conectada.", false);
      router.refresh();
    });
  }

  function resync(account: MetaAdAccountDTO) {
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const result = await resyncMetaAdAccountMetadata(account.id);
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report("Datos actualizados desde Meta.", false);
      router.refresh();
    });
  }

  function toggleActive(account: MetaAdAccountDTO) {
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const result = await updateMetaAdAccount({
        id: account.id,
        label: account.label,
        isActive: !account.isActive,
      });
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report(
        account.isActive
          ? "Cuenta pausada en el registro. Sigue existiendo en Meta."
          : "Cuenta reactivada en el registro.",
        false,
      );
      router.refresh();
    });
  }

  function disconnect(account: MetaAdAccountDTO) {
    if (!canManage) return;
    report("", false);
    startTransition(async () => {
      const result = await disconnectMetaAdAccount(account.id);
      if (!result.ok) {
        report(result.error, true);
        return;
      }
      report(
        "Cuenta quitada del registro. Esto NO revoca el acceso del Usuario del Sistema en Meta: eso se hace aparte, en el Business Manager.",
        false,
      );
      router.refresh();
    });
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <h4 className="font-semibold text-slate-900">
            Cuentas publicitarias conectadas
          </h4>
          <p className="mt-1 text-sm text-slate-500">
            Qué cuentas sigue MotoMas. Sólo consulta: desde aquí no se crean ni
            se pausan campañas, ni se cambian presupuestos.
          </p>
        </div>
        {canManage && !showForm ? (
          <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Conectar cuenta
          </Button>
        ) : null}
      </div>

      {message ? (
        <p
          className={`border-b border-slate-200 px-5 py-3 text-sm font-medium ${
            isError ? "text-red-600" : "text-emerald-600"
          }`}
        >
          {message}
        </p>
      ) : null}

      {canManage && showForm ? (
        <form
          className="grid gap-4 border-b border-slate-200 p-5 md:grid-cols-2"
          onSubmit={connect}
        >
          <div>
            <Input
              placeholder="act_1234567890"
              value={adAccountId}
              onChange={(event) => setAdAccountId(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              {adAccountId && !idLooksValid
                ? 'Debe tener la forma "act_" seguida de dígitos.'
                : "Business Manager → Configuración → Cuentas publicitarias."}
            </p>
          </div>
          <Input
            placeholder="Nombre interno (opcional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <div className="flex gap-2 md:col-span-2">
            <Button disabled={isPending || !idLooksValid} type="submit">
              Conectar
            </Button>
            <Button type="button" variant="ghost" onClick={resetForm}>
              <X className="h-4 w-4" />
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {accounts.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Cuenta</th>
                <th className="px-5 py-3 font-semibold">Moneda</th>
                <th className="px-5 py-3 font-semibold">Estado en Meta</th>
                <th className="px-5 py-3 font-semibold">Seguimiento</th>
                <th className="px-5 py-3 font-semibold">Última consulta</th>
                {canManage ? (
                  <th className="px-5 py-3 font-semibold">Acciones</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">
                      {account.label ?? account.accountName ?? "Sin nombre"}
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {account.adAccountId}
                    </div>
                    {account.label && account.accountName ? (
                      <div className="mt-1 text-xs text-slate-500">
                        En Meta: {account.accountName}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {account.currency ?? "—"}
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={account.isHealthy ? "green" : "amber"}>
                      {account.accountStatusLabel}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Badge tone={account.isActive ? "blue" : "slate"}>
                      {account.isActive ? "Siguiendo" : "Pausada"}
                    </Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500">
                    {account.lastSyncedAt
                      ? formatDateTime(account.lastSyncedAt)
                      : `Sin resincronizar (alta ${formatDateTime(
                          account.connectedAt,
                        )})`}
                  </td>
                  {canManage ? (
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          disabled={isPending}
                          size="sm"
                          variant="secondary"
                          onClick={() => resync(account)}
                        >
                          <RefreshCw className="h-4 w-4" />
                          Actualizar
                        </Button>
                        <Button
                          disabled={isPending}
                          size="sm"
                          variant="secondary"
                          onClick={() => toggleActive(account)}
                        >
                          {account.isActive ? "Pausar" : "Reanudar"}
                        </Button>
                        <Button
                          disabled={isPending}
                          size="sm"
                          variant="secondary"
                          onClick={() => disconnect(account)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Desconectar
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          className="border-0"
          description="Pega el identificador act_… de cada cuenta del Business Manager. Se comprueba contra Meta antes de guardarla, así que una cuenta a la que el token no llegue no se conecta."
          icon={Megaphone}
          title="Ninguna cuenta publicitaria conectada"
        />
      )}

      <p className="border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
        Desconectar sólo deja de seguir la cuenta aquí. <strong>No revoca</strong>{" "}
        el acceso del Usuario del Sistema en Meta — eso se hace aparte, en el
        Business Manager.
      </p>
    </Card>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-NI", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
