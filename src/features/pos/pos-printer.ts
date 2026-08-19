"use client";

import {
  encodeDrawerPulse,
  encodeReceipt,
  encodeTestPrint,
  type PaperWidth,
  type ReceiptPrintJob,
} from "@/server/pos/escpos";

/**
 * Patch POS2.6 — la impresora, vista desde el terminal.
 *
 * ## Una abstracción, no una marca
 *
 * El contrato habla de imprimir, abrir el cajón, probar y consultar estado.
 * **No menciona ninguna marca**: el despliegue acordado es «una térmica USB
 * ESC/POS», y ESC/POS es justamente lo que permite no atarse a Epson, Star o
 * XPrinter. Si algún día hiciera falta una que no lo hable, se implementa este
 * mismo contrato con otro transporte.
 *
 * ## La configuración vive en el terminal, no en la base
 *
 * A qué puerto responde el puente y cuánto mide el papel son hechos **de este
 * PC**, no del negocio: dos mostradores de la misma sucursal pueden tener
 * impresoras distintas. Guardarlo en Prisma habría exigido modelar el terminal
 * físico —cuál es, quién lo posee, cómo se identifica— que es una decisión que
 * nadie ha tomado (P-43). `localStorage` es el sitio correcto para un dato del
 * dispositivo, y por eso **este parche no toca el esquema**.
 *
 * **No guarda ningún secreto de negocio**: el token del puente es un secreto
 * local entre dos procesos de la misma máquina, no una credencial de usuario.
 */

export type PrinterConfig = {
  enabled: boolean;
  /** Base del puente local. Por omisión el puerto que el script abre. */
  bridgeUrl: string;
  paperWidth: PaperWidth;
  /** Secreto compartido con el puente. Opcional; vacío = puente sin token. */
  token: string;
};

export const defaultPrinterConfig: PrinterConfig = {
  enabled: false,
  bridgeUrl: "http://127.0.0.1:7777",
  paperWidth: 42,
  token: "",
};

const STORAGE_KEY = "motomas_pos_printer";

export function readPrinterConfig(): PrinterConfig {
  if (typeof window === "undefined") return defaultPrinterConfig;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPrinterConfig;
    const parsed = JSON.parse(raw) as Partial<PrinterConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      bridgeUrl: typeof parsed.bridgeUrl === "string" && parsed.bridgeUrl
        ? parsed.bridgeUrl
        : defaultPrinterConfig.bridgeUrl,
      paperWidth: parsed.paperWidth === 32 ? 32 : 42,
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    // Una configuración corrupta no debe impedir cobrar: se vuelve al valor por
    // omisión, que es «impresora apagada».
    return defaultPrinterConfig;
  }
}

const CONFIG_EVENT = "motomas:pos-printer-config";

export function writePrinterConfig(config: PrinterConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event(CONFIG_EVENT));
}

/**
 * La configuración como **fuente externa**, para consumirla con
 * `useSyncExternalStore`.
 *
 * Sembrar el estado desde un efecto provoca un renderizado en cascada —y el
 * linter lo señala con razón—. Esto es lo que React ofrece para lo que aquí
 * ocurre de verdad: un dato que vive fuera de React, ausente en el servidor y
 * presente tras hidratar.
 *
 * La instantánea se cachea por cadena para que su **referencia sea estable**:
 * devolver un objeto nuevo en cada lectura haría que React no parase de
 * renderizar.
 */
let cachedRaw: string | null = null;
let cachedConfig: PrinterConfig = defaultPrinterConfig;

export const printerConfigStore = {
  subscribe(onChange: () => void) {
    if (typeof window === "undefined") return () => {};
    window.addEventListener(CONFIG_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(CONFIG_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  },
  getSnapshot(): PrinterConfig {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedConfig = readPrinterConfig();
    }
    return cachedConfig;
  },
  /** En el servidor no hay `localStorage`: la impresora nace apagada. */
  getServerSnapshot(): PrinterConfig {
    return defaultPrinterConfig;
  },
};

/**
 * El resultado de una operación de hardware.
 *
 * **Los tres modos de fallo se distinguen** porque el cajero hace cosas
 * distintas con cada uno: si el puente no corre, hay que arrancarlo; si la
 * impresora no responde, hay que mirar el papel o el cable; si la impresora está
 * apagada en la configuración, no hay nada que arreglar.
 */
export type HardwareResult =
  | { ok: true }
  | { ok: false; reason: "disabled" | "bridge" | "printer" | "request"; message: string };

const MESSAGES = {
  disabled: "La impresora está desactivada en este terminal.",
  bridge: "El servicio de impresión del punto de venta no está disponible.",
  printer: "La impresora no respondió. Revisa papel y conexión.",
  request: "No se pudo preparar el trabajo de impresión.",
} as const;

async function send(
  config: PrinterConfig,
  path: "/print" | "/drawer" | "/test",
  bytes: Uint8Array,
): Promise<HardwareResult> {
  if (!config.enabled) {
    return { ok: false, reason: "disabled", message: MESSAGES.disabled };
  }
  try {
    const response = await fetch(`${config.bridgeUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.token ? { "x-pos-bridge-token": config.token } : {}),
      },
      body: JSON.stringify({ bytes: Array.from(bytes) }),
      // Un mostrador no espera indefinidamente a una impresora muerta.
      signal: AbortSignal.timeout(20_000),
    });

    if (response.ok) return { ok: true };
    // **El mensaje del puente no se propaga tal cual.** Podría describir la
    // máquina; el terminal habla en términos del cajero.
    return { ok: false, reason: "printer", message: MESSAGES.printer };
  } catch {
    // Fallo de red al bucle local: el puente no está corriendo.
    return { ok: false, reason: "bridge", message: MESSAGES.bridge };
  }
}

export type PosHardware = {
  printReceipt(job: ReceiptPrintJob): Promise<HardwareResult>;
  openCashDrawer(): Promise<HardwareResult>;
  testPrint(): Promise<HardwareResult>;
  getStatus(): Promise<{ available: boolean; configured: boolean }>;
};

/**
 * El hardware real, hablando con el puente.
 *
 * Se construye con la configuración en vez de leerla dentro: así las pruebas
 * pueden sustituir la implementación entera sin tocar `localStorage` ni exigir
 * una impresora, que es la condición del encargo para CI.
 */
export function createPosHardware(config: PrinterConfig): PosHardware {
  return {
    printReceipt: (job) => send(config, "/print", encodeReceipt(job)),
    openCashDrawer: () => send(config, "/drawer", encodeDrawerPulse()),
    testPrint: () => send(config, "/test", encodeTestPrint(config.paperWidth)),
    async getStatus() {
      if (!config.enabled) return { available: false, configured: false };
      try {
        const response = await fetch(`${config.bridgeUrl}/status`, {
          signal: AbortSignal.timeout(4_000),
        });
        if (!response.ok) return { available: false, configured: false };
        const body = (await response.json()) as { configured?: boolean };
        // **Solo se declara «conectado» si el puente lo confirmó.** No se
        // presume por tener configuración guardada.
        return { available: true, configured: Boolean(body.configured) };
      } catch {
        return { available: false, configured: false };
      }
    },
  };
}
