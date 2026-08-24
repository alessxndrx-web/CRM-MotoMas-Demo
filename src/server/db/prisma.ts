import { PrismaClient } from "@prisma/client";

/**
 * Lazy PrismaClient singleton.
 *
 * The client is only constructed when DATABASE_URL is configured, so the app
 * (and the production build) never instantiate a database connection in
 * environments without a database. Callers must check {@link isDatabaseConfigured}
 * first (or catch {@link DatabaseNotConfiguredError}).
 */

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("La base de datos no está configurada (falta DATABASE_URL).");
    this.name = "DatabaseNotConfiguredError";
  }
}

const globalForPrisma = globalThis as unknown as {
  motomasPrisma?: PrismaClient;
};

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPrisma(): PrismaClient {
  if (!isDatabaseConfigured()) {
    throw new DatabaseNotConfiguredError();
  }
  if (!globalForPrisma.motomasPrisma) {
    globalForPrisma.motomasPrisma = new PrismaClient();
  }
  return globalForPrisma.motomasPrisma;
}
