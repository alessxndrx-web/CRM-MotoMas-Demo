import { redirect } from "next/navigation";

import { getDefaultRouteForSession } from "@/data/operations/users";
import { getCurrentUserSession } from "@/server/auth/context";

export const dynamic = "force-dynamic";

export default async function PanelPage() {
  const session = await getCurrentUserSession();
  if (!session) redirect("/login");

  redirect(
    getDefaultRouteForSession({
      userId: session.uid,
      userName: session.name,
      role: session.role,
      branchId: session.branchId,
      branchName: session.branchName,
    }),
  );
}
