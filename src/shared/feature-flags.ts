/**
 * Developer-only visibility switch for technical/migration wording (database
 * source badges, "pendiente de migración" dividers, DATABASE_URL notices).
 * Hidden by default so the presentation UI reads as one unified system;
 * set NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true to reveal them.
 */
export const SHOW_TECHNICAL_LABELS =
  process.env.NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS === "true";
