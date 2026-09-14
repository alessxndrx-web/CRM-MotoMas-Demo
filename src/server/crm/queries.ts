import type { Prisma } from "@prisma/client";

import type { CrmScope } from "@/server/auth/access";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  CRM_LIST_LIMIT,
  activityPriorityLabels,
  activityStatusLabels,
  activityTypeLabels,
  customerFileStatusLabels,
  leadStatusLabels,
  type ActivityDTO,
  type ActivityPriorityValue,
  type ActivityStatusValue,
  type ActivityTypeValue,
  type CustomerDTO,
  type CustomerFileDetailDTO,
  type CustomerFileDTO,
  type CustomerFileStatusValue,
  type LeadDTO,
  type CustomerDetailDTO,
  type LeadCommercialContextDTO,
  type LeadMotorcycleDTO,
  type LeadStatusValue,
} from "@/server/crm/shared";
import {
  creditStatusLabels,
  type CreditStatusValue,
} from "@/server/expedientes/shared";
import {
  reservationProofStatusLabels,
  reservationStatusLabels,
  saleStatusLabels,
  saleTypeLabels,
  type ReservationPaymentProofStatusValue,
  type ReservationStatusValue,
  type SaleStatusValue,
  type SaleTypeValue,
} from "@/server/operations/shared";
import {
  paymentRequestStatusLabels,
  type PaymentRequestStatusValue,
} from "@/server/payments/shared";

/**
 * Role-scoped CRM read queries. Every function resolves the caller's
 * {@link CrmScope} into a Prisma `where` filter so branch/personal visibility is
 * enforced in the database layer, never only in the UI.
 */

const LIST_LIMIT = CRM_LIST_LIMIT;

/**
 * Patch CRM-AUD1 — filtros de listado, comunes a leads y clientes.
 *
 * **La búsqueda ocurre en la base, no en el navegador.** Filtrar en el cliente
 * sólo habría buscado dentro de las 200 filas ya traídas, que es precisamente
 * donde el registro buscado no está cuando la lista se trunca.
 */
/**
 * Patch CRM-AUD2 — una página de resultados y cuántos hay en total.
 *
 * El total es lo que convierte una lista truncada en una lista navegable: sin
 * él, la pantalla no puede decir cuántas páginas hay ni si vale la pena buscar.
 */
export type PagedResult<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

/** Tamaño de página por omisión. Cabe en una pantalla sin desplazar mucho. */
export const CRM_PAGE_SIZE = 25;

/**
 * Página y desplazamiento, a prueba de lo que venga en la URL.
 *
 * Una página negativa, cero, con letras o absurdamente alta se resuelve a la
 * primera en lugar de reventar la consulta: el parámetro lo escribe el usuario
 * en la barra de direcciones y no es una entrada de confianza.
 */
