import { PublicProcessLookup } from "@/features/portal/components/public-process-lookup";

type CheckFilePageProps = {
  searchParams?: Promise<{
    codigo?: string | string[];
    expediente?: string | string[];
    telefono?: string | string[];
    cedula?: string | string[];
  }>;
};

export default async function CheckFilePage({ searchParams }: CheckFilePageProps) {
  const resolvedSearchParams = await searchParams;
  const codigoParam = resolvedSearchParams?.codigo;
  const expedienteParam = resolvedSearchParams?.expediente;
  const telefonoParam = resolvedSearchParams?.telefono;
  const cedulaParam = resolvedSearchParams?.cedula;
  const initialCode = Array.isArray(codigoParam) ? codigoParam[0] : codigoParam;
  const initialFileNumber = Array.isArray(expedienteParam)
    ? expedienteParam[0]
    : expedienteParam;
  const initialPhone = Array.isArray(telefonoParam)
    ? telefonoParam[0]
    : telefonoParam;
  const initialCedula = Array.isArray(cedulaParam) ? cedulaParam[0] : cedulaParam;

  return (
    <PublicProcessLookup
      initialCode={initialCode}
      initialCedula={initialCedula}
      initialFileNumber={initialFileNumber}
      initialPhone={initialPhone}
      view="process"
    />
  );
}
