import type { OperationRole } from "@/features/operations/types";

export type ModuleIntro = {
  eyebrow: string;
  title: string;
  description: string;
};

const accountingIntroByRole: Record<OperationRole, ModuleIntro> = {
  Administrador: {
    eyebrow: "Supervisión financiera",
    title: "Control contable",
    description:
      "Consulta el estado contable, cierres, documentos y reportes financieros de todas las sucursales.",
  },
  Contador: {
    eyebrow: "Contabilidad",
    title: "Centro de control contable",
    description:
      "Revisa documentos, registra asientos, concilia bancos y cierra los periodos contables.",
  },
  Gerente: {
    eyebrow: "Supervisión de sucursal",
    title: "Consulta contable",
    description:
      "Consulta costos de inventario y reportes contables de tu sucursal.",
  },
  Cajero: {
    eyebrow: "Contabilidad",
    title: "Área contable",
    description: "Área contable separada de la operación de caja.",
  },
  Vendedor: {
    eyebrow: "Contabilidad",
    title: "Área contable",
    description: "Área contable restringida al equipo financiero.",
  },
};

const cashierIntroByRole: Record<OperationRole, ModuleIntro> = {
  Administrador: {
    eyebrow: "Supervisión de caja",
    title: "Control de caja",
    description:
      "Supervisa la operación de caja, revisa cierres y consulta los documentos emitidos.",
  },
  Cajero: {
    eyebrow: "Caja operativa",
    title: "Estación de caja",
    description:
      "Emite facturas, recibos y notas del turno, y prepara el cierre de la jornada.",
  },
  Gerente: {
    eyebrow: "Supervisión de sucursal",
    title: "Control de caja",
    description: "Consulta la operación de caja de tu sucursal.",
  },
  Contador: {
    eyebrow: "Caja",
    title: "Documentos de caja",
    description: "Consulta los documentos que Caja emite para revisión contable.",
  },
  Vendedor: {
    eyebrow: "Caja",
    title: "Área de caja",
    description: "Área de caja restringida al personal autorizado.",
  },
};

export function accountingIntro(role: OperationRole): ModuleIntro {
  return accountingIntroByRole[role];
}

export function cashierIntro(role: OperationRole): ModuleIntro {
  return cashierIntroByRole[role];
}

/** Single context line shown under the page title in the shell header. */
const shellSubtitleByRole: Record<OperationRole, string> = {
  Administrador: "Supervisión, control y configuración del sistema.",
  Gerente: "Supervisión comercial de tu sucursal.",
  Vendedor: "Gestión comercial de tu cartera.",
  Cajero: "Operación diaria de caja.",
  Contador: "Ejecución y control contable.",
};

export function shellSubtitle(role: OperationRole): string {
  return shellSubtitleByRole[role];
}

/**
 * The owner sees supervision-first grouping; every other role keeps the
 * operational labels. Only labels and order change — never the items or roles.
 */
const adminGroupLabels: Record<string, string> = {
  Inicio: "Panel general",
  "Gestión Comercial": "Registros comerciales",
  Supervisión: "Supervisión comercial",
  Sistema: "Configuración",
};

const adminGroupOrder = [
  "Inicio",
  "Supervisión",
  "Operación",
  "Finanzas",
  "Gestión Comercial",
  "Sistema",
];

export function navGroupLabelForRole(
  groupKey: string,
  role: OperationRole,
): string | null {
  if (groupKey === "Inicio") {
    return role === "Administrador" ? adminGroupLabels.Inicio : null;
  }
  if (role === "Administrador") return adminGroupLabels[groupKey] ?? groupKey;
  return groupKey;
}

export function navGroupRank(groupKey: string, role: OperationRole): number {
  if (role !== "Administrador") return 0;
  const index = adminGroupOrder.indexOf(groupKey);
  return index === -1 ? adminGroupOrder.length : index;
}