function resolvePaging(filters: CrmListFilters): {
  page: number;
  pageSize: number;
  skip: number;
} {
  const pageSize = CRM_PAGE_SIZE;
  const raw = Number(filters.page ?? 1);
  const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function emptyPage<T>(filters: CrmListFilters): PagedResult<T> {
  const { page, pageSize } = resolvePaging(filters);
  return { rows: [], total: 0, page, pageSize };
}

export type CrmListFilters = {
  /** Nombre, teléfono, cédula, correo o código de seguimiento. */
  q?: string | null;
  /** Sólo para leads. */
  status?: LeadStatusValue | null;
  /** Patch CRM-AUD2 — página pedida, empezando en 1. */
  page?: number | null;
};

/**
 * Texto libre a filtro de Prisma. El teléfono se normaliza a dígitos porque el
 * usuario lo teclea como lo tiene apuntado —con guiones, con espacios— y la
 * columna lo guarda limpio.
 */
function searchTerms(raw: string | null | undefined): {
  text: string;
  digits: string;
} | null {
  const text = (raw ?? "").trim();
  if (text.length < 2) return null;
  return { text, digits: text.replace(/\D/g, "") };
}

/** Resolves the cuid branch id for a branch code, or null if not seeded. */
async function resolveBranchId(branchCode: string): Promise<string | null> {
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({ where: { code: branchCode } });
  return branch?.id ?? null;
}

/** Leads visible for a scope: assigned OR created by the seller in personal mode. */
function personalLeadFilter(userId: string): Prisma.LeadWhereInput {
  return {
    OR: [{ assignedSellerId: userId }, { createdById: userId }],
  };
}

/**
 * Patch CRM-QA1 — lo que hay que traer del lead para poder pintar su moto.
 *
 * Se declara una vez porque lo usan `listLeads` y `getLeadDetail`, y las dos
 * tienen que devolver exactamente la misma forma: si divergieran, la ficha
 * mostraria un dato que la lista no tiene y nadie lo notaria hasta produccion.
 */
const leadInclude = {
  branch: true,
  assignedSeller: true,
  createdBy: true,
  catalogModel: true,
} satisfies Prisma.LeadInclude;

/**
 * Cuantas unidades AVAILABLE de cada modelo hay en cada sucursal, para los pares
 * (modelo, sucursal) que la lista de leads necesita.
 *
 * **Un `groupBy` y no una consulta por fila.** Una lista de 200 leads habria
 * hecho 200 viajes a la base para un contador; agrupar una vez sobre los modelos
 * ya visibles cuesta uno.
 *
 * La disponibilidad NO se filtra por el alcance del usuario: es el inventario
 * fisico de la sucursal del lead, que es justo el dato que un vendedor necesita
 * para saber si puede prometer esa moto. No revela costos.
 */
async function availabilityByModelAndBranch(
  pairs: Array<{ catalogModelId: string; branchId: string }>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!pairs.length) return result;

  const rows = await getPrisma().motorcycleUnit.groupBy({
    by: ["catalogModelId", "branchId"],
    where: {
      status: "AVAILABLE",
      catalogModelId: { in: [...new Set(pairs.map((p) => p.catalogModelId))] },
      branchId: { in: [...new Set(pairs.map((p) => p.branchId))] },
    },
    _count: { _all: true },
  });

  for (const row of rows) {
    if (!row.catalogModelId) continue;
    result.set(`${row.catalogModelId}:${row.branchId}`, row._count._all);
  }
  return result;
}

type CatalogModelRelation = {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  slug: string;
  imageUrl: string | null;
  description: string | null;
} | null;

function mapLeadMotorcycle(
  catalogModel: CatalogModelRelation,
  availableUnitsInBranch: number,
): LeadMotorcycleDTO | null {
  if (!catalogModel) return null;
  return {
    catalogModelId: catalogModel.id,
    brand: catalogModel.brand,
    model: catalogModel.model,
    year: catalogModel.year,
    slug: catalogModel.slug,
    imageUrl: catalogModel.imageUrl,
    description: catalogModel.description,
    availableUnitsInBranch,
  };
}

/**
 * El `where` de un listado de leads: alcance + filtros.
 *
 * Patch CRM-AUD2 — **extraído para que la lista y la página compartan la regla.**
 * `null` significa «este alcance no alcanza a nada»: el llamante devuelve vacío,
 * que es fallar cerrado.
 */
async function leadListWhere(
  scope: CrmScope,
  filters: CrmListFilters,
): Promise<Prisma.LeadWhereInput | null> {
  let where: Prisma.LeadWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return null;
    where = { branchId };
  } else if (scope.level === "personal") {
    where = personalLeadFilter(scope.userId);
  }

  // Los filtros se AÑADEN al alcance, nunca lo sustituyen: por construcción una
  // búsqueda no puede sacar un lead que el usuario no vería sin ella.
  const search = searchTerms(filters.q);
  if (!search && !filters.status) return where;

  return {
    AND: [
      where,
      ...(filters.status ? [{ status: filters.status }] : []),
      ...(search
        ? [
            {
              OR: [
                { name: { contains: search.text, mode: "insensitive" as const } },
                { trackingCode: { contains: search.text, mode: "insensitive" as const } },
                { email: { contains: search.text, mode: "insensitive" as const } },
                { cedula: { contains: search.text, mode: "insensitive" as const } },
                ...(search.digits.length >= 3
                  ? [{ phone: { contains: search.digits } }]
                  : []),
              ],
            },
          ]
        : []),
    ],
  };
}

