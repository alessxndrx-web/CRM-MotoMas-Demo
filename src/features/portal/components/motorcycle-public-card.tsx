/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, Bike } from "lucide-react";

import { type PublicMotorcycle } from "@/data/catalog/motorcycles";
import { cn } from "@/lib/utils";

/**
 * Catalog card (Patch 3.9P-E).
 *
 * The catalog data is deliberately sparse: 10 of the 15 models carry only a
 * name and an image (no brand, no description, no specs, no colors, and no
 * category on any model). PROJECT_RULES §17 forbids inventing that data, so the
 * card is imagery-led and every metadata slot is optional: a model with nothing
 * but a name must still read as intentional, not unfinished.
 *
 * The sparse fallback is a safe, generic invitation to talk to an advisor — it
 * states no spec, price, stock or financing term.
 */
export function MotorcyclePublicCard({
  className,
  motorcycle,
}: {
  className?: string;
  motorcycle: PublicMotorcycle;
}) {
  const image = motorcycle.images[0] ?? null;

  return (
    <article
      className={cn(
        "hover-lift portal-card-shadow group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-colors hover:border-navy/25 hover:shadow-[0_16px_44px_rgba(18,40,76,0.14)] focus-within:border-navy/30",
        className,
      )}
    >
      {/*
       * Catalog photos range from 0.96 to 1.76 aspect. `object-contain` on a
       * 4:3 plate keeps every bike whole — `object-cover` was slicing ~31% off
       * the near-square shots (7 of 15 models). The plate is a flat, neutral
       * tint so the JPEG photos (which carry their own backgrounds) sit next to
       * the transparent PNGs without one looking pasted on.
       */}
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-50">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_55%,rgba(18,40,76,0.06),transparent_70%)]"
        />
        {image ? (
          <img
            alt={motorcycle.name}
            className="relative h-full w-full object-contain p-4 transition-transform duration-500 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            loading="lazy"
            src={image}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-slate-300">
            <Bike className="h-10 w-10" />
          </div>
        )}
        {motorcycle.brand ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-navy shadow-sm backdrop-blur-sm">
            {motorcycle.brand}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col border-t border-slate-100 p-5">
        <h2 className="text-balance text-lg font-bold leading-tight tracking-tight text-slate-900">
          {/* Whole-card target: the name owns the click, buttons stay explicit. */}
          <Link
            className="after:absolute after:inset-0 focus-visible:outline-none"
            href={`/motocicletas/${motorcycle.slug}`}
          >
            {motorcycle.name}
          </Link>
        </h2>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
          {motorcycle.shortDescription ?? "Conoce más detalles con un asesor."}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy transition-colors group-hover:text-navy-soft">
            Ver modelo
            <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>

          {/* Above the card-wide overlay so it stays independently clickable. */}
          <Link
            className="relative z-10 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2"
            href={`/solicitar-informacion?moto=${motorcycle.slug}`}
          >
            Solicitar información
          </Link>
        </div>
      </div>
    </article>
  );
}
