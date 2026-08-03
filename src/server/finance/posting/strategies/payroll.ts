import { componentsForEvent } from "@/server/finance/account-mapping/shared";
import { PostingPayloadError } from "@/server/finance/posting/errors";
import type { PostingComponentAmount } from "@/server/finance/posting/shared";
import type { PostingStrategy } from "@/server/finance/posting/strategy";
import { roundFinancialMoney } from "@/server/finance/money";
import { sanitizeFinancialText } from "@/server/finance/text";

/**
 * Patch FF1.4-F — posting strategy for payroll (`PLANILLA`).
 *
 * ## The arithmetic
 *
 * `calculatePayrollNetPay` (src/server/contabilidad/shared.ts) is:
 *
 *     neto = max(salario + comisiones + bonos − deducciones − anticipos, 0)
 *
 * so the gross fact is `salario + comisiones + bonos` — what the employer
 * spends — and the net is the residual left for the employee after the two
 * subtractions.
 *
 * ## Which components an entry declares
 *
 * `componentsForEvent("PLANILLA")` is `PLANILLA_NETO, PLANILLA_DEDUCCIONES`.
 * There is no gross component, so the gross is reached by **addition**: each
 * component becomes an independent balanced debit/credit pair, and
 *
 *     neto + deducciones = salario + comisiones + bonos
 *
 * holds exactly when `anticipos = 0`. The set is therefore `PLANILLA_NETO` plus
 * `PLANILLA_DEDUCCIONES` when it is non-zero, which recognizes the whole gross
 * once and splits the credit between what the employee receives and what was
 * withheld from them. This is the mirror image of the FF1.4-C derivation: there
 * the gross was declared and the deductions subtracted from it; here the parts
 * are declared and the gross is their sum. Both rules exist for the same
 * reason — never state the same money twice, never lose any of it.
 *
 * A component worth zero is not declared: it did not move, and declaring it
 * would demand a mapping rule for a movement that never happens.
 *
 * ## Why payroll carrying advances is refused
 *
 * `anticipos` reduces the net exactly like `deducciones`, but the matrix has
 * **one** deduction component, not two. They are not interchangeable:
 *
 * - a deduction is withheld for a third party (INSS, IR) and credits a
 *   withholdings-payable account;
 * - an advance recovery settles a receivable the company already holds against
 *   the employee, and credits that receivable.
 *
 * Folding both into `PLANILLA_DEDUCCIONES` would post the advance recovery to
 * the withholdings account — one mapping rule names one pair of accounts, so
 * the two cannot share a component without landing on the same accounts. And
 * omitting the advance loses it: `neto + deducciones` would fall short of the
 * gross by exactly the advance, understating the salary expense.
 *
 * Both available readings are wrong, so the record is refused rather than
 * posted incorrectly. See `docs/POSTING_ENGINE.md` §14.
 *
 * ## What this strategy never does
 *
 * It chooses no account, decides no debit/credit side and touches no database.
 * Whether `PLANILLA_NETO` debits a salary expense or a payable is the mapping's
 * decision, not this file's.
 */

export type PayrollPostingPayload = {
  payrollRecordId: string;
  reference: string;
  employeeName: string;
  period: string;
  baseSalary: number;
  commissions: number;
  bonuses: number;
  deductions: number;
  advances: number;
  netPay: number;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readMoney(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return roundFinancialMoney(value);
}

function parsePayrollPayload(payload: unknown): PayrollPostingPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const candidate = payload as Record<string, unknown>;

  if (!isNonEmptyString(candidate.payrollRecordId)) return null;
  if (!isNonEmptyString(candidate.reference)) return null;
  if (!isNonEmptyString(candidate.employeeName)) return null;
  if (!isNonEmptyString(candidate.period)) return null;

  const baseSalary = readMoney(candidate.baseSalary);
  const commissions = readMoney(candidate.commissions);
  const bonuses = readMoney(candidate.bonuses);
  const deductions = readMoney(candidate.deductions);
  const advances = readMoney(candidate.advances);
  const netPay = readMoney(candidate.netPay);
  if (
    baseSalary === null ||
    commissions === null ||
    bonuses === null ||
    deductions === null ||
    advances === null ||
    netPay === null
  ) {
    return null;
  }

  return {
    payrollRecordId: candidate.payrollRecordId,
    reference: candidate.reference,
    employeeName: candidate.employeeName,
    period: candidate.period,
    baseSalary,
    commissions,
    bonuses,
    deductions,
    advances,
    netPay,
  };
}

function payrollConcept(payload: PayrollPostingPayload): string {
  return (
    sanitizeFinancialText(
      `Planilla ${payload.period} · ${payload.employeeName}`,
      300,
    ) ?? payload.reference
  );
}

const allowed = new Set(componentsForEvent("PLANILLA"));

export const payrollStrategy: PostingStrategy<PayrollPostingPayload> = {
  event: "PLANILLA",
  description: "Planilla",
  parse: parsePayrollPayload,
  plan(payload): PostingComponentAmount[] {
    // One deduction component, two kinds of deduction. The advance has nowhere
    // honest to go.
    if (payload.advances > 0) {
      throw new PostingPayloadError(
        `La planilla ${payload.reference} tiene anticipos (${payload.advances}), y el evento PLANILLA solo admite un componente de deducciones, que corresponde a las retenciones. No se contabiliza para no registrar el anticipo en la cuenta equivocada.`,
      );
    }

    const earnings = roundFinancialMoney(
      payload.baseSalary + payload.commissions + payload.bonuses,
    );
    if (earnings <= 0) {
      throw new PostingPayloadError(
        `La planilla ${payload.reference} no tiene devengado por contabilizar.`,
      );
    }

    // `netPay` is floored at zero, so deductions above the gross would post a
    // pair of components that no longer reconstructs what was earned.
    if (payload.deductions > earnings) {
      throw new PostingPayloadError(
        `La planilla ${payload.reference} tiene deducciones mayores que el devengado. No se contabiliza porque el neto quedaría en cero y el asiento no representaría el movimiento.`,
      );
    }

    // The stored net must be exactly what the components recompose. A record
    // whose net disagrees with its own parts would post an expense that is not
    // the one the record states.
    const recomposed = roundFinancialMoney(payload.netPay + payload.deductions);
    if (recomposed !== earnings) {
      throw new PostingPayloadError(
        `La planilla ${payload.reference} es inconsistente: neto más deducciones (${recomposed}) no coincide con el devengado (${earnings}). No se contabiliza.`,
      );
    }

    const concept = payrollConcept(payload);
    const components = [
      { component: "PLANILLA_NETO" as const, amount: payload.netPay },
      { component: "PLANILLA_DEDUCCIONES" as const, amount: payload.deductions },
    ].filter((entry) => entry.amount > 0);

    // Asked, never assumed — narrowing the matrix later fails loudly here
    // instead of silently dropping a movement.
    const unmappable = components.filter(
      (entry) => !allowed.has(entry.component),
    );
    if (unmappable.length) {
      throw new PostingPayloadError(
        `La planilla ${payload.reference} necesita ${unmappable
          .map((entry) => entry.component)
          .join(", ")}, y el evento PLANILLA no admite ese componente. No se contabiliza para no perder el movimiento.`,
      );
    }

    return components.map((entry) => ({
      component: entry.component,
      amount: entry.amount,
      concept,
    }));
  },
};
