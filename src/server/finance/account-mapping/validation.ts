import {
  listRulesWithAccounts,
  type MappingDb,
  type MappingRuleWithAccounts,
} from "@/server/finance/account-mapping/repository";
import {
  accountingEventComponentLabels,
  accountingEventTypeLabels,
  componentsForEvent,
  isComponentAllowedForEvent,
  type AccountingEventComponentValue,
  type AccountingEventTypeValue,
  type AccountMappingIssueDTO,
  type AccountMappingValidationDTO,
} from "@/server/finance/account-mapping/shared";
import { describeChartAccountPostingBlock } from "@/server/finance/chart-of-accounts/shared";

/**
 * Patch FF1.0 — validation of a mapping set.
 * Patch FF1.5-A — set-level validation on top of it.
 *
 * These are the rules that make a set safe for the posting engine to consume.
 * They are checked against current database state (account existence and
 * activity are read, never trusted from the caller) and re-checked at
 * activation, so a set that became invalid after it was drafted cannot go live.
 *
 * The strongest rule is structural: every rule carries BOTH a debit and a
 * credit account, and they must differ. Any entry the engine later builds from
 * a validated set is therefore balanced by construction — an unbalanced entry
 * cannot originate from a mapping.
 *
 * ## Two levels, and why the second one had to exist
 *
 * `validateRule` judges one row at a time. FF1.4-G showed that is not enough: a
 * set can pass every row-level check, satisfy every SQL constraint, activate
 * without complaint and still describe accounting that is wrong — because the
 * defect lives in the *relationship* between two rows, and nothing was looking
 * there.
 *
 * `validateSetRelationships` closes exactly that gap and nothing else. It is
 * deliberately small: it encodes only what the repository proves, never what an
 * accountant would prefer. The invariants that remain unenforced are listed in
 * `docs/POSTING_CONTRACT.md` §7 together with the reason each one could not be
 * proven from the repository alone.
 *
 * This file validates **configuration**, never postings. It never reads a
 * business document, never computes an entry and never duplicates a check the
 * engine already performs.
 */

export const MAPPING_EMPTY_ERROR =
  "El conjunto no tiene reglas y no puede activarse.";

function ruleLabel(rule: MappingRuleWithAccounts): string {
  return `${accountingEventTypeLabels[rule.event]} · ${
    accountingEventComponentLabels[rule.component]
  }`;
}

function validateRule(rule: MappingRuleWithAccounts): AccountMappingIssueDTO[] {
  const issues: AccountMappingIssueDTO[] = [];
  const label = ruleLabel(rule);

  if (!isComponentAllowedForEvent(rule.event, rule.component)) {
    issues.push({
      ruleId: rule.id,
      message: `${label}: el componente no corresponde a este evento y nunca se aplicaría.`,
    });
  }
  if (rule.debitAccountId === rule.creditAccountId) {
    issues.push({
      ruleId: rule.id,
      message: `${label}: la cuenta de debe y la de haber no pueden ser la misma.`,
    });
  }
  // FF1.1: the same eligibility rule a journal line must satisfy. A mapping
  // pointing at a grouping header or an unapproved template account would build
  // an entry the ledger itself would refuse.
  const debitBlock = describeChartAccountPostingBlock(rule.debitAccount);
  if (debitBlock) {
    issues.push({ ruleId: rule.id, message: `${label}: ${debitBlock}` });
  }
  const creditBlock = describeChartAccountPostingBlock(rule.creditAccount);
  if (creditBlock) {
    issues.push({ ruleId: rule.id, message: `${label}: ${creditBlock}` });
  }
  return issues;
}

// --- Set level (Patch FF1.5-A) -------------------------------------------

