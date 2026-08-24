import { Prisma } from "@prisma/client";

/**
 * Patch FF1.0 — shared financial error vocabulary.
 *
 * Financial actions in this project return `{ ok: false, error }` instead of
 * throwing at their boundary, but a rule violation discovered *inside* a
 * database transaction must abort that transaction. Returning a value from a
 * Prisma interactive transaction commits it; only a thrown error rolls it back.
 *
 * `FinancialRuleError` is therefore the way to reject a business rule from
 * inside {@link import("./transaction").runFinancialTransaction}: it rolls the
 * transaction back and its message is handed to the caller unchanged.
 */
export class FinancialRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialRuleError";
  }
}

export function isFinancialRuleError(
  error: unknown,
): error is FinancialRuleError {
  return error instanceof FinancialRuleError;
}

/** Message shown when no more specific cause could be identified. */
export const GENERIC_FINANCIAL_ERROR =
  "No se pudo completar la operación financiera.";

export const DATABASE_REQUIRED_ERROR =
  "Esta acción requiere una base de datos configurada (DATABASE_URL).";

export const NO_FINANCIAL_PERMISSION_ERROR =
  "No tienes permiso para esta operación.";

/**
 * Patch TD-01 — messages that several financial modules had declared
 * independently with identical text. Centralizing them means a wording change
 * reaches every screen at once instead of leaving one module phrasing the same
 * refusal differently.
 *
 * Only messages shared by the financial layer live here. Module-specific
 * wording (`"El turno está cerrado…"`, `"El periodo debe tener el formato
 * AAAA-MM."`) stays where it belongs.
 */
export const UNKNOWN_BRANCH_ERROR = "Selecciona una sucursal válida.";

export const ACCOUNT_NOT_FOUND_ERROR = "La cuenta contable no existe.";

/**
 * Constraint name (`table_col1_col2_key`) → message, so a unique violation can
 * explain *which* rule was broken instead of collapsing every failure into one
 * generic sentence — the current weakness of the ad-hoc `catch {}` blocks in
 * the Caja/Contabilidad actions.
 */
export type UniqueConstraintMessages = Readonly<Record<string, string>>;

function uniqueTargets(error: Prisma.PrismaClientKnownRequestError): string[] {
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) {
    return target.filter((value): value is string => typeof value === "string");
  }
  return [];
}

/**
 * Turns a database failure into a message a Contador or Cajero can act on.
 * Anything unrecognized falls back to `fallback`, never to a raw Prisma string:
 * driver text can leak column names, values and connection details.
 */
export function describeFinancialError(
  error: unknown,
  fallback: string = GENERIC_FINANCIAL_ERROR,
  uniqueMessages: UniqueConstraintMessages = {},
): string {
  if (isFinancialRuleError(error)) return error.message;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        for (const target of uniqueTargets(error)) {
          const message = uniqueMessages[target];
          if (message) return message;
        }
        return "Ya existe un registro con esos datos únicos.";
      }
      case "P2003":
        return "La operación referencia un registro que no existe.";
      case "P2025":
        return "El registro ya no existe o fue modificado por otra persona.";
      case "P2034":
        return "Otra operación modificó estos datos al mismo tiempo. Intenta de nuevo.";
      default:
        return fallback;
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) return fallback;
  return fallback;
}
