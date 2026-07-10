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

  return (
    <section>
      {/* Detail hero: image and identity share one tinted showroom band. */}
      <div className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div aria-hidden className="brand-rule h-1 w-full" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_80%_at_75%_-10%,rgba(37,99,235,0.08),transparent_60%),radial-gradient(80%_70%_at_-5%_110%,rgba(249,115,22,0.08),transparent_55%)]"
        />

        <div className="relative mx-auto max-w-[1240px] px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
          <Link
            className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-slate-600 transition-colors hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            href="/catalogo"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al catálogo
          </Link>

          <div className="mt-6 grid items-center gap-8 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
            <div className="animate-fade-in overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 shadow-[0_20px_60px_rgba(2,6,23,0.10)]">
              {/* Catalog photos run 0.96-1.76 aspect; contain keeps bikes whole. */}
              <div className="aspect-[4/3]">
                {heroImage ? (
                  <img
                    alt={motorcycle.name}
                    className="h-full w-full object-contain p-4 sm:p-6"
                    src={heroImage}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-slate-300">
                    <Bike className="h-14 w-14" />
                  </div>
                )}
              </div>
            </div>

            <div className="animate-fade-up">
              {motorcycle.brand ? <PortalBadge tone="blue">{motorcycle.brand}</PortalBadge> : null}
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                {motorcycle.name}
              </h1>
              <span aria-hidden className="mt-4 block h-1 w-16 rounded-full bg-orange-500" />
              {motorcycle.description ?? motorcycle.shortDescription ? (
                <p className="mt-4 text-base leading-7 text-slate-600">
                  {motorcycle.description ?? motorcycle.shortDescription}
                </p>
              ) : null}

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              className={cn(btnAccent, "w-full sm:w-auto")}
              href={`/solicitar-informacion?moto=${motorcycle.slug}`}
            >
              Solicitar información
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className={cn(btnOutline, "w-full sm:w-auto")} href="/catalogo">
              Volver al catálogo
            </Link>
          </div>

              {motorcycle.technicalSpecs.length ? (
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
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                        {spec}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
      {extraImages.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {extraImages.map((image) => (
            <PortalCard className="reveal-on-scroll overflow-hidden" key={image}>
              <img
                alt={motorcycle.name}
                className="aspect-[4/3] w-full bg-gradient-to-b from-slate-50 to-slate-100 object-contain p-3"
                src={image}
              />
            </PortalCard>
          ))}
        </div>
      ) : null}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <PortalCard className="p-6">
          <h2 className="text-xl font-semibold text-slate-900">Cómo sigue tu proceso</h2>
          <ol className="mt-5 grid gap-3">
            {processSteps.map((step, index) => (
              <li className="flex items-center gap-3" key={step}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-sm font-semibold text-white">
                  {index + 1}
                </span>
                <span className="text-sm font-semibold text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
        </PortalCard>

        <PortalCard className="p-6">
          <h2 className="text-xl font-semibold text-slate-900">También puedes consultar</h2>
          <div className="mt-5 grid gap-2.5">
            {consultLinks.map((item) => (
              <Link
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-300 hover:bg-slate-50"
                href={item.href}
                key={item.href}
              >
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-orange-50 text-orange-600">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-semibold text-slate-800">{item.label}</span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
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
