import { notFound } from "next/navigation";

import { PortalPageHeader } from "@/features/portal/components/ui";
import { SandboxCheckout } from "@/features/portal/components/sandbox-checkout";
import { getActivePaymentProvider } from "@/server/payments/providers";

export const dynamic = "force-dynamic";

type SandboxPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
    volver?: string | string[];
  }>;
};

/**
 * Patch CRM-QA1 — la página de pago de la pasarela de pruebas.
 *
 * **Sólo existe cuando el proveedor activo es el de pruebas.** Con una pasarela
 * real configurada —o sin ninguna— esta ruta responde 404: no es un atajo para
 * marcar cobros como pagados, es el sustituto declarado de un proveedor mientras
 * MotoMas no tenga uno.
 *
 * `PAYMENTS_ALLOW_SANDBOX` gobierna si el adaptador de pruebas puede estar
 * activo en producción; por omisión no puede.
 */
export default async function SandboxPaymentPage({ searchParams }: SandboxPageProps) {
  const adapter = getActivePaymentProvider();
  if (!adapter?.isSandbox) notFound();

  const params = await searchParams;
  const providerReference = firstParam(params?.ref);
  if (!providerReference) notFound();

  const rawReturn = firstParam(params?.volver) ?? "/mi-reserva";
  // Sólo rutas internas: un destino absoluto convertiría esta página en un
  // redirector abierto con la marca de MotoMas delante.
  const returnPath =
    rawReturn.startsWith("/") && !rawReturn.startsWith("//")
      ? rawReturn
      : "/mi-reserva";

  return (
    <>
      <PortalPageHeader
        description="Entorno de pruebas de MotoMas. Ningún cobro de esta pantalla es real."
        eyebrow="Pasarela de pruebas"
        title="Pago de prueba"
      />
      <section className="mx-auto max-w-[720px] px-4 py-10 sm:px-6 lg:px-8">
        <SandboxCheckout
          providerReference={providerReference}
          returnPath={returnPath}
        />
      </section>
    </>
  );
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
