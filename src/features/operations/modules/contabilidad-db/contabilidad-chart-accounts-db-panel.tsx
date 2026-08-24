"use client";

import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  BookOpen,
  Plus,
  Power,
  PowerOff,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  ContaErrorNotice,
  ContaSectionCard,
  ContaTotal,
  selectClass,
  useContaRunner,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  activateChartAccountAction,
  approveTemplateChartAccountsAction,
  archiveChartAccountAction,
  createChartAccountAction,
  deactivateChartAccountAction,
  restoreChartAccountAction,
} from "@/server/contabilidad/actions";
import {
  accountNatureLabels,
  accountNatureValues,
  accountTypeLabels,
  accountTypeValues,
  defaultNatureForType,
  type AccountTypeValue,
  type ChartAccountDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed plan de cuentas (`/panel/contabilidad/catalogo-cuentas`).
 * Global by design — the chart of accounts is not branch-scoped. Writes require
 * the operator role; the server re-checks it on every action.
 *
 * Patch FF1.1 turned the flat list into the catalogue view the foundation
 * needs: the hierarchy is visible through indentation, a TEMPLATE account is
 * labelled as such everywhere it appears, and the reason an account cannot
 * receive movements is stated instead of implied. The panel renders what the
 * server derived (`postable`, `pendingApproval`); it never re-implements the
 * eligibility rule, which is exactly how three divergent copies of it appeared
 * before.
 */

type CatalogSummary = {
  total: number;
  active: number;
  postable: number;
  template: number;
  pendingApproval: number;
  archived: number;
};

type StatusFilter = "TODAS" | "PENDIENTES" | "INACTIVAS" | "ARCHIVADAS";

const MAX_APPROVAL_BATCH = 500;

export function ContabilidadChartAccountsDbPanel({
  accounts,
  canOperate,
  enabled,
  scopeLabel,
  summary,
  supervision,
}: {
  accounts: ChartAccountDTO[];
  canOperate: boolean;
  enabled: boolean;
  scopeLabel: string;
  summary: CatalogSummary | null;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("TODAS");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (status === "PENDIENTES" && !account.pendingApproval) return false;
      if (status === "INACTIVAS" && (account.isActive || account.isArchived)) {
        return false;
      }
      if (status === "ARCHIVADAS" && !account.isArchived) return false;
      if (status === "TODAS" && account.isArchived) return false;
      if (!needle) return true;
      return (
        account.code.toLowerCase().includes(needle) ||
        account.name.toLowerCase().includes(needle)
      );
    });
  }, [accounts, search, status]);

  const pendingIds = useMemo(
    () =>
      visible
        .filter((account) => account.pendingApproval)
        .slice(0, MAX_APPROVAL_BATCH)
        .map((account) => account.id),
    [visible],
  );

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Catálogo de cuentas contables: jerarquía, código, nombre, tipo, naturaleza y vigencia. Las cuentas no se eliminan: se desactivan o se archivan y quedan en el histórico."
        enabled={enabled}
        icon={BookOpen}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Plan de cuentas"
      >
        <ContaErrorNotice error={error} />

        {summary ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <ContaTotal emphasis label="Cuentas" value={summary.total} />
            <ContaTotal label="Activas" value={summary.active} />
            <ContaTotal label="Admiten movimiento" value={summary.postable} />
            <ContaTotal label="De plantilla" value={summary.template} />
            <ContaTotal
              label="Pendientes de aprobar"
              value={summary.pendingApproval}
            />
            <ContaTotal label="Archivadas" value={summary.archived} />
          </div>
        ) : null}

        {summary?.pendingApproval ? (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Este catálogo contiene cuentas de <strong>plantilla</strong>. Son una
            propuesta de referencia, no el catálogo de la empresa: no reciben
            movimientos hasta que la contabilidad las apruebe, y pueden
            renombrarse, desactivarse o archivarse antes de aprobarlas.
          </p>
        ) : null}

        {canOperate ? (
          <ChartAccountForm
            accounts={accounts}
            disabled={pending}
            onRun={run}
          />
        ) : null}
      </ContaSectionCard>

      {enabled ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">Cuentas</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-56"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por código o nombre"
                value={search}
              />
              <select
                className={`${selectClass} w-48`}
                onChange={(event) =>
                  setStatus(event.target.value as StatusFilter)
                }
                value={status}
              >
                <option value="TODAS">Vigentes</option>
                <option value="PENDIENTES">Pendientes de aprobar</option>
                <option value="INACTIVAS">Inactivas</option>
                <option value="ARCHIVADAS">Archivadas</option>
              </select>
            </div>
          </div>

          {canOperate && pendingIds.length ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm text-amber-900">
                {pendingIds.length} cuenta(s) de plantilla visibles esperan la
                aprobación de la contabilidad.
              </p>
              <Button
                disabled={pending}
                onClick={() =>
                  run(() =>
                    approveTemplateChartAccountsAction({
                      accountIds: pendingIds,
                      reason: "Aprobación por lote desde el catálogo.",
                    }),
                  )
                }
                size="sm"
                variant="secondary"
              >
                <BadgeCheck className="h-4 w-4" />
                Aprobar visibles
              </Button>
            </div>
          ) : null}

          {visible.length ? (
            <div className="mt-4 space-y-2">
              {visible.map((account) => (
                <ChartAccountRow
                  account={account}
                  canOperate={canOperate}
                  disabled={pending}
                  key={account.id}
                  onRun={run}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description={
                accounts.length
                  ? "Ninguna cuenta coincide con el filtro seleccionado."
                  : "Registra la primera cuenta contable o siembra la plantilla de referencia."
              }
              icon={BookOpen}
              title={
                accounts.length ? "Sin coincidencias" : "Sin cuentas registradas"
              }
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ChartAccountRow({
  account,
  canOperate,
  disabled,
  onRun,
}: {
  account: ChartAccountDTO;
  canOperate: boolean;
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [reason, setReason] = useState("");
  const [showReason, setShowReason] = useState<"archive" | "restore" | null>(
    null,
  );

  // Indentation is the whole point of storing `level`: the hierarchy has to be
  // legible without expanding anything.
  const indent = Math.min(account.level - 1, 5) * 20;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div style={{ paddingLeft: indent }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">
              {account.code}
            </span>
            <span className="text-sm text-slate-700">{account.name}</span>
            {account.isArchived ? <Badge tone="slate">Archivada</Badge> : null}
            {!account.isActive && !account.isArchived ? (
              <Badge tone="red">Inactiva</Badge>
            ) : null}
            {account.pendingApproval ? (
              <Badge tone="amber">Plantilla sin aprobar</Badge>
            ) : null}
            {account.isTemplate && !account.pendingApproval ? (
              <Badge tone="blue">Plantilla aprobada</Badge>
            ) : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge tone="slate">{account.typeLabel}</Badge>
            <Badge tone={account.isContraNature ? "orange" : "slate"}>
              {account.natureLabel}
            </Badge>
            <span>Nivel {account.level}</span>
            {account.allowsPosting ? null : <Badge tone="gray">Agrupación</Badge>}
            {account.parentCode ? <span>Padre: {account.parentCode}</span> : null}
            {account.childCount ? (
              <span>{account.childCount} subcuenta(s)</span>
            ) : null}
            {account.requiresCostCenter ? (
              <Badge tone="indigo">Centro de costo</Badge>
            ) : null}
          </div>

          {account.postingBlockReason && !account.isArchived ? (
            <p className="mt-2 text-xs text-amber-700">
              {account.postingBlockReason}
            </p>
          ) : null}
        </div>

        {canOperate ? (
          <div className="flex flex-wrap items-center gap-2">
            {account.pendingApproval ? (
              <Button
                disabled={disabled}
                onClick={() =>
                  onRun(() =>
                    approveTemplateChartAccountsAction({
                      accountIds: [account.id],
                    }),
                  )
                }
                size="sm"
                variant="secondary"
              >
                <BadgeCheck className="h-4 w-4" />
                Aprobar
              </Button>
            ) : null}

            {!account.isArchived && account.isActive ? (
              <Button
                disabled={disabled}
                onClick={() =>
                  onRun(() =>
                    deactivateChartAccountAction({ accountId: account.id }),
                  )
                }
                size="sm"
                variant="secondary"
              >
                <PowerOff className="h-4 w-4" />
                Desactivar
              </Button>
            ) : null}

            {!account.isArchived && !account.isActive ? (
              <Button
                disabled={disabled}
                onClick={() =>
                  onRun(() =>
                    activateChartAccountAction({ accountId: account.id }),
                  )
                }
                size="sm"
                variant="secondary"
              >
                <Power className="h-4 w-4" />
                Activar
              </Button>
            ) : null}

            <Button
              disabled={disabled}
              onClick={() =>
                setShowReason((current) =>
                  current ? null : account.isArchived ? "restore" : "archive",
                )
              }
              size="sm"
              variant="secondary"
            >
              {account.isArchived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {account.isArchived ? "Restaurar" : "Archivar"}
            </Button>
          </div>
        ) : null}
      </div>

      {showReason ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          <Input
            className="w-72"
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              showReason === "archive"
                ? "Motivo del archivado (obligatorio)"
                : "Motivo de la restauración (obligatorio)"
            }
            value={reason}
          />
          <Button
            disabled={disabled || !reason.trim()}
            onClick={() =>
              onRun(
                () =>
                  showReason === "archive"
                    ? archiveChartAccountAction({
                        accountId: account.id,
                        reason,
                      })
                    : restoreChartAccountAction({
                        accountId: account.id,
                        reason,
                      }),
                () => {
                  setReason("");
                  setShowReason(null);
                },
              )
            }
            size="sm"
          >
            Confirmar
          </Button>
          <p className="text-xs text-slate-500">
            La cuenta nunca se elimina: archivarla la retira del catálogo activo
            y conserva su código y sus movimientos.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ChartAccountForm({
  accounts,
  disabled,
  onRun,
}: {
  accounts: ChartAccountDTO[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountTypeValue>(accountTypeValues[0]);
  const [nature, setNature] = useState(defaultNatureForType(accountTypeValues[0]));
  const [parentId, setParentId] = useState("");
  const [allowsPosting, setAllowsPosting] = useState(true);
  const [requiresCostCenter, setRequiresCostCenter] = useState(false);
  const [description, setDescription] = useState("");

  const parentOptions = accounts.filter((account) => !account.isArchived);

  return (
    <div className="mt-6">
      <FormSection
        description="El código admite dígitos, puntos y guiones. La cuenta se crea como cuenta de la empresa (origen EMPRESA); las cuentas de plantilla solo entran por la siembra del catálogo de referencia."
        title="Registrar cuenta"
      >
        <Field label="Código" required>
          <Input onChange={(event) => setCode(event.target.value)} value={code} />
        </Field>
        <Field label="Nombre" required>
          <Input onChange={(event) => setName(event.target.value)} value={name} />
        </Field>
        <Field label="Tipo" required>
          <select
            className={selectClass}
            onChange={(event) => {
              const next = event.target.value as AccountTypeValue;
              setType(next);
              // The usual nature for the type, still editable: contra accounts
              // are legitimate and the catalogue must be able to hold them.
              setNature(defaultNatureForType(next));
            }}
            value={type}
          >
            {accountTypeValues.map((value) => (
              <option key={value} value={value}>
                {accountTypeLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          hint="Se sugiere según el tipo; cámbiala solo para cuentas de naturaleza contraria."
          label="Naturaleza"
          required
        >
          <select
            className={selectClass}
            onChange={(event) =>
              setNature(event.target.value as typeof nature)
            }
            value={nature}
          >
            {accountNatureValues.map((value) => (
              <option key={value} value={value}>
                {accountNatureLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          hint="Al recibir una subcuenta, la cuenta padre deja de admitir movimientos directos."
          label="Cuenta padre"
        >
          <select
            className={selectClass}
            onChange={(event) => setParentId(event.target.value)}
            value={parentId}
          >
            <option value="">Sin cuenta padre (primer nivel)</option>
            {parentOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {account.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Uso">
          <div className="flex flex-col gap-2 pt-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input
                checked={allowsPosting}
                onChange={(event) => setAllowsPosting(event.target.checked)}
                type="checkbox"
              />
              Admite movimientos directos
            </label>
            <label className="flex items-center gap-2">
              <input
                checked={requiresCostCenter}
                onChange={(event) =>
                  setRequiresCostCenter(event.target.checked)
                }
                type="checkbox"
              />
              Requerirá centro de costo
            </label>
          </div>
        </Field>
        <Field className="sm:col-span-2" hint="Opcional." label="Descripción">
          <Input
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
        </Field>
      </FormSection>
      <div className="mt-4">
        <Button
          disabled={disabled || !code.trim() || !name.trim()}
          onClick={() =>
            onRun(
              () =>
                createChartAccountAction({
                  code,
                  name,
                  type,
                  nature,
                  parentId: parentId || null,
                  allowsPosting,
                  requiresCostCenter,
                  description: description || null,
                }),
              () => {
                setCode("");
                setName("");
                setDescription("");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar cuenta
        </Button>
      </div>
    </div>
  );
}
