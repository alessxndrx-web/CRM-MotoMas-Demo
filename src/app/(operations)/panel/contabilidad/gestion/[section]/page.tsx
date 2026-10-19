import { notFound } from "next/navigation";
import { crmFinanceSections, type CrmFinanceSection } from "@/server/finance/crm/shared";
import { crmSnapshot } from "@/server/finance/crm/treasury";
import { CrmFinanceWorkspace } from "@/features/operations/modules/contabilidad-db/crm-finance-workspace";

export const dynamic = "force-dynamic";
export default async function CrmFinancePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!Object.hasOwn(crmFinanceSections, section)) notFound();
  const result = await crmSnapshot();
  if (!result.ok) return <p role="alert">{result.error}</p>;
  return <CrmFinanceWorkspace data={result.data} section={section as CrmFinanceSection} />;
}
