import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  buildPublicTimeline,
  hasUsableVerification,
  mapCreditStatusToPublicStatus,
  mapDeliveryStatusToPublicStatus,
  mapExpedienteStatusToPublicStatus,
  mapLeadStatusToPublicStatus,
  mapReservationStatusToPublicStatus,
  maskIdentification,
  maskPhone,
  normalizeIdentification,
  normalizePhone,
  normalizeTrackingCode,
  type PublicCreditStatusDTO,
  type PublicDeliveryStatusDTO,
  type PublicExpedienteStatusDTO,
  type PublicLookupInput,
  type PublicPortalLookupResultDTO,
  type PublicReservationStatusDTO,
} from "@/server/portal/shared";

/**
 * Public (unauthenticated) portal lookups (Patch 3.6A). Every function requires
 * a public code PLUS a verification field (phone or identification) that must
 * match the record's own customer/lead contact data. A wrong code, a wrong
 * phone, a missing verification field or an absent database all resolve to the
 * SAME `null` — the caller can never tell which part was wrong, so codes and
 * phone numbers cannot be enumerated.
 *
 * These functions return only the public-safe DTOs from `shared.ts`. They never
 * return a raw Prisma object, and they never read Caja, Contabilidad, costs,
 * notes, emails, audit logs or another customer's record. UI is NOT connected
 * in this patch.
 */

/**
 * Internal, module-private verified context. Never returned to a caller; the
 * public functions project only safe primitives out of it.
 */
type VerifiedContext = {
  trackingCode: string | null;
  customerName: string;
  rawPhone: string | null;
  rawIdentification: string | null;
  branchName: string;
  advisorName: string | null;
  motorcycleModel: string;
  leadStatus: string | null;
  fileStatus: string | null;
  fileNumber: string | null;
  reservationStatus: string | null;
  hasReservation: boolean;
  saleStatus: string | null;
  creditStatus: string | null;
  hasCredit: boolean;
  lastUpdate: Date | null;
};

function unitLabel(
  unit: { brand: string; model: string } | null | undefined,
): string | null {
  if (!unit) return null;
  return `${unit.brand} ${unit.model}`.trim();
}

function newest(...dates: Array<Date | null | undefined>): Date | null {
  let max: Date | null = null;
  for (const date of dates) {
    if (date && (!max || date.getTime() > max.getTime())) max = date;
  }
  return max;
}

