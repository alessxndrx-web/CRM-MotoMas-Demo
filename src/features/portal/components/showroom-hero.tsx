"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { btnAccent, btnOutline, PortalBadge } from "@/features/portal/components/ui";
import { cn } from "@/lib/utils";

export type ShowroomModel = {
  slug: string;
  name: string;
  image: string;
  shortDescription: string | null;
};

/**
 * White premium showroom hero (Patch 3.9P-C). One featured motorcycle at a time
 * with a manual model strip — no auto-rotation, the customer chooses what to
 * view. Uses only existing transparent showroom assets and real catalog copy
 * (no invented data).
 *
 * Composition rules: the surface stays light (white showroom, not a dark
 * cinematic stage); the bike is staged on a soft CSS platform instead of being
 * boxed in a card; orange belongs to the single conversion CTA only.
 *
 * The active bike and its caption are keyed on the slug so React remounts them
 * on every switch, which replays the 300ms `animate-hero-swap` entrance.
 */
export function ShowroomHero({ models }: { models: ShowroomModel[] }) {
  const [activeSlug, setActiveSlug] = useState(models[0]?.slug ?? "");
  const active = models.find((model) => model.slug === activeSlug) ?? models[0] ?? null;

  return (
    <section className="relative overflow-hidden border-b border-slate-200 bg-white">
      {/* Faint showroom texture; kept near-invisible so the surface reads white. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/motomas/hero/background.webp')] bg-cover bg-center opacity-[0.05]"
      />
      {/* Soft brand washes: navy top-right, a whisper of orange bottom-left. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_-10%,rgba(18,40,76,0.08),transparent_60%),radial-gradient(90%_70%_at_-10%_110%,rgba(249,115,22,0.07),transparent_55%)]" />

      <div className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8 lg:px-8 lg:py-16">
        <div className="animate-fade-up">
          <PortalBadge tone="blue">MotoMas · Showroom</PortalBadge>
          {/* 4xl at 375px overflowed with `leading-[1.05]`; step down on mobile. */}
          <h1 className="mt-5 text-balance text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.05] xl:text-6xl">
            Tu próxima moto te espera en MotoMas
          </h1>
          <span aria-hidden className="portal-rule mt-5 block w-20" />
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            Explora el catálogo, solicita información y da seguimiento a tu
            proceso en línea con un asesor de la sucursal que elijas.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              className={cn(btnAccent, "w-full sm:w-auto")}
              href={active ? `/solicitar-informacion?moto=${active.slug}` : "/solicitar-informacion"}
            >
              Solicitar información
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              className={cn(btnOutline, "w-full border-navy/25 text-navy hover:border-navy/40 hover:bg-navy/5 sm:w-auto")}
              href="/catalogo"
            >
              Ver catálogo
            </Link>
          </div>

          {/* Tertiary action: existing tracking route, text-level hierarchy. */}
          <p className="mt-5 text-sm text-slate-600">
            ¿Ya enviaste una solicitud?{" "}
            <Link
              className="inline-flex items-center gap-1 font-semibold text-navy transition-colors hover:text-navy-soft"
              href="/consultar-expediente"
            >
              Consulta tu proceso
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </p>

          {models.length > 1 ? (
            <div className="mt-8">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Modelos destacados
              </div>
              <div
                aria-label="Seleccionar modelo destacado"
                className="mt-3 flex gap-3 overflow-x-auto pb-2"
                role="group"
              >
                {models.map((model) => {
                  const isActive = model.slug === active?.slug;
                  return (
                    <button
                      aria-pressed={isActive}
                      className={cn(
                        "relative flex h-[4.5rem] w-[6.5rem] shrink-0 items-center justify-center rounded-xl border bg-white p-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40",
                        isActive
                          ? "border-navy bg-navy/5 ring-2 ring-navy/15"
                          : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm motion-reduce:hover:translate-y-0",
                      )}
                      key={model.slug}
                      onClick={() => setActiveSlug(model.slug)}
                      title={model.name}
                      type="button"
                    >
                      <img
                        alt={model.name}
                        className="max-h-full max-w-full object-contain"
                        src={model.image}
                      />
                      {isActive ? (
                        <span
                          aria-hidden
                          className="absolute inset-x-4 -bottom-0.5 h-0.5 rounded-full bg-orange-500"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Product stage: the bike sits on a soft light platform, unboxed. */}
        <div className="order-first lg:order-last">
          <div className="relative mx-auto w-full max-w-[660px]">
            {/* Halo behind the bike so it separates from the white surface. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 h-3/4 -translate-y-1/2 bg-[radial-gradient(55%_55%_at_50%_50%,rgba(18,40,76,0.07),transparent_70%)]"
            />

            <div className="relative flex aspect-[5/4] items-end justify-center sm:aspect-[4/3]">
              {active ? (
                <>
                  <img
                    alt={active.name}
                    className="animate-hero-swap relative z-10 max-h-[92%] max-w-full object-contain drop-shadow-[0_28px_30px_rgba(2,6,23,0.20)]"
                    key={active.slug}
                    src={active.image}
                  />
                  {/* Soft reflection under the bike, masked out quickly so the
                      floor stays clean on the white surface. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-full hidden justify-center opacity-[0.08] [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.8),transparent_55%)] lg:flex"
                  >
                    <img
                      alt=""
                      className="max-h-20 max-w-full -scale-y-100 object-contain blur-[2px]"
                      src={active.image}
                    />
                  </div>
                </>
              ) : null}
            </div>

            {/* Light showroom platform: floor ellipse + contact shadow. */}
            <div aria-hidden className="relative mx-auto -mt-2 h-10 w-[88%]">
              <div className="absolute inset-x-0 top-0 mx-auto h-full w-full rounded-[100%] bg-[radial-gradient(50%_100%_at_50%_0%,rgba(15,23,42,0.16),rgba(15,23,42,0.05)_55%,transparent_75%)]" />
              <div className="absolute inset-x-10 top-0 mx-auto h-3 rounded-[100%] bg-slate-900/15 blur-md" />
            </div>

            {active ? (
              <div className="relative mt-5 text-center" key={`${active.slug}-caption`}>
                <div className="animate-fade-in text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {active.name}
                </div>
                {active.shortDescription ? (
                  <p className="animate-fade-in mx-auto mt-1.5 max-w-md text-sm leading-6 text-slate-600">
                    {active.shortDescription}
                  </p>
                ) : null}
                <Link
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy transition-colors hover:text-navy-soft"
                  href={`/motocicletas/${active.slug}`}
                >
                  Ver modelo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
