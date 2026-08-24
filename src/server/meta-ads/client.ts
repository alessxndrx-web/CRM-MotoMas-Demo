import {
  metaAdDatePresetApiValues,
  type MetaAdAccountErrorCode,
  type MetaAdAccountMetadata,
  type MetaAdDatePresetValue,
} from "@/server/meta-ads/shared";

/**
 * Lecturas del Graph API sobre cuentas publicitarias.
 *
 * **Sólo lectura.** Este módulo hace un `GET` y nada más: no crea campañas, no
 * las pausa, no cambia presupuestos y no mueve dinero. No existe aquí ninguna
 * llamada `POST` a la Marketing API, y no debe existir mientras el token siga
 * teniendo sólo `ads_read`.
 *
 * El token se lee con `process.env` en el punto de uso, igual que `getSecret()`
 * en `src/server/auth/session.ts` y que el resto de credenciales de Meta.
 */

/**
 * Versión fijada, independiente de la de Lead Ads y la de WhatsApp: son tres
 * productos con contratos distintos y subir uno no debe obligar a revalidar los
 * otros. Al subirla, revisar la forma de `account_status`.
 */
const GRAPH_API_VERSION = "v23.0";
const GRAPH_API_HOST = "https://graph.facebook.com";

/** Lo mínimo para saber qué cuenta es y en qué estado está. */
const AD_ACCOUNT_FIELDS = "name,currency,account_status";

export type MetaAdAccountFetch =
  | { ok: true; metadata: MetaAdAccountMetadata }
  | { ok: false; code: MetaAdAccountErrorCode; detail: string };

/**
 * Token de Usuario del Sistema con `ads_read`.
 *
 * **Nunca `ads_management`.** El permiso de escritura se pedirá más adelante,
 * junto con topes de gasto duros, no antes de que existan: un token que puede
 * gastar dinero antes de que haya nada que limite cuánto es un riesgo sin
 * contrapartida.
 */
function getMarketingToken(): string | null {
  return process.env.META_MARKETING_ACCESS_TOKEN || null;
}

export function hasMarketingToken(): boolean {
  return getMarketingToken() !== null;
}

/**
 * Trae el nodo de la cuenta. Esta llamada **es** la validación real de la
 * conexión: si el token no tiene acceso o la cuenta no existe, Meta responde un
 * error, y sin esta comprobación el registro aceptaría identificadores que no
 * sirven para nada y el fallo aparecería mucho después.
 */
export async function fetchAdAccountMetadata(
  adAccountId: string,
): Promise<MetaAdAccountFetch> {
  const token = getMarketingToken();
  if (!token) {
    return {
      ok: false,
      code: "sin-token-configurado",
      detail: "META_MARKETING_ACCESS_TOKEN no configurado",
    };
  }

  const url = new URL(`${GRAPH_API_HOST}/${GRAPH_API_VERSION}/${adAccountId}`);
  url.searchParams.set("fields", AD_ACCOUNT_FIELDS);
  url.searchParams.set("access_token", token);

  let response: Response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch (error) {
    return {
      ok: false,
      code: "graph-api",
      detail: `no se pudo contactar la API: ${
        error instanceof Error ? error.message : "desconocido"
      }`,
    };
  }

  if (!response.ok) {
    /*
     * Meta responde 400 tanto para "no existe" como para "no tienes acceso" —
     * a propósito, para no confirmar la existencia de una cuenta ajena. Los dos
     * se resuelven igual (concederle acceso al Usuario del Sistema), así que se
     * presentan como el mismo caso en vez de inventar una distinción que la API
     * no hace.
     */
    const detail = await shortErrorDetail(response);
    const code: MetaAdAccountErrorCode =
      response.status === 400 || response.status === 403 ? "sin-acceso" : "graph-api";
    return { ok: false, code, detail };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: "graph-api", detail: "respuesta ilegible" };
  }

  if (typeof body !== "object" || body === null) {
    return { ok: false, code: "graph-api", detail: "respuesta ilegible" };
  }

  const record = body as Record<string, unknown>;
  return {
    ok: true,
    metadata: {
      accountName: typeof record.name === "string" ? record.name : null,
      currency: typeof record.currency === "string" ? record.currency : null,
      // `account_status` llega como entero; se guarda como texto porque la
      // columna es `String?` y porque el código es un identificador, no una
      // magnitud con la que se vaya a operar.
      accountStatus:
        typeof record.account_status === "number"
          ? String(record.account_status)
          : typeof record.account_status === "string"
            ? record.account_status
            : null,
    },
  };
}

/**
 * El mensaje corto del error de Meta. Nunca la respuesta completa: el cuerpo de
 * error puede repetir el token de la petición.
 */