export async function listLeads(
  scope: CrmScope,
  filters: CrmListFilters = {},
): Promise<LeadDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  const where = await leadListWhere(scope, filters);
  if (!where) return [];

  const leads = await prisma.lead.findMany({
    where,
    include: leadInclude,
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  const availability = await availabilityByModelAndBranch(
    leads
      .filter((lead) => lead.catalogModelId)
      .map((lead) => ({
        catalogModelId: lead.catalogModelId as string,
        branchId: lead.branchId,
      })),
  );

  return leads.map((lead) =>
    mapLead(
      lead,
      availability.get(`${lead.catalogModelId}:${lead.branchId}`) ?? 0,
    ),
  );
}

/**
 * Patch CRM-AUD2 — una página de leads, con su total.
 *
 * **Existe aparte de {@link listLeads} a propósito.** Aquella devuelve un array
 * y la consumen media docena de pantallas que necesitan la lista entera para
 * llenar un desplegable; cambiarle la forma de retorno habría tocado todas por
 * una necesidad que sólo tiene la pantalla de Leads.
 *
 * El total se cuenta con **el mismo `where`** que las filas: un contador que
 * ignorara el alcance revelaría cuántos registros existen fuera de él, que es
 * una fuga de información aunque no se vea ni una fila.
 */
export async function listLeadsPage(
  scope: CrmScope,
  filters: CrmListFilters = {},
): Promise<PagedResult<LeadDTO>> {
  if (!isDatabaseConfigured()) return emptyPage(filters);
  const prisma = getPrisma();

  const where = await leadListWhere(scope, filters);
  if (!where) return emptyPage(filters);

  const { page, pageSize, skip } = resolvePaging(filters);
  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      include: leadInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  const availability = await availabilityByModelAndBranch(
    leads
      .filter((lead) => lead.catalogModelId)
      .map((lead) => ({
        catalogModelId: lead.catalogModelId as string,
        branchId: lead.branchId,
      })),
  );

  return {
    rows: leads.map((lead) =>
      mapLead(
        lead,
        availability.get(`${lead.catalogModelId}:${lead.branchId}`) ?? 0,
      ),
    ),
    total,
    page,
    pageSize,
  };
}

/**
 * Patch CRM-AUD2 — una página de clientes, con su total. Ver
 * {@link listLeadsPage} para por qué convive con {@link listCustomers}.
 */
export async function listCustomersPage(
  scope: CrmScope,
  filters: CrmListFilters = {},
): Promise<PagedResult<CustomerDTO>> {
  if (!isDatabaseConfigured()) return emptyPage(filters);
  const prisma = getPrisma();

  const where = await customerListWhere(scope, filters);
  if (!where) return emptyPage(filters);

  const { page, pageSize, skip } = resolvePaging(filters);
  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: { branch: true, assignedSeller: true, assignedBy: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return { rows: customers.map(mapCustomer), total, page, pageSize };
}

/**
 * Patch CRM-QA1 — un lead concreto, ya recortado por el alcance del solicitante.
 *
 * Resuelve primero y comprueba despues sobre la fila resuelta, igual que
 * {@link getCustomerFileDetail}: un id fuera de alcance devuelve `null`, no un
 * error distinto, asi que la URL no sirve para averiguar si el lead existe.
 */
export async function getLeadDetail(
  scope: CrmScope,
  leadId: string,
): Promise<LeadDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: leadInclude,
  });
  if (!lead) return null;

  if (scope.level === "branch" && lead.branch.code !== scope.branchCode) {
    return null;
  }
  if (
    scope.level === "personal" &&
    lead.assignedSellerId !== scope.userId &&
    lead.createdById !== scope.userId
  ) {
    return null;
  }

  const availability = lead.catalogModelId
    ? await availabilityByModelAndBranch([
        { catalogModelId: lead.catalogModelId, branchId: lead.branchId },
      ])
    : new Map<string, number>();

  return mapLead(
    lead,
    availability.get(`${lead.catalogModelId}:${lead.branchId}`) ?? 0,
  );
}

/**
 * El alcance del solicitante sobre clientes, como filtro de Prisma.
 *
 * Patch CRM-AUD2 — **extraído para que la lista y la ficha no puedan divergir.**
 * Estaba escrito dentro de `listCustomers`; la ficha nueva necesita la misma
 * regla, y copiarla habría creado dos verdades sobre quién ve a quién.
 *
 * `null` significa «este alcance no alcanza a nada» y el llamante devuelve vacío
 * — falla cerrado, no abierto.
 */
