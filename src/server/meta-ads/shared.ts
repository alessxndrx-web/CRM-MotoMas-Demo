/**
 * Capa pura y segura para el cliente del registro de cuentas publicitarias:
 * validación del identificador, catálogo de estados y DTOs. Sin `import` de la
 * base de datos, para que el panel reutilice las formas y valide en pantalla con
 * la misma regla que el servidor.
 *
 * Vive en `src/server/meta-ads/` y no en `src/server/meta/`: aquello es Lead Ads
 * y entra por webhook; esto se lee del Graph API con llamadas GET. Comparten
 * proveedor, no mecanismo.
 *
 * Este módulo es de **sólo lectura y conexión**. No crea campañas, no las pausa,
 * no toca presupuestos y no gasta dinero.
 */

/**
 * El identificador de cuenta publicitaria en su forma literal `act_` + dígitos.
 *
 * Se guarda y se valida CON el prefijo porque es exactamente lo que el Graph API
 * espera como ruta del nodo (`GET /act_123…`). Guardarlo sin él obligaría a
 * recomponerlo en cada llamada y a acertar siempre.
 */
const AD_ACCOUNT_ID_PATTERN = /^act_\d+$/;

/** Tope defensivo: un `act_` legítimo son ~20 caracteres. */
const MAX_AD_ACCOUNT_ID = 40;

export function isValidAdAccountId(value: string): boolean {
  const clean = (value ?? "").trim();
  if (!clean || clean.length > MAX_AD_ACCOUNT_ID) return false;
  return AD_ACCOUNT_ID_PATTERN.test(clean);
}

export function normalizeAdAccountId(value: string): string | null {
  const clean = (value ?? "").trim();
  return isValidAdAccountId(clean) ? clean : null;
}

/**
 * `account_status` llega del Graph API como entero sin signo. Se guarda como
 * texto (la columna es `String?`) y se traduce aquí para la pantalla.
 *
 * Códigos documentados por Meta. Uno que no esté en la tabla se muestra tal cual
 * en vez de inventarle un nombre: Meta puede añadir estados, y una etiqueta
 * adivinada sería peor que el número crudo.
 */
export const adAccountStatusLabels: Record<string, string> = {
  "1": "Activa",
  "2": "Deshabilitada",
  "3": "Sin liquidar",
  "7": "Revisión de riesgo pendiente",
  "8": "Liquidación pendiente",
  "9": "Periodo de gracia",
  "100": "Cierre pendiente",
  "101": "Cerrada",
};

export function adAccountStatusLabel(status: string | null): string {
  if (!status) return "Sin dato";
  return adAccountStatusLabels[status] ?? `Código ${status}`;
}

/** Sólo el código 1 significa que la cuenta puede entregar anuncios. */
export function isAdAccountHealthy(status: string | null): boolean {
  return status === "1";
}

// --- Errores tipados ------------------------------------------------------

/**
 * Por qué falló una conexión. La pantalla los distingue: un identificador mal
 * escrito lo arregla quien lo pegó, mientras que "el token no tiene acceso" es
 * un permiso que hay que conceder en el Business Manager y que esa persona
 * quizá no pueda tocar.
 */
export type MetaAdAccountErrorCode =
  | "identificador-invalido"
  | "sin-token-configurado"
  | "sin-acceso"
  | "ya-conectada"
  | "no-encontrada"
  | "etiqueta-invalida"
  | "graph-api";

export const metaAdAccountErrorMessages: Record<MetaAdAccountErrorCode, string> =
  {
    "identificador-invalido":
      'El identificador debe tener la forma "act_" seguida de dígitos, por ejemplo act_1234567890.',
    "sin-token-configurado":
      "META_MARKETING_ACCESS_TOKEN no configurado. El servidor no tiene credenciales para consultar la API de Marketing.",
    "sin-acceso":
      "El token no tiene acceso a esa cuenta publicitaria, o la cuenta no existe. Concédele acceso al Usuario del Sistema desde el Business Manager y vuelve a intentarlo.",
    "ya-conectada": "Esa cuenta publicitaria ya está conectada.",
    "no-encontrada": "La cuenta publicitaria no está en el registro.",
    "etiqueta-invalida": "El nombre es demasiado largo.",
    "graph-api": "Meta no pudo responder la consulta.",
  };

export type MetaAdAccountResult =
  | { ok: true; id: string }
  | { ok: false; code: MetaAdAccountErrorCode; error: string };

// --- DTOs -----------------------------------------------------------------

export type MetaAdAccountDTO = {
  id: string;
  adAccountId: string;
  label: string | null;
  accountName: string | null;
  currency: string | null;
  accountStatus: string | null;
  accountStatusLabel: string;
  isHealthy: boolean;
  isActive: boolean;
  connectedAt: string;
  lastSyncedAt: string | null;
};

/** Lo que el Graph API devuelve del nodo de la cuenta. */
export type MetaAdAccountMetadata = {
  accountName: string | null;
  currency: string | null;
  accountStatus: string | null;
};

export const MAX_AD_ACCOUNT_LABEL = 120;
