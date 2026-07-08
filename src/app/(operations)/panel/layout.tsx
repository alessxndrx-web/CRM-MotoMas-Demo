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

  return (
    <>
      <SessionBridge session={demoSession} />
      <OperationsShell>{children}</OperationsShell>
    </>
  );
}
