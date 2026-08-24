import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import { BrandWordmark } from "@/features/operations/components/brand-wordmark";

/**
 * Brand panel for the login screen (desktop only). The photo is decorative and
 * sits under a dark blue overlay so the copy stays readable. Branding is text
 * only until a transparent logo asset replaces the current opaque PNG.
 */
export function LoginVisual() {
  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-hidden p-10 text-white xl:p-14">
      <Image
        alt=""
        className="object-cover"
        fill
        priority
        sizes="(min-width: 1280px) 50vw, (min-width: 1024px) 46vw, 0px"
        src="/assets/login/login-image.jpg"
      />

      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-slate-950/92 via-slate-900/85 to-blue-950/80"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-orange-500/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-orange-500 via-orange-400 to-blue-600"
      />

      <div className="relative">
        <BrandWordmark subtitle="Centro de Operaciones" tone="dark" />
      </div>

      <div className="relative">
        <h2 className="max-w-md text-2xl font-semibold leading-snug xl:text-3xl">
          Plataforma Integral de Gestión Comercial
        </h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-300">
          Leads, clientes, inventario, ventas, caja y contabilidad en un solo
          sistema multi-sucursal.
        </p>
        <p className="mt-6 flex items-center gap-2 text-sm text-slate-300">
          <ShieldCheck className="h-4 w-4 shrink-0 text-orange-400" />
          Acceso interno seguro para personal autorizado
        </p>
      </div>
    </div>
  );
}
