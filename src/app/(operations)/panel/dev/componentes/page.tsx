import { PageHeader } from "@/components/ui/page-header";
import { ComponentsShowcase } from "@/features/operations/modules/dev/components-showcase";
import { requireAuth } from "@/server/auth/context";

export const dynamic = "force-dynamic";

/**
 * Patch POS2.0-C — showcase de componentes.
 *
 * **Ruta de desarrollo, no de negocio.** Vive bajo `/panel/dev/` y no está en
 * `nav-model`, así que no aparece en la navegación comercial ni marca ningún
 * módulo como activo. Sigue exigiendo sesión, porque cuelga del `layout` del
 * panel; no se le añade ninguna regla de permisos propia — mostrar componentes
 * sin datos no es una capacidad que haya que autorizar.
 *
 * Existe por dos motivos: ver los componentes juntos, que es la única forma de
 * notar que dos de ellos no combinan, y darle a SUITE-POS2.0-C algo real que
 * manipular en un navegador.
 */
export default async function ComponentsShowcasePage() {
  await requireAuth();

  return (
    <section className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Desarrollo" }, { label: "Componentes" }]}
        description="Biblioteca de componentes de POS2.0-C. Datos de demostración: nada aquí toca la base de datos."
        eyebrow="Interno"
        title="Componentes de Operaciones"
      />
      <ComponentsShowcase />
    </section>
  );
}
