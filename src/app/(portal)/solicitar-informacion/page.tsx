import { LeadRequestForm } from "@/features/portal/components/lead-request-form";

type RequestInfoPageProps = {
  searchParams?: Promise<{
    moto?: string | string[];
  }>;
};

export default async function RequestInfoPage({
  searchParams,
}: RequestInfoPageProps) {
  const resolvedSearchParams = await searchParams;
  const motoParam = resolvedSearchParams?.moto;
  const initialMotorcycleSlug = Array.isArray(motoParam)
    ? motoParam[0]
    : motoParam;

  return <LeadRequestForm initialMotorcycleSlug={initialMotorcycleSlug} />;
}
