"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

export function BrandLoading({
  message = "Preparando información…",
  className,
}: {
  message?: string;
  className?: string;
}) {
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div
      aria-live="polite"
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center",
        className,
      )}
      role="status"
    >
      {!videoFailed ? (
        <video
          aria-hidden
          autoPlay
          className="hidden h-32 w-32 object-contain motion-safe:block"
          loop
          muted
          onError={() => setVideoFailed(true)}
          playsInline
          preload="metadata"
        >
          <source src="/assets/login/motorcycle-loading.webm" type="video/webm" />
        </video>
      ) : null}

      <span
        className={cn(
          "grid place-items-center rounded-xl bg-white p-3 shadow-sm",
          !videoFailed && "motion-safe:hidden",
        )}
      >
        <Image
          alt="MotoMas"
          className="h-14 w-14 object-contain"
          height={56}
          src="/assets/login/logo-motomas.png"
          width={56}
        />
      </span>

      <div>
        <p className="text-sm font-medium text-slate-700">{message}</p>
        <p className="mt-1 text-xs text-slate-500">
          MotoMas · Centro de Operaciones
        </p>
      </div>
    </div>
  );
}
