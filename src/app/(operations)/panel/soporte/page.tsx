import { Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAuth } from "@/server/auth/context";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  await requireAuth();

  return (
    <Card className="p-8 text-center">
      <Badge tone="slate">Soporte Técnico</Badge>
      <Wrench className="mx-auto mt-5 h-10 w-10 text-slate-400" />
      <h2 className="mt-4 text-xl font-semibold text-slate-900">
        Soporte Técnico en preparación
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        Este rol está disponible como estructura de acceso. Sus herramientas,
        diagnósticos y permisos operativos se activarán en el Patch 4.0D.
      </p>
    </Card>
  );
}
