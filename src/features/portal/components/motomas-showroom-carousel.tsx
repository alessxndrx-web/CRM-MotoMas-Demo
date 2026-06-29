"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import {
  PENDING_CATALOG_INFO,
  type PublicMotorcycle,
} from "@/data/catalog/motorcycles";

const showroomImageBySlug: Record<string, string> = {
  "bajaj-pulsar-180": "/showroom/motorcycles/bajaj-pulsar-180.png",
  "bajaj-pulsar-n250-2026": "/showroom/motorcycles/bajaj-pulsar-n250-2026.png",
  "dominar-250": "/showroom/motorcycles/dominar-250.png",
  "pulsar-ns200-2027": "/showroom/motorcycles/pulsar-ns200-2027.png",
  "pulsar-ns400z": "/showroom/motorcycles/pulsar-ns400z.png",
};

type ShowroomMotorcycleCalibration = {
  activeScale: number;
  activeX: number;
  activeY: number;
  sideScale: number;
  sideX: number;
  sideY: number;
  rearWheel: number;
  frontWheel: number;
  shadowWidth: number;
};

const defaultShowroomCalibration: ShowroomMotorcycleCalibration = {
  activeScale: 1.05,
  activeX: 0,
  activeY: 0,
  sideScale: 0.7,
  sideX: 0,
  sideY: 2,
  rearWheel: 24,
  frontWheel: 62,
  shadowWidth: 56,
};

// PNG crops vary by model; these offsets keep every motorcycle on the same showroom baseline.
const showroomCalibrationBySlug: Record<string, ShowroomMotorcycleCalibration> = {
  "bajaj-pulsar-180": {
    activeScale: 1.08,
    activeX: -6,
    activeY: 2,
    sideScale: 0.69,
    sideX: -2,
    sideY: 4,
    rearWheel: 22,
    frontWheel: 63,
    shadowWidth: 58,
  },
  "bajaj-pulsar-n250-2026": {
    activeScale: 1.13,
    activeX: 4,
    activeY: 0,
    sideScale: 0.72,
    sideX: 2,
    sideY: 2,
    rearWheel: 23,
    frontWheel: 64,
    shadowWidth: 56,
  },
  "dominar-250": {
    activeScale: 1.04,
    activeX: 0,
    activeY: 5,
    sideScale: 0.68,
    sideX: -3,
    sideY: 5,
    rearWheel: 21,
    frontWheel: 65,
    shadowWidth: 60,
  },
  "pulsar-ns200-2027": {
    activeScale: 1.09,
    activeX: 5,
    activeY: -2,
    sideScale: 0.71,
    sideX: 1,
    sideY: 1,
    rearWheel: 24,
    frontWheel: 62,
    shadowWidth: 57,
  },
  "pulsar-ns400z": {
    activeScale: 1.03,
    activeX: 0,
    activeY: 2,
    sideScale: 0.69,
    sideX: 0,
    sideY: 3,
    rearWheel: 22,
    frontWheel: 64,
    shadowWidth: 61,
  },
};

