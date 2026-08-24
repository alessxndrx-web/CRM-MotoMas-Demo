"use client";

import { Printer, Wallet } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  createPosHardware,
  printerConfigStore,
  writePrinterConfig,
  type PosHardware,
  type PrinterConfig,
} from "@/features/pos/pos-printer";

/**
 * Patch POS2.6 — impresora y cajón, desde el terminal.
 *
 * ## El estado no se presume
 *
 * «Conectada» solo se dice cuando el puente ha **contestado**. Tener
 * configuración guardada no es estar conectado, y afirmarlo dejaría al cajero
 * descubriendo el problema con el cliente delante.
 *
 * El estado va en `role="status"` y **siempre lleva palabra**: nunca es solo un
 * punto de color.
 *
 * ## Configuración local, mínima
 *
 * Cuatro campos y ninguno de negocio: encendido, dirección del puente, ancho de
 * papel y el secreto local. **Desde aquí no se puede tocar ni la autorización,
 * ni la sucursal, ni ninguna regla del servidor** — todo lo que se guarda vive
 * en este equipo.
 */
type Status = "unknown" | "checking" | "online" | "offline" | "disabled";

const STATUS_LABEL: Record<Status, string> = {
  unknown: "Sin comprobar",
  checking: "Comprobando…",
  online: "Conectada",
  offline: "No disponible",
  disabled: "Desactivada",
};

const STATUS_DOT: Record<Status, string> = {
  unknown: "bg-slate-300",
  checking: "bg-slate-400",
  online: "bg-emerald-500",
  offline: "bg-red-500",
  disabled: "bg-slate-300",
};

export function PosPrinterPanel({
  /** Inyectable para las pruebas: en producción se construye del `config`. */
  hardwareFactory = createPosHardware,
}: {
  hardwareFactory?: (config: PrinterConfig) => PosHardware;
}) {
  // Sin efecto de arranque: la configuración se lee de su propia fuente.
  const config = React.useSyncExternalStore(
    printerConfigStore.subscribe,
    printerConfigStore.getSnapshot,
    printerConfigStore.getServerSnapshot,
  );
  const [status, setStatus] = React.useState<Status>("unknown");
  const [message, setMessage] = React.useState<
    { tone: "success" | "danger"; text: string } | null
  >(null);
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const hardware = React.useMemo(() => hardwareFactory(config), [hardwareFactory, config]);

  function save(next: PrinterConfig) {
    // `writePrinterConfig` avisa a la fuente; el componente se entera por ella.
    writePrinterConfig(next);
    // Cambiar la configuración invalida lo que se sabía del hardware.
    setStatus("unknown");
  }

  function check() {
    if (!config.enabled) {
      setStatus("disabled");
      return;
    }
    setStatus("checking");
    startTransition(async () => {
      const result = await hardware.getStatus();
      setStatus(result.available ? "online" : "offline");
    });
  }

  function run(operation: () => Promise<{ ok: boolean; message?: string }>, okText: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await operation();
      setMessage(
        result.ok
          ? { tone: "success", text: okText }
          : { tone: "danger", text: result.message ?? "No se pudo completar." },
      );
      if (!result.ok) setStatus("offline");
    });
  }

  return (
    <Card className="p-5" data-testid="pos-impresora">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Printer aria-hidden className="h-5 w-5 text-slate-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Impresora</h2>
            <p className="flex items-center gap-1.5 text-sm text-slate-600" role="status">
              <span
                aria-hidden
                className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`}
              />
              {/* El estado se lee; el punto solo acompaña. */}
              <span data-testid="pos-impresora-estado">{STATUS_LABEL[status]}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="pos-impresora-comprobar"
            disabled={pending}
            onClick={check}
            size="sm"
            variant="secondary"
          >
            Comprobar
          </Button>
          <Button
            data-testid="pos-impresora-prueba"
            disabled={pending}
            onClick={() => run(() => hardware.testPrint(), "Página de prueba enviada.")}
            size="sm"
            variant="secondary"
          >
            Imprimir prueba
          </Button>
          <Button
            data-testid="pos-cajon-abrir"
            disabled={pending}
            onClick={() => run(() => hardware.openCashDrawer(), "Cajón abierto.")}
            size="sm"
            variant="secondary"
          >
            <Wallet aria-hidden className="h-4 w-4" />
            Abrir cajón
          </Button>
          <Button
            aria-expanded={open}
            data-testid="pos-impresora-config"
            onClick={() => setOpen((value) => !value)}
            size="sm"
            variant="ghost"
          >
            Configurar
          </Button>
        </div>
      </div>

      {message ? (
        <Notice
          className="mt-4"
          onDismiss={() => setMessage(null)}
          tone={message.tone === "success" ? "success" : "danger"}
        >
          <span data-testid="pos-impresora-mensaje">{message.text}</span>
        </Notice>
      ) : null}

      {open ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2" data-testid="pos-impresora-form">
          <FormField
            hint="Apagada, el mostrador cobra igual: no se imprime nada."
            label="Impresora activa"
          >
            {(field) => (
              <Select
                {...field}
                data-testid="pos-impresora-activa"
                onChange={(event) =>
                  save({ ...config, enabled: event.target.value === "si" })
                }
                value={config.enabled ? "si" : "no"}
              >
                <option value="no">Desactivada</option>
                <option value="si">Activa</option>
              </Select>
            )}
          </FormField>

          <FormField hint="Servicio local de este equipo." label="Dirección del puente">
            {(field) => (
              <Input
                {...field}
                data-testid="pos-impresora-url"
                onChange={(event) => save({ ...config, bridgeUrl: event.target.value })}
                spellCheck={false}
                value={config.bridgeUrl}
              />
            )}
          </FormField>

          <FormField hint="42 columnas para 80 mm, 32 para 58 mm." label="Ancho de papel">
            {(field) => (
              <Select
                {...field}
                data-testid="pos-impresora-ancho"
                onChange={(event) =>
                  save({ ...config, paperWidth: event.target.value === "32" ? 32 : 42 })
                }
                value={String(config.paperWidth)}
              >
                <option value="42">80 mm · 42 columnas</option>
                <option value="32">58 mm · 32 columnas</option>
              </Select>
            )}
          </FormField>

          <FormField
            hint="Opcional. Secreto compartido con el servicio de este equipo."
            label="Clave del puente"
          >
            {(field) => (
              <Input
                {...field}
                data-testid="pos-impresora-token"
                onChange={(event) => save({ ...config, token: event.target.value })}
                type="password"
                value={config.token}
              />
            )}
          </FormField>
        </div>
      ) : null}
    </Card>
  );
}
