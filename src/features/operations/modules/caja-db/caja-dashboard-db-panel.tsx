"use client";

import Link from "next/link";
import {
  Banknote,
  ClipboardList,
  Clock,
  FileText,
  Receipt,
  StickyNote,
  Wallet,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import {
  CajaErrorNotice,
  CajaScopeChip,
  CajaTotal,
  closingStatusTone,
  documentStatusTone,
  formatCajaAmount,
  formatCajaDateTime,
  selectClass,
  sessionStatusTone,
  useCajaRunner,
} from "@/features/operations/modules/caja-db/caja-db-shared";
import {
  closeCashSessionAction,
  openCashSessionAction,
} from "@/server/caja/actions";
import {
  cashPaymentMethodLabels,
  cashPaymentMethodValues,
  type CajaDashboardSummaryDTO,
  type CashClosingDTO,
  type CashDocumentDTO,
} from "@/server/caja/shared";

/**
 * Database-backed Caja dashboard for `/panel/caja`. Additive to the legacy
 * `CashierPanel` rendered below it.
 *
 * The lists arrive already scoped from the server; nothing here filters for
 * security. Opening and closing a turno are Cashier/Admin actions, so the
 * controls are hidden for a supervisor who cannot operate — the server rejects
 * them regardless.
 */

const quickActions = [
  { href: "/panel/caja/facturacion", icon: FileText, label: "Facturación" },
  { href: "/panel/caja/recibos", icon: Receipt, label: "Recibos" },
  { href: "/panel/caja/notas", icon: StickyNote, label: "Notas" },
  { href: "/panel/caja/cierres", icon: ClipboardList, label: "Cierres" },
];

export type CajaBranchOption = { code: string; name: string };

export function CajaDashboardDbPanel({
  branches,
  canOperate,
  closings,
  documents,
  enabled,
  scopeLabel,
  summary,
  supervision,
}: {
  /** Only a global role picks the branch of a new turno. */
  branches: CajaBranchOption[];
  canOperate: boolean;
  closings: CashClosingDTO[];
  documents: CashDocumentDTO[];
  enabled: boolean;
  scopeLabel: string;
  summary: CajaDashboardSummaryDTO;
  supervision: boolean;
}) {
  const { error, pending, run } = useCajaRunner();
  const session = summary.currentSession;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          hint="Facturas emitidas"
          icon={FileText}
          label="Facturado"
          value={formatCajaAmount(summary.issuedInvoiceTotal)}
        />
        <StatCard
          hint="Pagos registrados"
          icon={Banknote}
          label="Recibido"
          value={formatCajaAmount(summary.paymentTotal)}
        />
        <StatCard
          hint={`${summary.draftDocumentCount} en borrador`}
          icon={ClipboardList}
          label="Documentos"
          value={summary.documentCount}
        />
        <StatCard
          hint="Turnos sin cerrar"
          icon={Clock}
          label="Cierres pendientes"
          value={summary.pendingClosingCount}
        />
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <PrimarySectionBadge
              businessLabel={supervision ? "Caja · Supervisión" : "Caja · Operación"}
              technicalLabel="Caja · Base de datos (fuente principal)"
            />
            <CajaScopeChip label={scopeLabel} />
          </div>
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Wallet className="h-5 w-5" />
          </div>
        </div>

        <PrimarySectionDescription
          businessText={
            supervision
              ? "Revisa los turnos abiertos, los documentos emitidos y el estado de los cierres del alcance que supervisas."
              : "Abre tu turno, emite facturas, recibos y notas, y prepara el cierre al terminar la jornada."
          }
          technicalText="Caja respaldada por PostgreSQL. Esta es la fuente principal de turnos, documentos y cierres. El historial anterior sigue disponible debajo mientras se completa su migración."
        />

        {!enabled ? (
          <SectionUnavailableNotice
            businessText="Esta sección aún no está disponible."
            technicalText={
              <>
                Esta sección requiere <code>DATABASE_URL</code> configurado y una
                sucursal asignada.
              </>
            }
          />
        ) : (
          <>
            <CajaErrorNotice error={error} />

            <div className="mt-6">
              {session ? (
                <div className="rounded-xl border border-slate-200 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={sessionStatusTone(session.status)}>
                          Turno {session.statusLabel.toLowerCase()}
                        </Badge>
                        <Badge tone="slate">{session.branchName}</Badge>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {session.cashierName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Abierto el {formatCajaDateTime(session.openedAt)}
                        {summary.openSessionCount > 1
                          ? ` · ${summary.openSessionCount} turnos abiertos en el alcance`
                          : null}
                      </p>
                    </div>

                    {canOperate ? (
                      <Button
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            closeCashSessionAction({ cashSessionId: session.id }),
                          )
                        }
                        size="sm"
                        variant="secondary"
                      >
                        <Clock className="h-4 w-4" />
                        Cerrar turno
                      </Button>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {cashPaymentMethodValues.map((method) => (
                      <CajaTotal
                        key={method}
                        label={cashPaymentMethodLabels[method]}
                        value={formatCajaAmount(summary.paymentBreakdown[method])}
                      />
                    ))}
                  </div>
                </div>
              ) : canOperate ? (
                <OpenSessionForm branches={branches} disabled={pending} onRun={run} />
              ) : (
                <EmptyState
                  description="Cuando un cajero abra su turno verás aquí el movimiento del día."
                  icon={Clock}
                  title="No hay un turno abierto en este alcance"
                />
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <Link href={action.href} key={action.href}>
                  <Button size="sm" variant="secondary">
                    <action.icon className="h-4 w-4" />
                    {action.label}
                  </Button>
                </Link>
              ))}
            </div>
          </>
        )}
      </Card>

      {enabled ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentDocumentsCard documents={documents} />
          <ClosingsStatusCard closings={closings} />
        </div>
      ) : null}
    </div>
  );
}

