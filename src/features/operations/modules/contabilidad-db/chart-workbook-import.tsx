"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { previewChartWorkbookAction, importChartWorkbookAction, stageChartWorkbookAction } from "@/server/finance/chart-of-accounts/import-actions";
import type { CatalogPreview } from "@/server/finance/chart-of-accounts/workbook";
import { accountTypeLabels, accountNatureLabels } from "@/server/finance/chart-of-accounts/shared";

export function ChartWorkbookImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [choices, setChoices] = useState<Record<number, { type: string; nature: string }>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("TODAS");
  const selected = Object.entries(choices).filter(([, c]) => c.type && c.nature);
  const valid = selected.length > 0 && selected.length <= 500 && confirmed;
  function downloadComparison() {
    if (!preview) return;
    const cell = (v: string | number | null) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`;
    const rows = [["Hoja", "Fila", "Código", "Descripción", "Padre", "Estado", "Descripción ERP", "Observaciones"], ...preview.rows.map((r) => [preview.sheet, r.row, r.code, r.name, r.parentCode, r.status, r.currentName, r.issues.join("; ")])];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "comparacion-catalogo.csv"; a.click(); URL.revokeObjectURL(url);
  }
  async function run(importing: boolean) {
    if (!file) return;
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      if (importing && preview) {
        form.set("fileHash", preview.fileHash); form.set("catalogHash", preview.catalogHash);
        form.set("confirmed", confirmed ? "yes" : "no");
        form.set("selection", JSON.stringify(selected.map(([row, c]) => ({ row: Number(row), ...c }))));
        const result = await importChartWorkbookAction(form);
        if (result.ok) { setMessage(`${result.data.imported.length} cuentas importadas como inactivas. Referencia: ${result.data.fileHash}.`); setPreview(null); setChoices({}); setConfirmed(false); router.refresh(); }
        else setMessage(result.error);
      } else {
        const result = await previewChartWorkbookAction(form);
        if (result.ok) { setPreview(result.data); setChoices({}); setConfirmed(false); }
        else setMessage(result.error);
      }
    } catch { setMessage("No se pudo completar la operación. Vuelve a comparar el archivo antes de reintentar."); }
    finally { setBusy(false); }
  }
  async function stage(){
    if(!file)return;setBusy(true);setMessage("");
    try{const form=new FormData();form.set("file",file);form.set("confirmed","yes");const result=await stageChartWorkbookAction(form);if(result.ok){setMessage(`${result.data.uniqueCodes} códigos preparados: ${result.data.created} nuevos, ${result.data.reused} existentes; ${result.data.duplicatesOmitted} duplicados omitidos con evidencia y ${result.data.missingNames} nombres pendientes. Revisa y aprueba cada cuenta antes de activarla.`);setPreview(null);router.refresh();}else setMessage(result.error);}catch{setMessage("No se pudo preparar el catálogo.");}finally{setBusy(false);}
  }
  return <section className="space-y-3 rounded-xl border border-sb-border bg-sb-surface p-4" aria-label="Importación de catálogo">
    <h2 className="text-lg font-semibold">Conciliar catálogo desde Excel</h2>
    <p className="text-sm text-sb-muted">Compara el archivo con el catálogo actual. Los códigos repetidos y las diferencias de nombre requieren revisión. Las cuentas nuevas se crean inactivas; no se alteran cuentas existentes ni movimientos.</p>
    <div className="flex flex-wrap items-center gap-3">
      <Input type="file" accept=".xlsx" aria-label="Archivo del catálogo" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setChoices({}); setConfirmed(false); setMessage(""); }} />
      <Button disabled={!file || busy} onClick={() => void run(false)}>Comparar archivo</Button>
    </div>
    <p role="status" aria-live="polite" className="text-sm">{busy ? "Procesando…" : message}</p>
    {preview && <>
      <p className="text-sm">Hoja: {preview.sheet}. {preview.rows.length} filas · {preview.rows.filter((r) => r.status === "NUEVA").length} nuevas · {preview.rows.filter((r) => r.status === "SIN_CAMBIOS").length} sin cambios · {preview.rows.filter((r) => r.status === "CONFLICTO").length} conflictos.</p>
      <Button variant="secondary" onClick={downloadComparison}>Descargar comparación</Button>
      <details className="rounded border border-sb-border p-3"><summary className="cursor-pointer font-semibold">Preparar todo el catálogo para revisión final</summary><p className="my-3 text-sm">Conserva la primera fila de cada código y registra las otras descripciones como evidencia. Las cuentas sin nombre llevan una marca pendiente editable. La clasificación por grupo de origen es provisional: las cuentas quedan inactivas y sin aprobar.</p><Button variant="secondary" disabled={busy} onClick={()=>void stage()}>Preparar códigos únicos sin activar</Button></details>
      <div className="flex gap-3">
        <Input aria-label="Buscar cuentas de la importación" placeholder="Código o descripción" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select aria-label="Estado de comparación" className="rounded border bg-sb-surface p-2" value={status} onChange={(e) => setStatus(e.target.value)}>{["TODAS", "NUEVA", "SIN_CAMBIOS", "CONFLICTO"].map((v) => <option key={v}>{v}</option>)}</select>
      </div>
      <div className="max-h-96 overflow-auto">
        <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-sb-surface"><tr>{["Fila", "Código / padre", "Descripción / actual", "Estado", "Tipo confirmado", "Naturaleza confirmada"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
          {preview.rows.filter((r) => (status === "TODAS" || status === r.status) && `${r.code} ${r.name}`.toLowerCase().includes(filter.toLowerCase())).map((r) => <tr key={r.row} className="border-t border-sb-border">
            <td className="p-2">{r.row}</td><td className="p-2 font-mono">{r.code}<small className="block">{r.parentCode ?? "Raíz"}</small></td>
            <td className="p-2">{r.name}{r.currentName && r.currentName !== r.name && <small className="block">ERP: {r.currentName}</small>}</td>
            <td className="p-2">{r.status}{r.issues.map((i) => <small className="block" key={i}>{i}</small>)}</td>
            <td className="p-2">{r.status === "NUEVA" && <select disabled={busy} className="rounded border bg-sb-surface p-2" aria-label={`Tipo de ${r.code}`} value={choices[r.row]?.type ?? ""} onChange={(e) => { setConfirmed(false); setChoices({ ...choices, [r.row]: { type: e.target.value, nature: choices[r.row]?.nature ?? "" } }); }}><option value="">No importar</option>{Object.entries(accountTypeLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>}</td>
            <td className="p-2">{r.status === "NUEVA" && <select disabled={busy} className="rounded border bg-sb-surface p-2" aria-label={`Naturaleza de ${r.code}`} value={choices[r.row]?.nature ?? ""} onChange={(e) => { setConfirmed(false); setChoices({ ...choices, [r.row]: { type: choices[r.row]?.type ?? "", nature: e.target.value } }); }}><option value="">Elegir</option>{Object.entries(accountNatureLabels).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>}</td>
          </tr>)}
        </tbody></table>
      </div>
      <p className="text-sm">Selecciona también los padres nuevos y confirma su clasificación. Los padres existentes deben ser cuentas de agrupación. Los conflictos se conservan para resolución individual.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Confirmo la clasificación y jerarquía de las {selected.length} cuentas seleccionadas.</label>
      <Button disabled={busy || !valid} onClick={() => void run(true)}>Importar cuentas inactivas</Button>
    </>}
  </section>;
}
