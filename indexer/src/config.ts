import { z } from "zod";
import { loadProjectEnvironment } from "./load-env.js";

function emptyStringToUndefined(value: unknown) {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

loadProjectEnvironment();

const requiredEnvString = z.string().trim().min(1);
const optionalPositiveInt = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().int().positive().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  INDEXER_DATABASE_URL: requiredEnvString,
  INDEXER_STELLAR_RPC_URL: requiredEnvString.url(),
  INDEXER_CORE_CONTRACT_ID: requiredEnvString,
  INDEXER_REWARD_CONTRACT_ID: requiredEnvString,
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(4_000),
  INDEXER_BATCH_LIMIT: z.coerce.number().int().min(1).max(1_000).default(200),
  INDEXER_ALLOWED_ORIGIN: z.string().trim().default("*"),
  INDEXER_START_LEDGER: optionalPositiveInt,
});

export const indexerConfig = environmentSchema.parse(process.env);

export const trackedContractIds = [
  indexerConfig.INDEXER_CORE_CONTRACT_ID,
  indexerConfig.INDEXER_REWARD_CONTRACT_ID,
];