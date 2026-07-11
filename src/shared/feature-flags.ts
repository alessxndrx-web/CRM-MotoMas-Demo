/**
 * Developer-only visibility switch for technical/migration wording (database
 * source badges, "pendiente de migración" dividers, DATABASE_URL notices).
 * Hidden by default so the presentation UI reads as one unified system;
 * set NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true to reveal them.
 */
export const SHOW_TECHNICAL_LABELS =
  process.env.NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS === "true";

/**
 * Recovery-only switch for the operational panels that still read/write the
 * legacy browser stores. Migrated routes hide them when PostgreSQL is
 * available; setting this flag explicitly restores them for technical work.
 */
export const ENABLE_LEGACY_OPERATIONAL_PANELS =
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS === "true";

/** The destructive browser-only reset is hidden unless explicitly enabled. */
export const ENABLE_DEMO_DATA_RESET =
  process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA_RESET === "true";

export function shouldShowLegacyOperationalPanel({
  dbAvailable,
  fallbackAllowed = true,
}: {
  dbAvailable: boolean;
  fallbackAllowed?: boolean;
}) {
  if (!fallbackAllowed) return false;
  return ENABLE_LEGACY_OPERATIONAL_PANELS || !dbAvailable;
}
