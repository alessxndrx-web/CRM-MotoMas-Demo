import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { OperationsShell } from "@/features/operations/components/operations-shell";
import { SessionBridge } from "@/features/operations/components/session-bridge";
import { ThemeProvider } from "@/features/operations/components/theme-provider";
import type { DemoSession } from "@/features/operations/types";
import { getThemePreference } from "@/server/appearance/queries";
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

  // Patch CRM-INT4. El tema se lee aquí, en el servidor, por la misma razón que
  // la sesión: el primer HTML ya sale con el tema de esta persona, sin parpadeo
  // y sin que el cliente lo corrija al hidratar.
  const themePreference = await getThemePreference(session.uid);

  // Patch POS2.0-B. La sesión ya está resuelta aquí: pasarla evita que el chasis
  // pinte una primera vez sin navegación ni identidad y cambie al hidratar.
  return (
    <ThemeProvider initialPreference={themePreference}>
      <SessionBridge session={demoSession} />
      <OperationsShell initialSession={demoSession}>{children}</OperationsShell>
    </ThemeProvider>
  );
}
