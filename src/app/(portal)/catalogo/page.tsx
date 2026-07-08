import { motorcycles } from "@/data/catalog/motorcycles";
import { MotorcyclePublicCard } from "@/features/portal/components/motorcycle-public-card";
import {
  PortalCard,
  PortalSectionHeader,
} from "@/features/portal/components/ui";

export default function CatalogPage() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 py-12 sm:px-6 lg:px-8">
      <PortalSectionHeader
        eyebrow="Catálogo"
        title="Nuestras motocicletas"
        description="Explora los modelos disponibles y solicita información del que más te interese."
      />

      {motorcycles.length ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {motorcycles.map((motorcycle) => (
            <MotorcyclePublicCard key={motorcycle.slug} motorcycle={motorcycle} />
          ))}
        </div>
      ) : (
        <PortalCard className="mt-10 p-8 text-center">
          <h2 className="text-2xl font-black text-slate-900">Catálogo en preparación</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Pronto encontrarás aquí los modelos disponibles.
          </p>
        </PortalCard>
      )}
    </section>
  );
}
