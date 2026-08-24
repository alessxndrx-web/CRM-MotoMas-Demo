/**
 * Capa pura y segura para el cliente de la integración con Meta: tipos, DTOs y
 * el mapeo de `field_data` → campos de `Lead`. Sin `import` de la base de datos,
 * para que el panel de Marketing pueda reutilizar las formas. La autorización y
 * la escritura viven en queries.ts / actions.ts / ingest.ts.
 *
 * Este archivo NO habla con Meta. Sólo describe lo que Meta manda y traduce sus
 * respuestas al vocabulario del CRM.
 */

import { normalizePhone, sanitizeText } from "@/server/crm/shared";

/**
 * Una respuesta del formulario tal como la devuelve el Graph API. Meta manda
 * siempre un arreglo en `values` aunque la pregunta sea de respuesta única.
 */
export type MetaLeadFieldEntry = {
  name: string;
  values: string[];
};

/**
 * El nodo del lead en el Graph API. **No** es lo que llega por el webhook: el
 * webhook sólo trae identificadores, y estas respuestas hay que ir a buscarlas.
 */
export type MetaLeadgenDetail = {
  id: string;
  created_time?: string;
  form_id?: string;
  /** "fb" o "ig" según dónde se llenó el formulario. Ausente en formularios viejos. */
  platform?: string;
  field_data: MetaLeadFieldEntry[];
};

/**
 * Los nombres de campo del formulario de leads por defecto de Meta. Un
 * formulario personalizado puede traer otros; se registran y se omiten, nunca
 * tumban el lead completo.
 */
const FIELD_FULL_NAME = "full_name";
const FIELD_PHONE = "phone_number";
const FIELD_EMAIL = "email";

export type MappedMetaLead = {
  name: string | null;
  phone: string | null;
  email: string | null;
  /** Campos que llegaron y no sabemos traducir. Se reportan, no se pierden. */
  unknownFields: string[];
};

function firstValue(entry: MetaLeadFieldEntry): string {
  const value = entry.values?.[0];
  return typeof value === "string" ? value : "";
}

/**
 * Traduce el `field_data` de Meta al vocabulario de `Lead`, reutilizando las
 * mismas normalizaciones que usa el alta pública del portal para que un lead de
 * Meta y uno del sitio web queden guardados igual.
 *
 * Es la ÚNICA implementación del mapeo: la usan tanto el webhook como la
 * resolución manual de un lead en andén. Duplicarla dejaría dos leads con la
 * misma procedencia guardados distinto según por dónde entraron.
 */
export function mapMetaLeadFields(
  fieldData: MetaLeadFieldEntry[],
): MappedMetaLead {
  let name: string | null = null;
  let phone: string | null = null;
  let email: string | null = null;
  const unknownFields: string[] = [];

  for (const entry of fieldData ?? []) {
    if (!entry || typeof entry.name !== "string") continue;
    const raw = firstValue(entry);

    switch (entry.name) {
      case FIELD_FULL_NAME: {
        const clean = sanitizeText(raw);
        name = clean || null;
        break;
      }
      case FIELD_PHONE: {
        const clean = normalizePhone(raw);
        phone = clean || null;
        break;
      }
      case FIELD_EMAIL: {
        const clean = raw.trim().toLowerCase();
        email = clean || null;
        break;
      }
      default:
        unknownFields.push(entry.name);
    }
  }

  return { name, phone, email, unknownFields };
}

/**
 * Por qué un lead mapeado todavía no puede ser un `Lead`. `Lead.name` y
 * `Lead.phone` son obligatorios en la base, así que un formulario que no
 * pregunte nombre o teléfono no produce un lead válido por mucho que su página
 * esté mapeada.
 */
export type MetaLeadCompleteness =
  | { ok: true; name: string; phone: string; email: string | null }
  | { ok: false; missing: ("nombre" | "teléfono")[] };

/** Mínimo de dígitos que el CRM ya exige en el alta pública de un lead. */
const MIN_PHONE_DIGITS = 8;

export function checkMetaLeadCompleteness(
  mapped: MappedMetaLead,
): MetaLeadCompleteness {
  const { name, phone, email } = mapped;
  const missing: ("nombre" | "teléfono")[] = [];

  if (!name) missing.push("nombre");
  if (!phone || phone.length < MIN_PHONE_DIGITS) missing.push("teléfono");

  // Las dos primeras comprobaciones son las que estrechan el tipo; `missing`
  // sólo transporta el motivo hacia el mensaje que ve el operador.
  if (!name || !phone || missing.length > 0) return { ok: false, missing };

  return { ok: true, name, phone, email };
}

/**
 * Canal de origen del lead. Reutiliza los valores que la taxonomía del CRM ya
 * tiene (`src/data/operations/leads.ts`); no se inventa uno nuevo para Meta.
 *
 * `platform` ausente cae en "Facebook Ads": Lead Ads es un producto de páginas
 * de Facebook y el webhook identifica el origen con un `page_id` de Facebook.
 */
export function metaOriginChannel(platform: string | undefined): string {
  const value = (platform ?? "").trim().toLowerCase();
  if (value === "ig" || value === "instagram") return "Instagram Ads";
  return "Facebook Ads";
}

/**
 * `field_data` guardado en una columna JSON vuelve como `unknown`. Se estrecha
 * aquí, una sola vez, para que el andén y el panel lean la misma forma.
 */
export function asMetaFieldEntries(value: unknown): MetaLeadFieldEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: MetaLeadFieldEntry[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string") continue;
    entries.push({
      name: record.name,
      values: Array.isArray(record.values)
        ? record.values.filter((v): v is string => typeof v === "string")
        : [],
    });
  }
  return entries;
}

// --- DTOs del panel -------------------------------------------------------

export type MetaPageBranchDTO = {
  id: string;
  pageId: string;
  label: string | null;
  branchId: string;
  branchCode: string;
  branchName: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Un lead en andén, visto desde el panel.
 *
 * **Sin datos de contacto a propósito.** El repositorio ya sostiene que
 * Marketing mide campañas sin ver la identidad del lead
 * (`canViewLeadAttribution`, `MarketingLeadAttributionDTO`), y quien resuelve
 * esta fila sólo necesita saber de qué página vino para decidir la sucursal —
 * la decisión la toma la página, no la persona. Los valores siguen guardados en
 * `fetchedFields` y llegan al `Lead` al resolver.
 */
export type MetaUnmappedLeadDTO = {
  id: string;
  leadgenId: string;
  pageId: string;
  formId: string;
  receivedAt: string;
  /** Nombres de las preguntas que llegaron; nunca sus respuestas. */
  capturedFields: string[];
  /** Si con lo capturado alcanza para crear un `Lead`. */
  isComplete: boolean;
  missingFields: string[];
};

export type MetaPageBranchInput = {
  pageId: string;
  branchCode: string;
  label: string | null;
  isActive: boolean;
};

export type BranchChoice = { id: string; code: string; name: string };