// --- Abrir turno ---------------------------------------------------------

function OpenSessionForm({
  branches,
  disabled,
  onRun,
}: {
  branches: CajaBranchOption[];
  disabled: boolean;
  onRun: ReturnType<typeof useCajaRunner>["run"];
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [notes, setNotes] = useState("");

  // A global role must say where the turno lives; the others inherit theirs.
  const needsBranch = branches.length > 0;

  return (
    <>
      <FormSection
        description="Un turno agrupa los documentos, los pagos y el cierre de la jornada."
        title="Abrir turno"
      >
        {needsBranch ? (
          <Field label="Sucursal" required>
            <select
              className={selectClass}
              onChange={(event) => setBranchCode(event.target.value)}
              value={branchCode}
            >
              {branches.map((branch) => (
                <option key={branch.code} value={branch.code}>
                  {branch.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field hint="Opcional." label="Observaciones">
          <Input
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Ej. Turno de la mañana"
            value={notes}
          />
        </Field>
      </FormSection>

      <div className="mt-4">
        <Button
          disabled={disabled || (needsBranch && !branchCode)}
          onClick={() =>
            onRun(
              () =>
                openCashSessionAction({
                  branchCode: needsBranch ? branchCode : null,
                  notes: notes || null,
                }),
              () => setNotes(""),
            )
          }
          size="sm"
        >
          <Clock className="h-4 w-4" />
          Abrir turno
        </Button>
      </div>
    </>
  );
}

// --- Documentos recientes ------------------------------------------------

function RecentDocumentsCard({ documents }: { documents: CashDocumentDTO[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-slate-900">Documentos recientes</h2>
      {documents.length ? (
        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {documents.map((document) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={document.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="slate">{document.typeLabel}</Badge>
                  <Badge tone={documentStatusTone(document.status)}>
                    {document.statusLabel}
                  </Badge>
                </div>
                <p className="mt-1 font-mono text-xs font-medium text-slate-600">
                  {document.documentNumber}
                </p>
                <p className="text-xs text-slate-500">
                  {document.thirdPartyName} · {formatCajaDateTime(document.issuedAt)}
                </p>
              </div>
              <p className="text-sm font-bold text-slate-900">
                {formatCajaAmount(document.total)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-4"
          description="Las facturas, recibos y notas del turno aparecerán aquí."
          icon={FileText}
          title="Aún no hay documentos"
        />
      )}
    </Card>
  );
}

// --- Estado de cierres ---------------------------------------------------

function ClosingsStatusCard({ closings }: { closings: CashClosingDTO[] }) {
  return (
    <Card className="p-6">
      <h2 className="text-base font-bold text-slate-900">Estado de cierres</h2>
      {closings.length ? (
        <div className="mt-4 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {closings.map((closing) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              key={closing.id}
            >
              <div className="min-w-0">
                <Badge tone={closingStatusTone(closing.status)}>
                  {closing.statusLabel}
                </Badge>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {closing.cashierName}
                </p>
                <p className="text-xs text-slate-500">
                  {closing.branchName} · {formatCajaDateTime(closing.preparedAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900">
                  {formatCajaAmount(closing.receivedTotal)}
                </p>
                <p className="text-xs text-slate-500">
                  Diferencia {formatCajaAmount(closing.difference)}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-4"
          description="Prepara un cierre al terminar el turno para verlo aquí."
          icon={ClipboardList}
          title="Aún no hay cierres"
        />
      )}
    </Card>
  );
}