/**
 * The component every posting of `event` is guaranteed to carry, or null when
 * the event has no such component.
 *
 * Derived from the strategies, not from preference:
 *
 * - **`SUBTOTAL`** is emitted unconditionally by every strategy of every event
 *   whose matrix contains it. The three factories that cover those events —
 *   `accounting-document.ts`, `cash-document.ts` and `expense.ts` — all build
 *   their component list starting from `SUBTOTAL` and append only non-zero
 *   modifiers to it.
 * - **`PLANILLA_NETO`** is payroll's analogue: `PLANILLA` has no gross
 *   component, and the net is what every payroll with something to pay carries.
 * - **`TOTAL` is deliberately NOT treated as a base.** `CAJA_RECIBO` allows it
 *   and no strategy emits it, so demanding it would force the operator to
 *   create a rule that can never fire.
 *
 * Events with no base component (`CAJA_RECIBO`, `CAJA_CIERRE`, and the
 * `TOTAL`-only events, which have nothing to depend on it) are simply not
 * subject to the dependency check.
 */
function requiredBaseComponent(
  event: AccountingEventTypeValue,
): AccountingEventComponentValue | null {
  if (componentsForEvent(event).includes("SUBTOTAL")) return "SUBTOTAL";
  if (event === "PLANILLA") return "PLANILLA_NETO";
  return null;
}

/**
 * A set that maps a modifier without the component it modifies can never post
 * that event: the engine resolves every component of the plan and fails closed
 * on the first gap (`posting/mapping.ts`), and the base component is always in
 * that plan. The set is not merely incomplete, it is unusable for the event.
 *
 * Reporting it at activation instead of at posting time is strictly earlier
 * detection of a configuration that already could not work. No set that posts
 * anything today becomes invalid because of this rule.
 */
function validateEventDependencies(
  event: AccountingEventTypeValue,
  rules: MappingRuleWithAccounts[],
): AccountMappingIssueDTO[] {
  const base = requiredBaseComponent(event);
  if (!base) return [];

  const mapped = new Set(rules.map((rule) => rule.component));
  if (!mapped.size || mapped.has(base)) return [];

  const eventLabel = accountingEventTypeLabels[event];
  const baseLabel = accountingEventComponentLabels[base];
  const dependents = [...mapped]
    .map((component) => accountingEventComponentLabels[component])
    .join(", ");

  return [
    {
      ruleId: rules[0]?.id ?? null,
      message: `${eventLabel}: hay reglas para ${dependents} pero ninguna para ${baseLabel}. Toda contabilización de este evento declara ${baseLabel}, así que el evento no podría contabilizarse nunca.`,
    },
  ];
}

/**
 * Payroll is the only event whose economic fact is **emergent**: its matrix
 * carries neither `SUBTOTAL` nor `TOTAL`, so the gross exists in the ledger
 * only as the sum of its two components (`PLANILLA_NETO` + `PLANILLA_DEDUCCIONES`
 * = devengado, the identity `calculatePayrollNetPay` defines).
 *
 * That makes one configuration provably wrong: if either component's debit is
 * the other's credit, the two cancel on that account instead of adding, and the
 * gross never reaches the ledger. The entry still balances — which is precisely
 * why nothing downstream can catch it.
 *
 * The check is deliberately **narrow**. It does not demand that both components
 * share a debit account, because splitting the salary expense into two expense
 * accounts is a legitimate presentation and the repository proves nothing
 * against it. It rejects only the cancellation, which no correct configuration
 * produces. See `docs/POSTING_CONTRACT.md` §7 for the stronger invariant left
 * unenforced and why.
 *
 * It does not generalize to other events: everywhere else a deduction *should*
 * cancel part of the balance the gross created, and that is exactly what makes
 * those events correct.
 */
function validatePayrollComposition(
  rules: MappingRuleWithAccounts[],
): AccountMappingIssueDTO[] {
  const net = rules.find((rule) => rule.component === "PLANILLA_NETO");
  const deductions = rules.find(
    (rule) => rule.component === "PLANILLA_DEDUCCIONES",
  );
  if (!net || !deductions) return [];

  const issues: AccountMappingIssueDTO[] = [];
  const label = accountingEventTypeLabels.PLANILLA;

  if (deductions.debitAccountId === net.creditAccountId) {
    issues.push({
      ruleId: deductions.id,
      message: `${label}: las deducciones debitan la misma cuenta que el neto acredita (${deductions.debitAccount.code}). En vez de sumar al gasto, cancelarían el pasivo con el trabajador, y el devengado nunca llegaría al mayor.`,
    });
  }
  if (net.debitAccountId === deductions.creditAccountId) {
    issues.push({
      ruleId: net.id,
      message: `${label}: el neto debita la misma cuenta que las deducciones acreditan (${net.debitAccount.code}). Los dos componentes se cancelarían entre sí en vez de componer el devengado.`,
    });
  }
  return issues;
}

