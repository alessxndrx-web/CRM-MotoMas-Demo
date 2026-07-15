import Link from "next/link";
import {
  ArrowRight,
  Bike,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  FileSearch,
  MapPin,
  Search,
  ShieldCheck,
  Truck,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

import { desiredBranches } from "@/data/operations/leads";
import { motorcycles } from "@/data/catalog/motorcycles";
import {
  ShowroomHero,
  type ShowroomModel,
} from "@/features/portal/components/showroom-hero";
import {
  btnAccent,
  PortalCard,
  PortalSectionHeader,
} from "@/features/portal/components/ui";
import { cn } from "@/lib/utils";

// Featured models that have a transparent showroom asset (no invented data).
const featuredSlugs = [
  "bajaj-pulsar-n250-2026",
  "pulsar-ns400z",
  "pulsar-ns200-2027",
  "dominar-250",
  "bajaj-pulsar-180",
];

const trustSignals: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: UserCheck, title: "Asesor asignado", text: "Una persona de la sucursal da seguimiento a tu solicitud." },
  { icon: FileSearch, title: "Seguimiento de solicitud", text: "Consulta el avance de tu proceso cuando quieras." },
  { icon: MapPin, title: "Atención por sucursal", text: "Elige la sucursal donde prefieres ser atendido." },
  { icon: CalendarCheck, title: "Reserva y entrega", text: "Acompañamiento desde la reserva hasta la entrega." },
  { icon: CreditCard, title: "Acompañamiento en crédito", text: "Te orientamos durante el seguimiento de tu crédito." },
  { icon: ShieldCheck, title: "Proceso claro de compra", text: "Cada paso es transparente y fácil de entender." },
];

const processSteps = [
  "Solicitud",
  "Revisión por sucursal",
  "Asesor asignado",
  "Contacto",
  "Cotización / crédito",
  "Reserva",
  "Entrega",
];

const clientTools: { icon: LucideIcon; label: string; href: string; text: string }[] = [
  { icon: Search, label: "Ver catálogo", href: "/catalogo", text: "Explora los modelos disponibles." },
  { icon: ClipboardList, label: "Solicitar información", href: "/solicitar-informacion", text: "Envía tus datos y elige sucursal." },
  { icon: FileSearch, label: "Consultar solicitud", href: "/consultar-expediente", text: "Revisa el avance de tu proceso." },
  { icon: CreditCard, label: "Mi crédito", href: "/mi-credito", text: "Estado de tu seguimiento de crédito." },
  { icon: CalendarCheck, label: "Mi reserva", href: "/mi-reserva", text: "Estado de tu reserva." },
  { icon: Truck, label: "Mi entrega", href: "/mi-entrega", text: "Estado de tu entrega." },
];

export function PublicHome() {
  const models: ShowroomModel[] = featuredSlugs
    .map((slug) => {
      const motorcycle = motorcycles.find((item) => item.slug === slug);
      if (!motorcycle) return null;
      return {
        slug: motorcycle.slug,
        name: motorcycle.name,
        image: `/showroom/motorcycles/${slug}.png`,
        shortDescription: motorcycle.shortDescription,
      };
    })
    .filter((model): model is ShowroomModel => model !== null);

  return (
    <>
      {models.length ? <ShowroomHero models={models} /> : null}

      {/* Trust signals */}
      <section className="portal-section mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <PortalSectionHeader
          align="center"
          eyebrow="Por qué MotoMas"
          title="Una compra acompañada de principio a fin"
          description="Así ayudamos a cada cliente a avanzar con confianza."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trustSignals.map((signal) => (
            <PortalCard
              className="hover-lift reveal-on-scroll p-6 hover:border-navy/20"
              key={signal.title}
            >
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-navy/5 text-navy">
                <signal.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{signal.title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-slate-600">{signal.text}</p>
            </PortalCard>
          ))}
        </div>
      </section>

      {/* Customer process */}
      <section className="border-y border-slate-200 bg-white">
        <div className="portal-section mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
          <PortalSectionHeader
            eyebrow="Cómo funciona"
            title="Tu proceso de compra, paso a paso"
            description="Desde tu solicitud hasta la entrega de tu motocicleta."
          />
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {processSteps.map((step, index) => (
              <li
                className="reveal-on-scroll relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-5"
                key={step}
              >
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1 bg-navy/15"
                />
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-navy text-sm font-semibold text-white">
                  {index + 1}
                </div>
                <div className="mt-3 text-base font-semibold text-slate-900">{step}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Client tools */}
      <section className="portal-section mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <PortalSectionHeader
          eyebrow="Herramientas para el cliente"
          title="Consulta tu proceso cuando quieras"
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clientTools.map((tool) => (
            <Link
              className="hover-lift reveal-on-scroll portal-card-shadow group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-navy/30 hover:shadow-[0_16px_44px_rgba(18,40,76,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              href={tool.href}
              key={tool.href}
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy/5 text-navy">
                <tool.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-1 text-base font-semibold text-slate-900">
                  {tool.label}
                  <ArrowRight className="h-4 w-4 text-slate-400 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-navy" />
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{tool.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Branches */}
      <section className="border-t border-slate-200 bg-white">
        <div className="portal-section mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
          <PortalSectionHeader
            eyebrow="Sucursales"
            title="Atención en nuestras sucursales"
            description="Selecciona tu sucursal preferida al solicitar información y un asesor de esa sucursal te dará seguimiento."
          />
          <div className="mt-8 flex flex-wrap gap-2.5">
            {desiredBranches.map((branch) => (
              <span
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700"
                key={branch.id}
              >
                <MapPin className="h-4 w-4 text-navy" />
                {branch.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA: deep navy brand band (the page's only dark surface). */}
      <section className="portal-section mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="portal-stage reveal-on-scroll relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-12">
          <span aria-hidden className="brand-rule absolute inset-x-0 top-0 h-1" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_120%_at_50%_-20%,rgba(249,115,22,0.25),transparent_60%)]" />
          <div className="relative">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-orange-300">
              <Bike className="h-6 w-6" />
            </div>
            <h2 className="mx-auto mt-5 max-w-2xl text-2xl font-bold text-white sm:text-3xl">
              Solicita información y un asesor te dará seguimiento
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">
              Elige tu moto de interés y la sucursal donde quieres ser atendido.
            </p>
            <Link className={cn(btnAccent, "mt-7")} href="/solicitar-informacion">
              Solicitar información
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
