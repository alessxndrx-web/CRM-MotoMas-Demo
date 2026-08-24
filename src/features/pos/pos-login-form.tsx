"use client";

import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/feedback";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { loginPosAction } from "@/server/pos/auth-actions";

/**
 * Patch POS2.4 — el acceso al mostrador.
 *
 * **Una terminal, no un tablero.** Sin barra lateral, sin métricas, sin
 * navegación comercial: dos campos y un botón, que es lo que hace falta en una
 * pantalla táctil detrás de un mostrador.
 *
 * ## El error es siempre el mismo
 *
 * El servidor devuelve un único mensaje genérico y esta pantalla lo muestra tal
 * cual. **No distingue «no existe» de «contraseña incorrecta» de «cuenta
 * desactivada»**: cualquiera de esas tres respuestas convertiría el formulario
 * en una forma de averiguar qué usuarios existen.
 *
 * La redirección la decide el servidor (`redirectTo`), no esta pantalla.
 */
export function PosLoginForm() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const usernameError = submitted && !username.trim() ? "Escribe tu usuario." : null;
  const passwordError = submitted && !password ? "Escribe tu contraseña." : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (!username.trim() || !password) return;

    startTransition(async () => {
      const result = await loginPosAction({ username, password });
      if (!result.ok) {
        setError(result.error);
        // La contraseña no sobrevive a un intento fallido.
        setPassword("");
        return;
      }
      router.replace(result.redirectTo);
      router.refresh();
    });
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="w-full max-w-sm p-6" data-testid="pos-login">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-600 text-white">
            <ShoppingCart aria-hidden className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Punto de Venta</h1>
          <p className="mt-1 text-sm text-slate-500">
            Entra con tus credenciales de mostrador.
          </p>
        </div>

        {error ? (
          <Notice className="mt-5" tone="danger">
            <span data-testid="pos-login-error">{error}</span>
          </Notice>
        ) : null}

        <form className="mt-5 space-y-4" noValidate onSubmit={submit}>
          <FormField error={usernameError} label="Usuario" required>
            {(field) => (
              <Input
                {...field}
                autoCapitalize="none"
                autoComplete="username"
                data-testid="pos-login-usuario"
                onChange={(event) => setUsername(event.target.value)}
                spellCheck={false}
                value={username}
              />
            )}
          </FormField>

          <FormField error={passwordError} label="Contraseña" required>
            {(field) => (
              <Input
                {...field}
                autoComplete="current-password"
                data-testid="pos-login-clave"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            )}
          </FormField>

          <Button
            className="w-full"
            data-testid="pos-login-entrar"
            disabled={pending}
            type="submit"
          >
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
