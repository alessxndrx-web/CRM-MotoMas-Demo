import type { PosSaleDetailDTO } from "@/server/pos/shared";

/**
 * Patch POS2.6 — codificador ESC/POS.
 *
 * ## Por qué a mano y sin dependencia
 *
 * ESC/POS es un puñado de secuencias de escape de dos o tres bytes. Lo que un
 * recibo de mostrador necesita —inicializar, alinear, negrita, cortar, pulso de
 * cajón— cabe en las constantes de abajo. Una librería traería un modelo de
 * dispositivo, descubrimiento USB y un árbol de dependencias para no usar casi
 * nada de ello.
 *
 * ## Es puro
 *
 * Recibe un recibo y devuelve bytes. **No abre puertos, no habla con nadie y no
 * conoce la base de datos**: por eso se puede probar sin impresora, que es la
 * condición que el encargo pone para CI.
 *
 * ## Codificación
 *
 * CP437 no lleva acentos ni «ñ», y una impresora térmica configurada de fábrica
 * casi siempre arranca ahí. En vez de apostar por una tabla de códigos concreta,
 * **se transliteran los acentos**: «Camión» sale «Camion», que es legible, en vez
 * de «Cami??n», que no lo es. Cuando el despliegue confirme la tabla real de la
 * impresora, esto se sustituye por `ESC t n` y la tabla correspondiente (P-52).
 */

/* -------------------------------------------------------------------------
 * Comandos
 * ---------------------------------------------------------------------- */

const ESC = 0x1b;
const GS = 0x1d;

export const escposCommands = {
  /** `ESC @` — restablece márgenes, estilo y alineación de la sesión anterior. */
  initialize: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0x00],
  alignCenter: [ESC, 0x61, 0x01],
  alignRight: [ESC, 0x61, 0x02],
  boldOn: [ESC, 0x45, 0x01],
  boldOff: [ESC, 0x45, 0x00],
  doubleHeightOn: [GS, 0x21, 0x01],
  doubleHeightOff: [GS, 0x21, 0x00],
  /** `GS V 1` — corte parcial: deja un puente de papel para que no caiga. */
  cut: [GS, 0x56, 0x01],
  /**
   * `ESC p 0 25 250` — pulso al conector del cajón.
   *
   * El cajón **no está conectado al PC**: cuelga de la impresora, y esto es lo
   * que la impresora envía por ese conector. Por eso abrir el cajón y imprimir
   * comparten camino: son el mismo dispositivo.
   */
  drawerPulse: [ESC, 0x70, 0x00, 0x19, 0xfa],
} as const;

/** Alto de papel habitual: 42 columnas a 80 mm, 32 a 58 mm. */
export type PaperWidth = 32 | 42;

/* -------------------------------------------------------------------------
 * Texto
 * ---------------------------------------------------------------------- */

const TRANSLITERATIONS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u",
  Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U",
  ñ: "n", Ñ: "N", "¿": "?", "¡": "!", "€": "EUR",
};

/** Deja el texto en ASCII imprimible, sin perder legibilidad. */
export function toPrinterText(value: string): string {
  return value
    .replace(/[áéíóúüÁÉÍÓÚÜñÑ¿¡€]/g, (char) => TRANSLITERATIONS[char] ?? char)
    // Cualquier cosa que siga fuera de ASCII se sustituye, nunca se omite: un
    // carácter perdido descuadra una columna alineada.
    .replace(/[^\x20-\x7e\n]/g, "?");
}

/** Rellena a la derecha, recortando si no cabe. Nunca desborda la columna. */
function padEnd(value: string, width: number): string {
  const text = toPrinterText(value);
  return text.length >= width ? text.slice(0, width) : text.padEnd(width, " ");
}

/** Etiqueta a la izquierda, importe a la derecha, en una sola línea. */
export function twoColumns(left: string, right: string, width: PaperWidth): string {
  const value = toPrinterText(right);
  const label = padEnd(left, Math.max(0, width - value.length - 1));
  return `${label} ${value}`;
}

export function centered(value: string, width: PaperWidth): string {
  const text = toPrinterText(value).slice(0, width);
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(left) + text;
}

export function separator(width: PaperWidth): string {
  return "-".repeat(width);
}

/* -------------------------------------------------------------------------
 * Construcción del trabajo
 * ---------------------------------------------------------------------- */

/**
 * Lo que se imprime, resuelto en el servidor.
 *
 * **Solo lleva datos que el dominio ya tiene.** No hay RUC, ni serie, ni número
 * de autorización, ni desglose de impuesto calculado: nada de eso existe en el
 * repositorio, e imprimirlo lo convertiría en una factura que no es (P-39).
 */
export type ReceiptPrintJob = {
  businessName: string;
  branchName: string;
  saleNumber: string;
  issuedAt: string;
  operatorName: string;
  customerName: string | null;
  lines: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payments: Array<{ label: string; amount: number }>;
  paidTotal: number;
  /** `total − paidTotal`. Se imprime solo si no es cero. */
  balance: number;
  notes: string | null;
  /** Aviso obligatorio: esto no es un documento fiscal. */
  footer: string;
  paperWidth: PaperWidth;
};

const amount = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const quantity = (value: number) =>
  Number.isInteger(value) ? String(value) : String(value);

