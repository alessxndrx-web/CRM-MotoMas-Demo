"use client";

import { Calculator, Pencil, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import {
  BranchSelect,
  ContaErrorNotice,
  ContaSectionCard,
  ContaTotal,
  LedgerRestrictedNotice,
  expenseStatusTone,
  formatContaAmount,
  formatContaDate,
  parseAmount,
  selectClass,
  useContaRunner,
  type BranchOption,
  type ContaRunner,
} from "@/features/operations/modules/contabilidad-db/contabilidad-db-shared";
import {
  createExpenseAction,
  reviewExpenseAction,
  updateExpenseAction,
} from "@/server/contabilidad/actions";
import {
  calculateExpenseTotal,
  expenseCategoryLabels,
  expenseCategoryValues,
  type ExpenseDTO,
} from "@/server/contabilidad/shared";

/**
 * Database-backed gastos (`/panel/contabilidad/gastos`). A gasto is registered
 * then reviewed — no approve/reject/cancel, matching the model.
 *
 * Patch FF2.1-A adds the editing half. The registration form already collected
 * the tax and computed the total with it; what was missing was any way to
 * correct an expense before review, so `updateExpenseAction` had no caller at
 * all.
 *
 * Editing is offered **only while the expense is REGISTRADO**, which is not a UI
 * choice: `updateExpenseAction` refuses anything past that state, and reviewing
 * is what freezes the record and produces its journal entry. The screen mirrors
 * the server rule instead of inventing one.
 */
export function ContabilidadExpensesDbPanel({
  branches,
  canOperate,
  canReview,
  canViewLedger,
  enabled,
  expenses,
  scopeLabel,
  supervision,
}: {
  branches: BranchOption[];
  canOperate: boolean;
  canReview: boolean;
  canViewLedger: boolean;
  enabled: boolean;
  expenses: ExpenseDTO[];
  scopeLabel: string;
  supervision: boolean;
}) {
  const { error, pending, run } = useContaRunner();
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <ContaSectionCard
        businessDescription="Gastos por categoría, con su total calculado (subtotal más impuesto menos retenciones) y su estado de revisión."
        enabled={enabled}
        icon={Calculator}
        scopeLabel={scopeLabel}
        supervision={supervision}
        title="Gastos"
      >
        {!canViewLedger ? (
          <LedgerRestrictedNotice />
        ) : (
          <>
            <ContaErrorNotice error={error} />
            {canOperate ? (
              <ExpenseForm branches={branches} disabled={pending} onRun={run} />
            ) : null}
          </>
        )}
      </ContaSectionCard>

      {enabled && canViewLedger ? (
        <Card className="p-6">
          <h2 className="text-base font-bold text-slate-900">Gastos</h2>
          {expenses.length ? (
            <div className="mt-4 space-y-3">
              {expenses.map((expense) => (
                <div
                  className="rounded-xl border border-slate-200 p-4"
                  data-testid="expense-row"
                  key={expense.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={expenseStatusTone(expense.status)}>
                          {expense.statusLabel}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-900">
                          {expense.supplier}
                        </span>
                        <Badge tone="slate">{expense.categoryLabel}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {expense.concept} · {expense.branchName} ·{" "}
                        {formatContaDate(expense.expenseDate)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatContaAmount(expense.total)}
                      </div>
                      {/* El desglose solo aporta cuando hay algo que desglosar. */}
                      {expense.tax > 0 ||
                      expense.retention1 > 0 ||
                      expense.retention2 > 0 ? (
                        <div className="mt-1 text-xs tabular-nums text-slate-500">
                          {formatContaAmount(expense.subtotal)}
                          {expense.tax > 0
                            ? ` + ${formatContaAmount(expense.tax)} imp.`
                            : ""}
                          {expense.retention1 + expense.retention2 > 0
                            ? ` − ${formatContaAmount(
                                expense.retention1 + expense.retention2,
                              )} ret.`
                            : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {expense.status === "REGISTRADO" &&
                  editingId === expense.id ? (
                    <ExpenseEditForm
                      disabled={pending}
                      expense={expense}
                      onClose={() => setEditingId(null)}
                      onRun={run}
                    />
                  ) : null}

                  {expense.status === "REGISTRADO" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canOperate ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            setEditingId(
                              editingId === expense.id ? null : expense.id,
                            )
                          }
                          size="sm"
                          variant="secondary"
                        >
                          {editingId === expense.id ? (
                            <>
                              <X className="h-4 w-4" />
                              Cancelar
                            </>
                          ) : (
                            <>
                              <Pencil className="h-4 w-4" />
                              Editar
                            </>
                          )}
                        </Button>
                      ) : null}
                      {canReview ? (
                        <Button
                          disabled={pending}
                          onClick={() =>
                            run(() => reviewExpenseAction({ expenseId: expense.id }))
                          }
                          size="sm"
                          variant="success"
                        >
                          Revisar
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-4"
              description="Registra el primer gasto del periodo."
              icon={Calculator}
              title="Sin gastos registrados"
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Corrects a registered expense. Only the fields `updateExpenseAction` accepts
 * are offered — no branch, no category, no date — so the form cannot promise an
 * edit the server would silently drop.
 *
 * The total is recomputed with the very same `calculateExpenseTotal` the server
 * uses. That is the whole point: the screen never carries its own arithmetic,
 * so a change to the formula cannot leave the preview disagreeing with what
 * gets stored.
 */
function ExpenseEditForm({
  disabled,
  expense,
  onClose,
  onRun,
}: {
  disabled: boolean;
  expense: ExpenseDTO;
  onClose: () => void;
  onRun: ContaRunner;
}) {
  const [supplier, setSupplier] = useState(expense.supplier);
  const [concept, setConcept] = useState(expense.concept);
  const [subtotal, setSubtotal] = useState(String(expense.subtotal));
  const [tax, setTax] = useState(String(expense.tax));
  const [retention1, setRetention1] = useState(String(expense.retention1));
  const [retention2, setRetention2] = useState(String(expense.retention2));

  const total = useMemo(
    () =>
      calculateExpenseTotal({
        retention1: parseAmount(retention1),
        retention2: parseAmount(retention2),
        subtotal: parseAmount(subtotal),
        tax: parseAmount(tax),
      }),
    [retention1, retention2, subtotal, tax],
  );

  return (
    <div
      className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
      data-testid="expense-editor"
    >
      <FormSection
        description="El total se recalcula: subtotal más impuesto menos retenciones."
        title="Editar gasto registrado"
      >
        <Field label="Proveedor" required>
          <Input onChange={(event) => setSupplier(event.target.value)} value={supplier} />
        </Field>
        <Field label="Concepto" required>
          <Input onChange={(event) => setConcept(event.target.value)} value={concept} />
        </Field>
        <Field label="Subtotal" required>
          <Input inputMode="decimal" onChange={(event) => setSubtotal(event.target.value)} value={subtotal} />
        </Field>
        <Field label="Impuesto">
          <Input inputMode="decimal" onChange={(event) => setTax(event.target.value)} value={tax} />
        </Field>
        <Field label="Retención 1%">
          <Input inputMode="decimal" onChange={(event) => setRetention1(event.target.value)} value={retention1} />
        </Field>
        <Field label="Retención 2%">
          <Input inputMode="decimal" onChange={(event) => setRetention2(event.target.value)} value={retention2} />
        </Field>
      </FormSection>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContaTotal emphasis label="Nuevo total" value={formatContaAmount(total)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={disabled || !supplier.trim() || !concept.trim()}
          onClick={() =>
            onRun(
              () =>
                updateExpenseAction({
                  expenseId: expense.id,
                  supplier,
                  concept,
                  subtotal: parseAmount(subtotal),
                  tax: parseAmount(tax),
                  retention1: parseAmount(retention1),
                  retention2: parseAmount(retention2),
                }),
              onClose,
            )
          }
          size="sm"
        >
          Guardar cambios
        </Button>
        <Button disabled={disabled} onClick={onClose} size="sm" variant="secondary">
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function ExpenseForm({
  branches,
  disabled,
  onRun,
}: {
  branches: BranchOption[];
  disabled: boolean;
  onRun: ContaRunner;
}) {
  const [branchCode, setBranchCode] = useState(branches[0]?.code ?? "");
  const [category, setCategory] = useState(expenseCategoryValues[0]);
  const [supplier, setSupplier] = useState("");
  const [concept, setConcept] = useState("");
  const [subtotal, setSubtotal] = useState("0");
  const [tax, setTax] = useState("0");
  const [retention1, setRetention1] = useState("0");
  const [retention2, setRetention2] = useState("0");

  const total = useMemo(
    () =>
      calculateExpenseTotal({
        retention1: parseAmount(retention1),
        retention2: parseAmount(retention2),
        subtotal: parseAmount(subtotal),
        tax: parseAmount(tax),
      }),
    [retention1, retention2, subtotal, tax],
  );

  return (
    <div className="mt-6">
      <FormSection description="El total se calcula: subtotal más impuesto menos retenciones." title="Registrar gasto">
        <Field label="Sucursal" required>
          <BranchSelect branches={branches} onChange={setBranchCode} value={branchCode} />
        </Field>
        <Field label="Categoría" required>
          <select
            className={selectClass}
            onChange={(event) => setCategory(event.target.value as typeof category)}
            value={category}
          >
            {expenseCategoryValues.map((value) => (
              <option key={value} value={value}>
                {expenseCategoryLabels[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Proveedor" required>
          <Input onChange={(event) => setSupplier(event.target.value)} value={supplier} />
        </Field>
        <Field label="Concepto" required>
          <Input onChange={(event) => setConcept(event.target.value)} value={concept} />
        </Field>
        <Field label="Subtotal" required>
          <Input inputMode="decimal" onChange={(event) => setSubtotal(event.target.value)} value={subtotal} />
        </Field>
        <Field label="Impuesto">
          <Input inputMode="decimal" onChange={(event) => setTax(event.target.value)} value={tax} />
        </Field>
        <Field label="Retención 1%">
          <Input inputMode="decimal" onChange={(event) => setRetention1(event.target.value)} value={retention1} />
        </Field>
        <Field label="Retención 2%">
          <Input inputMode="decimal" onChange={(event) => setRetention2(event.target.value)} value={retention2} />
        </Field>
      </FormSection>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ContaTotal emphasis label="Total" value={formatContaAmount(total)} />
      </div>

      <div className="mt-4">
        <Button
          disabled={disabled || !branchCode || !supplier.trim() || !concept.trim()}
          onClick={() =>
            onRun(
              () =>
                createExpenseAction({
                  branchCode,
                  category,
                  supplier,
                  concept,
                  subtotal: parseAmount(subtotal),
                  tax: parseAmount(tax),
                  retention1: parseAmount(retention1),
                  retention2: parseAmount(retention2),
                }),
              () => {
                setSupplier("");
                setConcept("");
                setSubtotal("0");
                setTax("0");
                setRetention1("0");
                setRetention2("0");
              },
            )
          }
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Registrar gasto
        </Button>
      </div>
    </div>
  );
}
