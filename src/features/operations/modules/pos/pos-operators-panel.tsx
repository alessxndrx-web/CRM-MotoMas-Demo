"use client";

import { KeyRound, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/feedback";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge, defineStatuses } from "@/components/ui/status";
import {
  createPosOperatorAction,
  resetPosOperatorPasswordAction,
  setPosOperatorActiveAction,
} from "@/server/pos/operator-actions";

/**
 * Patch POS2.4 — credenciales de mostrador, desde el panel administrativo.
 *
 * ## Por qué está en Configuración y no en el POS
 *
 * Repartir credenciales es administración, no operación. Un operador de
 * mostrador no debe poder crearse compañeros; por eso vive junto a la gestión de
 * usuarios y usa el mismo permiso, `canManageUsers`.
 *
 * ## La contraseña se ve una vez
 *
 * El servidor la genera y la devuelve **solo** en la respuesta de creación o de
 * restablecimiento. Esta pantalla la muestra en un aviso que hay que cerrar, y
 * no la guarda en ningún estado que sobreviva a la recarga. **No hay forma de
 * volver a consultarla**: solo de sustituirla.
 *
 * Ningún hash llega nunca al navegador — la consulta que alimenta esta tabla no
 * lo selecciona.
 */
export type PosOperatorRow = {
  id: string;
  username: string;
  branchName: string;
  auditUserName: string;
  isActive: boolean;
  createdAt: string;
};

const operatorStatus = defineStatuses({
  activo: { label: "Activo", tone: "success" },
  inactivo: { label: "Inactivo", tone: "danger", hint: "No puede iniciar sesión" },
});

export function PosOperatorsPanel({
  operators,
  branches,
  users,
}: {
  operators: PosOperatorRow[];
  branches: Array<{ code: string; name: string }>;
  /** Usuarios internos a los que atribuir las ventas. No autentican el POS. */
  users: Array<{ id: string; name: string; email: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<{ username: string; password: string } | null>(
    null,
  );
  const [creating, setCreating] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [branchCode, setBranchCode] = React.useState(branches[0]?.code ?? "");
  const [auditUserId, setAuditUserId] = React.useState(users[0]?.id ?? "");
  const [submitted, setSubmitted] = React.useState(false);

  const usernameError =
    submitted && username.trim().length < 3 ? "Al menos 3 caracteres." : null;

  function create() {
    setSubmitted(true);
    setError(null);
    if (username.trim().length < 3 || !branchCode || !auditUserId) return;

    startTransition(async () => {
      const result = await createPosOperatorAction({ username, branchCode, auditUserId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSecret({ username: result.username, password: result.password });
      setCreating(false);
      setSubmitted(false);
      setUsername("");
      router.refresh();
    });
  }

  function reset(operatorId: string) {
    setError(null);
    startTransition(async () => {
      const result = await resetPosOperatorPasswordAction({ operatorId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSecret({ username: result.username, password: result.password });
      router.refresh();
    });
  }

  function toggle(operatorId: string, isActive: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setPosOperatorActiveAction({ operatorId, isActive });
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  const columns: Array<DataTableColumn<PosOperatorRow>> = [
    {
      id: "username",
      header: "Usuario",
      cell: (row) => <span className="font-mono text-sm text-slate-800">{row.username}</span>,
    },
    { id: "branch", header: "Sucursal", cell: (row) => row.branchName },
    {
      id: "audit",
      header: "Ventas a nombre de",
      cell: (row) => <span className="text-xs text-slate-500">{row.auditUserName}</span>,
      hideOnMobile: true,
    },
    {
      id: "state",
      header: "Estado",
      cell: (row) => (
        <StatusBadge map={operatorStatus} value={row.isActive ? "activo" : "inactivo"} />
      ),
      width: "8rem",
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <span className="flex justify-end gap-1">
          <Button
            disabled={pending}
            onClick={() => reset(row.id)}
            size="sm"
            variant="ghost"
          >
            <KeyRound aria-hidden className="h-4 w-4" />
            Nueva clave
          </Button>
          {row.isActive ? (
            <ConfirmAction
              confirmLabel="Desactivar"
              description="No podrá iniciar sesión y su sesión abierta se cerrará de inmediato."
              label="Desactivar"
              onConfirm={() => toggle(row.id, false)}
              size="sm"
              title={`Desactivar a ${row.username}`}
              variant="ghost"
            />
          ) : (
            <Button
              disabled={pending}
              onClick={() => toggle(row.id, true)}
              size="sm"
              variant="ghost"
            >
              Activar
            </Button>
          )}
        </span>
      ),
      align: "right",
      width: "16rem",
    },
  ];

  return (
    <Card className="overflow-hidden p-0" data-testid="pos-operadores">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Credenciales de mostrador
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">
            El punto de venta tiene su propia identidad: estas credenciales no dan
            acceso al panel, y el acceso al panel no da acceso al mostrador.
          </p>
        </div>
        <Button data-testid="pos-operador-nuevo" onClick={() => setCreating(true)} size="sm">
          <UserPlus aria-hidden className="h-4 w-4" />
          Nuevo operador
        </Button>
      </div>

      {error ? (
        <div className="px-5 pt-4">
          <Notice onDismiss={() => setError(null)} tone="danger">
            <span data-testid="pos-operador-error">{error}</span>
          </Notice>
        </div>
      ) : null}

      {secret ? (
        <div className="px-5 pt-4">
          <Notice onDismiss={() => setSecret(null)} tone="warning" title="Anótala ahora">
            <span data-testid="pos-operador-clave">
              Contraseña de <strong>{secret.username}</strong>:{" "}
              <code className="font-mono font-semibold">{secret.password}</code>. No se
              podrá volver a consultar.
            </span>
          </Notice>
        </div>
      ) : null}

      {operators.length === 0 ? (
        <div className="p-6">
          <EmptyState
            action={
              <Button onClick={() => setCreating(true)} size="sm">
                <UserPlus aria-hidden className="h-4 w-4" />
                Crear el primero
              </Button>
            }
            description="Sin credenciales de mostrador nadie puede entrar al punto de venta."
            icon={UserPlus}
            title="Sin operadores de mostrador"
          />
        </div>
      ) : (
        <DataTable
          caption="Operadores de mostrador"
          columns={columns}
          rowKey={(row) => row.id}
          rows={operators}
        />
      )}

      <Drawer
        description="La contraseña la genera el servidor y se muestra una sola vez."
        footer={
          <>
            <Button disabled={pending} onClick={() => setCreating(false)} variant="secondary">
              Cancelar
            </Button>
            <Button data-testid="pos-operador-crear" disabled={pending} onClick={create}>
              Crear operador
            </Button>
          </>
        }
        onClose={() => setCreating(false)}
        open={creating}
        title="Nuevo operador de mostrador"
      >
        <div className="space-y-4">
          <FormField
            error={usernameError}
            hint="Letras, números, punto, guion o guion bajo."
            label="Usuario"
            required
          >
            {(field) => (
              <Input
                {...field}
                autoCapitalize="none"
                data-testid="pos-operador-usuario"
                onChange={(event) => setUsername(event.target.value)}
                spellCheck={false}
                value={username}
              />
            )}
          </FormField>

          <FormField label="Sucursal" required>
            {(field) => (
              <Select
                {...field}
                data-testid="pos-operador-sucursal"
                onChange={(event) => setBranchCode(event.target.value)}
                value={branchCode}
              >
                {branches.map((branch) => (
                  <option key={branch.code} value={branch.code}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField
            hint="Las ventas quedan atribuidas a este usuario interno. No autentica el mostrador."
            label="Ventas a nombre de"
            required
          >
            {(field) => (
              <Select
                {...field}
                data-testid="pos-operador-auditoria"
                onChange={(event) => setAuditUserId(event.target.value)}
                value={auditUserId}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · {user.email}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        </div>
      </Drawer>
    </Card>
  );
}
