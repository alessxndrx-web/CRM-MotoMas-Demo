"use client";

import { Printer } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/feedback";
import { createPosHardware, readPrinterConfig } from "@/features/pos/pos-printer";
import { buildPosReceiptAction } from "@/server/pos/receipt-actions";

/**
 * Patch POS6.0-C — reimprimir una venta ya registrada.
 *
 * **Nunca toca la venta.** Construye el recibo desde lo persistido y lo manda al
 * puente; que el papel falle no pone en duda el cobro, igual que en POS2.6. Es
 * la misma acción de servidor que usa el terminal, que ya comprueba que la venta
 * sea de la sucursal del operador.
 *
 * No se comparte componente con el cobro a propósito: allí la impresión ocurre
 * **después** de crear la venta y dentro de su flujo; aquí es la única acción de
 * la pantalla. Unificarlas obligaría a que la del cobro conociera un estado que
 * no necesita.
 */
export function PosReprintButton({ saleId }: { saleId: string }) {
  const [state, setState] = useState<
    { tone: "pending" | "ok" | "error"; text: string } | null
  >(null);

  async function reprint() {
    const config = readPrinterConfig();
    if (!config.enabled) {
      setState({
        tone: "error",
        text: "La impresora no está configurada en este terminal.",
      });
      return;
    }

    setState({ tone: "pending", text: "Imprimiendo recibo…" });
    try {
      const receipt = await buildPosReceiptAction({
        saleId,
        paperWidth: config.paperWidth,
      });
      if (!receipt.ok) {
        setState({ tone: "error", text: receipt.error });
        return;
      }
      const result = await createPosHardware(config).printReceipt(receipt.job);
      setState(
        result.ok
          ? { tone: "ok", text: "Recibo impreso." }
          : { tone: "error", text: result.message },
      );
    } catch {
      // **Ningún interno llega al cajero.**
      setState({ tone: "error", text: "El recibo no se pudo imprimir." });
    }
  }

  return (
    <div className="space-y-3">
      <Button
        data-testid="pos-venta-reimprimir"
        onClick={() => void reprint()}
        variant="secondary"
      >
        <Printer aria-hidden className="h-4 w-4" />
        Reimprimir recibo
      </Button>
      {state ? (
        <Notice
          onDismiss={() => setState(null)}
          tone={
            state.tone === "ok"
              ? "success"
              : state.tone === "error"
                ? "warning"
                : "info"
          }
        >
          <span data-testid="pos-venta-recibo-estado">{state.text}</span>
        </Notice>
      ) : null}
    </div>
  );
}
