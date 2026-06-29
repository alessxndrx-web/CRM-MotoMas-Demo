import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { FileText, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  PortalStaticStatusLinks,
  PortalStatusLinks,
} from "@/features/portal/components/portal-status-links";

const portalNavItems = [
  { href: "/", label: "Inicio" },
  { href: "/catalogo", label: "Catálogo" },
  { href: "/solicitar-informacion", label: "Solicitar información" },
  { href: "/consultar-expediente", label: "Consultar expediente" },
];

const portalStatusItems = [
  { href: "/mi-credito", label: "Mi crédito" },
  { href: "/mi-reserva", label: "Mi reserva" },
  { href: "/mi-entrega", label: "Mi entrega" },
];

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-56 max-w-5xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.45),rgba(239,35,45,0.1)_34%,transparent_70%)] blur-2xl" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-white/10 bg-[#0b0b0c]/88 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1520px] flex-col gap-5 px-4 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
            <Link className="flex items-center gap-3" href="/">
              <img
                alt="MotoMas"
                className="h-11 w-auto object-contain"
                src="/showroom/logo/motomas-logo-mark.png"
              />
            </Link>

            <nav
              aria-label="Navegación pública"
              className="flex flex-wrap items-center gap-2"
            >
              {portalNavItems.map((item) => (
                <Link
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-wrap items-center gap-2">
              <Suspense
                fallback={<PortalStaticStatusLinks items={portalStatusItems} />}
              >
                <PortalStatusLinks items={portalStatusItems} />
              </Suspense>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-white/10 bg-[#0b0b0c]/80">
          <div className="mx-auto grid max-w-[1520px] gap-6 px-4 py-8 text-sm text-zinc-500 sm:px-8 lg:grid-cols-[1fr_auto] lg:px-10">
            <div>
              <Badge tone="red">Portal público</Badge>
              <p className="mt-3 max-w-2xl leading-6">
                Experiencia separada para visitantes, prospectos y clientes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 font-semibold text-zinc-300 hover:bg-white/[0.06]"
                href="/catalogo"
              >
                <Search className="h-4 w-4" />
                Catálogo
              </Link>
              <Link
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 font-semibold text-zinc-300 hover:bg-white/[0.06]"
                href="/consultar-expediente"
              >
                <FileText className="h-4 w-4" />
                Expediente
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
