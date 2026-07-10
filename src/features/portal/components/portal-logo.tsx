/* eslint-disable @next/next/no-img-element */

import { cn } from "@/lib/utils";

/**
 * MotoMas lockup for the public portal.
 *
 * Uses `motomas-logo-mark.png`, not `motomas-logo-transparent.png`: both hold
 * the same 362x298 artwork, but the latter centres it on a 500x500 canvas, so
 * 57% of the image is empty padding and the mark renders ~60% smaller for a
 * given height. The mark is cropped tight (378x314), so `h-12` actually yields
 * a 48px-tall logo. Intrinsic size is set to reserve space and avoid shift.
 */
export function PortalLogo({ className }: { className?: string }) {
  return (
    <img
      alt="MotoMas"
      className={cn("w-auto object-contain", className)}
      height={314}
      src="/showroom/logo/motomas-logo-mark.png"
      width={378}
    />
  );
}