async function shortErrorDetail(response: Response): Promise<string> {
  const base = `la API respondió ${response.status}`;
  try {
    const parsed: unknown = await response.json();
    const message = (parsed as { error?: { message?: unknown } })?.error?.message;
    if (typeof message === "string" && message) return `${base}: ${message}`;
  } catch {
    // Un error sin JSON legible sigue siendo un error; basta con el estado.
  }
  return base;
}

// --- Insights (Patch Meta-4) ---------------------------------------------

/**
 * Campos que se le piden al informe.
 *
 * `account_currency` va además de los cinco de negocio, y es una adición
 * deliberada: la foto guarda una moneda obligatoria, y tomarla de la caché del
 * registro la haría depender de un dato que pudo quedarse viejo. Pedirla en la
 * misma respuesta hace que la cifra y su moneda vengan del mismo sitio.
 */
const INSIGHTS_FIELDS = "impressions,clicks,spend,ctr,cpc,account_currency";

/** Lo que Meta devuelve por cada fila del informe, ya convertido. */
export type MetaAdInsights = {
  impressions: number;
  clicks: number;
  spend: string;
  ctr: string;
  cpc: string | null;
  currency: string | null;
  /** `true` cuando Meta respondió sin filas: se preguntó y no hubo actividad. */
  empty: boolean;
};

export type MetaAdInsightsFetch =
  | { ok: true; insights: MetaAdInsights }
  | { ok: false; code: MetaAdAccountErrorCode; detail: string };

/**
 * Números que llegan como texto. Meta serializa las métricas como cadenas
 * («"1234"», «"78.90"»), así que se conservan como texto hasta que Prisma las
 * convierte a `Decimal`: pasar por `number` a mitad de camino introduciría el
 * error de coma flotante que la columna `Decimal` existe para evitar.
 */
function asDecimalString(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function asCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/**
 * Lee el informe de una cuenta para un periodo.
 *
 * **Sigue siendo sólo lectura**: un `GET` más, con el mismo token `ads_read`.
 *
 * Una respuesta con `data: []` no es un error — es Meta diciendo que en ese
 * periodo no hubo entrega. Se devuelve como una foto de ceros marcada con
 * `empty`, porque «preguntamos y no hubo nada» es información, y perderla la
 * confundiría con «no hemos preguntado».
 */
export async function fetchAdAccountInsights(
  adAccountId: string,
  datePreset: MetaAdDatePresetValue,
): Promise<MetaAdInsightsFetch> {
  const token = getMarketingToken();
  if (!token) {
    return {
      ok: false,
      code: "sin-token-configurado",
      detail: "META_MARKETING_ACCESS_TOKEN no configurado",
    };
  }

  const url = new URL(
    `${GRAPH_API_HOST}/${GRAPH_API_VERSION}/${adAccountId}/insights`,
  );
  url.searchParams.set("fields", INSIGHTS_FIELDS);
  url.searchParams.set("date_preset", metaAdDatePresetApiValues[datePreset]);
  url.searchParams.set("access_token", token);

  let response: Response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch (error) {
    return {
      ok: false,
      code: "graph-api",
      detail: `no se pudo contactar la API: ${
        error instanceof Error ? error.message : "desconocido"
      }`,
    };
  }

  if (!response.ok) {
    const detail = await shortErrorDetail(response);
    const code: MetaAdAccountErrorCode =
      response.status === 400 || response.status === 403 ? "sin-acceso" : "graph-api";
    return { ok: false, code, detail };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, code: "graph-api", detail: "respuesta ilegible" };
  }

  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    return { ok: false, code: "graph-api", detail: "el informe no trae `data`" };
  }

  if (!data.length) {
    return {
      ok: true,
      insights: {
        impressions: 0,
        clicks: 0,
        spend: "0",
        ctr: "0",
        cpc: null,
        currency: null,
        empty: true,
      },
    };
  }

  const row = data[0] as Record<string, unknown>;
  const clicks = asCount(row.clicks);

  return {
    ok: true,
    insights: {
      impressions: asCount(row.impressions),
      clicks,
      spend: asDecimalString(row.spend, "0"),
      ctr: asDecimalString(row.ctr, "0"),
      // Sin clics no hay coste por clic. Meta omite el campo, y un 0 diría algo
      // distinto —«cada clic salió gratis»— que además es falso.
      cpc: clicks > 0 ? asDecimalString(row.cpc, "0") : null,
      currency:
        typeof row.account_currency === "string" && row.account_currency
          ? row.account_currency
          : null,
      empty: false,
    },
  };
}
