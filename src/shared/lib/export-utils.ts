"use client";

/**
 * Reusable export helpers for the demo: Excel-compatible CSV generation and a
 * print-ready PDF workflow built on the browser's own print dialog. No
 * external dependency is installed — everything runs client-side.
 */

export type ExportColumn<T> = {
  label: string;
  value: (row: T) => string;
};

export type ExportContext = {
  role: string;
  scope: string;
  userName?: string;
};

const CSV_BOM = "﻿";

function escapeCsvCell(value: string) {
  const needsQuoting = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

export function buildCsv<T>(rows: T[], columns: ExportColumn<T>[]) {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(column.value(row))).join(","),
  );
  return [header, ...body].join("\r\n");
}

export function buildExportFilename(base: string, extension: string) {
  const date = new Date().toISOString().slice(0, 10);
  const safeBase =
    base
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "export";
  return `${safeBase}-${date}.${extension}`;
}

/**
 * Downloads rows as an Excel-compatible CSV. Returns false (never throws) so
 * callers can show a safe, user-facing error instead of crashing the page.
 */
export function downloadCsv<T>(
  filenameBase: string,
  rows: T[],
  columns: ExportColumn<T>[],
): boolean {
  if (typeof window === "undefined") return false;
  try {
    const csv = CSV_BOM + buildCsv(rows, columns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildExportFilename(filenameBase, "csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Printable PDF (browser print) workflow                                    */
/* -------------------------------------------------------------------------- */

export type PrintableKeyValue = { label: string; value: string };
export type PrintableSection = { heading: string; rows: PrintableKeyValue[] };
export type PrintableTable = { title?: string; columns: string[]; rows: string[][] };
export type PrintableTotal = { label: string; value: string; strong?: boolean };

export type PrintableDocumentOptions = {
  documentTitle: string;
  subtitle?: string;
  meta?: PrintableKeyValue[];
  sections?: PrintableSection[];
  descripcionMoto?: string[];
  table?: PrintableTable;
  totals?: PrintableTotal[];
  observations?: PrintableKeyValue[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPrintableHtml(options: PrintableDocumentOptions): string {
  const generatedAt = new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const metaRow = (options.meta ?? [])
    .map(
      (item) =>
        `<div class="meta-item"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`,
    )
    .join("");

  const sections = (options.sections ?? [])
    .map(
      (section) => `
      <section class="block">
        <h3>${escapeHtml(section.heading)}</h3>
        <div class="kv-grid">
          ${section.rows
            .map(
              (row) =>
                `<div class="kv"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`,
            )
            .join("")}
        </div>
      </section>`,
    )
    .join("");

  const motoBlock = options.descripcionMoto?.length
    ? `<section class="block"><h3>Descripción de motocicleta</h3><pre class="moto">${options.descripcionMoto
        .map(escapeHtml)
        .join("\n")}</pre></section>`
    : "";

  const table = options.table
    ? `
      <section class="block">
        ${options.table.title ? `<h3>${escapeHtml(options.table.title)}</h3>` : ""}
        <table>
          <thead><tr>${options.table.columns
            .map((column) => `<th>${escapeHtml(column)}</th>`)
            .join("")}</tr></thead>
          <tbody>
            ${
              options.table.rows.length
                ? options.table.rows
                    .map(
                      (row) =>
                        `<tr>${row
                          .map((cell) => `<td>${escapeHtml(cell || "-")}</td>`)
                          .join("")}</tr>`,
                    )
                    .join("")
                : `<tr><td colspan="${options.table.columns.length}" class="empty">Sin registros para este alcance.</td></tr>`
            }
          </tbody>
        </table>
      </section>`
    : "";

  const totals = options.totals?.length
    ? `<section class="block totals">
        ${options.totals
          .map(
            (total) =>
              `<div class="total-row${total.strong ? " strong" : ""}"><span>${escapeHtml(
                total.label,
              )}</span><strong>${escapeHtml(total.value)}</strong></div>`,
          )
          .join("")}
      </section>`
    : "";

  const observations = options.observations?.length
    ? `<section class="block">
        <h3>Observaciones</h3>
        ${options.observations
          .map(
            (item) =>
              `<p><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value || "Sin observaciones")}</p>`,
          )
          .join("")}
      </section>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.documentTitle)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; }
  header.brand { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 20px; }
  .brand-name { font-size: 20px; font-weight: 900; letter-spacing: 0.04em; }
  .brand-sub { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { font-size: 12px; color: #555; margin: 0 0 16px; }
  .meta-row { display:flex; flex-wrap:wrap; gap: 16px; margin-bottom: 20px; font-size: 11px; }
  .meta-item { display:flex; flex-direction:column; gap:2px; }
  .meta-item span { color:#666; text-transform:uppercase; letter-spacing:.04em; font-size:10px; }
  .block { margin-bottom: 20px; }
  .block h3 { font-size: 13px; text-transform: uppercase; letter-spacing:.06em; border-bottom:1px solid #ccc; padding-bottom:6px; margin-bottom:10px; }
  .kv-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .kv { display:flex; flex-direction:column; font-size:11px; }
  .kv span { color:#666; }
  table { width:100%; border-collapse: collapse; font-size: 10.5px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background:#f0f0f0; text-transform:uppercase; font-size:9.5px; letter-spacing:.03em; }
  td.empty { text-align:center; color:#777; }
  pre.moto { background:#f5f5f5; padding:10px; border-radius:4px; font-size:11px; white-space:pre-wrap; }
  .totals { max-width: 320px; margin-left:auto; }
  .total-row { display:flex; justify-content:space-between; font-size:12px; padding:4px 0; border-bottom:1px dashed #ddd; }
  .total-row.strong { font-weight:900; font-size:14px; border-bottom:2px solid #1a1a1a; }
  footer.print-footer { margin-top: 32px; padding-top: 12px; border-top:1px solid #ccc; font-size: 10px; color:#777; text-align:center; }
  .print-actions { text-align:right; margin-bottom: 16px; }
  .print-actions button { font-size:12px; padding:8px 16px; border-radius:6px; border:1px solid #333; background:#1a1a1a; color:#fff; cursor:pointer; }
  @media print { .print-actions { display:none; } body { padding: 12mm; } }
</style>
</head>
<body>
  <div class="print-actions"><button onclick="window.print()" type="button">Imprimir / Guardar PDF</button></div>
  <header class="brand">
    <div>
      <div class="brand-name">MotoMas</div>
      <div class="brand-sub">Portal de Operaciones</div>
    </div>
    <div style="text-align:right; font-size:11px; color:#555;">Generado: ${escapeHtml(generatedAt)}</div>
  </header>
  <h1>${escapeHtml(options.documentTitle)}</h1>
  ${options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
  ${metaRow ? `<div class="meta-row">${metaRow}</div>` : ""}
  ${sections}
  ${motoBlock}
  ${table}
  ${totals}
  ${observations}
  <footer class="print-footer">Documento generado desde MotoMas - Portal de Operaciones</footer>
</body>
</html>`;
}

/**
 * Opens a clean printable window and triggers the browser print dialog.
 * Returns false (never throws) if the popup was blocked, so the caller can
 * show a safe message instead of crashing the page.
 */
export function openPrintableWindow(html: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1000,height=800");
    if (!printWindow) return false;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // Printing is best-effort; the visible "Imprimir / Guardar PDF"
        // button inside the printed page covers this case.
      }
    }, 300);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs an export action and converts any failure (thrown error or a `false`
 * return) into a safe, user-facing Spanish message instead of letting the
 * page crash.
 */
export function safeRunExport(
  action: () => boolean,
  failureMessage = "No se pudo generar el archivo. Intenta nuevamente.",
): string | null {
  try {
    return action() ? null : failureMessage;
  } catch {
    return "Ocurrió un error al exportar. Intenta nuevamente.";
  }
}

/* -------------------------------------------------------------------------- */
/*  Formatting helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Locale-invariant plain number for CSV cells (Excel-friendly, no thousands separator). */
export function formatCsvNumber(value: number) {
  return (Number.isFinite(value) ? value : 0).toFixed(2);
}

/** Human-readable currency for printable PDF tables and totals. */
export function formatCurrencyExport(value: number) {
  return new Intl.NumberFormat("es-NI", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateExport(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatPercentageExport(value: number) {
  return `${(Number.isFinite(value) ? value : 0).toFixed(0)}%`;
}

export function formatStatusLabelExport(value: string) {
  return sanitizeExportText(value) || "Sin estado";
}

/** Strips excess whitespace/newlines so exported text stays on one clean line. */
export function sanitizeExportText(value: string | null | undefined) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}
