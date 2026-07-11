"use client";

import { BarChart3 } from "lucide-react";

import {
  ContaScopeChip,
  ContaTotal,
  formatContaAmount,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  PrimarySectionBadge,
  PrimarySectionDescription,
  SectionUnavailableNotice,
} from "@/features/operations/components/legacy-section-divider";
import { Card } from "@/components/ui/card";
import type { ContabilidadDashboardSummaryDTO } from "@/server/contabilidad/shared";

/**
 * Database-backed Contabilidad dashboard / reportes summary (Patch 3.5C). Every
 * figure is derived from persisted records — there is no report entity. Cost
 * figures render only when the reader may view costs; a Manager sees the valued
 * inventory of their own branch and the ledger counters stay at zero.
 */

export function ContabilidadDashboardDbPanel({
  canViewCosts,
  enabled,
  heading = "Resumen contable",
  scopeLabel,
  summary,
  supervision,
}: {
  canViewCosts: boolean;
  enabled: boolean;
  heading?: string;
  scopeLabel: string;
  summary: ContabilidadDashboardSummaryDTO;
  supervision: boolean;
}) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PrimarySectionBadge
            businessLabel={`${heading} · ${supervision ? "Supervisión" : "Operación"}`}
            technicalLabel={`${heading} · Base de datos (fuente principal)`}
          />
          <ContaScopeChip label={scopeLabel} />
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <BarChart3 className="h-5 w-5" />
        </div>
      </div>

      <PrimarySectionDescription
        businessText="Cifras del periodo derivadas de los registros contables: documentos, asientos, gastos, planilla, bancos y cierres."
        technicalText="Resumen derivado de PostgreSQL. No existe una entidad de reporte; cada cifra se calcula sobre los registros persistidos."
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
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Documentos</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ContaTotal label="Documentos" value={summary.documentCount} />
              <ContaTotal label="En borrador" value={summary.draftDocumentCount} />
              <ContaTotal label="Por revisar" value={summary.pendingReviewCount} />
              <ContaTotal label="Por contabilizar" value={summary.pendingPostingCount} />
              <ContaTotal label="Por conciliar" value={summary.pendingReconciliationCount} />
              <ContaTotal label="Anulados" value={summary.cancelledDocumentCount} />
              <ContaTotal
                emphasis
                label="Total facturado"
                value={formatContaAmount(summary.documentTotal)}
              />
              <ContaTotal
                label="Retenciones"
                value={formatContaAmount(summary.retentionTotal)}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Asientos</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ContaTotal label="Asientos" value={summary.journalEntryCount} />
              <ContaTotal
                label="Borradores descuadrados"
                value={summary.unbalancedDraftEntryCount}
              />
              <ContaTotal label="Debe" value={formatContaAmount(summary.journalDebitTotal)} />
              <ContaTotal label="Haber" value={formatContaAmount(summary.journalCreditTotal)} />
              <ContaTotal
                emphasis
                label="Diferencia"
                value={formatContaAmount(summary.journalDifference)}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Gastos, planilla y comprobantes
            </h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ContaTotal label="Comprobantes" value={summary.voucherCount} />
              <ContaTotal label="Gastos" value={summary.expenseCount} />
              <ContaTotal
                label="Total gastos"
                value={formatContaAmount(summary.expenseTotal)}
              />
              <ContaTotal
                label="Gastos por revisar"
                value={summary.pendingExpenseReviewCount}
              />
              <ContaTotal
                emphasis
                label="Planilla neta"
                value={formatContaAmount(summary.payrollNetTotal)}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Bancos y cierres</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ContaTotal
                label="Saldo bancario"
                value={formatContaAmount(summary.bankBalanceTotal)}
              />
              <ContaTotal
                label="Conciliaciones pendientes"
                value={summary.pendingReconciliationItems}
              />
              <ContaTotal label="Periodos abiertos" value={summary.openClosingCount} />
              {canViewCosts && summary.inventoryUnitCostTotal !== null ? (
                <ContaTotal
                  emphasis
                  label="Costo de inventario"
                  value={formatContaAmount(summary.inventoryUnitCostTotal)}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
