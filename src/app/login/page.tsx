import { redirect } from "next/navigation";

import { getDefaultRouteForSession } from "@/data/operations/users";
import { LoginForm } from "@/features/operations/components/login-form";
import { LoginVisual } from "@/features/operations/components/login-visual";
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
    <main className="app-canvas flex min-h-screen text-slate-900">
      <aside className="hidden lg:block lg:w-[46%] xl:w-1/2">
        <LoginVisual />
      </aside>
      <section className="flex min-h-screen flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <LoginForm authSource={authSource} nextPath={params.next} />
      </section>
    </main>
  );
}
