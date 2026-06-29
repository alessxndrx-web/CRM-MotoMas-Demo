/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, Bike } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  PENDING_CATALOG_INFO,
  type PublicMotorcycle,
} from "@/data/catalog/motorcycles";

export function MotorcyclePublicCard({
  motorcycle,
}: {
  motorcycle: PublicMotorcycle;
}) {
  const image = motorcycle.images[0] ?? null;

  return (
    <Card className="group overflow-hidden">
      <div className="aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,#171717,#0b0b0c)]">
        {image ? (
          <img
            alt={motorcycle.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            src={image}
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-zinc-600">
            <Bike className="h-10 w-10" />
          </div>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">{motorcycle.name}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {motorcycle.brand ?? PENDING_CATALOG_INFO}
            </p>
          </div>
          <Badge tone="gray">{motorcycle.category ?? PENDING_CATALOG_INFO}</Badge>
        </div>
        <p className="mt-4 min-h-[72px] text-sm leading-6 text-zinc-400">
          {motorcycle.shortDescription ?? PENDING_CATALOG_INFO}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
            href={`/motocicletas/${motorcycle.slug}`}
          >
            Ver detalle
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-zinc-100 transition hover:bg-white/[0.1]"
            href={`/solicitar-informacion?moto=${motorcycle.slug}`}
          >
            Solicitar información
          </Link>
        </div>
      </div>
    </Card>
  );
}
