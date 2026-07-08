"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, LogIn, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { saveDemoSession } from "@/features/operations/services/session-service";
import { loginAction } from "@/server/auth/actions";

export function LoginForm({
  authSource,
  nextPath,
}: {
  authSource: "database" | "dev-fallback" | "disabled";
  nextPath?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await loginAction({ email, password });
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      saveDemoSession(result.session);
      const destination =
        nextPath && nextPath.startsWith("/panel") ? nextPath : result.redirectTo;
      router.push(destination);
      router.refresh();
    } catch {
      setError("No se pudo iniciar sesión. Intenta nuevamente.");
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-600 shadow-[0_18px_40px_rgba(239,35,45,0.35)]">
          <ShieldCheck className="h-7 w-7 text-white" />
        </div>
        <h1 className="mt-5 text-2xl font-black text-white">MotoMas</h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Centro de Operaciones
        </p>
      </div>

      <div className="rounded-3xl border border-white/10 bg-[#111]/80 p-8 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
        <h2 className="text-lg font-black text-white">Iniciar sesión</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Ingresa con tu cuenta interna para acceder al panel.
        </p>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Correo
            </span>
            <input
              autoComplete="email"
              className="h-12 w-full rounded-xl border border-white/10 bg-[#0c0c0c] px-4 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@motomas.local"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-zinc-500">
              Contraseña
            </span>
            <input
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-white/10 bg-[#0c0c0c] px-4 text-sm font-semibold text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/15"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <Button className="mt-1 h-12 w-full" disabled={loading} type="submit">
            <LogIn className="h-4 w-4" />
            {loading ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>

        {authSource === "dev-fallback" ? (
          <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100">
            <div className="font-black uppercase tracking-[0.1em] text-amber-200">
              Modo desarrollo (sin base de datos)
            </div>
            <p className="mt-2 text-amber-100/90">
              Aún no hay <code>DATABASE_URL</code> configurado. Puedes ingresar con
              las cuentas de desarrollo:
            </p>
            <ul className="mt-2 grid gap-1 font-mono text-[11px] text-amber-100/90">
              <li>admin@motomas.local</li>
              <li>gerente@motomas.local</li>
              <li>vendedor@motomas.local</li>
              <li>cajero@motomas.local</li>
              <li>contador@motomas.local</li>
            </ul>
            <p className="mt-2 text-amber-100/90">
              Contraseña: <span className="font-mono">Motomas.2026</span>
            </p>
          </div>
        ) : null}

        {authSource === "disabled" ? (
          <div className="mt-6 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-xs leading-5 text-red-100">
            El acceso está deshabilitado: configura <code>DATABASE_URL</code> o
            habilita el modo de desarrollo para iniciar sesión.
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-600">
        MotoMas — Plataforma ERP + CRM multi-sucursal. Acceso interno privado.
      </p>
    </div>
  );
}
