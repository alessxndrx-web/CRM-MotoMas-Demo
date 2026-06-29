import type {
  DesiredBranchId,
  LeadOriginChannel,
  PublicLead,
} from "@/data/operations/leads";

export type LeadRequestFormValues = {
  nombre: string;
  telefono: string;
  cedula: string;
  correo: string;
  motoSlug: string;
  sucursalDeseada: DesiredBranchId | "";
  canalOrigen: LeadOriginChannel | "";
};

export type CreatedLeadSummary = Pick<
  PublicLead,
  "id" | "estado" | "motoInteres" | "sucursalNombre" | "fechaCreacion"
>;
