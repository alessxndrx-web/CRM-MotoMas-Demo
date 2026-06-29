export const storageKeys = {
  publicLeads: "motomas-public-leads-v1",
  customers: "motomas-customers-v1",
  customerFiles: "motomas-customer-files-v1",
  inventoryUnits: "motomas-inventory-units-v1",
  transferOrders: "motomas-transfer-orders-v1",
  reservations: "motomas-reservations-v1",
  sales: "motomas-sales-v1",
  quotes: "motomas-quotes-v1",
  expedientDocuments: "motomas-expedient-documents-v1",
  creditApplications: "motomas-credit-applications-v1",
  activities: "motomas-activities-v1",
  marketingCampaigns: "motomas-marketing-campaigns-v1",
  demoSession: "motomas-demo-session-v1",
} as const;

export const demoPersistenceKeys = [
  storageKeys.publicLeads,
  storageKeys.customers,
  storageKeys.customerFiles,
  storageKeys.inventoryUnits,
  storageKeys.transferOrders,
  storageKeys.reservations,
  storageKeys.sales,
  storageKeys.quotes,
  storageKeys.expedientDocuments,
  storageKeys.creditApplications,
  storageKeys.activities,
  storageKeys.marketingCampaigns,
  storageKeys.demoSession,
] as const;

export type DemoPersistenceKey = (typeof demoPersistenceKeys)[number];
