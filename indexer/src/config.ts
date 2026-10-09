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
const optionalTrimmedString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);
const gasEnabled = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
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
  INDEXER_VELO_GAS_ENABLED: gasEnabled,
  INDEXER_GAS_INTERNAL_TOKEN: optionalTrimmedString,
  VELO_GAS_API_KEY: optionalTrimmedString,
  VELO_BASE_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().url().refine((value) => new URL(value).protocol === "https:", "VELO_BASE_URL must use HTTPS.").optional(),
  ),
});

const parsedEnvironment = environmentSchema.parse(process.env);

if (parsedEnvironment.INDEXER_VELO_GAS_ENABLED) {
  if (!parsedEnvironment.INDEXER_GAS_INTERNAL_TOKEN || parsedEnvironment.INDEXER_GAS_INTERNAL_TOKEN.length < 32) {
    throw new Error("INDEXER_GAS_INTERNAL_TOKEN must contain at least 32 characters when Gas Station is enabled.");
  }

  if (!parsedEnvironment.VELO_GAS_API_KEY || !parsedEnvironment.VELO_BASE_URL) {
    throw new Error("Configure VELO_GAS_API_KEY and VELO_BASE_URL when INDEXER_VELO_GAS_ENABLED=true.");
  }
}

export const indexerConfig = parsedEnvironment;

export const trackedContractIds = [
  indexerConfig.INDEXER_CORE_CONTRACT_ID,
  indexerConfig.INDEXER_REWARD_CONTRACT_ID,
];
