import { Suspense, type ReactNode } from "react";

import { MobileStickyCTA } from "@/features/portal/components/mobile-sticky-cta";
import { PublicFooter } from "@/features/portal/components/public-footer";
import { PublicHeader } from "@/features/portal/components/public-header";

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7f9] text-slate-900">
      <Suspense fallback={<HeaderFallback />}>
        <PublicHeader />
      </Suspense>

      {/* Extra bottom padding on mobile so the sticky CTA never covers content. */}
      <main className="flex-1 pb-24 lg:pb-0">{children}</main>

      <PublicFooter />
      <MobileStickyCTA />
    </div>
  );
}

function HeaderFallback() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="MotoMas"
          className="h-9 w-auto object-contain"
          src="/showroom/logo/motomas-logo.png"
        />
      </div>
    </header>
  );
}
