import type { ReactNode } from "react";

import { OperationsShell } from "@/features/operations/components/operations-shell";

export default function OperationsLayout({ children }: { children: ReactNode }) {
  return <OperationsShell>{children}</OperationsShell>;
}
