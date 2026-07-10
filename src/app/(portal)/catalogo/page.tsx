import { motorcycles } from "@/data/catalog/motorcycles";
import { MotorcyclePublicCard } from "@/features/portal/components/motorcycle-public-card";
import {
  PortalCard,
  PortalPageHeader,
} from "@/features/portal/components/ui";

export default function CatalogPage() {
  return (
    <>
      <PortalPageHeader
        description="Explora los modelos disponibles y solicita información del que más te interese."
        eyebrow="Catálogo"
        title="Nuestras motocicletas"
      >
        {motorcycles.length ? (
          <p className="mt-4 text-sm font-medium text-slate-500">
            {motorcycles.length} modelos en catálogo
          </p>
        ) : null}
      </PortalPageHeader>

      <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
        {motorcycles.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {motorcycles.map((motorcycle) => (
              <MotorcyclePublicCard
                className="reveal-on-scroll"
                key={motorcycle.slug}
                motorcycle={motorcycle}
              />
            ))}
          </div>
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
