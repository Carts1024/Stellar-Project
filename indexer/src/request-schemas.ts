import { z } from "zod";
import { MAX_EVENT_LIST_LIMIT } from "./types.js";
import type { ContractEventFilters } from "./types.js";

type RawEventQuery = {
  eventType?: unknown;
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

function sanitizeEventTypeQuery(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const sanitized = values.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [entry];
    }

    return entry
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  });

  if (sanitized.length === 0) {
    return undefined;
  }

  return Array.from(new Set(sanitized));
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

const eventTypesQuerySchema = z.preprocess(
  sanitizeEventTypeQuery,
  z
    .array(
      z
        .string()
        .min(1, "Expected a value.")
        .max(64, "Event type is too long.")
        .regex(/^[a-z][a-z0-9_]*$/, "Expected a lowercase event type."),
    )
    .min(1, "Expected at least one event type.")
    .optional(),
);

const eventListQuerySchema = z
  .object({
    eventTypes: eventTypesQuerySchema,
    groupId: positiveIntegerQuerySchema.optional(),
    poolId: positiveIntegerQuerySchema.optional(),
    limit: positiveIntegerQuerySchema.pipe(z.number().max(MAX_EVENT_LIST_LIMIT)).optional(),
  })
  .strict();

const eventStreamQuerySchema = eventListQuerySchema.omit({ limit: true });

export function parseEventListFilters(query: RawEventQuery): ContractEventFilters {
  return eventListQuerySchema.parse({
    eventTypes: sanitizeEventTypeQuery(query.eventType),
    groupId: sanitizeQueryValue(query.groupId),
    poolId: sanitizeQueryValue(query.poolId),
    limit: sanitizeQueryValue(query.limit),
  });
}

export function parseEventStreamFilters(
  query: RawEventQuery,
): Readonly<Pick<ContractEventFilters, "eventTypes" | "groupId" | "poolId">> {
  return eventStreamQuerySchema.parse({
    eventTypes: sanitizeEventTypeQuery(query.eventType),
    groupId: sanitizeQueryValue(query.groupId),
    poolId: sanitizeQueryValue(query.poolId),
  });
}