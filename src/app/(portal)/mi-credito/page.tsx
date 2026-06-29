import { PublicProcessLookup } from "@/features/portal/components/public-process-lookup";

type MyCreditPageProps = {
  searchParams?: Promise<{
    codigo?: string | string[];
    expediente?: string | string[];
    telefono?: string | string[];
    cedula?: string | string[];
  }>;
};

export default async function MyCreditPage({ searchParams }: MyCreditPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <PublicProcessLookup
      initialCode={firstParam(resolvedSearchParams?.codigo)}
      initialCedula={firstParam(resolvedSearchParams?.cedula)}
      initialFileNumber={firstParam(resolvedSearchParams?.expediente)}
      initialPhone={firstParam(resolvedSearchParams?.telefono)}
      view="credit"
    />
  );
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
