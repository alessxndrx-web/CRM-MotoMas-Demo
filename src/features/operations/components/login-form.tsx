"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";

import { BrandWordmark } from "@/features/operations/components/brand-wordmark";
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
      <div className="mb-8 flex justify-center lg:hidden">
        <BrandWordmark
          className="items-center"
          subtitle="Centro de Operaciones"
          tone="light"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ingresa con tu cuenta interna para acceder al Centro de Operaciones.
        </p>

        <form className="mt-6 grid gap-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Correo
            </span>
            <input
              autoComplete="email"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="correo@motomas.local"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Contraseña
            </span>
            <input
              autoComplete="current-password"
              className="h-11 w-full rounded-md border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <button
            className="mt-1 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:pointer-events-none disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            <LogIn className="h-4 w-4" />
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        {authSource === "dev-fallback" ? (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
            <div className="font-semibold">Cuentas de desarrollo</div>
            <p className="mt-1">
              Este entorno permite ingresar con las cuentas de prueba:
            </p>
            <ul className="mt-2 grid gap-1 font-mono text-[11px]">
              <li>admin@motomas.local</li>
              <li>gerente@motomas.local</li>
              <li>vendedor@motomas.local</li>
              <li>cajero@motomas.local</li>
              <li>contador@motomas.local</li>
            </ul>
            <p className="mt-2">
              Contraseña: <span className="font-mono">Motomas.2026</span>
            </p>
          </div>
        ) : null}

        {authSource === "disabled" ? (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-700">
            El acceso está deshabilitado. Configura la conexión de datos
            (<code>DATABASE_URL</code>) o habilita el modo de desarrollo para
            iniciar sesión.
          </div>
        ) : null}
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        Acceso restringido a personal autorizado.
      </p>
    </div>
  );
}
