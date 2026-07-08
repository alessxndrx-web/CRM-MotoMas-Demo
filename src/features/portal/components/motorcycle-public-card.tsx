/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, Bike } from "lucide-react";

import { type PublicMotorcycle } from "@/data/catalog/motorcycles";

export function MotorcyclePublicCard({
  motorcycle,
}: {
  motorcycle: PublicMotorcycle;
}) {
  const image = motorcycle.images[0] ?? null;

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_40px_rgba(2,6,23,0.05)] transition hover:shadow-[0_16px_48px_rgba(2,6,23,0.12)]">
      <div className="aspect-[4/3] overflow-hidden bg-slate-100">
        {image ? (
          <img
            alt={motorcycle.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            src={image}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-slate-300">
            <Bike className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-bold text-slate-900">{motorcycle.name}</h2>
        {motorcycle.brand ? (
          <p className="mt-0.5 text-sm text-slate-500">{motorcycle.brand}</p>
        ) : null}
        {motorcycle.shortDescription ? (
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
            {motorcycle.shortDescription}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center gap-2.5 pt-0.5">
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
            href={`/motocicletas/${motorcycle.slug}`}
          >
            Ver modelo
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            href={`/solicitar-informacion?moto=${motorcycle.slug}`}
          >
            Solicitar información
          </Link>
        </div>
      </div>
    </div>
  );
}
