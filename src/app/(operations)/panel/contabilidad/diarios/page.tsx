import { AccountingPanel } from "@/features/operations/modules/accounting/accounting-panel";
import { LegacySectionDivider } from "@/features/operations/components/legacy-section-divider";
import { ContabilidadJournalsDbPanel } from "@/features/operations/modules/contabilidad-db/contabilidad-journals-db-panel";
import { getContabilidadPageContext } from "@/server/contabilidad/context";
import {
  getJournalEntryDetail,
  listChartAccounts,
  listJournalEntries,
} from "@/server/contabilidad/queries";
import type { JournalEntryDetailDTO } from "@/server/contabilidad/shared";

export const dynamic = "force-dynamic";

export default async function AccountingJournalsPage() {
  const ctb = await getContabilidadPageContext();

  let entries: JournalEntryDetailDTO[] = [];
  let accounts = ctb.enabled && ctb.canViewLedger ? await listChartAccounts(ctb.scope) : [];
  if (ctb.enabled && ctb.canViewLedger) {
    const list = await listJournalEntries(ctb.scope);
    const details = await Promise.all(
      list.map((entry) => getJournalEntryDetail(ctb.scope, entry.id)),
    );
    entries = details.filter((detail): detail is JournalEntryDetailDTO => detail !== null);
    accounts = accounts.filter((account) => account.isActive);
  }

  return (
    <section className="space-y-10">
      {ctb.canAccess ? (
        <ContabilidadJournalsDbPanel
          accounts={accounts}
          canOperate={ctb.canOperate}
          canReview={ctb.canReview}
          canViewLedger={ctb.canViewLedger}
          enabled={ctb.enabled}
          entries={entries}
          scopeLabel={ctb.scopeLabel}
          supervision={ctb.supervision}
        />
      ) : null}

      {ctb.enabled ? (
        <LegacySectionDivider
          businessLabel="Registros adicionales de contabilidad"
          technicalLabel="Contabilidad local · Temporal, pendiente de migración"
        />
      ) : null}
      <AccountingPanel
        dbAvailable={ctb.dbConfigured}
        fallbackAllowed={ctb.canAccess}
        section="diarios"
      />
    </section>
  );
}
