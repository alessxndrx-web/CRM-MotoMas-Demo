// MotoMas — Plantilla de catálogo de cuentas (Patch FF1.1)
//
// ESTA PLANTILLA NO ES EL CATÁLOGO DE MOTOMAS.
//
// Es un catálogo de referencia, de uso general, para empresas comerciales que
// venden motocicletas, repuestos y servicios de taller. Se siembra con
// `origin = PLANTILLA` y sin aprobar: ninguna cuenta admite movimientos hasta
// que la contabilidad de la empresa la apruebe explícitamente, y cualquiera
// puede renombrarse, desactivarse o archivarse antes de aprobarla.
//
// El contador de la empresa es quien decide qué se conserva, qué se renombra,
// qué se desactiva y qué falta. Nada de este archivo asume la estructura, la
// política contable ni el plan fiscal reales de MotoMas.
//
// Convenciones del archivo, para que agregar una cuenta no requiera repetir
// datos derivables:
//
//   - El tipo sale del primer dígito del código (1 activo … 6 gasto).
//   - La naturaleza sale del tipo, salvo `contra: true`, que la invierte
//     (depreciación acumulada, devoluciones sobre ventas, pérdidas acumuladas).
//   - El nivel sale de la cantidad de segmentos del código.
//   - La cuenta padre es el código sin su último segmento.
//   - Una cuenta con subcuentas es de agrupación y no admite movimientos.
//
// Referencias fiscales nicaragüenses (IVA, IR, INSS, INATEC, impuesto
// municipal) aparecen como nombres de cuenta, NO como reglas: FF1.1 no
// implementa impuestos, tasas ni cálculo tributario alguno.

export const CHART_ACCOUNT_TEMPLATE_VERSION = "MOTOMAS-TEMPLATE-2026.1";

/** Primer dígito del código → tipo de cuenta. */
export const TYPE_BY_CLASS = {
  1: "ACTIVO",
  2: "PASIVO",
  3: "PATRIMONIO",
  4: "INGRESO",
  5: "COSTO",
  6: "GASTO",
};

