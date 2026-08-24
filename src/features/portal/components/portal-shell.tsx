import { Suspense, type ReactNode } from "react";

import { MobileStickyCTA } from "@/features/portal/components/mobile-sticky-cta";
import { PublicFooter } from "@/features/portal/components/public-footer";
import { PortalLogo } from "@/features/portal/components/portal-logo";
import { PublicHeader } from "@/features/portal/components/public-header";

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="portal-canvas flex min-h-screen flex-col text-slate-900">
      <Suspense fallback={<HeaderFallback />}>
        <PublicHeader />
      </Suspense>

      <main className="flex-1">{children}</main>

      <PublicFooter />
      <MobileStickyCTA />
    </div>
  );
}

/** Mirrors the real header's height so hydration does not shift the page. */
function HeaderFallback() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-md">
      <div aria-hidden className="brand-rule h-0.5 w-full" />
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <PortalLogo className="h-11 sm:h-12" />
      </div>
    </header>
  );
}