async function customerScopeFilter(
  scope: CrmScope,
): Promise<Prisma.CustomerWhereInput | null> {
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return null;
    return { branchId };
  }
  if (scope.level === "personal") {
    return {
      OR: [
        // Patch CRM-QA1. La cartera asignada es la primera via de acceso de un
        // vendedor a un cliente: antes solo llegaba a el a traves de un lead o
        // de un expediente, asi que un cliente reasignado quedaba invisible para
        // quien acababa de recibirlo.
        { assignedSellerId: scope.userId },
        { leads: { some: personalLeadFilter(scope.userId) } },
        { customerFiles: { some: { sellerId: scope.userId } } },
      ],
    };
  }
  return {};
}

/** Alcance + búsqueda de un listado de clientes. Ver {@link leadListWhere}. */
async function customerListWhere(
  scope: CrmScope,
  filters: CrmListFilters,
): Promise<Prisma.CustomerWhereInput | null> {
  const scoped = await customerScopeFilter(scope);
  if (!scoped) return null;

  const search = searchTerms(filters.q);
  if (!search) return scoped;

  return {
    AND: [
      scoped,
      {
        OR: [
          { name: { contains: search.text, mode: "insensitive" } },
          { email: { contains: search.text, mode: "insensitive" } },
          { cedula: { contains: search.text, mode: "insensitive" } },
          ...(search.digits.length >= 3
            ? [{ phoneNormalized: { contains: search.digits } }]
            : []),
        ],
      },
    ],
  };
}

