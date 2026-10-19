export const crmFinanceKinds = {
  PAYABLE_INVOICE: "Factura de proveedor",
  PAYABLE_PAYMENT: "Pago a proveedor",
  RECEIVABLE_COLLECTION: "Cobro de cuenta por cobrar",
  BANK_IN: "Ingreso bancario",
  BANK_OUT: "Egreso bancario",
  CASH_IN: "Ingreso de caja administrativa",
  CASH_OUT: "Egreso de caja administrativa",
  ASSET_ACQUISITION: "Alta de activo fijo",
  ASSET_DISPOSAL: "Baja de activo sin recuperación",
  DEPRECIATION: "Depreciación mensual",
  TAX: "Impuesto o retención",
  ADJUSTMENT: "Ajuste contable",
} as const;
export const crmFinanceSections = {
  resumen: "Resumen financiero", obligaciones: "Cuentas por pagar", cobros: "Cuentas por cobrar",
  tesoreria: "Tesorería y extractos", caja: "Caja administrativa", activos: "Activos fijos",
  impuestos: "Auxiliares tributarios", aprobaciones: "Revisión y aprobaciones", cierres: "Control de cierre",
  documentos: "Centro de documentos", configuracion: "Configuración contable",
} as const;
export type CrmFinanceSection = keyof typeof crmFinanceSections;
export const crmFinanceStatusLabels = { DRAFT: "Borrador", IN_REVIEW: "En revisión", APPROVED: "Aprobado", POSTED: "Contabilizado", REVERSED: "Revertido", REJECTED: "Devuelto / retirado" } as const;
export type CrmFinanceDraft = {
  requestKey: string; kind: string; branchId: string; thirdPartyId?: string;
  parentId?: string; receivableId?: string; bankAccountId?: string; cashSessionId?: string;
  debitAccountId: string; creditAccountId: string; date: string; dueDate?: string;
  currency: string; exchangeRate: string; amount: string; reference: string; description: string;
  usefulLifeMonths?: number; residualAmount?: string; taxBase?: string; taxRate?: string; certificate?: string; attachmentUrl?: string;
  fxAccountId?: string; cashFlowClass?: string;
};
