/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  CalendarCheck,
  CreditCard,
  FileSearch,
  MessageSquare,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { getMotorcycleBySlug, motorcycles } from "@/data/catalog/motorcycles";
import {
  btnAccent,
  btnOutline,
  PortalBadge,
  PortalCard,
} from "@/features/portal/components/ui";
import { cn } from "@/lib/utils";

type MotorcycleDetailPageProps = {
  params: Promise<{ slug: string }>;
};

const processSteps = [
  "Solicitas información",
  "La sucursal revisa tu solicitud",
  "Un asesor te contacta",
  "Cotización y seguimiento",
  "Reserva y entrega",
];

const consultLinks: { icon: LucideIcon; label: string; href: string }[] = [
  { icon: FileSearch, label: "Consultar solicitud", href: "/consultar-expediente" },
  { icon: CreditCard, label: "Mi crédito", href: "/mi-credito" },
  { icon: CalendarCheck, label: "Mi reserva", href: "/mi-reserva" },
  { icon: Truck, label: "Mi entrega", href: "/mi-entrega" },
];

export default async function MotorcycleDetailPage({
  params,
}: MotorcycleDetailPageProps) {
  const { slug } = await params;
  const motorcycle = getMotorcycleBySlug(slug);

  if (!motorcycle) notFound();

  const heroImage = motorcycle.images[0] ?? null;
  const extraImages = motorcycle.images.slice(1);
  const summary = motorcycle.description ?? motorcycle.shortDescription;
  const hasSpecs = motorcycle.technicalSpecs.length > 0;

  return (
    <section>
      {/* Light showroom band: the bike is staged, not boxed in a card. */}
      <div className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div aria-hidden className="brand-rule h-1 w-full" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_80%_at_75%_-10%,rgba(18,40,76,0.08),transparent_60%),radial-gradient(80%_70%_at_-5%_110%,rgba(249,115,22,0.07),transparent_55%)]"
        />

        <div className="relative mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-600 transition-colors hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
            href="/catalogo"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al catálogo
          </Link>

          <div className="mt-6 grid items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
            <div className="animate-fade-in relative mx-auto w-full max-w-[640px]">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-1/2 h-3/4 -translate-y-1/2 bg-[radial-gradient(55%_55%_at_50%_50%,rgba(18,40,76,0.07),transparent_70%)]"
              />
              {/* Catalog photos run 0.96-1.76 aspect; contain keeps bikes whole. */}
              <div className="relative flex aspect-[4/3] items-end justify-center">
                {heroImage ? (
                  <img
                    alt={motorcycle.name}
                    className="relative z-10 max-h-[94%] max-w-full object-contain drop-shadow-[0_28px_30px_rgba(2,6,23,0.18)]"
                    src={heroImage}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-slate-300">
                    <Bike className="h-14 w-14" />
                  </div>
                )}
              </div>
              {/* Soft floor: ellipse + contact shadow, no plate behind the bike. */}
              <div aria-hidden className="relative mx-auto -mt-2 h-9 w-[86%]">
                <div className="absolute inset-x-0 top-0 h-full w-full rounded-[100%] bg-[radial-gradient(50%_100%_at_50%_0%,rgba(15,23,42,0.15),rgba(15,23,42,0.05)_55%,transparent_75%)]" />
                <div className="absolute inset-x-10 top-0 h-3 rounded-[100%] bg-slate-900/12 blur-md" />
              </div>
            </div>

            <div className="animate-fade-up">
              {motorcycle.brand ? (
                <PortalBadge tone="blue">{motorcycle.brand}</PortalBadge>
              ) : null}
              <h1
                className={cn(
                  "text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl",
                  motorcycle.brand && "mt-4",
                )}
              >
                {motorcycle.name}
              </h1>
              <span aria-hidden className="portal-rule mt-4 block w-16" />

              {/*
               * Sparse-data safe: 10 of 15 models carry no description at all.
               * The fallback invites a conversation — it states no spec, price,
               * stock or financing term (PROJECT_RULES §17).
               */}
              <p className="mt-4 text-base leading-7 text-slate-600">
                {summary ??
                  "Consulta la ficha completa de este modelo con un asesor de la sucursal que elijas."}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  className={cn(btnAccent, "w-full sm:w-auto")}
                  href={`/solicitar-informacion?moto=${motorcycle.slug}`}
                >
                  Solicitar información
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  className={cn(
                    btnOutline,
                    "w-full border-navy/25 text-navy hover:border-navy/40 hover:bg-navy/5 sm:w-auto",
                  )}
                  href="/catalogo"
                >
                  Ver catálogo
                </Link>
              </div>

              {hasSpecs ? (
                <div className="mt-8">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Características
                  </div>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {motorcycle.technicalSpecs.map((spec) => (
                      <li
                        className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700"
                        key={spec}
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-navy" />
                        {spec}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                /* No empty spec column: a single honest advisor prompt instead. */
                <div className="mt-8 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-navy/5 text-navy">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                  <p className="text-sm leading-6 text-slate-600">
                    Un asesor puede darte la ficha técnica, los colores
                    disponibles y las opciones de compra de este modelo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="portal-section mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        {/* Only renders when a model has more than one photo. */}
        {extraImages.length ? (
          <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {extraImages.map((image) => (
              <PortalCard className="reveal-on-scroll overflow-hidden" key={image}>
                <img
                  alt={motorcycle.name}
                  className="aspect-[4/3] w-full bg-slate-50 object-contain p-3"
                  src={image}
                />
              </PortalCard>
            ))}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <PortalCard className="p-6 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Cómo sigue tu proceso
            </h2>
            <ol className="mt-5 grid gap-3">
              {processSteps.map((step, index) => (
                <li className="flex items-center gap-3" key={step}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{step}</span>
                </li>
              ))}
            </ol>
          </PortalCard>

          <PortalCard className="p-6 sm:p-7">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              También puedes consultar
            </h2>
            <div className="mt-5 grid gap-2.5">
              {consultLinks.map((item) => (
                <Link
                  className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-navy/30 hover:bg-slate-50"
                  href={item.href}
                  key={item.href}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-navy/5 text-navy">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-semibold text-slate-800">
                    {item.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-navy" />
                </Link>
              ))}
            </div>
          </PortalCard>
        </div>
      </div>
    </section>
  );
}

export function generateStaticParams() {
  return motorcycles.map((motorcycle) => ({ slug: motorcycle.slug }));
}
