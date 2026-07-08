"use client";

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
 */
export function ShowroomHero({ models }: { models: ShowroomModel[] }) {
  const [activeSlug, setActiveSlug] = useState(models[0]?.slug ?? "");
  const active = models.find((model) => model.slug === activeSlug) ?? models[0] ?? null;

  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_-10%,rgba(37,99,235,0.10),transparent_60%),radial-gradient(90%_70%_at_-10%_110%,rgba(249,115,22,0.10),transparent_55%)]" />
      <div className="relative mx-auto grid max-w-[1240px] items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:py-16 lg:px-8">
        <div>
          <PortalBadge tone="orange">MotoMas · Showroom</PortalBadge>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Tu próxima moto te espera en MotoMas
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
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
              <div className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
                Modelos destacados
              </div>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {models.map((model) => (
                  <button
                    aria-pressed={model.slug === active?.slug}
                    className={cn(
                      "flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border bg-white p-1.5 transition",
                      model.slug === active?.slug
                        ? "border-blue-500 ring-2 ring-blue-500/20"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                    key={model.slug}
                    onClick={() => setActiveSlug(model.slug)}
                    title={model.name}
                    type="button"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={model.name}
                      className="max-h-full max-w-full object-contain"
                      src={model.image}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="order-first lg:order-last">
          <div className="relative rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-100 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.10)]">
            <div className="flex aspect-[4/3] items-center justify-center">
              {active ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={active.name}
                    className="max-h-full max-w-full object-contain drop-shadow-[0_24px_28px_rgba(2,6,23,0.22)]"
                    src={active.image}
                  />
                </>
              ) : null}
            </div>
            {/* floor shadow */}
            <div className="mx-auto mt-1 h-3 w-2/3 rounded-[100%] bg-slate-900/10 blur-md" />
            {active ? (
              <div className="mt-4 text-center">
                <div className="text-xl font-black text-slate-900">{active.name}</div>
                {active.shortDescription ? (
                  <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-slate-600">
                    {active.shortDescription}
                  </p>
                ) : null}
                <Link
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-800"
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
