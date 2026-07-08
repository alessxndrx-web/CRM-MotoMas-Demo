import { redirect } from "next/navigation";

import { getDefaultRouteForSession } from "@/data/operations/users";
import { LoginForm } from "@/features/operations/components/login-form";
import { getCurrentUserSession } from "@/server/auth/context";
import { authSourceLabel } from "@/server/auth/user-store";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCurrentUserSession();
  if (session) {
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

  const params = await searchParams;
  const authSource = authSourceLabel();

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#050505] px-4 py-12 text-zinc-100">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 mx-auto h-64 max-w-3xl bg-[radial-gradient(circle_at_50%_0%,rgba(239,35,45,0.45),rgba(239,35,45,0.1)_38%,transparent_72%)] blur-2xl" />
      <div className="relative z-10 flex w-full justify-center">
        <LoginForm authSource={authSource} nextPath={params.next} />
      </div>
    </main>
  );
}
