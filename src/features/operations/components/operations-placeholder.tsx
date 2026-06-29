import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type OperationsPlaceholderProps = {
  title: string;
  route: string;
};

export function OperationsPlaceholder({ title, route }: OperationsPlaceholderProps) {
  return (
    <Card className="p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge tone="red">Fase 0</Badge>
          <h2 className="mt-5 text-3xl font-black text-white">{title}</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-400">
            Esta vista está preparada en {route}. La funcionalidad de este módulo
            se habilitará en una fase posterior autorizada.
          </p>
        </div>
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.045] text-red-400">
          <FileText className="h-7 w-7" />
        </div>
      </div>
    </Card>
  );
}
