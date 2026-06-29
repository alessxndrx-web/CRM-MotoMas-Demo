"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, Bike, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  PENDING_CATALOG_INFO,
  type PublicMotorcycle,
} from "@/data/catalog/motorcycles";

export function FeaturedMotorcycleCarousel({
  motorcycles,
}: {
  motorcycles: PublicMotorcycle[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMotorcycle = motorcycles[activeIndex] ?? null;
  const hasSideMotorcycles = motorcycles.length > 2;

  useEffect(() => {
    if (motorcycles.length < 2) return;

    const intervalId = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % motorcycles.length);
    }, 6500);

    return () => window.clearInterval(intervalId);
  }, [motorcycles.length]);

  if (!activeMotorcycle) return null;

  const previousMotorcycle = motorcycles[(activeIndex - 1 + motorcycles.length) % motorcycles.length];
  const nextMotorcycle = motorcycles[(activeIndex + 1) % motorcycles.length];
  const requestHref = `/solicitar-informacion?moto=${activeMotorcycle.slug}`;
  const detailsHref = `/motocicletas/${activeMotorcycle.slug}`;
  const image = activeMotorcycle.images[0] ?? null;
  const attribute = activeMotorcycle.category ?? activeMotorcycle.brand;

  function goToPrevious() {
    setActiveIndex((currentIndex) =>
      (currentIndex - 1 + motorcycles.length) % motorcycles.length,
    );
  }

  function goToNext() {
    setActiveIndex((currentIndex) => (currentIndex + 1) % motorcycles.length);
  }

  return (
    <section aria-label="Vitrina destacada" className="mt-10">
      <div className="overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(118deg,#311722_0%,#5a303b_52%,#252a33_100%)] shadow-[0_28px_64px_rgba(0,0,0,0.24)]">
        <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
          <div className="relative z-30 flex min-h-[350px] flex-col justify-between p-7 sm:p-10 lg:min-h-[510px] lg:p-12">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-red-200">
                Vitrina destacada
              </div>
              {attribute ? (
                <div className="mt-5 inline-flex rounded-full border border-red-300/25 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-100">
                  {attribute}
                </div>
              ) : null}
              <Link className="mt-5 block w-fit" href={requestHref}>
                <h2 className="max-w-xl text-4xl font-black leading-tight text-white sm:text-5xl">
                  {activeMotorcycle.name}
                </h2>
              </Link>
              <p className="mt-5 max-w-lg text-base leading-7 text-zinc-200">
                {activeMotorcycle.shortDescription ?? PENDING_CATALOG_INFO}
              </p>
              <p className="mt-4 max-w-md text-sm leading-6 text-zinc-300/80">
                Conoce este modelo y solicita atención en la sucursal que prefieras.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex h-12 items-center justify-center rounded-lg border border-white/20 bg-white/[0.08] px-5 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/[0.14]"
                href={detailsHref}
              >
                Ver detalles
              </Link>
            </div>
          </div>

          <div className="relative min-h-[320px] overflow-hidden [perspective:1200px] sm:min-h-[430px] lg:min-h-[510px]">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(to_top,rgba(10,12,16,0.32),transparent)]" />

            {hasSideMotorcycles ? (
              <MotorcyclePreview
                motorcycle={previousMotorcycle}
                onClick={goToPrevious}
                position="left"
              />
            ) : null}

            <Link
              aria-label={`Solicitar información sobre ${activeMotorcycle.name}`}
              className="absolute inset-0 z-20 flex items-center justify-center px-10 pb-12 pt-16 sm:px-16 lg:px-12"
              href={requestHref}
            >
              {image ? (
                <img
                  alt={activeMotorcycle.name}
                  className="max-h-[420px] w-full origin-center object-contain drop-shadow-[0_24px_22px_rgba(0,0,0,0.28)] transition-[transform,opacity] duration-700 ease-out hover:scale-[1.02] sm:max-h-[470px]"
                  key={activeMotorcycle.slug}
                  src={image}
                />
              ) : (
                <div className="grid h-52 w-52 place-items-center rounded-full border border-white/20 bg-white/[0.06] text-zinc-300">
                  <Bike className="h-14 w-14" />
                </div>
              )}
            </Link>

            {hasSideMotorcycles ? (
              <MotorcyclePreview
                motorcycle={nextMotorcycle}
                onClick={goToNext}
                position="right"
              />
            ) : null}

            <Link
              className="absolute right-5 top-5 z-40 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(225,29,46,0.24)] transition hover:bg-red-500 sm:right-8 sm:top-7"
              href={requestHref}
            >
              Solicitar información
              <ArrowRight className="h-4 w-4" />
            </Link>

            {motorcycles.length > 1 ? (
              <div className="absolute inset-x-5 bottom-5 z-40 flex items-center justify-between gap-4 sm:inset-x-8 sm:bottom-7">
                <div className="flex items-center gap-2">
                  {motorcycles.map((motorcycle, index) => (
                    <button
                      aria-label={`Mostrar ${motorcycle.name}`}
                      className={`h-2.5 rounded-full transition-all duration-300 ${index === activeIndex ? "w-8 bg-red-400" : "w-2.5 bg-white/35 hover:bg-white/60"}`}
                      key={motorcycle.slug}
                      onClick={() => setActiveIndex(index)}
                      type="button"
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <CarouselControl label="Moto anterior" onClick={goToPrevious}>
                    <ChevronLeft className="h-5 w-5" />
                  </CarouselControl>
                  <CarouselControl label="Moto siguiente" onClick={goToNext}>
                    <ChevronRight className="h-5 w-5" />
                  </CarouselControl>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function MotorcyclePreview({
  motorcycle,
  onClick,
  position,
}: {
  motorcycle: PublicMotorcycle;
  onClick: () => void;
  position: "left" | "right";
}) {
  const image = motorcycle.images[0] ?? null;
  const positionClass =
    position === "left"
      ? "-left-[35%] [transform:translateX(8%)_scale(0.7)_rotateY(28deg)]"
      : "-right-[35%] [transform:translateX(-8%)_scale(0.7)_rotateY(-28deg)]";

  return (
    <button
      aria-label={`Mostrar ${motorcycle.name}`}
      className={`absolute top-1/2 z-10 hidden w-[78%] -translate-y-1/2 opacity-35 transition-[transform,opacity] duration-700 hover:opacity-55 lg:block ${positionClass}`}
      onClick={onClick}
      type="button"
    >
      {image ? (
        <img
          alt=""
          className="max-h-[330px] w-full object-contain blur-[0.35px]"
          src={image}
        />
      ) : null}
    </button>
  );
}

function CarouselControl({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-white/20 bg-black/15 text-white transition hover:border-white/40 hover:bg-white/10"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
