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
  | "periodo-invalido"
  | "moneda-desconocida"
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
    "periodo-invalido": "El periodo solicitado no es uno de los cinco del panel.",
    "moneda-desconocida":
      "No se sabe en qué moneda opera esa cuenta. Pulsa «Actualizar» en la cuenta para releer sus datos y vuelve a intentarlo.",
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

// --- Métricas (Patch Meta-4) ---------------------------------------------

/**
 * Los cinco periodos del tablero, en vocabulario del CRM.
 *
 * Es un conjunto fijo y no un selector de fechas libre: cada combinación
 * (cuenta × periodo) es una foto guardada, y un rango libre multiplicaría las
 * fotos por infinito sin que nadie las volviera a mirar.
 */
export type MetaAdDatePresetValue =
  | "HOY"
  | "ULTIMOS_7D"
  | "ULTIMOS_30D"
  | "ESTE_MES"
  | "MES_PASADO";

export const metaAdDatePresetValues: MetaAdDatePresetValue[] = [
  "HOY",
  "ULTIMOS_7D",
  "ULTIMOS_30D",
  "ESTE_MES",
  "MES_PASADO",
];

export const metaAdDatePresetLabels: Record<MetaAdDatePresetValue, string> = {
  HOY: "Hoy",
  ULTIMOS_7D: "Últimos 7 días",
  ULTIMOS_30D: "Últimos 30 días",
  ESTE_MES: "Este mes",
  MES_PASADO: "Mes pasado",
};

/**
 * Traducción al `date_preset` literal de la API de Insights.
 *
 * Los cinco valores están verificados contra la referencia vigente de Meta, que
 * acepta: today, yesterday, this_month, last_month, this_quarter, maximum,
 * data_maximum, last_3d, last_7d, last_14d, last_28d, last_30d, last_90d,
 * last_week_mon_sun, last_week_sun_sat, last_quarter, last_year,
 * this_week_mon_today, this_week_sun_today, this_year.
 *
 * El vocabulario del CRM se mantiene aparte del de Meta a propósito: si Meta
 * renombra un preset, se cambia esta tabla y no las cinco pantallas que lo usan.
 */
export const metaAdDatePresetApiValues: Record<MetaAdDatePresetValue, string> = {
  HOY: "today",
  ULTIMOS_7D: "last_7d",
  ULTIMOS_30D: "last_30d",
  ESTE_MES: "this_month",
  MES_PASADO: "last_month",
};

export function isMetaAdDatePresetValue(
  value: string,
): value is MetaAdDatePresetValue {
  return metaAdDatePresetValues.includes(value as MetaAdDatePresetValue);
}

/**
 * Las cifras de una foto.
 *
 * `impressions` y `clicks` viajan como `number`: en la base son BIGINT, pero un
 * `bigint` de JavaScript no se puede serializar hacia un componente cliente, y
 * ninguna cuenta publicitaria se acerca de lejos a `Number.MAX_SAFE_INTEGER`.
 *
 * `spend`, `ctr` y `cpc` son `Decimal` en la base y `number` aquí, por lo mismo
 * y siguiendo lo que `MarketingCampaignDTO` ya hace con `estimatedBudget`: la
 * precisión se conserva donde se guarda, no donde se muestra.
 */
export type MetaAdMetricSnapshotDTO = {
  id: string;
  impressions: number;
  clicks: number;
  spend: number;
  currency: string;
  ctr: number;
  cpc: number | null;
  fetchedAt: string;
};

/**
 * Una fila del tablero.
 *
 * `snapshot` en `null` significa **«nunca se ha consultado este periodo»**, que
 * no es lo mismo que una foto con ceros («se consultó y no hubo actividad»). El
 * tablero los muestra distinto a propósito: una cuenta sin refrescar no puede
 * parecer una cuenta sin gasto.
 */
export type MetaAdMetricRowDTO = {
  adAccountId: string;
  label: string | null;
  accountName: string | null;
  /** Moneda del registro; la de la foto puede diferir si Meta la cambió. */
  registryCurrency: string | null;
  snapshot: MetaAdMetricSnapshotDTO | null;
};

