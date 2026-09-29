/**
 * Patch CRM-INT1 — permisos delegados, tipos y etiquetas puros.
 *
 * El rol decide qué ve una persona; esto decide qué puede **modificar** un
 * usuario de Marketing y en qué sucursales. Ver `UserPermissionGrant` en el
 * esquema.
 */

export type DelegatedPermissionValue =
  | "MARKETING_GESTIONAR_CAMPANAS"
  | "MARKETING_REPORTAR_LEADS"
  | "MARKETING_GESTIONAR_INTEGRACIONES";

export const delegatedPermissionValues: DelegatedPermissionValue[] = [
  "MARKETING_GESTIONAR_CAMPANAS",
  "MARKETING_REPORTAR_LEADS",
  "MARKETING_GESTIONAR_INTEGRACIONES",
];

export const delegatedPermissionLabels: Record<DelegatedPermissionValue, string> = {
  MARKETING_GESTIONAR_CAMPANAS: "Crear y editar campañas",
  MARKETING_REPORTAR_LEADS: "Reportar leads por campaña",
  MARKETING_GESTIONAR_INTEGRACIONES: "Gestionar la integración con Meta",
};

export const delegatedPermissionHints: Record<DelegatedPermissionValue, string> = {
  MARKETING_GESTIONAR_CAMPANAS:
    "Una campaña para todas las sucursales exige el permiso en todas.",
  MARKETING_REPORTAR_LEADS:
    "La cifra que Marketing registra por sucursal para conciliar con el CRM.",
  MARKETING_GESTIONAR_INTEGRACIONES:
    "Páginas y leads pendientes de Meta por sucursal; las cuentas publicitarias exigen todas.",
};

export function isDelegatedPermissionValue(
  value: string,
): value is DelegatedPermissionValue {
  return delegatedPermissionValues.includes(value as DelegatedPermissionValue);
}

/** Cómo alcanza una concesión: a nadie, a todas las sucursales o a algunas. */
export type GrantMode = "NONE" | "ALL" | "BRANCHES";

/** Un usuario de Marketing con lo que puede modificar. */
export type MarketingUserGrantsDTO = {
  userId: string;
  name: string;
  email: string;
  isActive: boolean;
  grants: Record<
    DelegatedPermissionValue,
    { mode: GrantMode; branchCodes: string[] }
  >;
};
