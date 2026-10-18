import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import type { Readable } from "node:stream";

export const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
export type CatalogSourceRow = { row: number; code: string; name: string; parentCode: string | null; issues: string[] };
export type ExistingCatalogRow = { code: string; name: string; updatedAt: Date };
export type CatalogPreview = {
  sheet: string; sheets: string[]; fileHash: string; catalogHash: string;
  rows: Array<CatalogSourceRow & { status: "NUEVA" | "SIN_CAMBIOS" | "CONFLICTO"; currentName: string | null }>;
};

function text(value: ExcelJS.CellValue): string {
  // Never execute formulas or use their cached results as master data.
  if (typeof value === "string" || typeof value === "number") return String(value).trim().replace(/\s+/g, " ");
  if (value && typeof value === "object" && "richText" in value) return value.richText.map((v) => v.text).join("").trim();
  return "";
}

export function catalogFingerprint(rows: ExistingCatalogRow[]): string {
  return createHash("sha256").update(JSON.stringify([...rows].sort((a, b) => a.code.localeCompare(b.code)).map((r) => [r.code, r.name, r.updatedAt.toISOString()]))).digest("hex");
}

export function reconcileCatalog(rows: CatalogSourceRow[], existing: ExistingCatalogRow[]) {
  const current = new Map(existing.map((r) => [r.code, r]));
  return rows.map((r) => {
    const match = current.get(r.code);
    const status = r.issues.length || (match && match.name !== r.name) ? "CONFLICTO" : match ? "SIN_CAMBIOS" : "NUEVA";
    return { ...r, status, currentName: match?.name ?? null } as CatalogPreview["rows"][number];
  });
}

export async function inspectCatalogWorkbook(bytes: Buffer, existing: ExistingCatalogRow[]): Promise<CatalogPreview> {
  if (!bytes.length || bytes.length > MAX_CATALOG_BYTES) throw new Error("El archivo debe tener como máximo 2 MiB.");
  // Bound actual decompressed content before handing XML to the workbook parser.
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (entries.length > 300) throw new Error("El archivo contiene demasiadas partes.");
  let expanded = 0;
  for (const entry of entries) {
    await new Promise<void>((resolve, reject) => {
      const stream = entry.nodeStream() as Readable;
      stream.on("data", (chunk: Buffer) => {
        expanded += chunk.length;
        if (expanded > 24 * 1024 * 1024) stream.destroy(new Error("El contenido descomprimido supera 24 MiB."));
      });
      stream.on("error", reject); stream.on("end", resolve);
    });
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  if (workbook.worksheets.length > 40) throw new Error("El libro supera el límite de 40 hojas.");
  const candidates: Array<{ sheet: ExcelJS.Worksheet; header: number }> = [];
  for (const sheet of workbook.worksheets) {
    for (let n = 1; n <= Math.min(sheet.rowCount, 20); n++) {
      const a = text(sheet.getCell(n, 1).value).toLowerCase();
      const b = text(sheet.getCell(n, 2).value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (a.includes("cuenta") && b.includes("descripcion")) candidates.push({ sheet, header: n });
    }
  }
  if (candidates.length !== 1) throw new Error("Debe existir un único catálogo con Cuenta Contable y Descripción en las columnas A y B.");
  const { sheet, header } = candidates[0];
  if (sheet.rowCount > 2000) throw new Error("El catálogo supera el límite de 2.000 filas.");
  const rows: CatalogSourceRow[] = [];
  for (let n = header + 1; n <= sheet.rowCount; n++) {
    const code = text(sheet.getCell(n, 1).value);
    const name = text(sheet.getCell(n, 2).value);
    const hasFormula = [1, 2].some((col) => { const v = sheet.getCell(n, col).value; return v && typeof v === "object" && ("formula" in v || "sharedFormula" in v); });
    if (!code && !name && !hasFormula) continue;
    const issues: string[] = [];
    if (!/^[0-9]+(?:[.-][0-9]+)*$/.test(code) || code.length > 30) issues.push("Código inválido o calculado.");
    if (!name || name.length > 200) issues.push("Descripción ausente o demasiado larga.");
    if (hasFormula) issues.push("Las fórmulas no se admiten como datos del catálogo.");
    rows.push({ row: n, code, name, parentCode: null, issues });
  }
  if (!rows.length) throw new Error("El catálogo no contiene cuentas.");
  const occurrences = new Map<string, number>();
  for (const r of rows) occurrences.set(r.code, (occurrences.get(r.code) ?? 0) + 1);
  for (const r of rows) {
    if ((occurrences.get(r.code) ?? 0) > 1) r.issues.push("Código repetido: requiere resolución contable explícita.");
    const prefixes = rows.filter((p) => Boolean(p.code) && p.code !== r.code && (r.code.startsWith(p.code + "-") || r.code.startsWith(p.code + ".") || (!r.code.includes("-") && !r.code.includes(".") && r.code.startsWith(p.code))));
    r.parentCode = prefixes.sort((a, b) => b.code.length - a.code.length)[0]?.code ?? null;
    if (r.parentCode && (occurrences.get(r.parentCode) ?? 0) > 1) r.issues.push("La cuenta padre tiene código duplicado.");
  }
  return { sheet: sheet.name, sheets: workbook.worksheets.map((s) => s.name), fileHash: createHash("sha256").update(bytes).digest("hex"), catalogHash: catalogFingerprint(existing), rows: reconcileCatalog(rows, existing) };
}
