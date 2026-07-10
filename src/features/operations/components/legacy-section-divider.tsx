import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { SHOW_TECHNICAL_LABELS } from "@/shared/feature-flags";

/**
 * Separates the database-backed section of a module from its still-local
 * section. Shows a business-friendly label by default; the technical
 * migration label is developer-only and requires
 * NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true.
 */
export function LegacySectionDivider({
  technicalLabel,
  businessLabel,
}: {
  technicalLabel: string;
  businessLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-100" />
      <Badge tone="gray">
        {SHOW_TECHNICAL_LABELS ? technicalLabel : businessLabel}
      </Badge>
      <span className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

/** Badge on a database-backed section header (see LegacySectionDivider). */
export function PrimarySectionBadge({
  technicalLabel,
  businessLabel,
}: {
  technicalLabel: string;
  businessLabel: string;
}) {
  return (
    <Badge tone="green">
      {SHOW_TECHNICAL_LABELS ? technicalLabel : businessLabel}
    </Badge>
  );
}

/** Descriptive paragraph under a database-backed section header. */
export function PrimarySectionDescription({
  technicalText,
  businessText,
}: {
  technicalText: ReactNode;
  businessText: ReactNode;
}) {
  return (
    <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
      {SHOW_TECHNICAL_LABELS ? technicalText : businessText}
    </p>
  );
}

/** Notice shown when a database-backed section has no database configured. */
export function SectionUnavailableNotice({
  technicalText,
  businessText,
}: {
  technicalText: ReactNode;
  businessText: ReactNode;
}) {
  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-700">
      {SHOW_TECHNICAL_LABELS ? technicalText : businessText}
    </div>
  );
}
