export function parseCrmCsv(text: string) {
  const table: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === ";")) { row.push(field.trim()); field = ""; }
    else if (!quoted && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); if (row.some(Boolean)) table.push(row); row = []; field = "";
    } else field += c;
    if (table.length > 1001) throw new Error("El CSV supera 1000 movimientos.");
  }
  if (quoted) throw new Error("Comillas sin cerrar en el extracto.");
  row.push(field.trim()); if (row.some(Boolean)) table.push(row);
  return table;
}
export function parseCrmStatementCsv(text: string) {
  const table=parseCrmCsv(text);
  const header = table.shift()?.map((s) => s.toLowerCase());
  if (!header || !["id,fecha,referencia,importe", "externalid,date,reference,amount"].includes(header.join(","))) throw new Error("Columnas del extracto inválidas.");
  return table.map((r) => { if (r.length !== 4) throw new Error("Cada movimiento requiere cuatro columnas."); return { externalId: r[0], date: r[1], reference: r[2], amount: r[3] }; });
}
