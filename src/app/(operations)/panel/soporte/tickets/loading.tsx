import { Card } from "@/components/ui/card";

export default function OperatorTicketsLoading() {
  return (
    <section aria-busy="true" aria-label="Cargando bandeja de tickets" className="space-y-6">
      <Card className="h-32 animate-pulse bg-slate-50" />
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-9">
        {Array.from({ length: 9 }, (_, index) => (
          <Card className="h-24 animate-pulse bg-slate-50" key={index} />
        ))}
      </div>
      <Card className="h-48 animate-pulse bg-slate-50" />
      <Card className="h-80 animate-pulse bg-slate-50" />
    </section>
  );
}
