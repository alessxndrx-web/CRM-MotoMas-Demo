import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { motorcycles } from "@/data/catalog/motorcycles";
import { MotorcyclePublicCard } from "@/features/portal/components/motorcycle-public-card";

export default function CatalogPage() {
  return (
    <section className="mx-auto max-w-[1520px] px-4 py-10 sm:px-8 lg:px-10">
      <div className="mb-8">
        <Badge tone="red">Catálogo público</Badge>
        <h1 className="mt-5 text-4xl font-black text-white sm:text-5xl">
          Motocicletas
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-400">
          Vista pública del catálogo con motocicletas adjuntas al
          proyecto, separada del inventario operativo interno.
        </p>
      </div>

      {motorcycles.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {motorcycles.map((motorcycle) => (
            <MotorcyclePublicCard key={motorcycle.slug} motorcycle={motorcycle} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <h2 className="text-2xl font-black">Catálogo pendiente</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
            Información pendiente de completar. Cuando se incorporen modelos al
            catálogo, aparecerán aquí.
          </p>
        </Card>
      )}
    </section>
  );
}
