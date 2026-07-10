import Link from "next/link";

import { PortalLogo } from "@/features/portal/components/portal-logo";

const footerLinks = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/solicitar-informacion", label: "Solicitar información" },
  { href: "/consultar-expediente", label: "Consultar solicitud" },
  { href: "/mi-credito", label: "Mi crédito" },
  { href: "/mi-reserva", label: "Mi reserva" },
  { href: "/mi-entrega", label: "Mi entrega" },
];

export function PublicFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.5fr_1fr] lg:px-8">
        <div>
          <PortalLogo className="h-12" />
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
            Encuentra tu próxima motocicleta y solicita información. Un asesor de
            la sucursal que elijas dará seguimiento a tu solicitud paso a paso.
          </p>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Enlaces
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
            {footerLinks.map((item) => (
              <Link
                className="text-sm font-medium text-slate-600 transition hover:text-blue-700"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/*
       * The mobile sticky CTA is fixed above this bar, so the last row clears
       * it here. Padding used to sit on <main>, which left the footer covered.
       */}
      <div className="border-t border-slate-200">
        <div className="mx-auto max-w-[1240px] px-4 pb-24 pt-5 text-xs text-slate-500 sm:px-6 lg:px-8 lg:pb-5">
          MotoMas · Atención personalizada por sucursal.
        </div>
      </div>
    </footer>
  );
}
