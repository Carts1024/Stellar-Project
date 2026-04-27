import { PrismaClient } from "@prisma/client";
import { indexerConfig } from "./config.js";

const globalForPrisma = globalThis as typeof globalThis & {
  talambagPrisma?: PrismaClient;
};

function createPrismaClient() {
  return new PrismaClient({
    log: indexerConfig.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.talambagPrisma ?? createPrismaClient();

if (indexerConfig.NODE_ENV !== "production") {
  globalForPrisma.talambagPrisma = prisma;
}