/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Bike } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  getMotorcycleBySlug,
  motorcycles,
  PENDING_CATALOG_INFO,
} from "@/data/catalog/motorcycles";

type MotorcycleDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function MotorcycleDetailPage({
  params,
}: MotorcycleDetailPageProps) {
  const { slug } = await params;
  const motorcycle = getMotorcycleBySlug(slug);

  if (!motorcycle) notFound();

  const heroImage = motorcycle.images[0] ?? null;

  return (
    <section className="mx-auto max-w-[1520px] px-4 py-10 sm:px-8 lg:px-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="aspect-[16/10] bg-[linear-gradient(135deg,#171717,#0b0b0c)]">
            {heroImage ? (
              <img
                alt={motorcycle.name}
                className="h-full w-full object-cover"
                src={heroImage}
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-zinc-600">
                <Bike className="h-12 w-12" />
              </div>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <Badge tone="red">Motocicleta</Badge>
          <h1 className="mt-5 text-4xl font-black text-white">{motorcycle.name}</h1>
          <p className="mt-3 text-base leading-7 text-zinc-400">
            {motorcycle.description ?? PENDING_CATALOG_INFO}
          </p>
          <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/[0.045] p-5">
            <DetailLine label="Marca" value={motorcycle.brand ?? PENDING_CATALOG_INFO} />
            <DetailLine
              label="Categoria"
              value={motorcycle.category ?? PENDING_CATALOG_INFO}
            />
            <DetailLine
              label="Colores"
              value={
                motorcycle.colors.length
                  ? motorcycle.colors.join(", ")
                  : PENDING_CATALOG_INFO
              }
            />
          </div>
          <Link
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-red-600 px-6 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(239,35,45,0.24)] transition hover:bg-red-500"
            href={`/solicitar-informacion?moto=${motorcycle.slug}`}
          >
            Solicitar información
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_420px]">
        <Card className="p-6">
          <Badge tone="gray">Ficha tecnica</Badge>
          {motorcycle.technicalSpecs.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {motorcycle.technicalSpecs.map((spec) => (
                <div
                  className="rounded-xl border border-white/10 bg-white/[0.045] p-4 text-sm font-semibold leading-6 text-zinc-300"
                  key={spec}
                >
                  {spec}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">{PENDING_CATALOG_INFO}</p>
          )}
        </Card>

        <Card className="p-6">
          <Badge tone="gray">Imagenes</Badge>
          <div className="mt-5 grid gap-3">
            {motorcycle.images.length ? (
              motorcycle.images.map((image) => (
                <img
                  alt={motorcycle.name}
                  className="aspect-[16/10] w-full rounded-xl object-cover"
                  key={image}
                  src={image}
                />
              ))
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4 text-sm text-zinc-500">
                {PENDING_CATALOG_INFO}
              </div>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}

export function generateStaticParams() {
  return motorcycles.map((motorcycle) => ({ slug: motorcycle.slug }));
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4 last:border-b-0 last:pb-0">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="max-w-[240px] text-right text-sm font-bold text-white">
        {value}
      </span>
    </div>
  );
}
