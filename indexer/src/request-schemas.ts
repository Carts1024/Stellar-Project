import { z } from "zod";
import { MAX_EVENT_LIST_LIMIT } from "./types.js";
import type { PoolEventFilters } from "./types.js";

type RawEventQuery = {
  groupId?: unknown;
  poolId?: unknown;
  limit?: unknown;
};

function sanitizeQueryValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }

  return value;
}

const positiveIntegerQuerySchema = z.preprocess(
  sanitizeQueryValue,
  z
    .string()
    .min(1, "Expected a value.")
    .regex(/^\d+$/, "Expected a positive integer.")
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive()),
);

const eventListQuerySchema = z
  .object({
    groupId: positiveIntegerQuerySchema.optional(),
    poolId: positiveIntegerQuerySchema.optional(),
    limit: positiveIntegerQuerySchema.pipe(z.number().max(MAX_EVENT_LIST_LIMIT)).optional(),
  })
  .strict();

const eventStreamQuerySchema = eventListQuerySchema.omit({ limit: true });

export function parseEventListFilters(query: RawEventQuery): PoolEventFilters {
  return eventListQuerySchema.parse({
    groupId: sanitizeQueryValue(query.groupId),
    poolId: sanitizeQueryValue(query.poolId),
    limit: sanitizeQueryValue(query.limit),
  });
}

export function parseEventStreamFilters(
  query: RawEventQuery,
): Readonly<Pick<PoolEventFilters, "groupId" | "poolId">> {
  return eventStreamQuerySchema.parse({
    groupId: sanitizeQueryValue(query.groupId),
    poolId: sanitizeQueryValue(query.poolId),
  });
}