import {
  listRulesWithAccounts,
  type MappingDb,
  type MappingRuleWithAccounts,
} from "@/server/finance/account-mapping/repository";
import {
  accountingEventComponentLabels,
  accountingEventTypeLabels,
  isComponentAllowedForEvent,
  type AccountMappingIssueDTO,
  type AccountMappingValidationDTO,
} from "@/server/finance/account-mapping/shared";
import { describeChartAccountPostingBlock } from "@/server/finance/chart-of-accounts/shared";

/**
 * Patch FF1.0 — validation of a mapping set.
 *
 * These are the rules that make a set safe for the future posting engine to
 * consume. They are checked against current database state (account existence
 * and activity are read, never trusted from the caller) and re-checked at
 * activation, so a set that became invalid after it was drafted cannot go live.
 *
 * The strongest rule is structural: every rule carries BOTH a debit and a
 * credit account, and they must differ. Any entry the engine later builds from
 * a validated set is therefore balanced by construction — an unbalanced entry
 * cannot originate from a mapping.
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

  return { valid: issues.length === 0, ruleCount: rules.length, issues };
}
