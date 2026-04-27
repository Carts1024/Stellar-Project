import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  INDEXER_DATABASE_URL: z.string().min(1),
  INDEXER_STELLAR_RPC_URL: z.string().url(),
  INDEXER_CORE_CONTRACT_ID: z.string().min(1),
  INDEXER_REWARD_CONTRACT_ID: z.string().min(1),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(4_000),
  INDEXER_BATCH_LIMIT: z.coerce.number().int().min(1).max(1_000).default(200),
  INDEXER_ALLOWED_ORIGIN: z.string().default("*"),
  INDEXER_START_LEDGER: z.coerce.number().int().positive().optional(),
});

export const indexerConfig = environmentSchema.parse(process.env);

export const trackedContractIds = [
  indexerConfig.INDEXER_CORE_CONTRACT_ID,
  indexerConfig.INDEXER_REWARD_CONTRACT_ID,
];