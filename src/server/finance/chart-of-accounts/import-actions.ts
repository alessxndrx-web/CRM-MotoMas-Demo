"use server";

import { authorizeFinancialFoundation } from "@/server/finance/context";
import { getPrisma } from "@/server/db/prisma";
import { runFinancialTransaction } from "@/server/finance/transaction";
import { isAccountNatureValue, isAccountTypeValue, MAX_CHART_ACCOUNT_LEVEL } from "@/server/finance/chart-of-accounts/shared";
import { catalogFingerprint, inspectCatalogWorkbook, MAX_CATALOG_BYTES } from "@/server/finance/chart-of-accounts/workbook";
import { stageCatalogWorkbook } from "@/server/finance/chart-of-accounts/staging";

export async function stageChartWorkbookAction(form:FormData){
  const auth=await authorizeFinancialFoundation("configure");if(!auth.ok)return auth;
  if(form.get("confirmed")!=="yes")return{ok:false as const,error:"Confirma la preparación del catálogo para revisión."};
  let bytes:Buffer;try{bytes=await readFile(form);}catch{return{ok:false as const,error:"Selecciona un Excel válido."};}
  return runFinancialTransaction({actor:auth.actor,timeoutMs:60000,revalidate:["/panel/contabilidad/catalogo-cuentas"],run:ctx=>stageCatalogWorkbook(ctx,bytes)});
}

async function readFile(form: FormData): Promise<Buffer> {
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || file.size > MAX_CATALOG_BYTES) throw new Error("Selecciona un archivo .xlsx de hasta 2 MiB.");
  return Buffer.from(await file.arrayBuffer());
}

export async function previewChartWorkbookAction(form: FormData) {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return auth;
  try {
    const bytes = await readFile(form);
    const current = await getPrisma().chartAccount.findMany({ select: { code: true, name: true, updatedAt: true } });
    return { ok: true as const, data: await inspectCatalogWorkbook(bytes, current) };
  } catch {
    return { ok: false as const, error: "No se pudo leer el catálogo. Usa un libro .xlsx válido de hasta 2 MiB, con un único catálogo en A:B y hasta 2.000 filas." };
  }
}

export async function importChartWorkbookAction(form: FormData) {
  const auth = await authorizeFinancialFoundation("configure");
  if (!auth.ok) return auth;
  let bytes: Buffer;
  let selection: Array<{ row: number; type: string; nature: string }>;
  try {
    bytes = await readFile(form);
    const raw: unknown = JSON.parse(String(form.get("selection")));
    if (!Array.isArray(raw) || !raw.length || raw.length > 500) throw new Error();
    selection = raw;
    if (selection.some((r) => !r || !Number.isInteger(r.row) || !isAccountTypeValue(r.type) || !isAccountNatureValue(r.nature)) || new Set(selection.map((r) => r.row)).size !== selection.length) throw new Error();
    if (form.get("confirmed") !== "yes") throw new Error();
  } catch {
    return { ok: false as const, error: "Confirma de 1 a 500 cuentas con tipo y naturaleza explícitos." };
  }

  return runFinancialTransaction({
    actor: auth.actor, timeoutMs: 30_000,
    revalidate: ["/panel/contabilidad", "/panel/contabilidad/catalogo-cuentas"],
    errorMessage: "No se importó ninguna cuenta. Revisa el archivo y vuelve a generar la vista previa.",
    run: async (ctx) => {
      // Serializes against all catalogue writers, including existing services.
      // Concurrent ledger posts cannot use the new accounts: they are inactive.
      await ctx.tx.$executeRaw`LOCK TABLE chart_accounts IN SHARE ROW EXCLUSIVE MODE`;
      const current = await ctx.tx.chartAccount.findMany();
      ctx.ensure(catalogFingerprint(current) === form.get("catalogHash"), "El catálogo cambió desde la vista previa. Vuelve a compararlo.");
      const preview = await inspectCatalogWorkbook(bytes, current);
      ctx.ensure(preview.fileHash === form.get("fileHash"), "El archivo cambió desde la vista previa.");
      const selected = selection.map((s) => {
        const row = preview.rows.find((r) => r.row === s.row);
        ctx.ensure(Boolean(row && row.status === "NUEVA"), "Solo se admiten cuentas nuevas sin conflictos.");
        return { ...row!, type: s.type, nature: s.nature };
      }).sort((a, b) => a.code.length - b.code.length || a.code.localeCompare(b.code));
      const accounts = new Map(current.map((r) => [r.code, r]));
      const imported: Array<{ code: string; name: string }> = [];
      for (const row of selected) {
        const parent = row.parentCode ? accounts.get(row.parentCode) : null;
        ctx.ensure(!row.parentCode || Boolean(parent), `Selecciona también la cuenta padre ${row.parentCode}.`);
        ctx.ensure(!parent?.archivedAt, "La cuenta padre está archivada.");
        ctx.ensure(!parent?.allowsPosting, "La cuenta padre admite movimientos. Revísala en el catálogo antes de importar subcuentas.");
        const level = parent ? parent.level + 1 : 1;
        ctx.ensure(level <= MAX_CHART_ACCOUNT_LEVEL, "Se superó la profundidad máxima del catálogo.");
        // Explicit reviewer choices, never a tax or classification inference.
        if (!isAccountTypeValue(row.type) || !isAccountNatureValue(row.nature)) return ctx.fail("Clasificación inválida.");
        ctx.ensure(!parent || parent.type === row.type, "El tipo de cuenta debe coincidir con su agrupación padre.");
        const grouping = preview.rows.some((r) => r.parentCode === row.code);
        const created = await ctx.tx.chartAccount.create({ data: {
          code: row.code, name: row.name, type: row.type, nature: row.nature,
          parentId: parent?.id ?? null, level, allowsPosting: !grouping,
          origin: "EMPRESA", isActive: false,
          description: `Importación Excel ${preview.fileHash}; hoja ${preview.sheet}; fila ${row.row}. Clasificación confirmada; pendiente de activación.`,
        } });
        await ctx.audit({ domain: "CONTABILIDAD", action: "CHART_ACCOUNT_CREATED", entityType: "CHART_ACCOUNT", entityId: created.id, entityCode: created.code,
          reason: "Importación Excel revisada; cuenta creada inactiva.", before: null,
          after: { code: created.code, type: created.type, nature: created.nature, level, allowsPosting: created.allowsPosting, origin: created.origin, isActive: false, description: created.description },
          metadata: { component: "HEADER", operation: "CREATE" },
        });
        accounts.set(created.code, created);
        imported.push({ code: created.code, name: created.name });
      }
      return { imported, fileHash: preview.fileHash };
    },
  });
}
