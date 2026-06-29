import { PublicProcessLookup } from "@/features/portal/components/public-process-lookup";

type MyReservationPageProps = {
  searchParams?: Promise<{
    codigo?: string | string[];
    expediente?: string | string[];
    telefono?: string | string[];
    cedula?: string | string[];
  }>;
};

export default async function MyReservationPage({
  searchParams,
}: MyReservationPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <PublicProcessLookup
      initialCode={firstParam(resolvedSearchParams?.codigo)}
      initialCedula={firstParam(resolvedSearchParams?.cedula)}
      initialFileNumber={firstParam(resolvedSearchParams?.expediente)}
      initialPhone={firstParam(resolvedSearchParams?.telefono)}
      view="reservation"
    />
  );
}

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
