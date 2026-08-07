import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { OperationsShell } from "@/features/operations/components/operations-shell";
import { SessionBridge } from "@/features/operations/components/session-bridge";
import type { DemoSession } from "@/features/operations/types";
import { getCurrentUserSession } from "@/server/auth/context";

export default async function OperationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getCurrentUserSession();
  if (!session) redirect("/login");

  const demoSession: DemoSession = {
    userId: session.uid,
    userName: session.name,
    role: session.role,
    branchId: session.branchId,
    branchName: session.branchName,
  };

  // Patch POS2.0-B. La sesión ya está resuelta aquí: pasarla evita que el chasis
  // pinte una primera vez sin navegación ni identidad y cambie al hidratar.
  return (
    <>
      <SessionBridge session={demoSession} />
      <OperationsShell initialSession={demoSession}>{children}</OperationsShell>
    </>
  );
}
