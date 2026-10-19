import { Prisma } from "@prisma/client";
import { authorizeFinancialFoundation } from "@/server/finance/context";
import { getPrisma } from "@/server/db/prisma";
import { financialStatements } from "@/server/finance/crm/statements";

export type LedgerFilters = { from: string; to: string; branchId?: string; accountId?: string; page?: number };
export function ledgerDates(from: string, to: string) {
  const parse = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Indica fechas válidas.");
    const date = new Date(s + "T00:00:00.000Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== s) throw new Error("Indica fechas válidas.");
    return date;
  };
  const start = parse(from); const end = parse(to);
  if (start > end) throw new Error("La fecha inicial debe ser anterior a la final.");
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function getLedgerReport(filters: LedgerFilters) {
  const auth = await authorizeFinancialFoundation("view");
  if (!auth.ok) return auth;
  let dates: ReturnType<typeof ledgerDates>;
  try { dates = ledgerDates(filters.from, filters.to); }
  catch { return { ok: false as const, error: "El intervalo de fechas no es válido." }; }
  const page = Math.max(1, Math.min(100000, Math.floor(Number(filters.page) || 1)));
  const db = getPrisma();
  try {
    return await db.$transaction(async (tx) => {
    const branches = await tx.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
    if (filters.branchId && !branches.some((b) => b.id === filters.branchId)) return { ok: false as const, error: "La sucursal no existe." };
    const accounts = await tx.chartAccount.findMany({ orderBy: { code: "asc" } });
    const selected = accounts.find((a) => a.id === filters.accountId);
    if (filters.accountId && !selected) return { ok: false as const, error: "La cuenta no existe." };
    const posted: Prisma.JournalEntryWhereInput = { status: { in: ["CONTABILIZADO", "CONCILIADO"] }, ...(filters.branchId ? { branchId: filters.branchId } : {}) };
    const [opening, movements] = await Promise.all([
      tx.journalEntryLine.groupBy({ by: ["accountId"], where: { entry: { ...posted, entryDate: { lt: dates.start } } }, _sum: { debit: true, credit: true } }),
      tx.journalEntryLine.groupBy({ by: ["accountId"], where: { entry: { ...posted, entryDate: { gte: dates.start, lt: dates.end } } }, _sum: { debit: true, credit: true } }),
    ]);
    const openings = new Map(opening.map((r) => [r.accountId, r._sum]));
    const period = new Map(movements.map((r) => [r.accountId, r._sum]));
    const zero = new Prisma.Decimal(0);
    const trial = accounts.filter((a) => openings.has(a.id) || period.has(a.id)).map((a) => {
      const o = openings.get(a.id); const m = period.get(a.id);
      const initial = (o?.debit ?? zero).minus(o?.credit ?? zero);
      const debit = m?.debit ?? zero; const credit = m?.credit ?? zero;
      const closing = initial.plus(debit).minus(credit);
      return { accountId: a.id, code: a.code, name: a.name, type: a.type, nature: a.nature,
        opening: initial.toFixed(2), debit: debit.toFixed(2), credit: credit.toFixed(2),
        closingDebit: Prisma.Decimal.max(closing, 0).toFixed(2), closingCredit: Prisma.Decimal.max(closing.negated(), 0).toFixed(2),
        normalClosing: (a.nature === "ACREEDORA" ? closing.negated() : closing).toFixed(2) };
    });
    const sum = (key: "debit" | "credit" | "closingDebit" | "closingCredit") => trial.reduce((v, r) => v.plus(r[key]), zero).toFixed(2);
    const totals = { debit: sum("debit"), credit: sum("credit"), closingDebit: sum("closingDebit"), closingCredit: sum("closingCredit") };
    const periodFor = (type: string, creditNormal: boolean) => trial.filter((r) => r.type === type).reduce((v, r) => v.plus(creditNormal ? r.credit : r.debit).minus(creditNormal ? r.debit : r.credit), zero).toFixed(2);
    const closingFor = (types: string[], creditNormal: boolean) => trial.filter((r) => types.includes(r.type)).reduce((v, r) => v.plus(creditNormal ? r.closingCredit : r.closingDebit).minus(creditNormal ? r.closingDebit : r.closingCredit), zero);
    const assets = closingFor(["ACTIVO"], false); const liabilities = closingFor(["PASIVO"], true);
    const equity = closingFor(["PATRIMONIO"], true); const accumulatedResult = closingFor(["INGRESO", "COSTO", "GASTO"], true);
    const statements = { revenue: periodFor("INGRESO", true), cost: periodFor("COSTO", false), expenses: periodFor("GASTO", false), assets: assets.toFixed(2), liabilities: liabilities.toFixed(2), equity: equity.toFixed(2), accumulatedResult: accumulatedResult.toFixed(2), equationDifference: assets.minus(liabilities).minus(equity).minus(accumulatedResult).toFixed(2) };
    const lineWhere: Prisma.JournalEntryLineWhereInput = { ...(selected ? { accountId: selected.id } : {}), entry: { ...posted, entryDate: { gte: dates.start, lt: dates.end } } };
    const orderBy: Prisma.JournalEntryLineOrderByWithRelationInput[] = [{ entry: { entryDate: "asc" } }, { entry: { entryNumber: "asc" } }, { position: "asc" }, { id: "asc" }];
    const [count, lines] = await Promise.all([
      tx.journalEntryLine.count({ where: lineWhere }),
      tx.journalEntryLine.findMany({ where: lineWhere, orderBy, skip: (page - 1) * 100, take: 100, include: { entry: { include: { branch: { select: { name: true } } } }, account: { select: { code: true, name: true } } } }),
    ]);
    // Running balance must include earlier pages. A database window computes it
    // over the entire filtered account, then applies the same stable pagination.
    let running: Array<{ id: string; balance: Prisma.Decimal }> = [];
    if (selected) {
      running = await tx.$queryRaw<Array<{ id: string; balance: Prisma.Decimal }>>(Prisma.sql`
        SELECT l.id, SUM(l.debit-l.credit) OVER (ORDER BY e.entry_date, e.entry_number, l.position, l.id) AS balance
        FROM journal_entry_lines l JOIN journal_entries e ON e.id=l.entry_id
        WHERE l.account_id=${selected.id} AND e.status IN ('CONTABILIZADO','CONCILIADO')
          AND e.entry_date>=${dates.start} AND e.entry_date<${dates.end}
          ${filters.branchId ? Prisma.sql`AND e.branch_id=${filters.branchId}` : Prisma.empty}
        ORDER BY e.entry_date,e.entry_number,l.position,l.id LIMIT 100 OFFSET ${(page - 1) * 100}`);
    }
    const runningMap = new Map(running.map((r) => [r.id, r.balance]));
    const initial = new Prisma.Decimal(trial.find((r) => r.accountId === selected?.id)?.opening ?? 0);
    const financial = await financialStatements(tx,dates.start,dates.end,filters.branchId);
    return { ok: true as const, data: {
      trial, totals, income:financial.income, statements:{...statements,revenue:financial.revenue,cost:financial.cost,expenses:financial.expenses}, financial, count, page, branches, accounts: accounts.map((a) => ({ id: a.id, code: a.code, name: a.name })),
      opening: selected ? (selected.nature === "ACREEDORA" ? initial.negated() : initial).toFixed(2) : null,
      lines: lines.map((l) => ({ id: l.id, entryId: l.entryId, entryNumber: l.entry.entryNumber, date: l.entry.entryDate.toISOString().slice(0, 10), branch: l.entry.branch?.name ?? "Corporativo", code: l.account.code, name: l.account.name, concept: l.concept ?? l.entry.notes ?? "", debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), reversalOfId: l.entry.reversalOfId,
        balance: selected ? (selected.nature === "ACREEDORA" ? initial.plus(runningMap.get(l.id) ?? 0).negated() : initial.plus(runningMap.get(l.id) ?? 0)).toFixed(2) : null })),
    } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
  } catch {
    return { ok: false as const, error: "No se pudo consultar el libro. Revisa la conexión a la base de datos y vuelve a intentar." };
  }
}
