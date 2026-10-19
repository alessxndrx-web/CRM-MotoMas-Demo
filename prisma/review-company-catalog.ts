import { readFile, writeFile } from "node:fs/promises";
import type { AccountType, AccountNature } from "@prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { runFinancialTransaction } from "@/server/finance/transaction";
import { inspectCatalogWorkbook } from "@/server/finance/chart-of-accounts/workbook";
import { defaultNatureForType } from "@/server/finance/chart-of-accounts/shared";

// Explicit maintenance operation for the user's source catalogue. Never posts balances.
const expectedHash = "45db84ee30f4b857202842076c53ff209c19e985ca2c14889dfb685c6a1b0b74";
const db = getPrisma();
try {
  const [actorId, workbookPath] = process.argv.slice(2);
  if (!actorId || !workbookPath) throw Error("Indica responsable autorizado y archivo original.");
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  if (!["ADMIN", "CONTADOR"].includes(actor.role)) throw Error("Responsable sin permiso contable.");
  const preview = await inspectCatalogWorkbook(await readFile(workbookPath), []);
  if (preview.fileHash !== expectedHash) throw Error("El archivo no coincide con el catálogo revisado.");
  const unique = [...new Map([...preview.rows].reverse().filter(row => /^[0-9]+(?:[.-][0-9]+)*$/.test(row.code)).map(row => [row.code, row])).values()];
  if (unique.length !== 372) throw Error("Cambió la cobertura del catálogo.");
  const types: Record<string, AccountType> = { "1": "ACTIVO", "2": "PASIVO", "3": "PATRIMONIO", "4": "INGRESO", "5": "COSTO", "6": "GASTO" };
  // Explicit contra accounts identified in the source, rather than all accounts under a root.
  const contraRoots = ["122", "162-01", "163-02", "164-02", "165-02", "166-02", "32", "36"];
  function levelOf(code: string): number { const parent = unique.find(row => row.code === code)?.parentCode; return parent ? levelOf(parent) + 1 : 1; }
  const plan = unique.map(row => {
    const type = types[row.code[0]];
    if (!type) throw Error(`Grupo no reconocido: ${row.code}`);
    const contra = contraRoots.some(code => row.code === code || row.code.startsWith(code + "-") || row.code.startsWith(code + "."));
    const ordinary = defaultNatureForType(type);
    const nature: AccountNature = contra ? (ordinary === "DEUDORA" ? "ACREEDORA" : "DEUDORA") : ordinary;
    return { code: row.code, name: row.name, type, nature, level: levelOf(row.code), parentCode: row.parentCode, allowsPosting: !unique.some(child => child.parentCode === row.code), ready: Boolean(row.name) };
  }).sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
  const summary = { sourceHash: expectedHash, total: plan.length, ready: plan.filter(row => row.ready).length, missingNames: plan.filter(row => !row.ready).map(row => row.code).sort(), contraAccounts: plan.filter(row => contraRoots.some(code => row.code === code || row.code.startsWith(code + "-"))).map(row => row.code).sort() };
  if (!process.argv.includes("--apply")) console.log(JSON.stringify({ ...summary, applied: false }, null, 2));
  else {
    const result = await runFinancialTransaction({ actor: { userId: actor.id, role: actor.role }, timeoutMs: 120000, run: async ctx => {
      await ctx.tx.$executeRaw`LOCK TABLE chart_accounts IN SHARE ROW EXCLUSIVE MODE`;
      const accounts = await ctx.tx.chartAccount.findMany({ where: { templateVersion: `XLSX-${expectedHash.slice(0, 16)}` }, include: { _count: { select: { lines: true } } } });
      ctx.ensure(accounts.length === 372, "Prepara primero el catálogo original completo.");
      const byCode = new Map(accounts.map(account => [account.code, account]));
      const now = new Date(); let approved = 0;
      for (const row of plan) {
        const current = byCode.get(row.code); ctx.ensure(Boolean(current), `Falta ${row.code}.`);
        const parent = row.parentCode ? byCode.get(row.parentCode) : null;
        ctx.ensure(!row.parentCode || Boolean(parent), `Falta padre ${row.parentCode}.`);
        ctx.ensure(!parent || !parent.name.startsWith("[PENDIENTE"), `Completa primero el padre de ${row.code}.`);
        if (!row.ready) {
          ctx.ensure(!current!.approvedAt && !current!.isActive && !current!._count.lines, `La cuenta pendiente ${row.code} requiere revisión manual.`);
          const structural = { level: row.level, parentId: parent?.id ?? null, allowsPosting: row.allowsPosting };
          await ctx.tx.chartAccount.update({ where: { id: current!.id }, data: structural });
          await ctx.audit({ domain: "CONTABILIDAD", action: "CHART_ACCOUNT_UPDATED", entityType: "CHART_ACCOUNT", entityId: current!.id, entityCode: row.code, before: { level: current!.level, parentId: current!.parentId }, after: structural, reason: "Jerarquía del catálogo revisada; descripción pendiente, cuenta inactiva y sin aprobar." });
          continue;
        }
        ctx.ensure(current!.name === row.name, `Conserva la decisión editable de ${row.code}; revisa su cambio antes de adoptar.`);
        if (current!.approvedAt || current!._count.lines) {
          ctx.ensure(current!.type === row.type && current!.nature === row.nature && current!.allowsPosting === row.allowsPosting && current!.isActive, `La cuenta ${row.code} ya fue adoptada o tiene historia; no se sustituye.`); continue;
        }
        const data = { type: row.type, nature: row.nature, level: row.level, parentId: parent?.id ?? null, allowsPosting: row.allowsPosting, isActive: true, approvedAt: now, approvedByUserId: actor.id };
        await ctx.tx.chartAccount.update({ where: { id: current!.id }, data });
        await ctx.audit({ domain: "CONTABILIDAD", action: "CHART_ACCOUNT_APPROVED", entityType: "CHART_ACCOUNT", entityId: current!.id, entityCode: row.code, before: { type: current!.type, nature: current!.nature, allowsPosting: current!.allowsPosting, isActive: current!.isActive, approvedAt: current!.approvedAt }, after: { ...data, sourceHash: expectedHash }, reason: "Solicitud del usuario: revisar y activar el catálogo del Excel; descripción original conservada, naturaleza de contracuentas revisada, cuentas sin descripción excluidas.", metadata: { component: "HEADER", operation: "UPDATE" } });
        approved++;
      }
      return { approved, journalEntries: await ctx.tx.journalEntry.count(), companyConfigured: await ctx.tx.crmFinancePolicy.count() };
    } });
    if (!result.ok) throw Error(result.error);
    const report = { ...summary, ...result.data, applied: true, checkedAt: new Date().toISOString() };
    if (process.env.CATALOG_REVIEW_REPORT) await writeFile(process.env.CATALOG_REVIEW_REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
} finally { await db.$disconnect(); }
