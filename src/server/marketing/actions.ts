"use server";

import { revalidatePath } from "next/cache";

import { canManageMarketing } from "@/server/auth/access";
import { requireAuth } from "@/server/auth/context";
import { sanitizeText } from "@/server/crm/shared";
import { getPrisma, isDatabaseConfigured } from "@/server/db/prisma";
import {
  isMarketingCampaignObjectiveValue,
  isMarketingCampaignStatusValue,
  isMarketingChannelValue,
  type MarketingCampaignInput,
} from "@/server/marketing/shared";

/**
 * Server-side Marketing write actions. Admin and MARKETING manage campaigns —
 * the role is re-checked here, never trusted from the UI. The target branch is
 * resolved from a branch *code*; a raw branch id is never accepted from a client.
 * Enums are validated and free text is sanitized before Prisma.
 *
 * These actions never touch Caja, Contabilidad or the public portal, never
 * create leads/customers/units, and imply no external ad-platform integration.
 * Nothing here is wired into the UI yet.
 */

const DB_REQUIRED =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";
const NO_PERMISSION = "No tienes permiso para gestionar campañas.";
const NOT_FOUND = "La campaña no existe.";
const INVALID = "Revisa los datos de la campaña.";

export type MarketingActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const MAX_BUDGET = 100_000_000;

function normalizedName(value: string): string | null {
  const clean = sanitizeText(value);
  if (!clean || clean.length > MAX_NAME) return null;
  return clean;
}

function optionalDescription(value: string | null): string | null {
  if (!value) return null;
  const clean = sanitizeText(value);
  return clean ? clean.slice(0, MAX_DESCRIPTION) : null;
}

function optionalSlug(value: string | null): string | null {
  if (!value) return null;
  const clean = sanitizeText(value).toLowerCase();
  return clean ? clean.slice(0, 120) : null;
}

/** A valid non-negative budget, or null. Rejects NaN/negative/oversized. */
function sanitizeBudget(value: number | null): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > MAX_BUDGET) return null;
  return Math.round(value * 100) / 100;
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type ValidatedCampaign = {
  name: string;
  channel: MarketingCampaignInput["channel"];
  motorcycleSlug: string | null;
  estimatedBudget: number | null;
  startsAt: Date;
  endsAt: Date | null;
  status: MarketingCampaignInput["status"];
  objective: MarketingCampaignInput["objective"];
  description: string | null;
};

function validate(input: MarketingCampaignInput): ValidatedCampaign | null {
  const name = normalizedName(input.name);
  if (!name) return null;
  if (!isMarketingChannelValue(input.channel)) return null;
  if (!isMarketingCampaignStatusValue(input.status)) return null;
  if (!isMarketingCampaignObjectiveValue(input.objective)) return null;

  const startsAt = parseDate(input.startsAt);
  if (!startsAt) return null;
  let endsAt: Date | null = null;
  if (input.endsAt) {
    endsAt = parseDate(input.endsAt);
    if (!endsAt) return null;
    if (endsAt.getTime() < startsAt.getTime()) return null;
  }

  return {
    name,
    channel: input.channel,
    motorcycleSlug: optionalSlug(input.motorcycleSlug),
    estimatedBudget: sanitizeBudget(input.estimatedBudget),
    startsAt,
    endsAt,
    status: input.status,
    objective: input.objective,
    description: optionalDescription(input.description),
  };
}

/** Resolves a branch code to its id, or null (unknown/unspecified branch). */
async function resolveTargetBranchId(
  branchCode: string | null,
): Promise<string | null> {
  if (!branchCode) return null;
  const prisma = getPrisma();
  const branch = await prisma.branch.findUnique({
    where: { code: branchCode },
    select: { id: true },
  });
  return branch?.id ?? null;
}

export async function createMarketingCampaignAction(
  input: MarketingCampaignInput,
): Promise<MarketingActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const data = validate(input);
  if (!data) return { ok: false, error: INVALID };

  const prisma = getPrisma();
  const targetBranchId = await resolveTargetBranchId(input.targetBranchCode);

  const campaign = await prisma.marketingCampaign.create({
    data: {
      name: data.name,
      channel: data.channel,
      targetBranchId,
      motorcycleSlug: data.motorcycleSlug,
      estimatedBudget: data.estimatedBudget,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: data.status,
      objective: data.objective,
      description: data.description,
      createdById: session.uid,
    },
    select: { id: true },
  });

  revalidatePath("/panel/marketing");
  return { ok: true, id: campaign.id };
}

export async function updateMarketingCampaignAction(
  campaignId: string,
  input: MarketingCampaignInput,
): Promise<MarketingActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const data = validate(input);
  if (!data) return { ok: false, error: INVALID };

  const prisma = getPrisma();
  const existing = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: NOT_FOUND };

  const targetBranchId = await resolveTargetBranchId(input.targetBranchCode);

  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: {
      name: data.name,
      channel: data.channel,
      targetBranchId,
      motorcycleSlug: data.motorcycleSlug,
      estimatedBudget: data.estimatedBudget,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: data.status,
      objective: data.objective,
      description: data.description,
    },
  });

  revalidatePath("/panel/marketing");
  return { ok: true, id: campaignId };
}

/**
 * Archive a campaign by marking it COMPLETED (the current flow has no hard
 * delete). Idempotent: archiving a completed campaign is a no-op success.
 */
export async function archiveMarketingCampaignAction(
  campaignId: string,
): Promise<MarketingActionResult> {
  if (!isDatabaseConfigured()) return { ok: false, error: DB_REQUIRED };

  const session = await requireAuth();
  if (!canManageMarketing(session.roleEnum)) {
    return { ok: false, error: NO_PERMISSION };
  }

  const prisma = getPrisma();
  const existing = await prisma.marketingCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: NOT_FOUND };

  await prisma.marketingCampaign.update({
    where: { id: campaignId },
    data: { status: "COMPLETED" },
  });

  revalidatePath("/panel/marketing");
  return { ok: true, id: campaignId };
}