export const templateAccounts = [
  // ---------------------------------------------------------------- ACTIVO
  { code: "1", name: "Activo" },
  { code: "1.1", name: "Activo corriente" },

  { code: "1.1.01", name: "Efectivo y equivalentes de efectivo" },
  { code: "1.1.01.01", name: "Caja general" },
  { code: "1.1.01.02", name: "Caja chica" },
  { code: "1.1.01.03", name: "Fondo de cambio de caja" },
  { code: "1.1.01.04", name: "Efectivo en tránsito" },

  { code: "1.1.02", name: "Bancos" },
  { code: "1.1.02.01", name: "Bancos moneda nacional" },
  { code: "1.1.02.02", name: "Bancos moneda extranjera" },
  { code: "1.1.02.03", name: "Cuentas de ahorro" },
  { code: "1.1.02.04", name: "Inversiones temporales" },

  { code: "1.1.03", name: "Cuentas por cobrar comerciales" },
  { code: "1.1.03.01", name: "Clientes por venta de motocicletas" },
  { code: "1.1.03.02", name: "Clientes por venta de repuestos" },
  { code: "1.1.03.03", name: "Clientes por servicios de taller" },
  { code: "1.1.03.04", name: "Clientes por ventas a crédito propio" },
  { code: "1.1.03.05", name: "Documentos por cobrar" },
  { code: "1.1.03.06", name: "Cuentas por cobrar a financieras" },
  { code: "1.1.03.07", name: "Tarjetas de crédito por liquidar" },
  {
    code: "1.1.03.08",
    name: "Estimación para cuentas incobrables",
    contra: true,
  },

  { code: "1.1.04", name: "Otras cuentas por cobrar" },
  { code: "1.1.04.01", name: "Anticipos a proveedores" },
  { code: "1.1.04.02", name: "Cuentas por cobrar a empleados" },
  { code: "1.1.04.03", name: "Préstamos a empleados" },
  { code: "1.1.04.04", name: "Cuentas por cobrar a socios" },
  { code: "1.1.04.05", name: "Depósitos en garantía" },
  { code: "1.1.04.06", name: "Otras cuentas por cobrar diversas" },

  { code: "1.1.05", name: "Créditos fiscales y pagos anticipados de impuestos" },
  { code: "1.1.05.01", name: "IVA acreditable" },
  { code: "1.1.05.02", name: "IVA pagado en importaciones" },
  { code: "1.1.05.03", name: "Anticipo de IR" },
  { code: "1.1.05.04", name: "Retenciones de IR sufridas" },
  { code: "1.1.05.05", name: "Pago mínimo definitivo" },
  { code: "1.1.05.06", name: "Otros créditos fiscales" },

  { code: "1.1.06", name: "Inventarios" },
  { code: "1.1.06.01", name: "Motocicletas nuevas" },
  { code: "1.1.06.02", name: "Motocicletas usadas" },
  { code: "1.1.06.03", name: "Motocicletas en tránsito de importación" },
  { code: "1.1.06.04", name: "Repuestos y accesorios" },
  { code: "1.1.06.05", name: "Lubricantes y consumibles" },
  { code: "1.1.06.06", name: "Cascos y equipamiento de seguridad" },
  { code: "1.1.06.07", name: "Llantas y baterías" },
  { code: "1.1.06.08", name: "Mercadería en consignación" },
  { code: "1.1.06.09", name: "Inventario en traslado entre sucursales" },
  { code: "1.1.06.10", name: "Materiales y suministros de taller" },
  {
    code: "1.1.06.11",
    name: "Estimación por obsolescencia de inventario",
    contra: true,
  },

  { code: "1.1.07", name: "Gastos pagados por anticipado" },
  { code: "1.1.07.01", name: "Seguros pagados por anticipado" },
  { code: "1.1.07.02", name: "Alquileres pagados por anticipado" },
  { code: "1.1.07.03", name: "Papelería y útiles en existencia" },
  { code: "1.1.07.04", name: "Otros gastos pagados por anticipado" },

  { code: "1.2", name: "Activo no corriente" },

  { code: "1.2.01", name: "Propiedad, planta y equipo" },
  { code: "1.2.01.01", name: "Terrenos" },
  { code: "1.2.01.02", name: "Edificios e instalaciones" },
  { code: "1.2.01.03", name: "Mejoras en propiedades arrendadas" },
  { code: "1.2.01.04", name: "Mobiliario y equipo de oficina" },
  { code: "1.2.01.05", name: "Equipo de cómputo" },
  { code: "1.2.01.06", name: "Equipo y herramientas de taller" },
  { code: "1.2.01.07", name: "Vehículos y equipo de reparto" },
  { code: "1.2.01.08", name: "Motocicletas de demostración" },

  { code: "1.2.02", name: "Depreciación acumulada", contra: true },
  {
    code: "1.2.02.01",
    name: "Depreciación acumulada de edificios e instalaciones",
    contra: true,
  },
  {
    code: "1.2.02.02",
    name: "Depreciación acumulada de mejoras en propiedades arrendadas",
    contra: true,
  },
  {
    code: "1.2.02.03",
    name: "Depreciación acumulada de mobiliario y equipo de oficina",
    contra: true,
  },
  {
    code: "1.2.02.04",
    name: "Depreciación acumulada de equipo de cómputo",
    contra: true,
  },
  {
    code: "1.2.02.05",
    name: "Depreciación acumulada de equipo y herramientas de taller",
    contra: true,
  },
  {
    code: "1.2.02.06",
    name: "Depreciación acumulada de vehículos",
    contra: true,
  },
  {
    code: "1.2.02.07",
    name: "Depreciación acumulada de motocicletas de demostración",
    contra: true,
  },

  { code: "1.2.03", name: "Activos intangibles" },
  { code: "1.2.03.01", name: "Licencias de software" },
  { code: "1.2.03.02", name: "Marcas y derechos" },
  {
    code: "1.2.03.03",
    name: "Amortización acumulada de intangibles",
    contra: true,
  },

  { code: "1.2.04", name: "Otros activos no corrientes" },
  { code: "1.2.04.01", name: "Depósitos en garantía a largo plazo" },
  { code: "1.2.04.02", name: "Activos por impuestos diferidos" },

  // ---------------------------------------------------------------- PASIVO
  { code: "2", name: "Pasivo" },
  { code: "2.1", name: "Pasivo corriente" },

  { code: "2.1.01", name: "Proveedores" },
  { code: "2.1.01.01", name: "Proveedores de motocicletas" },
  { code: "2.1.01.02", name: "Proveedores de repuestos y accesorios" },
  { code: "2.1.01.03", name: "Proveedores de servicios" },
  { code: "2.1.01.04", name: "Proveedores del exterior" },

  { code: "2.1.02", name: "Cuentas por pagar diversas" },
  { code: "2.1.02.01", name: "Acreedores diversos" },
  { code: "2.1.02.02", name: "Cuentas por pagar a socios" },
  { code: "2.1.02.03", name: "Cuentas por pagar a empleados" },
  { code: "2.1.02.04", name: "Depósitos de clientes por reservas" },
  { code: "2.1.02.05", name: "Anticipos de clientes" },
  { code: "2.1.02.06", name: "Sobrantes de caja por aplicar" },

  { code: "2.1.03", name: "Obligaciones financieras de corto plazo" },
  { code: "2.1.03.01", name: "Préstamos bancarios de corto plazo" },
  { code: "2.1.03.02", name: "Sobregiros bancarios" },
  { code: "2.1.03.03", name: "Intereses por pagar" },

  { code: "2.1.04", name: "Impuestos por pagar" },
  { code: "2.1.04.01", name: "IVA por pagar" },
  { code: "2.1.04.02", name: "IR anual por pagar" },
  { code: "2.1.04.03", name: "Retenciones de IR por enterar" },
  { code: "2.1.04.04", name: "Retenciones de IVA por enterar" },
  { code: "2.1.04.05", name: "Impuesto municipal sobre ingresos" },
  { code: "2.1.04.06", name: "Otros impuestos y tasas por pagar" },

  { code: "2.1.05", name: "Obligaciones laborales" },
  { code: "2.1.05.01", name: "Sueldos y salarios por pagar" },
  { code: "2.1.05.02", name: "Comisiones por pagar" },
  { code: "2.1.05.03", name: "INSS laboral por enterar" },
  { code: "2.1.05.04", name: "INSS patronal por pagar" },
  { code: "2.1.05.05", name: "INATEC por pagar" },
  { code: "2.1.05.06", name: "Vacaciones acumuladas" },
  { code: "2.1.05.07", name: "Aguinaldo acumulado" },
  { code: "2.1.05.08", name: "Indemnización acumulada" },
  { code: "2.1.05.09", name: "Retenciones a favor de terceros" },

  { code: "2.1.06", name: "Provisiones y otros pasivos corrientes" },
  { code: "2.1.06.01", name: "Provisión para garantías de motocicletas" },
  { code: "2.1.06.02", name: "Provisión para mantenimientos incluidos" },
  { code: "2.1.06.03", name: "Ingresos diferidos por servicios" },
  { code: "2.1.06.04", name: "Faltantes de caja por aclarar" },

  { code: "2.2", name: "Pasivo no corriente" },

  { code: "2.2.01", name: "Obligaciones financieras de largo plazo" },
  { code: "2.2.01.01", name: "Préstamos bancarios de largo plazo" },
  { code: "2.2.01.02", name: "Documentos por pagar de largo plazo" },

  { code: "2.2.02", name: "Otros pasivos no corrientes" },
  { code: "2.2.02.01", name: "Provisión para indemnización de largo plazo" },
  { code: "2.2.02.02", name: "Pasivos por impuestos diferidos" },

  // ------------------------------------------------------------ PATRIMONIO
  { code: "3", name: "Patrimonio" },

  { code: "3.1", name: "Capital" },
  { code: "3.1.01", name: "Capital social" },
  { code: "3.1.02", name: "Aportes pendientes de capitalizar" },
  { code: "3.1.03", name: "Capital adicional pagado" },

  { code: "3.2", name: "Reservas" },
  { code: "3.2.01", name: "Reserva legal" },
  { code: "3.2.02", name: "Reservas estatutarias" },

  { code: "3.3", name: "Resultados" },
  { code: "3.3.01", name: "Utilidades acumuladas de ejercicios anteriores" },
  {
    code: "3.3.02",
    name: "Pérdidas acumuladas de ejercicios anteriores",
    contra: true,
  },
  { code: "3.3.03", name: "Resultado del ejercicio" },
  { code: "3.3.04", name: "Dividendos decretados", contra: true },

  // -------------------------------------------------------------- INGRESOS
  { code: "4", name: "Ingresos" },
  { code: "4.1", name: "Ingresos operativos" },

  { code: "4.1.01", name: "Venta de motocicletas" },
  { code: "4.1.01.01", name: "Venta de motocicletas nuevas de contado" },
  { code: "4.1.01.02", name: "Venta de motocicletas nuevas a crédito" },
  { code: "4.1.01.03", name: "Venta de motocicletas usadas" },
  { code: "4.1.01.04", name: "Venta de motocicletas a flotas e instituciones" },

  { code: "4.1.02", name: "Venta de repuestos y accesorios" },
  { code: "4.1.02.01", name: "Venta de repuestos" },
  { code: "4.1.02.02", name: "Venta de accesorios" },
  { code: "4.1.02.03", name: "Venta de lubricantes" },
  { code: "4.1.02.04", name: "Venta de cascos y equipamiento" },
  { code: "4.1.02.05", name: "Venta de llantas y baterías" },

  { code: "4.1.03", name: "Servicios de taller" },
  { code: "4.1.03.01", name: "Mano de obra de mantenimiento preventivo" },
  { code: "4.1.03.02", name: "Mano de obra de reparación" },
  { code: "4.1.03.03", name: "Servicios de garantía facturados al fabricante" },
  { code: "4.1.03.04", name: "Diagnósticos e inspecciones" },

  { code: "4.1.04", name: "Otros ingresos operativos" },
  { code: "4.1.04.01", name: "Gestoría de trámites y placas" },
  { code: "4.1.04.02", name: "Comisiones por intermediación de seguros" },
  { code: "4.1.04.03", name: "Comisiones por intermediación financiera" },
  { code: "4.1.04.04", name: "Fletes y traslados facturados" },

  { code: "4.2", name: "Deducciones de ventas", contra: true },
  { code: "4.2.01", name: "Devoluciones sobre ventas", contra: true },
  { code: "4.2.02", name: "Descuentos y rebajas sobre ventas", contra: true },
  { code: "4.2.03", name: "Bonificaciones a clientes", contra: true },

  { code: "4.3", name: "Ingresos no operativos" },
  { code: "4.3.01", name: "Ingresos financieros por intereses" },
  { code: "4.3.02", name: "Diferencial cambiario ganado" },
  { code: "4.3.03", name: "Ganancia en venta de activo fijo" },
  { code: "4.3.04", name: "Sobrantes de caja" },
  { code: "4.3.05", name: "Otros ingresos diversos" },

  // ---------------------------------------------------------------- COSTOS
  { code: "5", name: "Costos" },

  { code: "5.1", name: "Costo de ventas" },
  { code: "5.1.01", name: "Costo de motocicletas nuevas" },
  { code: "5.1.02", name: "Costo de motocicletas usadas" },
  { code: "5.1.03", name: "Costo de repuestos y accesorios" },
  { code: "5.1.04", name: "Costo de lubricantes" },
  { code: "5.1.05", name: "Costo de cascos y equipamiento" },
  { code: "5.1.06", name: "Costo de llantas y baterías" },

  { code: "5.2", name: "Costos de taller" },
  { code: "5.2.01", name: "Mano de obra directa de taller" },
  { code: "5.2.02", name: "Prestaciones del personal de taller" },
  { code: "5.2.03", name: "Materiales y consumibles de taller" },
  { code: "5.2.04", name: "Servicios de terceros de taller" },
  { code: "5.2.05", name: "Herramientas menores" },

  { code: "5.3", name: "Costos indirectos y ajustes de inventario" },
  { code: "5.3.01", name: "Fletes y acarreos sobre compras" },
  { code: "5.3.02", name: "Aranceles y gastos de importación" },
  { code: "5.3.03", name: "Mermas y faltantes de inventario" },
  { code: "5.3.04", name: "Ajuste por obsolescencia de inventario" },
  { code: "5.3.05", name: "Costo de garantías otorgadas" },

  // ---------------------------------------------------------------- GASTOS
  { code: "6", name: "Gastos" },

  { code: "6.1", name: "Gastos de venta" },
  { code: "6.1.01", name: "Sueldos y salarios de ventas" },
  { code: "6.1.02", name: "Comisiones sobre ventas" },
  { code: "6.1.03", name: "Prestaciones sociales de ventas" },
  { code: "6.1.04", name: "INSS e INATEC patronal de ventas" },
  { code: "6.1.05", name: "Publicidad y promoción" },
  { code: "6.1.06", name: "Publicidad digital y redes sociales" },
  { code: "6.1.07", name: "Eventos y ferias comerciales" },
  { code: "6.1.08", name: "Material publicitario y rotulación" },
  { code: "6.1.09", name: "Viáticos y movilización de ventas" },
  { code: "6.1.10", name: "Depreciación de motocicletas de demostración" },
  { code: "6.1.11", name: "Otros gastos de venta" },

  { code: "6.2", name: "Gastos de administración" },
  { code: "6.2.01", name: "Sueldos y salarios administrativos" },
  { code: "6.2.02", name: "Prestaciones sociales administrativas" },
  { code: "6.2.03", name: "INSS e INATEC patronal administrativo" },
  { code: "6.2.04", name: "Honorarios profesionales" },
  { code: "6.2.05", name: "Servicios contables y de auditoría" },
  { code: "6.2.06", name: "Asesoría legal" },
  { code: "6.2.07", name: "Alquiler de locales" },
  { code: "6.2.08", name: "Energía eléctrica" },
  { code: "6.2.09", name: "Agua potable" },
  { code: "6.2.10", name: "Telefonía e internet" },
  { code: "6.2.11", name: "Papelería y útiles de oficina" },
  { code: "6.2.12", name: "Limpieza y seguridad" },
  { code: "6.2.13", name: "Mantenimiento de instalaciones y equipos" },
  { code: "6.2.14", name: "Licencias y suscripciones de software" },
  { code: "6.2.15", name: "Seguros" },
  { code: "6.2.16", name: "Impuestos municipales y tasas" },
  { code: "6.2.17", name: "Matrícula y licencias comerciales" },
  { code: "6.2.18", name: "Depreciación de propiedad, planta y equipo" },
  { code: "6.2.19", name: "Amortización de intangibles" },
  { code: "6.2.20", name: "Capacitación del personal" },
  { code: "6.2.21", name: "Combustible y mantenimiento vehicular" },
  { code: "6.2.22", name: "Otros gastos administrativos" },

  { code: "6.3", name: "Gastos financieros" },
  { code: "6.3.01", name: "Intereses sobre préstamos" },
  { code: "6.3.02", name: "Comisiones bancarias" },
  { code: "6.3.03", name: "Comisiones por cobros con tarjeta" },
  { code: "6.3.04", name: "Diferencial cambiario perdido" },
  { code: "6.3.05", name: "Otros gastos financieros" },

  { code: "6.4", name: "Otros gastos" },
  { code: "6.4.01", name: "Estimación de cuentas incobrables" },
  { code: "6.4.02", name: "Faltantes de caja" },
  { code: "6.4.03", name: "Pérdida en venta de activo fijo" },
  { code: "6.4.04", name: "Multas y recargos" },
  { code: "6.4.05", name: "Gastos no deducibles" },
  { code: "6.4.06", name: "Otros gastos diversos" },
];

