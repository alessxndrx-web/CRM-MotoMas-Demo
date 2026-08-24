"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

/**
 * Mobile-only sticky conversion bar. Hidden on lg+ (desktop keeps the header
 * CTA) and on the request form itself, where it only covers the form it points
 * at. `PublicFooter` pads its last row so this never covers content.
 */
export function MobileStickyCTA() {
  const pathname = usePathname();
  if (pathname.startsWith("/solicitar-informacion")) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur-md lg:hidden">
      <Link
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)] transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2"
        href="/solicitar-informacion"
      >
        Solicitar información
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
