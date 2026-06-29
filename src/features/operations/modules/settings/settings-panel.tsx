"use client";

import Link from "next/link";
import { Database, RotateCcw, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { resetDemoData } from "@/features/operations/services/demo-data-reset-service";
import {
  readDemoSession,
  subscribeToDemoSession,
} from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";

export function SettingsPanel() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [wasReset, setWasReset] = useState(false);

  useEffect(() => {
    setSession(readDemoSession());
    return subscribeToDemoSession(() => setSession(readDemoSession()));
  }, []);

  if (!session) {
    return (
      <Card className="p-8 text-center">
        <Database className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">
          Sesión interna requerida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Inicia sesión demo como Administrador para acceder a configuración.
        </p>
        <Link
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
          href="/panel"
        >
          Ir a inicio de sesión
        </Link>
      </Card>
    );
  }

  if (session.role !== "Administrador") {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-zinc-600" />
        <h2 className="mt-4 text-2xl font-black text-white">
          Configuración restringida
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          Esta zona interna está disponible solo para Administrador.
        </p>
      </Card>
    );
  }

  function runReset() {
    if (confirmation !== "REINICIAR") return;
    resetDemoData();
    setWasReset(true);
    setConfirmation("");
  }

  return (
    <section className="space-y-6">
      <div>
        <Badge tone="red">Configuración interna</Badge>
        <h2 className="mt-4 text-3xl font-black text-white">
          Reinicio de datos demo
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
          Herramienta interna para reiniciar el recorrido demo en este navegador.
          No aparece en el Portal Cliente ni afecta una base de datos real.
        </p>
      </div>

      <Card className="border-red-500/20 bg-red-500/8 p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <RotateCcw className="h-5 w-5 text-red-300" />
              <h3 className="text-xl font-black text-white">
                Reiniciar datos demo
              </h3>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              Limpia solicitudes, clientes, expedientes, inventario, traslados,
              reservas, ventas y sesión demo de este navegador.
            </p>
          </div>
          <Badge tone="gray">Solo configuración interna</Badge>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Confirmación
            </span>
            <input
              className="h-12 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
              onChange={(event) => {
                setWasReset(false);
                setConfirmation(event.target.value.toUpperCase());
              }}
              placeholder="Escribe REINICIAR"
              value={confirmation}
            />
          </label>
          <Button
            disabled={confirmation !== "REINICIAR"}
            onClick={runReset}
            type="button"
            variant="danger"
          >
            <RotateCcw className="h-4 w-4" />
            Reiniciar demo
          </Button>
        </div>

        {wasReset ? (
          <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4 text-sm font-semibold text-emerald-200">
            Datos demo reiniciados. La sesión interna fue cerrada.
          </div>
        ) : null}
      </Card>
    </section>
  );
}
