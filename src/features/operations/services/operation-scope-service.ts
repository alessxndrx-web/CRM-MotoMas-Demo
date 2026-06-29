import type {
  CustomerFileRecord,
  CustomerRecord,
} from "@/data/operations/customer-files";
import type { PublicLead } from "@/data/operations/leads";
import type { ReservationRecord } from "@/data/operations/reservations";
import type { SaleRecord } from "@/data/operations/sales";
import type { TransferOrder } from "@/data/operations/transfers";
import type { InventoryUnit } from "@/data/operations/inventory";
import type { ActivityRecord } from "@/data/operations/activities";
import type { QuoteRecord } from "@/data/operations/quotes";
import type { CustomerFileDocumentRecord } from "@/data/operations/customer-file-documents";
import type { CreditApplicationRecord } from "@/data/operations/credit-applications";
import type { DemoSession } from "@/features/operations/types";

export function filterLeadsBySession(
  leads: PublicLead[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return leads;

  if (session.role === "Gerente") {
    return leads.filter((lead) => lead.sucursalDeseada === session.branchId);
  }

  return leads.filter((lead) => isLeadAssignedToSessionSeller(lead, session));
}

export function filterCustomerFilesBySession(
  files: CustomerFileRecord[],
  leads: PublicLead[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return files;

  if (session.role === "Gerente") {
    return files.filter((file) => file.sucursalId === session.branchId);
  }

  return files.filter((file) => {
    const relatedLead = leads.find((lead) => lead.id === file.leadId);

    return (
      file.vendedor === session.userName ||
      Boolean(relatedLead && isLeadAssignedToSessionSeller(relatedLead, session))
    );
  });
}

export function filterCustomersBySession(
  customers: CustomerRecord[],
  files: CustomerFileRecord[],
  leads: PublicLead[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return customers;

  const scopedFiles = filterCustomerFilesBySession(files, leads, session);
  const scopedCustomerIds = new Set(scopedFiles.map((file) => file.clienteId));

  if (session.role === "Gerente") {
    return customers.filter(
      (customer) =>
        customer.sucursalOrigenId === session.branchId ||
        scopedCustomerIds.has(customer.id) ||
        customer.historialInteracciones.some(
          (interaction) => interaction.sucursalId === session.branchId,
        ),
    );
  }

  const scopedLeads = filterLeadsBySession(leads, session);
  const scopedLeadIds = new Set(scopedLeads.map((lead) => lead.id));
  const scopedLeadCustomerIds = new Set(
    scopedLeads
      .map((lead) => lead.clienteId)
      .filter((customerId): customerId is string => Boolean(customerId)),
  );

  return customers.filter(
    (customer) =>
      scopedCustomerIds.has(customer.id) ||
      scopedLeadCustomerIds.has(customer.id) ||
      scopedLeadIds.has(customer.origenLeadId) ||
      customer.historialInteracciones.some(
        (interaction) =>
          interaction.vendedor === session.userName ||
          (interaction.leadId ? scopedLeadIds.has(interaction.leadId) : false),
      ),
  );
}

export function filterReservationsBySession(
  reservations: ReservationRecord[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return reservations;

  if (session.role === "Gerente") {
    return reservations.filter(
      (reservation) => reservation.sucursalId === session.branchId,
    );
  }

  return reservations.filter(
    (reservation) => reservation.vendedorId === session.userId,
  );
}

export function filterTransferOrdersBySession(
  orders: TransferOrder[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return orders;

  if (session.role === "Gerente") {
    return orders.filter(
      (order) =>
        order.sucursalOrigenId === session.branchId ||
        order.sucursalDestinoId === session.branchId,
    );
  }

  return orders.filter((order) => order.solicitanteId === session.userId);
}

export function filterSalesBySession(
  sales: SaleRecord[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return sales;

  if (session.role === "Gerente") {
    return sales.filter((sale) => sale.sucursalId === session.branchId);
  }

  return sales.filter((sale) => sale.vendedorId === session.userId);
}

export function filterActivitiesBySession(
  activities: ActivityRecord[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return activities;
  if (session.role === "Gerente") {
    return activities.filter((activity) => activity.sucursalId === session.branchId);
  }

  return activities.filter((activity) => activity.vendedorId === session.userId);
}

export function filterQuotesBySession(
  quotes: QuoteRecord[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return quotes;
  if (session.role === "Gerente") {
    return quotes.filter((quote) => quote.sucursalId === session.branchId);
  }

  return quotes.filter((quote) => quote.vendedorId === session.userId);
}

export function filterCustomerFileDocumentsBySession(
  documents: CustomerFileDocumentRecord[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return documents;
  if (session.role === "Gerente") {
    return documents.filter((document) => document.sucursalId === session.branchId);
  }

  return documents.filter((document) => document.vendedorId === session.userId);
}

export function filterCreditApplicationsBySession(
  credits: CreditApplicationRecord[],
  session: DemoSession | null,
) {
  if (!session) return [];
  if (session.role === "Administrador") return credits;
  if (session.role === "Gerente") {
    return credits.filter((credit) => credit.sucursalId === session.branchId);
  }

  return credits.filter((credit) => credit.vendedorId === session.userId);
}

export function filterInventoryUnitsBySession(
  units: InventoryUnit[],
  session: DemoSession | null,
) {
  if (!session) return [];

  if (session.role === "Gerente") {
    return units.filter((unit) => unit.sucursalActualId === session.branchId);
  }

  return units;
}

export function filterBranchInventoryUnits(
  units: InventoryUnit[],
  session: DemoSession | null,
) {
  if (!session || session.branchId === "all") return [];

  return units.filter((unit) => unit.sucursalActualId === session.branchId);
}

export function isLeadAssignedToSessionSeller(
  lead: PublicLead,
  session: DemoSession,
) {
  return (
    session.role === "Vendedor" &&
    lead.sucursalDeseada === session.branchId &&
    (lead.vendedorAsignado === session.userName ||
      lead.creadoPorUsuarioId === session.userId)
  );
}