/**
 * Patch FF2.0-A — `IMPUESTO` is the only modifier that **adds** to the balance
 * its base component created: `calculateExpenseTotal` is
 * `subtotal + tax − retentions`, so the tax moves the payable in the *same*
 * direction as the subtotal, where every retention moves it the opposite way.
 *
 * Two configurations therefore contradict the model's own arithmetic:
 *
 * - the tax debiting what the subtotal credits, which subtracts the tax the
 *   model adds and leaves the payable at `subtotal − tax`;
 * - the tax crediting what the subtotal debits, which shrinks the expense to
 *   `subtotal − tax` when the model says the expense is `subtotal`.
 *
 * Both produce a balanced entry that disagrees with the stored `total`, which
 * is what makes them provable rather than a matter of taste. Which account the
 * tax lands on — creditable asset or sunk cost — stays entirely the
 * accountant's choice; only cancellation against the subtotal is refused.
 */
function validateAdditiveModifiers(
  event: AccountingEventTypeValue,
  rules: MappingRuleWithAccounts[],
): AccountMappingIssueDTO[] {
  const tax = rules.find((rule) => rule.component === "IMPUESTO");
  const subtotal = rules.find((rule) => rule.component === "SUBTOTAL");
  if (!tax || !subtotal) return [];

  const issues: AccountMappingIssueDTO[] = [];
  const label = accountingEventTypeLabels[event];

  if (tax.debitAccountId === subtotal.creditAccountId) {
    issues.push({
      ruleId: tax.id,
      message: `${label}: el impuesto debita la misma cuenta que el subtotal acredita (${tax.debitAccount.code}). El impuesto suma al importe adeudado, así que restarlo dejaría el saldo por debajo del total del documento.`,
    });
  }
  if (tax.creditAccountId === subtotal.debitAccountId) {
    issues.push({
      ruleId: tax.id,
      message: `${label}: el impuesto acredita la misma cuenta que el subtotal debita (${tax.creditAccount.code}). El gasto quedaría reducido por el impuesto, cuando el modelo lo registra aparte.`,
    });
  }
  return issues;
}

/**
 * Invariants that hold between rules of one set. Grouped by event because every
 * invariant known to be provable today is event-local.
 */
function validateSetRelationships(
  rules: MappingRuleWithAccounts[],
): AccountMappingIssueDTO[] {
  const byEvent = new Map<AccountingEventTypeValue, MappingRuleWithAccounts[]>();
  for (const rule of rules) {
    const bucket = byEvent.get(rule.event);
    if (bucket) bucket.push(rule);
    else byEvent.set(rule.event, [rule]);
  }

  const issues: AccountMappingIssueDTO[] = [];
  for (const [event, eventRules] of byEvent) {
    issues.push(...validateEventDependencies(event, eventRules));
    issues.push(...validateAdditiveModifiers(event, eventRules));
    if (event === "PLANILLA") {
      issues.push(...validatePayrollComposition(eventRules));
    }
  }
  return issues;
}

/**
 * Full report for a set. Read-only: it never repairs, deactivates or removes a
 * rule, so an operator always decides what to correct.
 */
export async function validateMappingSet(
  db: MappingDb,
  setId: string,
): Promise<AccountMappingValidationDTO> {
  const rules = await listRulesWithAccounts(db, setId);
  const issues: AccountMappingIssueDTO[] = [];

  if (!rules.length) {
    issues.push({ ruleId: null, message: MAPPING_EMPTY_ERROR });
  }
  for (const rule of rules) issues.push(...validateRule(rule));
  issues.push(...validateSetRelationships(rules));

  return { valid: issues.length === 0, ruleCount: rules.length, issues };
}
