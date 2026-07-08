"use client";

import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, PackagePlus } from "lucide-react";
import { useMemo, useState, useTransition, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  registerEgress,
  registerIngress,
} from "@/server/inventory/actions";
import {
  egressReasons,
  unitStatusLabels,
  type InventoryMovementDTO,
  type InventoryUnitDTO,
  type MotorcycleUnitStatusValue,
} from "@/server/inventory/shared";

type BranchOption = { code: string; name: string };
type Banner = { tone: "ok" | "error"; message: string } | null;

const today = () => new Date().toISOString().slice(0, 10);

export function InventoryMovementsClient({
  branchOptions,
  dbConfigured,
  isBranchLocked,
  movements,
  units,
}: {
  branchOptions: BranchOption[];
  dbConfigured: boolean;
  isBranchLocked: boolean;
  movements: InventoryMovementDTO[];
  units: InventoryUnitDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [ingressBanner, setIngressBanner] = useState<Banner>(null);
  const [ingress, setIngress] = useState({
    name: "",
    brand: "",
    model: "",
    year: "2026",
    chassisNumber: "",
    engineNumber: "",
    color: "",
    branchCode: branchOptions[0]?.code ?? "",
    entryDate: today(),
    notes: "",
  });

  const egressableUnits = useMemo(
    () =>
      units.filter(
        (unit) => !unit.exitDate && !["EXITED", "SOLD", "DELIVERED", "CANCELLED"].includes(unit.status),
      ),
    [units],
  );
  const [egressBanner, setEgressBanner] = useState<Banner>(null);
  const [egress, setEgress] = useState({
    unitId: "",
    reason: egressReasons[0].value as string,
    exitDate: today(),
    notes: "",
  });

  function submitIngress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIngressBanner(null);
    startTransition(async () => {
      const result = await registerIngress(ingress);
      if (!result.ok) {
        setIngressBanner({ tone: "error", message: result.error });
        return;
      }
      setIngressBanner({ tone: "ok", message: "Ingreso registrado correctamente." });
      setIngress((current) => ({
        ...current,
        name: "",
        brand: "",
        model: "",
        chassisNumber: "",
        engineNumber: "",
        color: "",
        notes: "",
      }));
      router.refresh();
    });
  }

  function submitEgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEgressBanner(null);
    if (!egress.unitId) {
      setEgressBanner({ tone: "error", message: "Selecciona una unidad." });
      return;
    }
    startTransition(async () => {
      const result = await registerEgress(egress);
      if (!result.ok) {
        setEgressBanner({ tone: "error", message: result.error });
        return;
      }
      setEgressBanner({ tone: "ok", message: "Egreso registrado correctamente." });
      setEgress((current) => ({ ...current, unitId: "", notes: "" }));
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Ingress */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
              <ArrowDownToLine className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-black text-white">Registrar ingreso</h3>
              <p className="text-xs text-zinc-500">Alta de una unidad al inventario.</p>
            </div>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={submitIngress}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nombre" onChange={(v) => setIngress({ ...ingress, name: v })} required value={ingress.name} />
              <TextField label="Marca" onChange={(v) => setIngress({ ...ingress, brand: v })} required value={ingress.brand} />
              <TextField label="Modelo" onChange={(v) => setIngress({ ...ingress, model: v })} required value={ingress.model} />
              <TextField label="Año" onChange={(v) => setIngress({ ...ingress, year: v })} required type="number" value={ingress.year} />
              <TextField label="Número de chasis" onChange={(v) => setIngress({ ...ingress, chassisNumber: v })} required value={ingress.chassisNumber} />
              <TextField label="Número de motor" onChange={(v) => setIngress({ ...ingress, engineNumber: v })} value={ingress.engineNumber} />
              <TextField label="Color" onChange={(v) => setIngress({ ...ingress, color: v })} value={ingress.color} />
              <TextField label="Fecha de ingreso" onChange={(v) => setIngress({ ...ingress, entryDate: v })} type="date" value={ingress.entryDate} />
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Sucursal</span>
              {isBranchLocked ? (
                <div className="flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-300">
                  {branchOptions[0]?.name ?? "Sucursal"}
                  <span className="ml-2 text-xs text-zinc-600">(fija por tu rol)</span>
                </div>
              ) : (
                <select
                  className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70"
                  onChange={(event) => setIngress({ ...ingress, branchCode: event.target.value })}
                  value={ingress.branchCode}
                >
                  {branchOptions.map((branch) => (
                    <option key={branch.code} value={branch.code}>{branch.name}</option>
                  ))}
                </select>
              )}
            </label>

            <TextField label="Observaciones" onChange={(v) => setIngress({ ...ingress, notes: v })} value={ingress.notes} />

            <BannerView banner={ingressBanner} />

            <Button disabled={pending || !dbConfigured} type="submit">
              <PackagePlus className="h-4 w-4" />
              Registrar ingreso
            </Button>
          </form>
        </Card>

        {/* Egress */}
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-500/15 text-red-300">
              <ArrowUpFromLine className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-black text-white">Registrar egreso</h3>
              <p className="text-xs text-zinc-500">Baja o salida de una unidad.</p>
            </div>
          </div>

          <form className="mt-5 grid gap-4" onSubmit={submitEgress}>
            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Unidad</span>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70"
                onChange={(event) => setEgress({ ...egress, unitId: event.target.value })}
                value={egress.unitId}
              >
                <option value="">Selecciona una unidad disponible</option>
                {egressableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.chassisNumber} · {unit.name} · {unit.branchName}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">Motivo</span>
              <select
                className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm font-semibold text-zinc-100 outline-none transition focus:border-red-500/70"
                onChange={(event) => setEgress({ ...egress, reason: event.target.value })}
                value={egress.reason}
              >
                {egressReasons.map((reason) => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </select>
            </label>

            <TextField label="Fecha de egreso" onChange={(v) => setEgress({ ...egress, exitDate: v })} type="date" value={egress.exitDate} />
            <TextField label="Observaciones" onChange={(v) => setEgress({ ...egress, notes: v })} value={egress.notes} />

            <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-xs leading-5 text-red-100">
              El egreso registra la salida de la unidad y no puede deshacerse. La
              unidad dejará de estar disponible.
            </div>

            <BannerView banner={egressBanner} />

            <Button disabled={pending || !dbConfigured || !egressableUnits.length} type="submit" variant="danger">
              <ArrowUpFromLine className="h-4 w-4" />
              Registrar egreso
            </Button>
          </form>
        </Card>
      </div>

      {/* Units */}
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-lg font-black text-white">Unidades registradas</h3>
          <p className="text-xs text-zinc-500">{units.length} unidad(es) en el alcance actual.</p>
        </div>
        {units.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Chasis</th>
                  <th className="px-5 py-3">Unidad</th>
                  <th className="px-5 py-3">Año</th>
                  <th className="px-5 py-3">Color</th>
                  <th className="px-5 py-3">Sucursal</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Ingreso</th>
                  <th className="px-5 py-3">Egreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {units.map((unit) => (
                  <tr className="hover:bg-white/[0.02]" key={unit.id}>
                    <td className="px-5 py-4 font-mono font-bold text-white">{unit.chassisNumber}</td>
                    <td className="px-5 py-4 text-zinc-300">{unit.name}</td>
                    <td className="px-5 py-4 text-zinc-400">{unit.year}</td>
                    <td className="px-5 py-4 text-zinc-400">{unit.color ?? "—"}</td>
                    <td className="px-5 py-4 text-zinc-400">{unit.branchName}</td>
                    <td className="px-5 py-4"><StatusBadge status={unit.status} /></td>
                    <td className="px-5 py-4 text-zinc-400">{formatDate(unit.entryDate)}</td>
                    <td className="px-5 py-4 text-zinc-400">{unit.exitDate ? formatDate(unit.exitDate) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-sm leading-6 text-zinc-500">
            {dbConfigured
              ? "Aún no hay unidades registradas en este alcance. Registra un ingreso para comenzar."
              : "Configura la base de datos para ver y registrar unidades reales."}
          </div>
        )}
      </Card>

      {/* Movements */}
      <Card className="overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <h3 className="text-lg font-black text-white">Historial de movimientos</h3>
          <p className="text-xs text-zinc-500">Últimos ingresos y egresos del alcance actual.</p>
        </div>
        {movements.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Unidad</th>
                  <th className="px-5 py-3">Sucursal</th>
                  <th className="px-5 py-3">Motivo</th>
                  <th className="px-5 py-3">Registrado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {movements.map((movement) => (
                  <tr className="hover:bg-white/[0.02]" key={movement.id}>
                    <td className="px-5 py-4 text-zinc-400">{formatDate(movement.date)}</td>
                    <td className="px-5 py-4"><Badge tone={movementTone(movement.type)}>{movement.typeLabel}</Badge></td>
                    <td className="px-5 py-4 text-zinc-300">
                      <span className="font-mono text-xs text-zinc-400">{movement.unitChassis}</span>
                      <div className="text-xs text-zinc-500">{movement.unitName}</div>
                    </td>
                    <td className="px-5 py-4 text-zinc-400">{movement.branchName}</td>
                    <td className="px-5 py-4 text-zinc-400">{movement.reason}</td>
                    <td className="px-5 py-4 text-zinc-400">{movement.createdByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-sm leading-6 text-zinc-500">Sin movimientos registrados todavía.</div>
        )}
      </Card>
    </div>
  );
}

function TextField({
  label,
  onChange,
  required,
  type = "text",
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <input
        className="h-11 w-full rounded-xl border border-white/10 bg-[#141414] px-4 text-sm text-zinc-100 outline-none transition focus:border-red-500/70"
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </label>
  );
}

function BannerView({ banner }: { banner: Banner }) {
  if (!banner) return null;
  return (
    <div
      className={
        banner.tone === "ok"
          ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200"
          : "rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200"
      }
    >
      {banner.message}
    </div>
  );
}

function StatusBadge({ status }: { status: MotorcycleUnitStatusValue }) {
  const tone =
    status === "AVAILABLE"
      ? "green"
      : status === "RESERVED" || status === "IN_TRANSFER"
        ? "yellow"
        : status === "SOLD" || status === "DELIVERED"
          ? "blue"
          : "red";
  return <Badge tone={tone}>{unitStatusLabels[status]}</Badge>;
}

function movementTone(type: string): "green" | "red" | "blue" | "yellow" | "gray" {
  if (type === "INGRESO" || type === "TRASLADO_ENTRADA") return "green";
  if (type === "EGRESO" || type === "TRASLADO_SALIDA") return "red";
  if (type === "VENTA" || type === "ENTREGA") return "blue";
  if (type === "RESERVA") return "yellow";
  return "gray";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-NI", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
