"use client";

import { Boxes, LogOut, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logoutPosAction } from "@/server/pos/auth-actions";
import { cn } from "@/lib/utils";

/**
 * Patch POS2.4 — la barra del terminal.
 *
 * Dice quién está en el mostrador, en qué sucursal, y ofrece las dos pantallas
 * operativas y la salida. **Nada más**: ni enlaces al panel administrativo, ni
 * módulos comerciales. Un operador de POS no tiene sesión administrativa, así
 * que un enlace a `/panel` solo le daría una puerta cerrada.
 *
 * El cierre de sesión llama a la acción del servidor, que borra la cookie **y**
 * rota la versión de sesión del operador: una cookie copiada deja de valer en la
 * siguiente petición, no cuando caduque.
 */
const links = [
  { href: "/pos/venta", label: "Venta", icon: ShoppingCart },
  { href: "/pos/inventario", label: "Existencias", icon: Boxes },
];

export function PosTerminalHeader({
  username,
  branchName,
}: {
  username: string;
  branchName: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function logout() {
    startTransition(async () => {
      await logoutPosAction();
      router.replace("/pos/login");
      router.refresh();
    });
  }

  return (
    <header className="border-b border-slate-200 bg-white" data-testid="pos-terminal">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-600 text-white">
            <ShoppingCart aria-hidden className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">
              Punto de Venta
            </p>
            <p className="truncate text-xs text-slate-500">
              <span data-testid="pos-operador">{username}</span> · {branchName}
            </p>
          </div>
        </div>

        <nav aria-label="Punto de venta" className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href;
            const Icon = link.icon;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "sb-focus flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
                href={link.href}
                key={link.href}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          <Badge className="ml-2 hidden sm:inline-flex" tone="slate">
            Mostrador
          </Badge>
          <Button
            className="ml-1"
            data-testid="pos-salir"
            disabled={pending}
            onClick={logout}
            size="sm"
            variant="secondary"
          >
            <LogOut aria-hidden className="h-4 w-4" />
            <span className="hidden sm:inline">Salir</span>
          </Button>
        </nav>
      </div>
    </header>
  );
}
