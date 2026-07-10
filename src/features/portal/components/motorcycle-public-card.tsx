/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, Bike } from "lucide-react";

import { type PublicMotorcycle } from "@/data/catalog/motorcycles";
import { cn } from "@/lib/utils";

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
        "hover-lift group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(2,6,23,0.05)] hover:border-blue-200 hover:shadow-[0_16px_44px_rgba(2,6,23,0.12)]",
        className,
      )}
    >
      {/*
       * Catalog photos range from 0.96 to 1.76 aspect. `object-contain` on a
       * 4:3 plate keeps every bike whole — `object-cover` was slicing ~31% off
       * the near-square shots (7 of 15 models).
       */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-b from-slate-50 to-slate-100">
        {image ? (
          <img
            alt={motorcycle.name}
            className="h-full w-full object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            loading="lazy"
            src={image}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-slate-300">
            <Bike className="h-10 w-10" />
          </div>
        )}
        {motorcycle.brand ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-700 backdrop-blur-sm">
            {motorcycle.brand}
          </span>
        ) : null}
        {/* Brand accent, revealed on hover. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-orange-500 transition-transform duration-200 group-hover:scale-x-100"
        />
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
          {motorcycle.name}
        </h2>
        {motorcycle.shortDescription ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-600">
            {motorcycle.shortDescription}
          </p>
        ) : null}

        {/*
         * Stacked, not side by side: at xl the grid yields ~280px cards, which
         * left each button ~115px — not enough for "Solicitar información".
         */}
        <div className="mt-auto grid gap-2 pt-4">
          <Link
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
            href={`/motocicletas/${motorcycle.slug}`}
          >
            Ver modelo
            <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" />
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2"
            href={`/solicitar-informacion?moto=${motorcycle.slug}`}
          >
            Solicitar información
          </Link>
        </div>
      </div>
    </article>
  );
}