export function MotomasShowroomCarousel({
  motorcycles,
}: {
  motorcycles: PublicMotorcycle[];
}) {
  const slides = useMemo(
    () => motorcycles.filter((motorcycle) => Boolean(showroomImageBySlug[motorcycle.slug])),
    [motorcycles],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMotorcycle = slides[activeIndex] ?? null;

  useEffect(() => {
    setActiveIndex((index) => (slides.length ? index % slides.length : 0));
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2) return;

    const intervalId = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, 6000);

    return () => window.clearInterval(intervalId);
  }, [slides.length]);

  if (!activeMotorcycle) return null;

  const requestHref = `/solicitar-informacion?moto=${activeMotorcycle.slug}`;
  const detailsHref = `/motocicletas/${activeMotorcycle.slug}`;

  function goTo(index: number) {
    setActiveIndex((index + slides.length) % slides.length);
  }

  return (
    <section aria-label="Showroom MotoMas" className="overflow-hidden bg-[#05070d]">
      <div className="relative isolate min-h-[740px] overflow-hidden [perspective:1400px] sm:min-h-[700px] lg:min-h-[calc(100svh-84px)]">
        <ShowroomSceneLayers />

        <div className="relative z-30 flex min-h-[740px] flex-col justify-between px-6 py-8 sm:min-h-[700px] sm:px-9 lg:min-h-[calc(100svh-84px)] lg:px-20 lg:py-14">
          <div className="relative isolate max-w-[335px] pt-10 lg:max-w-[400px] lg:pt-[19vh]">
            <div className="pointer-events-none absolute -inset-x-8 -inset-y-7 -z-10 bg-[radial-gradient(ellipse_at_left,rgba(2,4,10,0.92),rgba(2,4,10,0.5)_56%,transparent_84%)] blur-md" />
            <div className="inline-flex rounded-full border border-orange-300/30 bg-orange-400/10 px-3 py-1 text-xs font-bold text-orange-100">
              {activeMotorcycle.brand ?? "Modelo destacado"}
            </div>
            <Link className="mt-4 block" href={requestHref}>
              <h2 className="text-4xl font-black leading-[1.03] text-white sm:text-5xl">
                {activeMotorcycle.name}
              </h2>
            </Link>
            <p className="mt-5 text-sm leading-6 text-zinc-200 sm:text-base sm:leading-7">
              {activeMotorcycle.shortDescription ?? PENDING_CATALOG_INFO}
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-300/85">
              Elegí tu sucursal y recibí atención comercial para este modelo.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#ff7a00] px-5 text-sm font-bold text-white shadow-[0_12px_26px_rgba(249,115,22,0.3)] transition hover:-translate-y-0.5 hover:bg-orange-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200/90"
                href={requestHref}
              >
                Solicitar información
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                className="inline-flex h-11 items-center justify-center rounded-lg border border-sky-300/35 bg-[#07101e]/70 px-5 text-sm font-semibold text-sky-50 transition hover:-translate-y-0.5 hover:border-sky-200/65 hover:bg-sky-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
                href={detailsHref}
              >
                Ver detalles
              </Link>
            </div>
          </div>

          <div className="relative z-40 flex justify-center pt-6">
            <div className="flex gap-2">
              {slides.map((motorcycle, index) => (
                <button
                  aria-label={`Mostrar ${motorcycle.name}`}
                  className={`h-2.5 rounded-full transition-all duration-300 ${index === activeIndex ? "w-8 bg-[#ff7a00] shadow-[0_0_12px_rgba(249,115,22,0.7)]" : "w-2.5 bg-sky-100/30 hover:bg-sky-100/60"}`}
                  key={motorcycle.slug}
                  onClick={() => goTo(index)}
                  type="button"
                />
              ))}
            </div>
          </div>
        </div>

        {slides.length > 1 ? (
          <>
            <div className="absolute left-8 top-1/2 z-40 hidden -translate-y-1/2 lg:block">
              <ShowroomControl label="Modelo anterior" onClick={() => goTo(activeIndex - 1)}>
                <ChevronLeft className="h-5 w-5" />
              </ShowroomControl>
            </div>
            <div className="absolute right-8 top-1/2 z-40 hidden -translate-y-1/2 lg:block">
              <ShowroomControl label="Modelo siguiente" onClick={() => goTo(activeIndex + 1)}>
                <ChevronRight className="h-5 w-5" />
              </ShowroomControl>
            </div>
            <div className="absolute bottom-7 right-6 z-40 flex gap-2 lg:hidden">
              <ShowroomControl label="Modelo anterior" onClick={() => goTo(activeIndex - 1)}>
                <ChevronLeft className="h-5 w-5" />
              </ShowroomControl>
              <ShowroomControl label="Modelo siguiente" onClick={() => goTo(activeIndex + 1)}>
                <ChevronRight className="h-5 w-5" />
              </ShowroomControl>
            </div>
          </>
        ) : null}

        <div className="absolute inset-0 z-20 overflow-hidden">
          <ShowroomStageFrame />
          <ShowroomGroundContact />
          {slides.map((motorcycle, index) => (
            <ShowroomMotorcycle
              href={`/solicitar-informacion?moto=${motorcycle.slug}`}
              key={motorcycle.slug}
              motorcycle={motorcycle}
              onSelect={() => goTo(index)}
              position={getSlidePosition(index, activeIndex, slides.length)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ShowroomSceneLayers() {
  return (
    <>
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-center opacity-90"
        src="/motomas/hero/background.webp"
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(2,4,10,0.82)_0%,rgba(2,4,10,0.56)_30%,rgba(2,4,10,0.16)_57%,rgba(2,4,10,0.12)_100%),linear-gradient(0deg,rgba(2,4,10,0.66)_0%,rgba(2,4,10,0.16)_40%,transparent_70%)]" />
      <div className="pointer-events-none absolute left-[60%] top-[11%] z-[2] hidden h-[64%] w-[68%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.16),rgba(249,115,22,0.09)_44%,transparent_74%)] blur-3xl lg:block" />
      <img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-3%] left-0 z-[2] h-[58%] w-full object-cover object-top opacity-90 sm:h-[61%] lg:h-[64%]"
        src="/motomas/hero/floor.webp"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 24%, black 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 24%, black 100%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[58%] bg-[linear-gradient(0deg,rgba(2,4,10,0.6)_0%,rgba(2,4,10,0.18)_34%,transparent_64%)]" />
      <div
        className="pointer-events-none absolute bottom-[-9%] left-[-12%] right-[-12%] z-[3] hidden h-[40%] origin-bottom opacity-25 [transform:perspective(1000px)_rotateX(60deg)] lg:block"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, rgba(125, 211, 252, 0.16) 0 1px, transparent 1px 9%), repeating-linear-gradient(0deg, rgba(249, 115, 22, 0.12) 0 1px, transparent 1px 22%)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[45%] z-[4] h-24 bg-[linear-gradient(0deg,rgba(2,4,10,0.34),transparent)] blur-xl" />
      <div className="pointer-events-none absolute inset-x-[7%] bottom-[72px] z-[4] h-px bg-gradient-to-r from-transparent via-sky-300/35 to-orange-300/35 sm:bottom-[68px] lg:bottom-[72px]" />
    </>
  );
}

function ShowroomStageFrame() {
  return (
    <div className="pointer-events-none absolute left-[60%] top-[11%] hidden h-[59%] w-[61%] -translate-x-1/2 lg:block">
      <div className="absolute inset-0 border border-sky-300/35 [clip-path:polygon(10%_0,88%_0,100%_50%,88%_100%,10%_100%,0_50%)] [filter:drop-shadow(0_0_20px_rgba(56,189,248,0.16))]" />
      <div className="absolute inset-[9px] border border-orange-400/25 [clip-path:polygon(10%_0,88%_0,100%_50%,88%_100%,10%_100%,0_50%)] [filter:drop-shadow(0_0_20px_rgba(249,115,22,0.14))]" />
    </div>
  );
}

function ShowroomGroundContact() {
  return (
    <>
      <div className="pointer-events-none absolute left-1/2 bottom-[84px] z-10 h-12 w-[62%] -translate-x-1/2 rounded-[100%] bg-black/75 blur-xl sm:bottom-[78px] lg:bottom-[72px] lg:left-[60%] lg:h-20 lg:w-[50%]" />
      <div className="pointer-events-none absolute left-1/2 bottom-[83px] z-10 h-7 w-[48%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.3),rgba(249,115,22,0.13)_38%,transparent_74%)] blur-md lg:bottom-[72px] lg:left-[60%] lg:w-[38%]" />
    </>
  );
}

function ShowroomMotorcycle({
  href,
  motorcycle,
  onSelect,
  position,
}: {
  href: string;
  motorcycle: PublicMotorcycle;
  onSelect: () => void;
  position: "active" | "previous" | "next" | "hidden";
}) {
  const image = showroomImageBySlug[motorcycle.slug];
  const calibration = showroomCalibrationBySlug[motorcycle.slug] ?? defaultShowroomCalibration;
  const calibrationStyle = {
    "--active-scale": calibration.activeScale,
    "--active-x": `${calibration.activeX}px`,
    "--active-y": `${calibration.activeY}px`,
    "--side-scale": calibration.sideScale,
    "--side-x": `${calibration.sideX}px`,
    "--side-y": `${calibration.sideY}px`,
    "--rear-wheel": `${calibration.rearWheel}%`,
    "--front-wheel": `${calibration.frontWheel}%`,
    "--shadow-width": `${calibration.shadowWidth}%`,
  } as CSSProperties;
  const positionClass = {
    active: "z-20 opacity-100 [filter:blur(0px)] [transform:translateX(-50%)_scale(1)] lg:[transform:translateX(calc(-50%_+_var(--active-x)))_translateY(var(--active-y))_scale(var(--active-scale))]",
    previous:
      "z-10 pointer-events-none opacity-0 [filter:blur(2px)] [transform:translateX(-50%)_translateY(2%)_scale(.94)] lg:pointer-events-auto lg:opacity-38 lg:[filter:blur(.45px)_saturate(.72)_brightness(.64)] lg:[transform:translateX(calc(-116%_+_var(--side-x)))_translateY(calc(2%_+_var(--side-y)))_scale(var(--side-scale))_rotateY(18deg)]",
    next:
      "z-10 pointer-events-none opacity-0 [filter:blur(2px)] [transform:translateX(-50%)_translateY(2%)_scale(.94)] lg:pointer-events-auto lg:opacity-38 lg:[filter:blur(.45px)_saturate(.72)_brightness(.64)] lg:[transform:translateX(calc(16%_+_var(--side-x)))_translateY(calc(2%_+_var(--side-y)))_scale(var(--side-scale))_rotateY(-18deg)]",
    hidden:
      "z-0 pointer-events-none opacity-0 [filter:blur(3px)] [transform:translateX(-50%)_translateY(2%)_scale(.88)]",
  }[position];

  return (
    <div
      className={`absolute bottom-[100px] left-1/2 flex h-[325px] w-[86vw] origin-bottom items-end justify-center transition-[filter,opacity,transform] duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[filter,opacity,transform] motion-reduce:transition-none sm:bottom-[85px] sm:h-[410px] sm:w-[74vw] lg:bottom-[72px] lg:left-[60%] lg:h-[min(68vh,650px)] lg:w-[min(63vw,930px)] ${positionClass}`}
      style={calibrationStyle}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-1/2 h-8 -translate-x-1/2 rounded-[100%] bg-black/75 blur-lg lg:h-11 ${position === "active" ? "w-[var(--shadow-width)] opacity-100" : "w-[46%] opacity-55"}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-[var(--rear-wheel)] h-3 w-[15%] -translate-x-1/2 rounded-[100%] bg-black/85 blur-md ${position === "active" ? "opacity-90" : "opacity-35"}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-[var(--front-wheel)] h-3 w-[15%] -translate-x-1/2 rounded-[100%] bg-black/85 blur-md ${position === "active" ? "opacity-90" : "opacity-35"}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute bottom-0 left-1/2 h-3 -translate-x-1/2 rounded-[100%] bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.2),rgba(249,115,22,0.08)_42%,transparent_74%)] blur-md ${position === "active" ? "w-[38%] opacity-80" : "w-[30%] opacity-30"}`}
      />
      <img
        alt={position === "active" ? motorcycle.name : ""}
        className="max-h-full w-full origin-bottom object-contain object-bottom drop-shadow-[0_42px_26px_rgba(0,0,0,0.78)]"
        src={image}
      />
      {position === "active" ? (
        <Link aria-label={`Solicitar información sobre ${motorcycle.name}`} className="absolute inset-0" href={href} />
      ) : null}
      {position === "previous" || position === "next" ? (
        <button
          aria-label={`Mostrar ${motorcycle.name}`}
          className="absolute inset-0 hidden cursor-pointer lg:block"
          onClick={onSelect}
          type="button"
        />
      ) : null}
    </div>
  );
}

function getSlidePosition(
  index: number,
  activeIndex: number,
  length: number,
): "active" | "previous" | "next" | "hidden" {
  if (index === activeIndex) return "active";
  if (index === (activeIndex + 1) % length) return "next";
  if (index === (activeIndex - 1 + length) % length) return "previous";
  return "hidden";
}

function ShowroomControl({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid h-11 w-11 place-items-center rounded-lg border border-sky-300/35 bg-[#08111f]/85 text-sky-50 shadow-[0_8px_20px_rgba(2,4,10,0.28)] transition hover:border-orange-300/70 hover:bg-orange-400/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/80"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