/**
 * El recibo, como líneas de texto ya alineadas.
 *
 * Se expone aparte de los bytes **para poder verlo en pantalla**: la misma
 * representación alimenta la vista previa y la impresora, así que lo que el
 * cajero revisa es exactamente lo que sale por el papel.
 */
export function renderReceiptLines(job: ReceiptPrintJob): string[] {
  const w = job.paperWidth;
  const out: string[] = [];

  out.push(centered(job.businessName, w));
  out.push(centered(job.branchName, w));
  out.push("");
  out.push(twoColumns("Venta", job.saleNumber, w));
  out.push(twoColumns("Fecha", job.issuedAt, w));
  out.push(twoColumns("Atendio", job.operatorName, w));
  if (job.customerName) out.push(twoColumns("Cliente", job.customerName, w));
  out.push(separator(w));

  for (const line of job.lines) {
    // Nombre en su propia línea: recortarlo para que quepa con el importe haría
    // ilegible cualquier artículo con nombre largo, que son la mayoría.
    out.push(padEnd(line.name, w));
    out.push(
      twoColumns(
        `  ${quantity(line.quantity)} x ${amount(line.unitPrice)}`,
        amount(line.total),
        w,
      ),
    );
  }

  out.push(separator(w));
  if (job.discount > 0) out.push(twoColumns("Descuento", amount(job.discount), w));
  if (job.tax > 0) out.push(twoColumns("Impuesto", amount(job.tax), w));
  out.push(twoColumns("Subtotal", amount(job.subtotal), w));
  out.push(twoColumns("TOTAL", amount(job.total), w));
  out.push("");

  for (const payment of job.payments) {
    out.push(twoColumns(payment.label, amount(payment.amount), w));
  }
  out.push(twoColumns("Pagado", amount(job.paidTotal), w));
  // Un saldo distinto de cero se dice. P-1 permite cerrar corto; callarlo en el
  // papel sería esconder justo el hecho que alguien tendrá que explicar.
  if (Math.round(job.balance * 100) !== 0) {
    out.push(twoColumns("Saldo", amount(job.balance), w));
  }

  if (job.notes) {
    out.push("");
    out.push(padEnd(job.notes, w));
  }

  out.push("");
  out.push(centered(job.footer, w));
  return out;
}

/**
 * Los bytes que van a la impresora.
 *
 * `Uint8Array` y no `Buffer`: este módulo lo importa también el navegador para
 * la vista previa, y `Buffer` no existe allí.
 */
export function encodeReceipt(job: ReceiptPrintJob): Uint8Array {
  const bytes: number[] = [];
  const push = (command: readonly number[]) => bytes.push(...command);
  const text = (value: string) => {
    for (const char of toPrinterText(value)) bytes.push(char.charCodeAt(0) & 0xff);
    bytes.push(0x0a);
  };

  push(escposCommands.initialize);

  const lines = renderReceiptLines(job);
  push(escposCommands.alignLeft);
  lines.forEach((line, index) => {
    // La cabecera del negocio va en negrita; el resto plano, para que el
    // énfasis signifique algo.
    if (index === 0) push(escposCommands.boldOn);
    text(line);
    if (index === 0) push(escposCommands.boldOff);
  });

  // Avance antes del corte: sin él la cuchilla parte la última línea.
  text("");
  text("");
  push(escposCommands.cut);
  return Uint8Array.from(bytes);
}

/** Solo el pulso: abrir el cajón no imprime nada. */
export function encodeDrawerPulse(): Uint8Array {
  return Uint8Array.from([...escposCommands.initialize, ...escposCommands.drawerPulse]);
}

/** Página de prueba: confirma papel, ancho y corte sin gastar una venta. */
export function encodeTestPrint(width: PaperWidth): Uint8Array {
  const bytes: number[] = [...escposCommands.initialize, ...escposCommands.alignLeft];
  const text = (value: string) => {
    for (const char of toPrinterText(value)) bytes.push(char.charCodeAt(0) & 0xff);
    bytes.push(0x0a);
  };
  text(centered("MotoMas", width));
  text(centered("Prueba de impresion", width));
  text(separator(width));
  text(twoColumns("Ancho", `${width} col`, width));
  text(twoColumns("Acentos", "aeiou n", width));
  text(separator(width));
  text("");
  text("");
  bytes.push(...escposCommands.cut);
  return Uint8Array.from(bytes);
}

/** Del dominio al trabajo de impresión. Deriva; no vuelve a calcular nada. */
export function buildReceiptJob(
  sale: PosSaleDetailDTO,
  context: {
    businessName: string;
    operatorName: string;
    paperWidth: PaperWidth;
    footer: string;
  },
): ReceiptPrintJob {
  return {
    businessName: context.businessName,
    branchName: sale.branchName,
    saleNumber: sale.saleNumber,
    issuedAt: new Intl.DateTimeFormat("es-NI", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(sale.completedAt ?? sale.createdAt)),
    operatorName: context.operatorName,
    customerName: sale.customerName,
    lines: sale.items.map((item) => ({
      name: `${item.productName} (${item.productSku})`,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    payments: sale.payments.map((payment) => ({
      label: payment.methodLabel,
      amount: payment.amount,
    })),
    paidTotal: sale.paidTotal,
    balance: sale.balance,
    notes: sale.notes,
    footer: context.footer,
    paperWidth: context.paperWidth,
  };
}
