import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function OperatorRestrictedState() {
  return (
    <Card className="p-8 text-center">
      <Badge tone="gray">Bandeja de tickets</Badge>
      <ShieldCheck className="mx-auto mt-5 h-10 w-10 text-slate-400" />
      <h2 className="mt-4 text-2xl font-black text-slate-900">
        Acceso restringido
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        Esta área está reservada para operadores de Soporte Técnico y la
        supervisión autorizada de Administrador.
      </p>
    </Card>
  );
}
