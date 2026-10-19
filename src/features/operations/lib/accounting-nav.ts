export const crmFinanceSections = {
  resumen: "Resumen financiero", obligaciones: "Cuentas por pagar", cobros: "Cuentas por cobrar",
  tesoreria: "Tesorería y extractos", caja: "Caja administrativa", activos: "Activos fijos",
  impuestos: "Auxiliares tributarios", aprobaciones: "Revisión y aprobaciones", cierres: "Control de cierre",
  documentos: "Centro de documentos", configuracion: "Configuración contable",
} as const;

export type CrmFinanceSection = keyof typeof crmFinanceSections;

// La barra de escritorio y el cajón móvil comparten las mismas rutas y etiquetas.
export const accountingNavigation = [
  ...Object.entries(crmFinanceSections).map(([key, label]) => ({ href: `/panel/contabilidad/gestion/${key}`, label })),
  ...[
    ["catalogo-cuentas", "Catálogo de cuentas"], ["diarios", "Asientos manuales"],
    ["documentos", "Documentos de origen"], ["terceros", "Terceros"], ["gastos", "Gastos"],
    ["planilla", "Planilla"], ["liquidaciones", "Liquidaciones IVA"], ["inventario", "Inventario contable"],
    ["comprobantes", "Comprobantes"], ["reportes", "Libro y estados"], ["bancos", "Cuentas bancarias"],
  ].map(([key, label]) => ({ href: `/panel/contabilidad/${key}`, label })),
];