// --- Derivación ----------------------------------------------------------

const NATURE_BY_TYPE = {
  ACTIVO: "DEUDORA",
  COSTO: "DEUDORA",
  GASTO: "DEUDORA",
  PASIVO: "ACREEDORA",
  PATRIMONIO: "ACREEDORA",
  INGRESO: "ACREEDORA",
};

function invert(nature) {
  return nature === "DEUDORA" ? "ACREEDORA" : "DEUDORA";
}

export function parentCodeOf(code) {
  const index = code.lastIndexOf(".");
  return index === -1 ? null : code.slice(0, index);
}

/**
 * Expande la plantilla a filas completas y valida su coherencia. Devuelve las
 * cuentas ordenadas por código, de modo que una cuenta padre siempre precede a
 * sus subcuentas y la siembra puede insertarlas en un solo recorrido.
 *
 * Falla ante un catálogo inconsistente (código inválido, padre inexistente,
 * duplicado, clase desconocida) en lugar de sembrar a medias: una plantilla
 * rota produciría una jerarquía silenciosamente incorrecta.
 */
export function buildTemplateAccounts() {
  const byCode = new Map();

  for (const entry of templateAccounts) {
    if (!/^[0-9][0-9.]*$/.test(entry.code) || entry.code.includes("..")) {
      throw new Error(`Código de plantilla inválido: ${entry.code}`);
    }
    if (byCode.has(entry.code)) {
      throw new Error(`Código de plantilla duplicado: ${entry.code}`);
    }

    const type = TYPE_BY_CLASS[Number(entry.code[0])];
    if (!type) {
      throw new Error(`Clase desconocida en el código ${entry.code}`);
    }

    const baseNature = NATURE_BY_TYPE[type];
    byCode.set(entry.code, {
      code: entry.code,
      name: entry.name,
      type,
      nature: entry.contra ? invert(baseNature) : baseNature,
      level: entry.code.split(".").length,
      parentCode: parentCodeOf(entry.code),
      // Se calcula abajo, cuando se conoce el catálogo completo.
      allowsPosting: true,
      // El detalle por sucursal no aplica al patrimonio: el capital de la
      // empresa no se reparte por punto de venta.
      allowsBranchDetail: type !== "PATRIMONIO",
      // Las cuentas de resultado son las candidatas naturales a llevar centro
      // de costo cuando la empresa lo active. La bandera no la consume nadie
      // todavía; queda declarada para que activarlo no exija otra migración.
      requiresCostCenter: type === "GASTO" || type === "COSTO",
    });
  }

  for (const account of byCode.values()) {
    if (account.parentCode && !byCode.has(account.parentCode)) {
      throw new Error(
        `La cuenta ${account.code} referencia una cuenta padre inexistente (${account.parentCode}).`,
      );
    }
    if (account.parentCode) {
      // Una cuenta con subcuentas es de agrupación: no recibe movimientos.
      byCode.get(account.parentCode).allowsPosting = false;
    }
  }

  return [...byCode.values()].sort((left, right) =>
    left.code.localeCompare(right.code),
  );
}
