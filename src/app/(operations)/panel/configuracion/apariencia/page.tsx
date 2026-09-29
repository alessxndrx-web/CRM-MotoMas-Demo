import { PageHeader } from "@/components/ui/page-header";
import { AppearanceSection } from "@/features/operations/modules/settings/appearance-section";
import { requireAuth } from "@/server/auth/context";

/**
 * Patch CRM-INT4 — `/panel/configuracion/apariencia`.
 *
 * La sección «Apariencia» de Configuración, para todos los roles. El resto de
 * Configuración (usuarios, sucursales, permisos) sigue siendo de Gerente y
 * Administrador; esta ruta no expone nada de eso, sólo la preferencia de quien
 * la abre. El chasis la deja abrir también a los roles confinados a su área
 * (Contador, Cajero, Marketing, Soporte), igual que Ayuda.
 */
export default async function AppearancePage() {
  await requireAuth();
  return (
    <section className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Configuración" }, { label: "Apariencia" }]}
        description="Tu preferencia de tema para el panel interno."
        title="Apariencia"
      />
      <AppearanceSection />
    </section>
  );
}