/** Lo que el tablero recibe del servidor, ya resuelto. */
export type MetaAdMetricsBoardDTO = {
  datePreset: MetaAdDatePresetValue;
  rows: MetaAdMetricRowDTO[];
};

/** Resultado de refrescar varias cuentas de una vez. */
export type MetaAdRefreshSummary = {
  ok: boolean;
  refreshed: number;
  failures: { adAccountId: string; error: string }[];
};

/**
 * «hace 5 minutos», para que un número de la pantalla lleve siempre su edad.
 *
 * El repositorio no tenía ningún formateador relativo —sólo cadenas fijas en los
 * datos de demostración heredados—, así que se escribe aquí, en la capa pura,
 * donde el tablero y cualquier pantalla futura lo comparten.
 */
export function formatRelativeTime(
  value: string | Date,
  now: Date = new Date(),
): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "fecha desconocida";

  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 0) return "recién";
  if (seconds < 60) return "hace unos segundos";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;

  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;

  const months = Math.round(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;

  const years = Math.round(months / 12);
  return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

// --- La ventana de fechas, del lado del CRM (Patch Attribution-1) ---------

/**
 * El periodo resuelto a un intervalo `[desde, hasta)` **medio abierto**.
 *
 * Medio abierto y no `[desde, hasta]` porque el extremo cerrado obliga a elegir
 * un último instante —¿23:59:59? ¿.999?— y siempre deja fuera un trozo del
 * último día. `< hasta` no tiene ese problema.
 */
export type MetaAdDateRange = { from: Date; to: Date };

/**
 * Traduce uno de los cinco periodos a un intervalo de fechas real.
 *
 * ## Por qué esto no existía hasta ahora
 *
 * Meta-4 **nunca calcula una ventana**: manda el `date_preset` literal al Graph
 * API (`metaAdDatePresetApiValues`) y es Meta quien decide qué días entran. El
 * tablero de métricas no necesita saberlo porque no filtra nada suyo.
 *
 * Attribution-1 sí: los leads y las ventas están en **nuestra** base y hay que
 * contarlos entre dos fechas concretas. Ésta es la primera vez que el CRM tiene
 * que expresar los cinco periodos en fechas, y vive aquí —junto al vocabulario
 * que traduce— para que haya **un solo sitio** que decida qué significa cada uno.
 *
 * ## Las dos mitades del informe las mide gente distinta
 *
 * El gasto lo calculó Meta, en la zona horaria de la cuenta publicitaria. Los
 * leads y las ventas los cuenta esta función, en la hora del servidor. Comparten
 * el nombre del periodo, no el reloj: un coste por lead puede desviarse por las
 * horas de diferencia entre ambos. Es inherente a cruzar dos sistemas y se dice
 * en pantalla en vez de disimularse.
 *
 * ## Qué se entiende por «últimos N días»
 *
 * **Hoy cuenta.** `ULTIMOS_7D` es hoy y los seis días anteriores, no los siete
 * días que terminan ayer. Se elige así porque es lo que hace `last_7d` en la API
 * de Insights, que es con quien se compara la cifra de la izquierda; si algún
 * día se comprueba que Meta cuenta de otra forma, **se cambia aquí y en ningún
 * sitio más**.
 *
 * @param now Inyectable para que las pruebas no dependan del reloj real.
 */
export function resolveMetaAdDatePresetRange(
  preset: MetaAdDatePresetValue,
  now: Date = new Date(),
): MetaAdDateRange {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfTomorrow = addDays(startOfToday, 1);

  switch (preset) {
    case "HOY":
      return { from: startOfToday, to: startOfTomorrow };
    case "ULTIMOS_7D":
      return { from: addDays(startOfToday, -6), to: startOfTomorrow };
    case "ULTIMOS_30D":
      return { from: addDays(startOfToday, -29), to: startOfTomorrow };
    case "ESTE_MES":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      };
    case "MES_PASADO":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 1),
      };
  }
}

/**
 * Suma días sobre la fecha local. El constructor de `Date` normaliza el
 * desbordamiento, así que el 31 de enero menos 29 días cae en enero sin que haya
 * que saber cuántos días tiene cada mes.
 */
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
