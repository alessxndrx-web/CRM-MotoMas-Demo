import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { motorcycles } from "@/data/catalog/motorcycles";
import { MotorcyclePublicCard } from "@/features/portal/components/motorcycle-public-card";
import {
  btnAccent,
  PortalCard,
  PortalPageHeader,
} from "@/features/portal/components/ui";
import { cn } from "@/lib/utils";

export default function CatalogPage() {
  return (
    <>
      <PortalPageHeader
        description="Explora los modelos disponibles, revisa el que más te interese y solicita información para que un asesor de tu sucursal te dé seguimiento."
        eyebrow="Catálogo"
        title="Nuestras motocicletas"
      >
        {motorcycles.length ? (
          <p className="mt-5 text-sm font-medium text-slate-500">
            {motorcycles.length} modelos en catálogo
          </p>
        ) : null}
      </PortalPageHeader>

      <section className="portal-section mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        {motorcycles.length ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {motorcycles.map((motorcycle) => (
                <MotorcyclePublicCard
                  className="reveal-on-scroll"
                  key={motorcycle.slug}
                  motorcycle={motorcycle}
                />
              ))}
            </div>

            {/* Closing conversion step, so the grid does not end on nothing. */}
            <div className="reveal-on-scroll mt-12 flex flex-col items-center gap-5 rounded-2xl border border-slate-200/80 bg-white px-6 py-9 text-center sm:mt-14">
              <div>
                <h2 className="text-balance text-2xl font-bold tracking-tight text-slate-900">
                  ¿Ya sabes cuál te interesa?
                </h2>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
                  Solicita información y un asesor de la sucursal que elijas te
                  dará seguimiento paso a paso.
                </p>
              </div>
              <Link className={cn(btnAccent)} href="/solicitar-informacion">
                Solicitar información
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : (
          <PortalCard className="p-8 text-center">
            <h2 className="text-2xl font-bold text-slate-900">Catálogo en preparación</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
              Pronto encontrarás aquí los modelos disponibles.
            </p>
          </PortalCard>
        )}
      </section>
    </>
  );
}
