import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { indexerConfig } from "./config.js";

const globalForPrisma = globalThis as typeof globalThis & {
  talambagPrisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: indexerConfig.INDEXER_DATABASE_URL,
  });

  return new PrismaClient({
    adapter,
    log: indexerConfig.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.talambagPrisma ?? createPrismaClient();

if (indexerConfig.NODE_ENV !== "production") {
  globalForPrisma.talambagPrisma = prisma;
}