export async function listCustomers(
  scope: CrmScope,
  filters: CrmListFilters = {},
): Promise<CustomerDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  const where = await customerListWhere(scope, filters);
  if (!where) return [];

  const customers = await prisma.customer.findMany({
    where,
    include: { branch: true, assignedSeller: true, assignedBy: true },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return customers.map(mapCustomer);
}

export async function listCustomerFiles(
  scope: CrmScope,
): Promise<CustomerFileDTO[]> {
  if (!isDatabaseConfigured()) return [];
  const prisma = getPrisma();

  let where: Prisma.CustomerFileWhereInput = {};
  if (scope.level === "branch") {
    const branchId = await resolveBranchId(scope.branchCode);
    if (!branchId) return [];
    where = { branchId };
  } else if (scope.level === "personal") {
    where = {
      OR: [
        { sellerId: scope.userId },
        { lead: { is: personalLeadFilter(scope.userId) } },
      ],
    };
  }

  const files = await prisma.customerFile.findMany({
    where,
    include: { branch: true, customer: true, seller: true },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  return files.map(mapCustomerFile);
}

export async function getCustomerFileDetail(
  scope: CrmScope,
  id: string,
): Promise<CustomerFileDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  const prisma = getPrisma();

  const file = await prisma.customerFile.findUnique({
    where: { id },
    include: {
      branch: true,
      seller: true,
      customer: { include: { branch: true } },
      lead: { include: leadInclude },
      activities: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
      },
    },
  });
  if (!file) return null;

  // Enforce visibility on the resolved record.
  if (scope.level === "branch" && file.branch.code !== scope.branchCode) {
    return null;
  }
  if (scope.level === "personal") {
    const owned =
      file.sellerId === scope.userId ||
      file.lead?.assignedSellerId === scope.userId ||
      file.lead?.createdById === scope.userId;
    if (!owned) return null;
  }

  return {
    ...mapCustomerFile(file),
    customer: mapCustomer(file.customer),
    lead: file.lead ? mapLead(file.lead) : null,
    activities: file.activities.map(mapActivity),
  };
}

/**
 * Patch CRM-AUD2 — ¿alcanza el solicitante a este cliente?
 *
 * **Reutiliza exactamente el filtro de `listCustomers`.** Es la misma pregunta,
 * y responderla dos veces con dos reglas escritas a mano es como se acaba
 * teniendo una lista que enseña un cliente y una ficha que lo niega —o, peor, al
 * revés. La consulta lleva el alcance dentro del `where`: no se trae la fila
 * para filtrarla después.
 */
export async function canAccessCustomer(
  scope: CrmScope,
  customerId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const where = await customerScopeFilter(scope);
  if (!where) return false;
  const found = await getPrisma().customer.findFirst({
    where: { AND: [{ id: customerId }, where] },
    select: { id: true },
  });
  return Boolean(found);
}

/**
 * Patch CRM-AUD2 — la ficha completa de un cliente.
 *
 * **Un cliente fuera del alcance devuelve `null`**, igual que
 * {@link getLeadDetail}: el identificador de la URL no es una llave, y no se
 * distingue «no existe» de «no es tuyo».
 *
 * Todo lo relacionado se pide **acotado por el cliente ya autorizado**, no por
 * el alcance otra vez: una vez demostrado que este cliente es suyo, sus reservas
 * son suyas. Lo contrario obligaría a repetir el alcance en seis consultas y a
 * mantenerlo sincronizado en seis sitios.
 */
export async function getCustomerDetail(
  scope: CrmScope,
  customerId: string,
): Promise<CustomerDetailDTO | null> {
  if (!isDatabaseConfigured()) return null;
  if (!(await canAccessCustomer(scope, customerId))) return null;

  const prisma = getPrisma();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { branch: true, assignedSeller: true, assignedBy: true },
  });
  if (!customer) return null;

  const now = new Date();
  const [leads, activities, files, reservations, payments, sales, nextActivity] =
    await Promise.all([
      prisma.lead.findMany({
        where: { customerId },
        include: { assignedSeller: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.activity.findMany({
        where: { OR: [{ customerId }, { lead: { is: { customerId } } }] },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
      prisma.customerFile.findMany({
        where: { customerId },
        include: {
          seller: true,
          creditApplication: { select: { id: true, status: true } },
          documents: { select: { status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.reservation.findMany({
        where: { customerId },
        include: {
          motorcycleUnit: { select: { name: true, chassisNumber: true } },
          paymentProof: { select: { status: true } },
          paymentRequests: { where: { status: "PAGADA" }, select: { id: true }, take: 1 },
        },
        orderBy: { reservedAt: "desc" },
        take: 20,
      }),
      prisma.paymentRequest.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.sale.findMany({
        where: { customerId },
        include: { motorcycleUnit: { select: { name: true } } },
        orderBy: { soldAt: "desc" },
        take: 20,
      }),
      prisma.activity.findFirst({
        where: {
          OR: [{ customerId }, { lead: { is: { customerId } } }],
          status: "PENDIENTE",
          scheduledAt: { gte: now },
        },
        orderBy: { scheduledAt: "asc" },
      }),
    ]);

  return {
    customer: mapCustomer(customer),
    originLead: leads.length
      ? {
          id: leads[leads.length - 1].id,
          trackingCode: leads[leads.length - 1].trackingCode,
          statusLabel:
            leadStatusLabels[leads[leads.length - 1].status as LeadStatusValue] ??
            leads[leads.length - 1].status,
          originChannel: leads[leads.length - 1].originChannel,
          motorcycleInterest: leads[leads.length - 1].motorcycleInterest,
          createdAt: leads[leads.length - 1].createdAt.toISOString(),
        }
      : null,
    leads: leads.map((lead) => ({
      id: lead.id,
      trackingCode: lead.trackingCode,
      name: lead.name,
      statusLabel: leadStatusLabels[lead.status as LeadStatusValue] ?? lead.status,
      assignedSellerName: lead.assignedSeller?.name ?? null,
      motorcycleInterest: lead.motorcycleInterest,
      createdAt: lead.createdAt.toISOString(),
    })),
    activities: activities.map(mapActivity),
    nextActivity: nextActivity?.scheduledAt
      ? {
          id: nextActivity.id,
          typeLabel:
            activityTypeLabels[nextActivity.type as ActivityTypeValue] ??
            nextActivity.type,
          scheduledAt: nextActivity.scheduledAt.toISOString(),
        }
      : null,
    lastInteractionAt: activities[0]?.createdAt.toISOString() ?? null,
    expedientes: files.map((file) => ({
      id: file.id,
      fileNumber: file.fileNumber,
      statusLabel:
        customerFileStatusLabels[file.status as CustomerFileStatusValue] ??
        file.status,
      sellerName: file.seller?.name ?? null,
      motorcycleInterest: file.motorcycleInterest,
      creditStatusLabel: file.creditApplication
        ? creditStatusLabels[file.creditApplication.status as CreditStatusValue] ??
          file.creditApplication.status
        : null,
      creditId: file.creditApplication?.id ?? null,
      documentsPending: file.documents.filter(
        (doc) => doc.status === "PENDIENTE" || doc.status === "RECHAZADO",
      ).length,
      documentsTotal: file.documents.length,
    })),
    reservations: reservations.map((reservation) => ({
      id: reservation.id,
      reservationNumber: reservation.reservationNumber,
      status: reservation.status,
      statusLabel:
        reservationStatusLabels[reservation.status as ReservationStatusValue] ??
        reservation.status,
      unitName: reservation.motorcycleUnit?.name ?? "Unidad",
      chassisNumber: reservation.motorcycleUnit?.chassisNumber ?? "",
      reservedAt: reservation.reservedAt.toISOString(),
      // Las dos pruebas de pago que el negocio admite, y la ausencia de ambas.
      paymentLabel: reservation.paymentRequests.length
        ? "Pagada en línea"
        : reservation.paymentProof
          ? `Comprobante ${
              reservationProofStatusLabels[
                reservation.paymentProof.status as ReservationPaymentProofStatusValue
              ]?.toLowerCase() ?? ""
            }`.trim()
          : "Sin comprobante",
    })),
    paymentRequests: payments.map((payment) => ({
      id: payment.id,
      requestNumber: payment.requestNumber,
      concept: payment.concept,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      statusLabel:
        paymentRequestStatusLabels[payment.status as PaymentRequestStatusValue] ??
        payment.status,
      createdAt: payment.createdAt.toISOString(),
    })),
    sales: sales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      statusLabel: saleStatusLabels[sale.status as SaleStatusValue] ?? sale.status,
      typeLabel: saleTypeLabels[sale.type as SaleTypeValue] ?? sale.type,
      unitName: sale.motorcycleUnit?.name ?? "Unidad",
      soldAt: sale.soldAt.toISOString(),
    })),
  };
}

/**
 * Patch CRM-AUD1 — qué más tiene abierto el cliente de este lead.
 *
 * **Vuelve a aplicar el alcance sobre el lead antes de mirar nada más.** Un lead
 * fuera del alcance devuelve el contexto vacío, igual que
 * {@link getLeadDetail} devuelve `null`: el identificador de la URL no es una
 * llave.
 *
 * Un lead sin cliente asociado devuelve vacío sin consultar: todavía no hay
 * recorrido comercial que enseñar.
 */
export async function getLeadCommercialContext(
  scope: CrmScope,
  leadId: string,
): Promise<LeadCommercialContextDTO> {
  const empty: LeadCommercialContextDTO = {
    reservations: [],
    sales: [],
    expedientes: [],
    paymentRequests: [],
  };
  if (!isDatabaseConfigured()) return empty;

  const lead = await getLeadDetail(scope, leadId);
  if (!lead?.customerId) return empty;

  const prisma = getPrisma();
  const customerId = lead.customerId;
  const [reservations, sales, files, payments] = await Promise.all([
    prisma.reservation.findMany({
      where: { customerId },
      include: { motorcycleUnit: { select: { name: true } } },
      orderBy: { reservedAt: "desc" },
      take: 10,
    }),
    prisma.sale.findMany({
      where: { customerId },
      include: { motorcycleUnit: { select: { name: true } } },
      orderBy: { soldAt: "desc" },
      take: 10,
    }),
    prisma.customerFile.findMany({
      where: { customerId },
      include: { creditApplication: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.paymentRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    reservations: reservations.map((row) => ({
      id: row.id,
      reservationNumber: row.reservationNumber,
      statusLabel:
        reservationStatusLabels[row.status as ReservationStatusValue] ?? row.status,
      unitName: row.motorcycleUnit?.name ?? "Unidad",
    })),
    sales: sales.map((row) => ({
      id: row.id,
      saleNumber: row.saleNumber,
      statusLabel: saleStatusLabels[row.status as SaleStatusValue] ?? row.status,
      unitName: row.motorcycleUnit?.name ?? "Unidad",
    })),
    expedientes: files.map((row) => ({
      id: row.id,
      fileNumber: row.fileNumber,
      statusLabel:
        customerFileStatusLabels[row.status as CustomerFileStatusValue] ?? row.status,
      creditStatusLabel: row.creditApplication
        ? creditStatusLabels[
            row.creditApplication.status as CreditStatusValue
          ] ?? row.creditApplication.status
        : null,
    })),
    paymentRequests: payments.map((row) => ({
      id: row.id,
      requestNumber: row.requestNumber,
      concept: row.concept,
      amount: row.amount.toFixed(2),
      currency: row.currency,
      statusLabel:
        paymentRequestStatusLabels[row.status as PaymentRequestStatusValue] ??
        row.status,
    })),
  };
}

// --- Mappers -------------------------------------------------------------

type BranchRelation = { code: string; name: string } | null;
type UserRelation = { id: string; name: string } | null;

function branchCodeOf(branch: BranchRelation): string | null {
  return branch?.code ?? null;
}

function branchNameOf(branch: BranchRelation): string {
  return branch?.name ?? "Sucursal";
}

function mapLead(
  lead: {
    id: string;
    trackingCode: string;
    name: string;
    phone: string;
    cedula: string | null;
    email: string | null;
    motorcycleInterest: string | null;
    motorcycleSlug: string | null;
    originChannel: string | null;
    status: string;
    assignedSellerId: string | null;
    createdById: string | null;
    customerId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    branch?: BranchRelation;
    assignedSeller?: UserRelation;
    createdBy?: UserRelation;
    catalogModel?: CatalogModelRelation;
  },
  availableUnitsInBranch = 0,
): LeadDTO {
  const status = lead.status as LeadStatusValue;
  return {
    id: lead.id,
    trackingCode: lead.trackingCode,
    name: lead.name,
    phone: lead.phone,
    cedula: lead.cedula,
    email: lead.email,
    motorcycleInterest: lead.motorcycleInterest,
    motorcycleSlug: lead.motorcycleSlug,
    motorcycle: mapLeadMotorcycle(
      lead.catalogModel ?? null,
      availableUnitsInBranch,
    ),
    branchCode: branchCodeOf(lead.branch ?? null),
    branchName: branchNameOf(lead.branch ?? null),
    originChannel: lead.originChannel,
    status,
    statusLabel: leadStatusLabels[status] ?? lead.status,
    assignedSellerId: lead.assignedSellerId,
    assignedSellerName: lead.assignedSeller?.name ?? null,
    createdById: lead.createdById,
    createdByName: lead.createdBy?.name ?? null,
    customerId: lead.customerId,
    notes: lead.notes,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

function mapCustomer(customer: {
  id: string;
  name: string;
  phone: string;
  cedula: string | null;
  email: string | null;
  assignedSellerId?: string | null;
  assignedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
  assignedSeller?: UserRelation;
  assignedBy?: UserRelation;
}): CustomerDTO {
  return {
    id: customer.id,
    branchCode: branchCodeOf(customer.branch ?? null),
    branchName: branchNameOf(customer.branch ?? null),
    name: customer.name,
    phone: customer.phone,
    cedula: customer.cedula,
    email: customer.email,
    assignedSellerId: customer.assignedSellerId ?? null,
    assignedSellerName: customer.assignedSeller?.name ?? null,
    assignedByName: customer.assignedBy?.name ?? null,
    assignedAt: customer.assignedAt ? customer.assignedAt.toISOString() : null,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function mapCustomerFile(file: {
  id: string;
  fileNumber: string;
  customerId: string;
  leadId: string | null;
  sellerId: string | null;
  motorcycleInterest: string | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  branch?: BranchRelation;
  customer?: { name: string } | null;
  seller?: UserRelation;
}): CustomerFileDTO {
  const status = file.status as CustomerFileStatusValue;
  return {
    id: file.id,
    fileNumber: file.fileNumber,
    customerId: file.customerId,
    customerName: file.customer?.name ?? "Cliente",
    leadId: file.leadId,
    branchCode: branchCodeOf(file.branch ?? null),
    branchName: branchNameOf(file.branch ?? null),
    sellerId: file.sellerId,
    sellerName: file.seller?.name ?? null,
    motorcycleInterest: file.motorcycleInterest,
    status,
    statusLabel: customerFileStatusLabels[status] ?? file.status,
    notes: file.notes,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

function mapActivity(activity: {
  id: string;
  type: string;
  status: string;
  priority: string;
  description: string | null;
  result: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  user?: UserRelation;
}): ActivityDTO {
  const type = activity.type as ActivityTypeValue;
  const status = activity.status as ActivityStatusValue;
  const priority = activity.priority as ActivityPriorityValue;
  return {
    id: activity.id,
    type,
    typeLabel: activityTypeLabels[type] ?? activity.type,
    status,
    statusLabel: activityStatusLabels[status] ?? activity.status,
    priority,
    priorityLabel: activityPriorityLabels[priority] ?? activity.priority,
    description: activity.description,
    result: activity.result,
    scheduledAt: activity.scheduledAt ? activity.scheduledAt.toISOString() : null,
    completedAt: activity.completedAt ? activity.completedAt.toISOString() : null,
    userName: activity.user?.name ?? null,
    createdAt: activity.createdAt.toISOString(),
  };
}
