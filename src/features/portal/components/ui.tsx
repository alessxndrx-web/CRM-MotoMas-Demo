import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Light-theme UI kit for the public client portal (Patch 3.P1, retokenized in
 * Patch 3.9P-B).
 *
 * These are portal-scoped on purpose: the shared `@/components/ui/*` primitives
 * are dark-themed and used by the internal `/panel`, so the public portal keeps
 * its own premium light look here without touching the operations panel.
 *
 * Color rules (docs/PORTAL_UI_POLISH_PLAN.md §3):
 * - Primary surfaces use the brand navy (`navy` / `navy-soft` from globals.css),
 *   never stock Tailwind blue.
 * - Orange is the conversion accent only: `btnAccent`, active indicators and the
 *   next-step highlight. Everything decorative stays navy or slate.
 */

// Primary = brand navy. Accent = MotoMas orange (the conversion CTA).
// CTA microinteraction: a 1px lift plus a slightly deeper shadow on hover.
export const btnPrimary =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-navy px-6 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-navy-soft hover:shadow-[0_10px_24px_rgba(18,40,76,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0";
export const btnAccent =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-6 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow-[0_14px_30px_rgba(249,115,22,0.36)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0";
export const btnOutline =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-700 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0";

export const inputClass =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-navy focus:ring-2 focus:ring-navy/20";
export const selectClass =
  "h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition focus:border-navy focus:ring-2 focus:ring-navy/20";
export const labelClass =
  "mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500";

/** Navy icon tile used across trust signals, tools and lookup headers. */
export const iconTile =
  "grid place-items-center rounded-xl bg-navy/5 text-navy";

export function PortalCard({
  className,
  elevated = false,
  children,
}: {
  className?: string;
  elevated?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white",
        elevated ? "portal-card-shadow-elevated" : "portal-card-shadow",
        className,
      )}
    >
      {children}
    </div>
  );
}

type Tone = "blue" | "orange" | "slate" | "green" | "amber";

// "blue" renders as the brand navy tint; the tone key is kept so existing
// call sites don't churn.
const toneClasses: Record<Tone, string> = {
  blue: "border-navy/20 bg-navy/5 text-navy",
  orange: "border-orange-200 bg-orange-50 text-orange-700",
  slate: "border-slate-200 bg-slate-100 text-slate-600",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
};

export function PortalBadge({
  tone = "slate",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PortalSectionHeader({
  eyebrow,
  title,
  description,
  align = "left",
  tone = "blue",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  tone?: Tone;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <PortalBadge tone={tone}>{eyebrow}</PortalBadge> : null}
      <h2 className="mt-4 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      <span
        aria-hidden
        className={cn("portal-rule mt-4 block w-14", align === "center" && "mx-auto")}
      />
      {description ? (
        <p className="mt-4 text-base leading-7 text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

/**
 * Full-width page header for the portal's tool pages (request form, tracking).
 * Keeps those routes from opening with a form card floating in white space.
 */
export function PortalPageHeader({
  eyebrow,
  title,
  description,
  tone = "blue",
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  tone?: Tone;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-slate-200 bg-white">
      <div aria-hidden className="brand-rule h-1 w-full" />
      <div className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="animate-fade-up">
          {eyebrow ? <PortalBadge tone={tone}>{eyebrow}</PortalBadge> : null}
          <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
              {description}
            </p>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