async function resolveVerifiedContext(
  input: PublicLookupInput,
): Promise<VerifiedContext | null> {
  if (!isDatabaseConfigured()) return null;

  const code = normalizeTrackingCode(input.code);
  const phone = normalizePhone(input.phone);
  const identification = normalizeIdentification(input.identification);

  // Code plus a real verification field is mandatory — no lookup by code alone.
  if (!code) return null;
  if (!hasUsableVerification({ phone, identification })) return null;

  const prisma = getPrisma();

  // Resolve an anchor by any public code. Each code is unique within its table.
  const [anchorLead, anchorFile, anchorReservation, anchorSale] =
    await Promise.all([
      prisma.lead.findUnique({ where: { trackingCode: code } }),
      prisma.customerFile.findUnique({ where: { fileNumber: code } }),
      prisma.reservation.findUnique({ where: { reservationNumber: code } }),
      prisma.sale.findUnique({ where: { saleNumber: code } }),
    ]);

  const customerId =
    anchorFile?.customerId ??
    anchorReservation?.customerId ??
    anchorSale?.customerId ??
    anchorLead?.customerId ??
    null;
  const fileId =
    anchorFile?.id ??
    anchorReservation?.customerFileId ??
    anchorSale?.customerFileId ??
    null;

  if (!customerId && !anchorLead) return null;

  // Load the minimal contact data needed to verify the requester.
  const [customer, lead] = await Promise.all([
    customerId
      ? prisma.customer.findUnique({ where: { id: customerId } })
      : Promise.resolve(null),
    anchorLead
      ? Promise.resolve(anchorLead)
      : customerId
        ? prisma.lead.findFirst({
            where: { customerId },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve(null),
  ]);

  // Verification: the phone or identification must match the record's own
  // customer or lead. A mismatch is indistinguishable from "not found".
  const phoneMatches =
    phone.length >= 7 &&
    (customer?.phoneNormalized === phone ||
      (lead ? normalizePhone(lead.phone) === phone : false));
  const idMatches =
    identification.length >= 6 &&
    (customer?.cedulaNormalized === identification ||
      (lead ? normalizeIdentification(lead.cedula) === identification : false));
  if (!phoneMatches && !idMatches) return null;

  // Load the public-safe graph for the verified subject only.
  const file = fileId
    ? await prisma.customerFile.findUnique({
        where: { id: fileId },
        include: {
          branch: true,
          seller: true,
          quote: true,
          creditApplication: true,
        },
      })
    : customerId
      ? await prisma.customerFile.findFirst({
          where: { customerId },
          orderBy: { createdAt: "desc" },
          include: {
            branch: true,
            seller: true,
            quote: true,
            creditApplication: true,
          },
        })
      : null;

  const reservationWhere = file
    ? { customerFileId: file.id }
    : customerId
      ? { customerId }
      : null;
  const reservation = reservationWhere
    ? ((await prisma.reservation.findFirst({
        where: { ...reservationWhere, status: "ACTIVA" },
        orderBy: { reservedAt: "desc" },
        include: { branch: true, seller: true, motorcycleUnit: true },
      })) ??
      (await prisma.reservation.findFirst({
        where: reservationWhere,
        orderBy: { reservedAt: "desc" },
        include: { branch: true, seller: true, motorcycleUnit: true },
      })))
    : null;

  const sale = reservationWhere
    ? await prisma.sale.findFirst({
        where: reservationWhere,
        orderBy: { soldAt: "desc" },
        include: { branch: true, seller: true, motorcycleUnit: true },
      })
    : null;

  const leadForStatus =
    lead ??
    (file
      ? await prisma.lead.findFirst({
          where: { customerFiles: { some: { id: file.id } } },
          orderBy: { createdAt: "desc" },
        })
      : null);

  const branchName =
    file?.branch.name ??
    reservation?.branch.name ??
    sale?.branch.name ??
    (leadForStatus
      ? (await prisma.branch.findUnique({ where: { id: leadForStatus.branchId } }))?.name
      : null) ??
    "Información pendiente de completar";

  const advisorName =
    file?.seller?.name ??
    reservation?.seller.name ??
    sale?.seller.name ??
    null;

  const motorcycleModel =
    unitLabel(sale?.motorcycleUnit) ??
    unitLabel(reservation?.motorcycleUnit) ??
    file?.quote?.motorcycleModel ??
    file?.motorcycleInterest ??
    leadForStatus?.motorcycleInterest ??
    "Información pendiente de completar";

  return {
    trackingCode: leadForStatus?.trackingCode ?? null,
    customerName: customer?.name ?? leadForStatus?.name ?? "Cliente",
    rawPhone: customer?.phone ?? leadForStatus?.phone ?? null,
    rawIdentification: customer?.cedula ?? leadForStatus?.cedula ?? null,
    branchName,
    advisorName,
    motorcycleModel,
    leadStatus: leadForStatus?.status ?? null,
    fileStatus: file?.status ?? null,
    fileNumber: file?.fileNumber ?? null,
    reservationStatus: reservation?.status ?? null,
    hasReservation: Boolean(reservation),
    saleStatus: sale?.status ?? null,
    creditStatus: file?.creditApplication?.status ?? null,
    hasCredit: Boolean(file?.creditApplication),
    lastUpdate: newest(
      leadForStatus?.updatedAt,
      file?.updatedAt,
      reservation?.updatedAt,
      sale?.updatedAt,
      file?.creditApplication?.updatedAt,
    ),
  };
}

/** Highest-priority public status + its timeline index, from the whole process. */
function overallStatus(context: VerifiedContext): {
  status: string;
  nextStep: string;
  step: number;
} {
  if (context.saleStatus) {
    const mapped = mapDeliveryStatusToPublicStatus(context.saleStatus);
    return { status: mapped.label, nextStep: mapped.nextStep, step: mapped.step };
  }
  if (context.reservationStatus) {
    const mapped = mapReservationStatusToPublicStatus(context.reservationStatus);
    return { status: mapped.label, nextStep: mapped.nextStep, step: mapped.step };
  }
  if (context.fileStatus) {
    const mapped = mapExpedienteStatusToPublicStatus(context.fileStatus);
    return { status: mapped.label, nextStep: mapped.nextStep, step: mapped.step };
  }
  if (context.leadStatus) {
    const mapped = mapLeadStatusToPublicStatus(context.leadStatus);
    return { status: mapped.label, nextStep: mapped.nextStep, step: mapped.step };
  }
  return {
    status: "Seguimiento activo",
    nextStep: "La sucursal continuará el seguimiento de tu proceso.",
    step: 0,
  };
}

// --- Public lookups -------------------------------------------------------

export async function lookupPublicPortalStatus(
  input: PublicLookupInput,
): Promise<PublicPortalLookupResultDTO | null> {
  const context = await resolveVerifiedContext(input);
  if (!context) return null;

  const overall = overallStatus(context);

  return {
    trackingCode: context.trackingCode,
    customerName: context.customerName,
    maskedPhone: maskPhone(context.rawPhone),
    maskedIdentification: maskIdentification(context.rawIdentification),
    branchName: context.branchName,
    advisorName: context.advisorName,
    motorcycleModel: context.motorcycleModel,
    status: overall.status,
    nextStep: overall.nextStep,
    lastUpdate: context.lastUpdate ? context.lastUpdate.toISOString() : null,
    timeline: buildPublicTimeline(overall.step),
    lead: context.leadStatus
      ? {
          trackingCode: context.trackingCode ?? "",
          status: mapLeadStatusToPublicStatus(context.leadStatus).label,
          nextStep: mapLeadStatusToPublicStatus(context.leadStatus).nextStep,
        }
      : null,
    expediente: context.fileStatus
      ? {
          expedienteCode: context.fileNumber,
          status: mapExpedienteStatusToPublicStatus(context.fileStatus).label,
          nextStep: mapExpedienteStatusToPublicStatus(context.fileStatus).nextStep,
        }
      : null,
    reservation: context.reservationStatus
      ? {
          status: mapReservationStatusToPublicStatus(context.reservationStatus).label,
          nextStep: mapReservationStatusToPublicStatus(context.reservationStatus).nextStep,
        }
      : null,
    credit: context.hasCredit
      ? {
          status: mapCreditStatusToPublicStatus(context.creditStatus ?? "PENDIENTE").label,
          nextStep: mapCreditStatusToPublicStatus(context.creditStatus ?? "PENDIENTE").nextStep,
        }
      : null,
    delivery:
      context.saleStatus || context.hasReservation
        ? {
            status: mapDeliveryStatusToPublicStatus(context.saleStatus).label,
            nextStep: mapDeliveryStatusToPublicStatus(context.saleStatus).nextStep,
          }
        : null,
  };
}

export async function lookupPublicExpedienteStatus(
  input: PublicLookupInput,
): Promise<PublicExpedienteStatusDTO | null> {
  const context = await resolveVerifiedContext(input);
  if (!context) return null;
  const source = context.fileStatus
    ? mapExpedienteStatusToPublicStatus(context.fileStatus)
    : context.leadStatus
      ? mapLeadStatusToPublicStatus(context.leadStatus)
      : null;
  if (!source) return null;
  return {
    expedienteCode: context.fileNumber,
    status: source.label,
    nextStep: source.nextStep,
  };
}

export async function lookupPublicCreditStatus(
  input: PublicLookupInput,
): Promise<PublicCreditStatusDTO | null> {
  const context = await resolveVerifiedContext(input);
  if (!context) return null;
  const mapped = mapCreditStatusToPublicStatus(context.creditStatus ?? "PENDIENTE");
  return { status: mapped.label, nextStep: mapped.nextStep };
}

export async function lookupPublicReservationStatus(
  input: PublicLookupInput,
): Promise<PublicReservationStatusDTO | null> {
  const context = await resolveVerifiedContext(input);
  if (!context) return null;
  if (!context.reservationStatus) {
    return {
      status: "Sin reserva activa",
      nextStep: "Cuando registres una reserva, verás aquí su estado.",
    };
  }
  const mapped = mapReservationStatusToPublicStatus(context.reservationStatus);
  return { status: mapped.label, nextStep: mapped.nextStep };
}

export async function lookupPublicDeliveryStatus(
  input: PublicLookupInput,
): Promise<PublicDeliveryStatusDTO | null> {
  const context = await resolveVerifiedContext(input);
  if (!context) return null;
  const mapped = mapDeliveryStatusToPublicStatus(context.saleStatus);
  return { status: mapped.label, nextStep: mapped.nextStep };
}
