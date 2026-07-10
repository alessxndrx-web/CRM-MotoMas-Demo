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
 * Controlled showroom hero: one featured motorcycle at a time with a manual
 * model strip. No auto-rotation — the customer chooses what to view. Uses only
 * existing transparent showroom assets and real catalog copy (no invented data).
 *
 * The active bike and its caption are keyed on the slug so React remounts them
 * on every switch, which replays the 300ms `animate-hero-swap` entrance.
 */
export function ShowroomHero({ models }: { models: ShowroomModel[] }) {
  const [activeSlug, setActiveSlug] = useState(models[0]?.slug ?? "");
  const active = models.find((model) => model.slug === activeSlug) ?? models[0] ?? null;

  return (
    <section className="relative overflow-hidden border-b border-slate-200">
      {/* Depth layer: real showroom backdrop, heavily faded so copy stays readable. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/motomas/hero/background.webp')] bg-cover bg-center opacity-[0.07]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_-10%,rgba(37,99,235,0.10),transparent_60%),radial-gradient(90%_70%_at_-10%_110%,rgba(249,115,22,0.12),transparent_55%)]" />

      <div className="relative mx-auto grid max-w-[1240px] items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:px-8 lg:py-16">
        <div className="animate-fade-up">
          <PortalBadge tone="orange">MotoMas · Showroom</PortalBadge>
          {/* 4xl at 375px overflowed with `leading-[1.05]`; step down on mobile. */}
          <h1 className="mt-5 text-3xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.05] lg:text-6xl">
            Tu próxima moto te espera en MotoMas
          </h1>
          <span aria-hidden className="mt-5 block h-1 w-20 rounded-full bg-orange-500" />
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
            Explora el catálogo, solicita información y recibe seguimiento
            personalizado de un asesor en la sucursal que elijas.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              className={cn(btnAccent, "w-full sm:w-auto")}
              href={active ? `/solicitar-informacion?moto=${active.slug}` : "/solicitar-informacion"}
            >
              Solicitar información
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link className={cn(btnOutline, "w-full sm:w-auto")} href="/catalogo">
              Ver catálogo
            </Link>
          </div>

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
                        "relative flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border bg-white p-1.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40",
                        isActive
                          ? "border-blue-500 ring-2 ring-blue-500/20"
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

        <div className="order-first lg:order-last">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-100 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.10)]">
            {/* Showroom floor plate behind the bike. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[url('/motomas/hero/floor.webp')] bg-cover bg-bottom opacity-25"
            />

            <div className="relative flex aspect-[4/3] items-center justify-center">
              {active ? (
                <img
                  alt={active.name}
                  className="animate-hero-swap max-h-full max-w-full object-contain drop-shadow-[0_24px_28px_rgba(2,6,23,0.22)]"
                  key={active.slug}
                  src={active.image}
                />
              ) : null}
            </div>

            <div className="relative mx-auto mt-1 h-3 w-2/3 rounded-[100%] bg-slate-900/10 blur-md" />

            {active ? (
              <div className="relative mt-4 text-center" key={`${active.slug}-caption`}>
                <div className="animate-fade-in text-xl font-bold text-slate-900">
                  {active.name}
                </div>
                {active.shortDescription ? (
                  <p className="animate-fade-in mx-auto mt-1.5 max-w-md text-sm leading-6 text-slate-600">
                    {active.shortDescription}
                  </p>
                ) : null}
                <Link
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800"
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
